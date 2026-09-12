import * as fs from 'node:fs';
import { dirname, resolve, isAbsolute, relative } from 'node:path';
import { hash, fail, inside } from './storage.mjs';

export function textMetrics(content) {
  return { lines: content ? content.split(/\r?\n/).length - (content.endsWith('\n') ? 1 : 0) : 0, characters: content.length, estimatedTokens: Math.ceil(content.length / 4) };
}
const nextFence = (fence, marker) => !fence ? { char: marker[1][0], length: marker[1].length }
  : marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim() ? null : fence;

export function relocateMemoryText(content, source, target) {
  let fence = null;
  const rebase = ref => {
    if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || isAbsolute(ref) || /^[~#]/.test(ref)) return ref;
    const match = ref.match(/^([^?#]+)([?#].*)?$/); if (!match) return ref;
    try { return encodeURI(relative(dirname(target), resolve(dirname(source), decodeURIComponent(match[1])))).replaceAll('#', '%23').replaceAll('?', '%3F') + (match[2] || ''); } catch { return ref; }
  };
  return content.split(/(?<=\n)/).map(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)/); if (marker) { fence = nextFence(fence, marker); return line; }
    if (fence) return line;
    return line.replace(/(\[[^\]]+\]\()([^\s)]+)(\))/g, (_all, a, ref, b) => a + rebase(ref) + b)
      .replace(/(^|\s)@([^\s`]+)/g, (_all, before, ref) => before + '@' + rebase(ref));
  }).join('');
}

// Keep original offsets: accepted suggestions must not normalize line endings,
// trim unrelated content, or remove examples inside fenced code blocks.
export function memorySections(content) {
  const lines = content.split(/(?<=\n)/), sections = []; let offset = 0, current, fence = null;
  lines.forEach((text, i) => {
    const marker = text.match(/^\s*(`{3,}|~{3,})(.*)/);
    if (marker) fence = nextFence(fence, marker);
    if (!fence && /^#{1,6}\s+/.test(text) || !current) {
      if (current) { current.end = offset; current.endLine = i; sections.push(current); }
      current = { start: offset, line: i + 1, title: /^#{1,6}\s+/.test(text) ? text.trim().replace(/^#+\s*/, '') : 'Introduction' };
    }
    offset += text.length;
  });
  if (current) sections.push({ ...current, end: offset, endLine: lines.length });
  return sections.filter(s => content.slice(s.start, s.end).trim());
}

export function reviewMemory(files, { maxLines = 500, project = '' } = {}) {
  if (!Number.isInteger(maxLines) || maxLines < 20 || maxLines > 5000) fail('INVALID', 'Line guidance must be between 20 and 5,000.');
  const findings = [], documents = [], seenFiles = new Set(), across = new Map();
  const add = (file, code, line, message, extra = {}) => findings.push({ id: hash(`${file.path}:${code}:${line}`), fileId: file.id, path: file.path, code, line, message, severity: 'suggestion', ...extra });
  for (const file of files) {
    if (seenFiles.has(file.path)) continue; seenFiles.add(file.path);
    const { content } = file, metrics = textMetrics(content), sections = memorySections(content);
    documents.push({ ...file, metrics, sections });
    if (metrics.lines > maxLines) add(file, 'LENGTH', 1, `${metrics.lines} lines exceed your ${maxLines}-line guidance. Extract detailed procedures while preserving essential instructions.`);
    const lines = content.split(/(?<=\n)/); let offset = 0, fence = null, paragraph = null;
    const blocks = [], flush = () => { if (paragraph && paragraph.text.trim().length >= 30) blocks.push(paragraph); paragraph = null; };
    lines.forEach((line, i) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})(.*)/);
      if (marker) { flush(); fence = nextFence(fence, marker); }
      if (fence || marker || !line.trim() || /^#{1,6}\s/.test(line)) flush();
      else { paragraph ||= { text: '', line: i + 1, start: offset }; paragraph.text += line; paragraph.end = offset + line.length; }
      if (!fence && !marker) {
        if (/\/(?:Users|home)\/[^/\s]+\//.test(line)) add(file, 'MACHINE_PATH', i + 1, 'A path names a particular user account. Consider a project-relative path or a clearly explained home-directory reference.');
        for (const match of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
          const ref = match[1].replace(/^<|>$/g, '').split('#')[0];
          if (!ref || /^[a-z][a-z0-9+.-]*:/i.test(ref) || isAbsolute(ref) || ref.startsWith('~') || ref.includes(' ')) continue;
          let target; try { target = resolve(dirname(file.path), decodeURIComponent(ref)); } catch { continue; }
          // Do not probe arbitrary ancestors named by an untrusted document.
          if (inside(target, file.project || dirname(file.path)) && !fs.existsSync(target)) add(file, 'MISSING_REFERENCE', i + 1, `Relative reference does not exist: ${ref}`);
        }
      }
      offset += line.length;
    }); flush();
    const local = new Map();
    for (const block of blocks) {
      const normalized = block.text.trim().replace(/\s+/g, ' '), key = hash(normalized);
      if (local.has(key)) add(file, 'DUPLICATE', block.line, `This paragraph repeats line ${local.get(key).line}. Review its scope before removing the repetition.`, { endLine: block.line + block.text.trimEnd().split('\n').length - 1, edit: { start: block.start, end: block.end, replacement: '' } });
      else local.set(key, block);
      if (across.has(key)) { const other = across.get(key); if (other.path !== file.path) add(file, 'CROSS_FILE_DUPLICATE', block.line, `Similar instructions also appear in ${other.path}:${other.line}. Repetition across providers or scopes may be intentional.`); }
      else across.set(key, { path: file.path, line: block.line });
    }
    if (file.scope === 'user' && project) for (const section of sections) {
      const text = content.slice(section.start, section.end);
      if (text.includes(project) || /\b(?:npm|pnpm|yarn|cargo|pytest)\s+(?:run|test|build|dev)\b/.test(text)) add(file, 'PROJECT_SCOPE', section.line, 'This section contains project paths or build/test commands. It may belong in project instructions; confirm the destination and whether it is a personal default.', { section });
    }
  }
  return { documents, findings, maxLines, project, measuredAt: new Date().toISOString(), metrics: documents.reduce((a, f) => ({ lines: a.lines + f.metrics.lines, estimatedTokens: a.estimatedTokens + f.metrics.estimatedTokens }), { lines: 0, estimatedTokens: 0 }) };
}

export function applyReviewEdits(content, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start); let previous = content.length;
  for (const e of ordered) {
    if (!Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end <= e.start || e.end > previous || typeof e.replacement !== 'string') fail('INVALID', 'Suggested changes overlap or are invalid.');
    content = content.slice(0, e.start) + e.replacement + content.slice(e.end); previous = e.start;
  }
  return content;
}
