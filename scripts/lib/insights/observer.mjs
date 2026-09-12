// Installed locally by AIOS after the user reviews the native hook changes.
// Never emit prompt context or alter the harness's decision. No network access.
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = join(dirname(fileURLToPath(import.meta.url)), 'activity');
const digest = s => createHash('sha256').update(s).digest('hex');
const safe = s => typeof s === 'string' ? s.slice(0, 1000) : null;
const numeric = n => Number.isFinite(n) && n >= 0 ? n : null;
function markGap() {
  try {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    if (!fs.lstatSync(root).isSymbolicLink()) fs.writeFileSync(join(root, 'coverage-gap'), new Date().toISOString(), { mode: 0o600, flag: fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW });
  } catch { /* Failure must never interrupt a native session. */ }
}
function append(record) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(root).isSymbolicLink()) return;
  const path = join(root, digest(record.provider + ':' + record.sessionId) + '.jsonl');
  const fd = fs.openSync(path, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
  try { if (!fs.fstatSync(fd).isFile()) return; if (fs.fstatSync(fd).size > 2 * 1024 * 1024) { markGap(); return; } fs.writeSync(fd, JSON.stringify(record) + '\n'); }
  finally { fs.closeSync(fd); }
}
export function observerRecord(input, provider, now = new Date().toISOString()) {
  if (!['Claude Code', 'Cursor'].includes(provider)) return null;
  const sessionId = safe(input.session_id || input.conversation_id); if (!sessionId) return null;
  const event = safe(input.hook_event_name), tool = safe(input.tool_name), server = safe(input.mcp_server_name);
  const file = safe(input.file_path || (tool === 'Read' ? input.tool_input?.file_path || input.tool_input?.path : null));
  return { type: 'aios-observer', version: 1, provider, sessionId, timestamp: now, event, generationId: safe(input.generation_id),
    cwd: safe(input.cwd || input.workspace_roots?.[0]), model: safe(input.model_id || input.model),
    tool: server && tool ? `mcp__${server}__${tool}` : tool, toolUseId: safe(input.tool_use_id), server, file,
    status: safe(input.status), contextTokens: numeric(input.context_tokens), contextWindow: numeric(input.context_window_size), contextPercent: numeric(input.context_usage_percent),
    instructions: event === 'InstructionsLoaded' ? [{ path: safe(input.file_path), reason: safe(input.load_reason) }] : [],
    attachments: event === 'beforeSubmitPrompt' ? (Array.isArray(input.attachments) ? input.attachments : []).filter(a => a.type === 'rule').map(a => safe(a.file_path)).filter(Boolean).slice(0, 100) : [],
  };
}
if (process.argv[2] === '--capture') {
  const provider = process.argv[3], chunks = []; let length = 0;
  const timer = setTimeout(() => { markGap(); process.exit(0); }, 2500); timer.unref();
  try {
    for await (const chunk of process.stdin) {
      length += chunk.length;
      if (length > 1024 * 1024) {
        markGap();
        process.exit(0);
      }
      chunks.push(chunk);
    }
    const record = observerRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')), provider);
    if (record) append(record); else markGap();
  } catch { markGap(); }
  clearTimeout(timer);
}
