import * as fs from 'node:fs';
import { join, basename, resolve, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { providerPaths } from '../discovery.mjs';
import { hash, inside, fail } from '../storage.mjs';

const number = v => Number.isFinite(v) && v >= 0 ? v : null;
// eslint-disable-next-line no-control-regex
const label = v => typeof v === 'string' ? v.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 600) : null;
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const array = v => Array.isArray(v) ? v : [];
const sum = (...v) => v.some(n => number(n) !== null) ? v.reduce((a, n) => a + (number(n) || 0), 0) : null;
export function mcpServer(name) { return typeof name === 'string' ? /^(?:mcp__|mcp\.)(.+?)(?:__|\.)(.+)$/.exec(name)?.[1] || null : null; }

// Only metadata leaves this parser. Prompts, answers, arguments and instruction bodies
// are inspected in memory for typed fields and never copied into the session index.
export function sessionParser(provider, path, modifiedAt) {
  const s = { id: hash(`${provider}:${path}`), nativeId: null, provider, project: null, path, modifiedAt,
    startedAt: null, lastActiveAt: null, model: null, turns: 0, toolCalls: 0, tools: [], availableTools: [],
    resources: [], timeline: [], firstInputTokens: null, latestInputTokens: null, peakInputTokens: null,
    contextWindow: null, totalTokens: null, outputTokens: null, cachedTokens: null, compactions: 0,
    startupTokens: null, startupEstimate: null, completed: false, partial: false, subagent: /(?:\/subagents\/|\/agent-[^/]+\.jsonl$)/.test(path),
    coverage: provider === 'Cursor' ? 'messages-only' : 'tool-events', notes: [] };
  const tools = new Map(), available = new Map(), resources = new Map(), calls = new Set(), messages = new Set(), usage = new Map(), eventTurns = new Set();
  let firstResponse = false, recognized = 0, eventTurnCount = 0, responseTurns = 0, position = 0, wrappedTools = false, observedStart = false;
  function resource(name, kind, phase = 'during session', tokens = null) {
    name = label(name); if (!name) return;
    const key = `${kind}:${name}`; if (!resources.has(key)) resources.set(key, { name, kind, phase, estimatedTokens: tokens, evidence: 'Recorded in native session' });
  }
  function call(name, id, time, input) {
    name = label(name); if (!name || calls.has(id)) return; calls.add(id);
    if (/^(?:functions\.exec|code_mode|exec)$/i.test(name)) wrappedTools = true;
    s.toolCalls++; const previous = tools.get(name) || { name, server: mcpServer(name), calls: 0, lastUsedAt: null };
    previous.calls++; previous.lastUsedAt = time || previous.lastUsedAt; tools.set(name, previous);
    if (['Read', 'read_file'].includes(name) && input && typeof input === 'object') resource(input.file_path || input.path, 'file');
    if (name === 'Skill' && input && typeof input === 'object') resource(input.skill, 'skill');
  }
  function availableTool(name, loading) { name = label(name); if (name) available.set(name, { name, server: mcpServer(name), loading, phase: firstResponse ? 'during session' : 'first request' }); }
  function point(input, window, time, output, cached) {
    input = number(input); if (input === null) return;
    if (s.firstInputTokens === null) s.firstInputTokens = input;
    s.latestInputTokens = input; s.peakInputTokens = Math.max(s.peakInputTokens || 0, input);
    s.contextWindow = number(window) || s.contextWindow;
    const p = { at: time, inputTokens: input, contextWindow: s.contextWindow, outputTokens: number(output), cachedTokens: number(cached) };
    const last = s.timeline.at(-1);
    if (!last || last.at !== p.at || last.inputTokens !== p.inputTokens) s.timeline.push(p);
    if (s.timeline.length > 200) s.timeline.splice(1, 1);
  }
  return {
    add(o) {
      position++; if (!o || typeof o !== 'object' || Array.isArray(o)) return;
      const time = date(o.timestamp), p = o.payload || {};
      if (time) { if (!s.startedAt || time < s.startedAt) s.startedAt = time; if (!s.lastActiveAt || time > s.lastActiveAt) s.lastActiveAt = time; }
      const cwd = label(o.cwd || p.cwd); if (cwd && isAbsolute(cwd)) s.project = resolve(cwd);
      const nativeId = label(o.sessionId || o.session_id || (o.type === 'session_meta' ? p.id || p.session_id : null));
      if (nativeId) s.nativeId ||= nativeId;
      if (o.isSidechain) s.subagent = true;
      if (o.type === 'aios-observer' && ['Claude Code', 'Cursor'].includes(o.provider)) {
        provider = o.provider; s.provider = provider; s.observer = true; recognized++;
        s.model = label(o.model) || s.model;
        if (['sessionStart', 'SessionStart'].includes(o.event)) observedStart = true;
        if (['beforeSubmitPrompt', 'UserPromptSubmit'].includes(o.event)) { responseTurns++; s.completed = false; }
        if (['stop', 'Stop', 'sessionEnd', 'SessionEnd'].includes(o.event)) s.completed = o.status == null || o.status === 'completed';
        if (['postToolUse', 'PostToolUse', 'afterMCPExecution'].includes(o.event) && o.tool && !/^MCP(?::|$)/.test(o.tool)) call(o.tool, o.toolUseId || `${position}:${o.tool}`, time);
        for (const instruction of array(o.instructions)) resource(instruction.path, 'memory', instruction.reason === 'session_start' ? 'first request' : 'during session');
        for (const file of array(o.attachments)) resource(file, 'rule attachment', 'prompt attachment');
        if (o.file && o.event !== 'InstructionsLoaded') resource(o.file, 'file');
        if (o.event === 'preCompact') {
          s.compactions++; s.reportedContext = { tokens: number(o.contextTokens), percent: number(o.contextPercent), window: number(o.contextWindow), at: time, phase: 'before compaction' };
        }
        return;
      }
      if (provider === 'Claude Code') {
        if (['user', 'assistant', 'attachment', 'system'].includes(o.type)) recognized++;
        if (o.type === 'user' && !o.isMeta && (typeof o.message?.content === 'string' || array(o.message?.content).some(c => c.type === 'text')) && !o.toolUseResult) {
          const key = o.uuid || o.promptId || position; if (!messages.has(key)) { messages.add(key); responseTurns++; } s.completed = false;
        }
        if (o.type === 'assistant') {
          const m = o.message || {}; s.model = label(m.model) || s.model;
          for (const c of array(m.content)) if (c.type === 'tool_use') call(c.name, c.id || `${position}:${c.name}`, time, c.input);
          if (m.usage) {
            const u = m.usage, input = sum(u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens);
            if (input !== null) usage.set(m.id || o.requestId || position, { input, output: number(u.output_tokens) || 0, cached: number(u.cache_read_input_tokens) || 0, at: time });
            point(input, o.context_window?.context_window_size, time, u.output_tokens, u.cache_read_input_tokens);
          }
          if (m.stop_reason === 'end_turn' || m.stop_reason === 'stop_sequence') s.completed = true;
          firstResponse = true;
        }
        if (o.type === 'system' && o.subtype === 'init') {
          for (const name of array(o.tools)) availableTool(name, 'reported available');
          s.model = label(o.model) || s.model;
        }
        if (o.type === 'system' && o.subtype === 'turn_duration') s.completed = true;
        if (o.type === 'system' && /compact/.test(o.subtype || '')) s.compactions++;
        const a = o.type === 'attachment' ? o.attachment || {} : {};
        if (a.type === 'deferred_tools_delta') { for (const name of array(a.addedNames)) availableTool(name, 'deferred schema'); }
        if (a.type === 'skill_listing') for (const name of array(a.names)) resource(name, 'skill description', a.isInitial ? 'first request' : 'during session');
        if (a.type === 'instructions') for (const f of array(a.files)) resource(f.path, 'memory', firstResponse ? 'during session' : 'first request', typeof f.content === 'string' ? Math.ceil(f.content.length / 4) : null);
        if (a.type === 'prompt_snapshot') {
          if (!firstResponse && Array.isArray(a.systemPrompt)) s.startupEstimate = { tokens: Math.ceil(a.systemPrompt.filter(x => typeof x === 'string').join('\n').length / 4), label: 'Recorded system prompt text · estimate', includes: 'May overlap recorded memory. Excludes unknown tool schemas and first user prompt.' };
          for (const t of array(a.tools)) availableTool(t.name, t.defer_loading ? 'deferred schema' : 'schema recorded');
        }
      } else if (provider === 'Codex') {
        if (['session_meta', 'turn_context', 'response_item', 'event_msg', 'token_usage_record', 'world_state'].includes(o.type)) recognized++;
        if (o.type === 'session_meta') { s.contextWindow = number(p.context_window); s.subagent ||= JSON.stringify(p.source || p.thread_source || '').includes('subagent'); }
        if (o.type === 'turn_context') s.model = label(p.model) || s.model;
        if (o.type === 'event_msg') {
          if (p.type === 'user_message') { const key = p.turn_id || position; if (!eventTurns.has(key)) { eventTurns.add(key); eventTurnCount++; } s.completed = false; }
          if (p.type === 'task_started') { s.completed = false; s.contextWindow = number(p.model_context_window) || s.contextWindow; }
          if (p.type === 'task_complete') s.completed = true;
          if (p.type === 'token_count' && p.info) {
            const i = p.info, last = i.last_token_usage || {}, total = i.total_token_usage || {};
            point(last.input_tokens, i.model_context_window, time, last.output_tokens, last.cached_input_tokens);
            s.totalTokens = number(total.total_tokens); s.outputTokens = number(total.output_tokens); s.cachedTokens = number(total.cached_input_tokens);
          }
        }
        if (o.type === 'token_usage_record') {
          const u = p.usage || {}, total = p.thread_token_usage || {};
          point(u.input_tokens, null, time, u.output_tokens, u.cached_input_tokens);
          s.totalTokens = number(total.total_tokens) ?? s.totalTokens; s.outputTokens = number(total.output_tokens) ?? s.outputTokens; s.cachedTokens = number(total.cached_input_tokens) ?? s.cachedTokens;
        }
        if (o.type === 'response_item') {
          if (p.type === 'message' && p.role === 'user') responseTurns++;
          if (p.type === 'function_call' || p.type === 'custom_tool_call') call(p.namespace ? `${p.namespace}.${p.name}` : p.name, p.call_id || p.id || position, time);
          if (p.type === 'message' && p.role === 'assistant') firstResponse = true;
        }
        if (o.type === 'world_state') {
          const world = p.state || {};
          if (world.agents_md?.directory) resource(join(world.agents_md.directory, 'AGENTS.md'), 'memory context', firstResponse ? 'during session' : 'first request', typeof world.agents_md.text === 'string' ? Math.ceil(world.agents_md.text.length / 4) : null);
          s.model = label(world.model) || s.model;
        }
        if (o.type === 'compacted') s.compactions++;
      } else {
        if (o.role === 'user') { recognized++; responseTurns++; }
        if (o.role === 'assistant') { recognized++; firstResponse = true; }
        // Exported Cursor transcripts currently omit tool events/usage. Do not infer
        // non-use from prose or ask an AI to reconstruct private tool activity.
      }
    },
    finish({ partial = false, malformed = 0 } = {}) {
      s.turns = eventTurnCount || responseTurns; s.partial = partial || malformed > 0;
      if (!recognized) s.partial = true;
      s.tools = [...tools.values()]; s.availableTools = [...available.values()]; s.resources = [...resources.values()];
      if (usage.size) { s.timeline = []; s.firstInputTokens = null; s.latestInputTokens = null; s.peakInputTokens = null; for (const u of usage.values()) point(u.input, s.contextWindow, u.at, u.output, u.cached); s.totalTokens = [...usage.values()].reduce((n, u) => n + u.input + u.output, 0); s.outputTokens = [...usage.values()].reduce((n, u) => n + u.output, 0); s.cachedTokens = [...usage.values()].reduce((n, u) => n + u.cached, 0); }
      if (wrappedTools) { s.coverage = 'partial-tools'; s.notes.push('A code execution tool can call nested tools that this log does not expose individually.'); }
      if (s.observer) { s.coverage = observedStart ? 'tool-events' : 'partial-tools'; if (!observedStart) s.notes.push('Observer started after the session, or its start event is missing. Earlier tool use is unknown.'); }
      if (s.partial) s.notes.push('The source was incomplete, changed while reading, exceeded a limit or contained malformed records. It is excluded from non-use alerts.');
      if (s.partial) s.firstInputTokens = null;
      if (provider === 'Cursor' && !s.observer) { s.nativeId ||= /^[a-f0-9-]{36}\.jsonl$/i.test(basename(path)) ? basename(path, '.jsonl') : null; s.notes.push('Cursor transcript records messages only. Tool availability, calls and token usage are not exposed here. Enable the local observer to record future activity.'); }
      if (!s.availableTools.length) s.notes.push('This log does not provide a complete tool inventory. Configured tools are not proof of session availability.');
      s.notes.push('First-request input includes the first prompt. Cumulative tokens count repeated requests; they are not context occupancy.');
      s.id = hash(`${provider}:${s.nativeId || path}`);
      return s;
    },
  };
}

