import * as fs from 'node:fs';
import { join } from 'node:path';
import { fail, atomicWrite } from '../storage.mjs';
import { parseAnswer } from './contracts.mjs';
import { engineEnvironment } from './environment.mjs';

const authError = text => /unauthenticated|not authenticated|authentication required|sign.?in|login required|OAuth.*(?:expired|invalid)|invalid.*(?:API key|token)|401 Unauthorized/i.test(text);
function engineError(raw, name, detail = '') {
  const text = `${detail} ${raw.stderr || ''}`;
  if (authError(text)) fail('AUTH_REQUIRED', `${name} needs authentication. Sign in with its native CLI, then start a new run.`);
  if (raw.exitCode || detail) fail('ENGINE_FAILED', `${name} could not complete the request. Check its login, model access, quota and network. No score was recorded.`);
}
function jsonLines(raw) {
  try { return raw.stdout.split(/\r?\n/).filter(s => s.trim()).map(s => JSON.parse(s)); }
  catch { engineError(raw, 'AI engine'); fail('ENGINE_RESPONSE', 'The engine returned malformed JSON events. No score was recorded.'); }
}

export function createTextAdapter({ id, home, env, run, tool }) {
  async function call({ prompt, system, directory, settings, signal, schema }) {
    const privateDir = fs.mkdtempSync(join(directory, '.ai-runtime-')); fs.chmodSync(privateDir, 0o700);
    const began = Date.now(), clean = engineEnvironment(id, home, env, tool.path);
    // CLI authentication stays in its native store. Only Cursor's macOS
    // Keychain login or CURSOR_API_KEY is supported with its isolated home.
    const isolatedHome = join(privateDir, 'home'); fs.mkdirSync(isolatedHome, { mode: 0o700 }); clean.HOME = isolatedHome;
    try {
      let args, input, response, events;
      if (id === 'codex') {
        const config = ['project_doc_max_bytes=0', 'skills.include_instructions=false', 'skills.bundled.enabled=false', 'mcp_servers={}', 'plugins={}', 'web_search="disabled"', 'include_apps_instructions=false', 'include_environment_context=false', 'history.persistence="none"', `log_dir=${JSON.stringify(join(privateDir, 'logs'))}`, `sqlite_home=${JSON.stringify(join(privateDir, 'state'))}`];
        // Disable every advertised feature for the text profile, including
        // hooks, shell, browsers, apps, plugins, skill discovery and delegation.
        for (const feature of tool.features) config.push(`features.${feature}=false`);
        args = ['exec', '--json', '--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '-C', privateDir, ...config.flatMap(c => ['-c', c])];
        if (settings.model) args.push('--model', settings.model);
        if (schema) { const path = join(privateDir, 'schema.json'); atomicWrite(path, JSON.stringify(schema)); args.push('--output-schema', path); }
        args.push('-'); input = `${system}\n\n${prompt}`;
        const raw = await run(tool.path, args, { cwd: privateDir, env: clean, signal, timeout: settings.timeout * 1000, maxBytes: 2 * 1024 * 1024, input, allowFailure: true });
        events = jsonLines(raw);
        engineError(raw, 'Codex', events.find(e => e.type === 'turn.failed' || e.type === 'error')?.error?.message || (events.some(e => e.type === 'turn.failed' || e.type === 'error') ? 'failed' : ''));
        const completed = events.findLast(e => e.type === 'turn.completed');
        const message = events.findLast(e => e.type === 'item.completed' && e.item?.type === 'agent_message');
        if (!completed || typeof message?.item?.text !== 'string') fail('ENGINE_RESPONSE', 'Codex did not return a completed answer. No score was recorded.');
        const startupEnd = events.findIndex(e => e.type === 'turn.started');
        if (events.some((e, i) => e.item && !['agent_message', 'reasoning', 'todo_list'].includes(e.item.type) && !(i < startupEnd && e.item.type === 'error' && String(e.item.message).startsWith('Code Mode is unavailable because code-mode host is disabled.')))) fail('CAPABILITY', 'Codex attempted a tool outside the text-only profile. No score was recorded.');
        const usage = completed.usage;
        response = { text: message.item.text, tokens: usage && Number.isFinite(usage.input_tokens) && Number.isFinite(usage.output_tokens) ? usage.input_tokens + usage.output_tokens : null };
      } else {
        if (process.platform !== 'darwin') fail('CAPABILITY', 'The isolated Cursor adapter currently supports macOS Keychain authentication only.');
        if (fs.existsSync('/Library/Application Support/Cursor/hooks.json')) fail('CAPABILITY', 'Managed Cursor hooks are present. Isolated evaluations cannot run with this configuration; use another engine.');
        // Reference the existing Keychain store without copying credential bytes.
        // macOS security resolves its default keychain using HOME.
        fs.mkdirSync(join(isolatedHome, 'Library/Preferences'), { recursive: true, mode: 0o700 });
        for (const name of ['Library/Keychains', 'Library/Preferences/com.apple.security.plist']) { const native = join(home, name); if (fs.existsSync(native)) fs.symlinkSync(native, join(isolatedHome, name)); }
        const configDir = join(isolatedHome, '.cursor');
        atomicWrite(join(configDir, 'cli-config.json'), JSON.stringify({ version: 1, editor: { vimMode: false }, permissions: { allow: [], deny: ['Shell(*)', 'Read(*)', 'Read(**)', 'Read(/**)', 'Write(*)', 'Write(**)', 'Write(/**)', 'Mcp(*)', 'WebFetch(*)'] } }));
        clean.CURSOR_CONFIG_DIR = configDir; clean.CURSOR_DATA_DIR = join(privateDir, 'data');
        args = ['-p', '--output-format', 'stream-json', '--mode', 'ask', '--sandbox', 'enabled', '--workspace', privateDir, '--trust'];
        if (settings.model) args.push('--model', settings.model);
        input = `${system}\n\n${schema ? `Return only JSON matching this schema: ${JSON.stringify(schema)}\n\n` : ''}${prompt}`;
        const raw = await run(tool.path, args, { cwd: privateDir, env: clean, signal, timeout: settings.timeout * 1000, maxBytes: 2 * 1024 * 1024, input, allowFailure: true });
        events = jsonLines(raw); const result = events.findLast(e => e.type === 'result');
        engineError(raw, 'Cursor Agent', result?.is_error ? String(result.result || 'failed') : '');
        if (!result || result.subtype !== 'success' || typeof result.result !== 'string') fail('ENGINE_RESPONSE', 'Cursor Agent did not return a completed answer. No score was recorded.');
        if (events.some(e => e.type === 'tool_call' || e.message?.content?.some(c => c.type === 'tool_use'))) fail('CAPABILITY', 'Cursor Agent attempted a tool outside the text-only profile. No score was recorded.');
        response = { text: result.result, tokens: null };
      }
      return { ...response, structured: schema ? parseAnswer(response.text) : undefined, cost: null, durationMs: Date.now() - began, engine: tool.version, events: [] };
    } finally { fs.rmSync(privateDir, { recursive: true, force: true }); }
  }
  return { call };
}
