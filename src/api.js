import { parseTree, applyEdits } from 'jsonc-parser';

let queue = Promise.resolve();
export function request(operation, args = {}) {
  const result = queue.then(() => invoke(operation, args));
  queue = result.catch(() => {});
  return result;
}
async function invoke(operation, args) {
  if (!window.aios) throw new Error('Filesystem access requires the desktop app. Start it with npm run dev. Browser preview cannot access your machine.');
  const result = await window.aios.request(operation, args);
  if (!result?.ok) { const error = new Error(result?.error || 'The local engine returned an invalid response.'); error.code = result?.code; throw error; }
  return result;
}
export async function copyText(text) {
  if (typeof window !== 'undefined' && window.aios?.copyText) {
    const result = await window.aios.copyText(text);
    if (!result?.ok) throw new Error(result?.error || 'Could not write to the clipboard.');
    return;
  }
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable. Select and copy the text manually.');
  await navigator.clipboard.writeText(text);
}
export function redactConfig(value, key = '') {
  if (/^(env|headers|http_headers|env_http_headers|args)$/i.test(key)) return Array.isArray(value) ? value.map(() => '[REVIEW REQUIRED]') : Object.fromEntries(Object.keys(value || {}).map(k => [k, '[REDACTED]']));
  if (/secret|token|password|authorization|api.?key|credential/i.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(v => redactConfig(v));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactConfig(v, k)]));
  if (key === 'url' && typeof value === 'string') { try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; } catch { return '[REVIEW REQUIRED]'; } }
  return value;
}
export function contextEstimate(resources) {
  const files = new Map();
  for (const r of resources) {
    if (r.enabled && !r.error && ['memory', 'skills', 'commands', 'agents'].includes(r.kind) && r.estimatedTokens != null) files.set(r.canonicalPath || r.path, r);
  }
  return { files: [...files.values()], tokens: [...files.values()].reduce((sum, r) => sum + r.estimatedTokens, 0) };
}
export function redactJsonText(text) {
  const errors = [], tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length || tree?.type !== 'object') throw Error('Cannot export invalid JSON. Repair the source or use the raw editor to review it.');
  const edits = [];
  function visit(node) {
    if (node.type === 'property') {
      const [key, value] = node.children;
      if (/^(env|headers|http_headers|env_http_headers|args|url)$/i.test(key.value) || /secret|token|password|authorization|api.?key|credential/i.test(key.value)) {
        const original = JSON.parse(text.slice(value.offset, value.offset + value.length));
        edits.push({ offset: value.offset, length: value.length, content: JSON.stringify(redactConfig(original, key.value)) });
        return;
      }
    }
    for (const child of node.children || []) visit(child);
  }
  visit(tree); return applyEdits(text, edits);
}