export function usageRecommendations(sessions, resources, now = Date.now()) {
  const result = [];
  for (const r of resources.filter(r => r.kind === 'mcp' && r.enabled && !r.parked && !r.error && !r.overrideOnly)) {
    const applicable = sessions.filter(s => s.provider === r.provider && !s.subagent && s.turns > 0 &&
      (r.scope === 'user' || !!s.project && !!r.project && inside(s.project, r.project))).sort((a, b) => (b.startedAt || b.modifiedAt).localeCompare(a.startedAt || a.modifiedAt));
    const recent = applicable.slice(0, 3); if (recent.length < 3 || recent.some(s => s.partial || !s.completed || s.coverage !== 'tool-events')) continue;
    const matches = t => t.server === r.name || t.name?.startsWith(`mcp__${r.name}__`) || t.name?.startsWith(`mcp.${r.name}.`);
    const used = s => s.tools.some(t => matches(t) && t.calls > 0);
    if (recent.some(used)) continue;
    const offered = recent.every(s => s.availableTools.some(matches));
    const prior = applicable.find(used), days = prior?.lastActiveAt ? Math.floor((now - Date.parse(prior.lastActiveAt)) / 86400000) : null;
    result.push({ id: hash(`${r.id}:${recent.map(s => s.id).join(':')}`), resourceId: r.id, name: r.name, provider: r.provider, scope: r.scope,
      confidence: offered ? 'observed availability' : 'current configuration only', sessions: recent.map(s => s.id), lastUsedAt: prior?.lastActiveAt || null,
      title: `${r.name}: no calls recorded in 3 sessions`,
      message: offered ? 'This server’s tools were listed in all three sessions, with no recorded calls. Consider disabling it or moving it to a project.' : 'This MCP is enabled now, and the last three eligible sessions have no recorded calls to it. Its historical availability is unknown. Review whether it belongs at project level.',
      note: `${days !== null ? `Last recorded use was ${days} days ago. ` : 'No earlier use found in the inspected history. '}Availability is matched by server name; same-named definitions in multiple scopes may be ambiguous. Deferred schemas can make idle tools inexpensive; token savings are not measured.`,
    });
  }
  return result;
}

export function createSessionIndex({ home, env, maxEntries = 20000, maxFileBytes = 32 * 1024 * 1024, maxTotalBytes = 128 * 1024 * 1024 } = {}) {
  const cache = new Map(); let active = false;
  return { async scan({ preferences = {}, offset = 0, limit = 100, signal } = {}) {
    if (active) fail('BUSY', 'A session scan is already running.');
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 200) fail('INVALID', 'Select a valid session page.');
    active = true;
    try {
      const dirs = providerPaths(home, env, preferences), files = [], issues = []; let entries = 0, limited = false;
      async function walk(path, provider, depth = 0) {
        if (signal?.aborted) fail('CANCELED', 'Session scan canceled.');
        if (depth > 8 || entries >= maxEntries) { limited = true; return; }
        let directory;
        if (provider === 'Observer' && depth === 0) { try { if ((await fs.promises.lstat(path)).isSymbolicLink()) { issues.push({ code: 'UNSAFE_PATH', message: 'The observer directory is a symbolic link and was skipped.' }); return; } } catch {} }
        try { directory = await fs.promises.opendir(path); }
        catch (e) { if (e.code !== 'ENOENT') issues.push({ provider, code: e.code, message: 'A native session directory could not be read.' }); return; }
        for await (const entry of directory) {
          if (++entries > maxEntries) { limited = true; break; }
          if (entry.isSymbolicLink()) continue;
          const child = join(path, entry.name);
          if (entry.isDirectory()) await walk(child, provider, depth + 1);
          else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            try { const st = await fs.promises.lstat(child); files.push({ path: child, provider, size: st.size, mtime: st.mtimeMs, ctime: st.ctimeMs, modifiedAt: st.mtime.toISOString(), identity: `${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}` }); }
            catch { issues.push({ provider, code: 'SOURCE_CHANGED', message: 'A session disappeared during discovery.' }); }
          }
        }
      }
      for (const [path, provider] of [[join(dirs.claude, 'projects'), 'Claude Code'], [join(dirs.codex, 'sessions'), 'Codex'], [join(dirs.codex, 'archived_sessions'), 'Codex'], [join(dirs.cursor, 'projects'), 'Cursor'], [join(home, '.aios', 'activity'), 'Observer']]) {
        entries = 0; await walk(path, provider);
      }
      files.sort((a, b) => b.mtime - a.mtime || a.path.localeCompare(b.path));
      const page = files.slice(offset, offset + limit), sessions = []; let bytes = 0, gapTime = 0;
      try { gapTime = (await fs.promises.lstat(join(home, '.aios', 'activity', 'coverage-gap'))).mtimeMs; } catch {}
      for (const f of page) {
        if (signal?.aborted) fail('CANCELED', 'Session scan canceled.');
        const key = `${f.provider}:${f.path}:${f.provider === 'Observer' ? gapTime : ''}`;
        if (cache.get(key)?.identity === f.identity) { sessions.push(cache.get(key).session); continue; }
        if (bytes + Math.min(f.size, maxFileBytes) > maxTotalBytes) { limited = true; issues.push({ code: 'BYTE_LIMIT', message: 'Session read budget reached. Load the next page for more history.' }); break; }
        const parser = sessionParser(f.provider, f.path, f.modifiedAt); let malformed = 0, partial = f.size > maxFileBytes;
        let handle;
        try {
          handle = await fs.promises.open(f.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
          const before = await handle.stat(); if (!before.isFile() || before.size !== f.size || before.mtimeMs !== f.mtime) partial = true;
          const head = Math.min(1024 * 1024, Math.floor(maxFileBytes / 4));
          const ranges = f.size > maxFileBytes ? [[0, head - 1], [f.size - (maxFileBytes - head), f.size - 1]] : f.size ? [[0, f.size - 1]] : [];
          for (const [start, end] of ranges) {
            let skipFirst = start > 0;
            const stream = handle.createReadStream({ autoClose: false, start, end });
            const lines = createInterface({ input: stream, crlfDelay: Infinity });
            for await (const line of lines) {
              bytes += Buffer.byteLength(line) + 1;
              if (skipFirst) { skipFirst = false; continue; }
              if (!line.trim()) continue;
              try { parser.add(JSON.parse(line)); } catch { malformed++; }
            }
          }
          const after = await handle.stat(); if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) partial = true;
        } catch { partial = true; malformed++; }
        finally { await handle?.close().catch(() => {}); }
        const session = parser.finish({ partial, malformed });
        if (session.observer) {
          if (gapTime && (!session.startedAt || gapTime >= Date.parse(session.startedAt))) { session.partial = true; session.firstInputTokens = null; session.notes.push('An observer event was lost or exceeded a limit; this interval has a coverage gap.'); }
        }
        if (f.provider === 'Cursor' && !session.project) session.project = null;
        sessions.push(session); if (!session.partial) cache.set(key, { identity: f.identity, session });
      }
      if (cache.size > 500) { const keys = [...cache.keys()]; for (const key of keys.slice(0, cache.size - 500)) cache.delete(key); }
      if (limited) issues.push({ code: 'SCAN_LIMIT', message: 'History coverage is limited by a bounded read or directory budget. Alerts use only complete eligible records.' });
      const merged = new Map();
      for (const s of sessions) {
        const prior = merged.get(s.id);
        if (!prior) merged.set(s.id, s);
        else if (s.provider === 'Cursor') { const observer = s.observer ? s : prior.observer ? prior : null; if (observer) merged.set(s.id, { ...prior, ...observer, resources: [...prior.resources, ...s.resources] }); }
        else { const native = prior.observer ? s : prior; merged.set(s.id, { ...native, resources: [...new Map([...prior.resources, ...s.resources].map(r => [`${r.kind}:${r.name}`, r])).values()] }); }
      }
      return { sessions: [...merged.values()], totalDiscovered: files.length, nextOffset: offset + sessions.length < files.length ? offset + sessions.length : null, limited, issues, scannedAt: new Date().toISOString(), metadataOnly: true };
    } finally { active = false; }
  }, clear() { cache.clear(); } };
}
