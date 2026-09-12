import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { sessionParser, usageRecommendations, createSessionIndex } from '../scripts/lib/insights/sessions.mjs';
import { observerRecord } from '../scripts/lib/insights/observer.mjs';
import { interpretNewsPrompt, parseNews, officialNewsUrl, NEWS_SOURCES, createNewsReader } from '../scripts/lib/insights/news.mjs';
import { createService } from '../scripts/lib/service.mjs';
import { createLab } from '../scripts/lib/lab.mjs';
const stamp = '2026-09-12T10:00:00.000Z';
function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-insights-test-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const put = (path, data) => { const full = join(home, path); fs.mkdirSync(dirname(full), { recursive: true }); fs.writeFileSync(full, data); return full; };
  const service = createService({ home, env: {}, managedRoots: [] });
  return { home, put, service, call: (op, args) => { const r = service.request(op, args); assert.ok(r.ok, r.error); return r; } };
}
function parse(provider, events, options = {}) { const p = sessionParser(provider, '/fixture/log.jsonl', stamp); for (const e of events) p.add({ timestamp: stamp, ...e }); return p.finish(options); }
const claude = [
  { type: 'user', sessionId: 'session-one', uuid: 'u', cwd: '/project', message: { content: 'PRIVATE PROMPT' } },
  { type: 'attachment', attachment: { type: 'deferred_tools_delta', addedNames: ['mcp__db__query'] } },
  { type: 'attachment', attachment: { type: 'instructions', files: [{ path: '/project/CLAUDE.md', content: 'PRIVATE INSTRUCTIONS' }] } },
  { type: 'assistant', message: { id: 'm', model: 'test-model', usage: { input_tokens: 30, cache_creation_input_tokens: 10, cache_read_input_tokens: 60, output_tokens: 2 }, content: [{ type: 'tool_use', name: 'mcp__db__query', id: 'tool', input: { secret: 'PRIVATE TOOL PARAM' } }] } },
  { type: 'assistant', message: { id: 'm', model: 'test-model', stop_reason: 'end_turn', usage: { input_tokens: 30, cache_creation_input_tokens: 10, cache_read_input_tokens: 60, output_tokens: 8 }, content: [{ type: 'tool_use', name: 'mcp__db__query', id: 'tool' }] } },
];
test('Claude metadata deduplicates streamed usage and tools, retains deferred evidence, excludes conversation', () => {
  const s = parse('Claude Code', claude);
  assert.equal(s.toolCalls, 1); assert.equal(s.totalTokens, 108); assert.equal(s.firstInputTokens, 100); assert.equal(s.timeline.length, 1); assert.equal(s.completed, true);
  assert.equal(s.tools[0].server, 'db'); assert.equal(s.availableTools[0].loading, 'deferred schema'); assert.equal(s.resources[0].kind, 'memory'); assert.equal(s.startupTokens, null);
  assert.ok(!JSON.stringify(s).includes('PRIVATE'));
});
test('Codex uses per-request input separately from cumulative usage and marks opaque wrappers', () => {
  const s = parse('Codex', [{ type: 'session_meta', payload: { id: 'codex-id', cwd: '/project' } }, { type: 'event_msg', payload: { type: 'user_message' } },
    { type: 'turn_context', payload: { model: 'test-model' } }, { type: 'response_item', payload: { type: 'custom_tool_call', name: 'functions.exec', call_id: 'call', input: 'PRIVATE CODE' } },
    { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 1200, output_tokens: 60 }, total_token_usage: { total_tokens: 50000 }, model_context_window: 10000 } } },
    { type: 'event_msg', payload: { type: 'task_complete' } }]);
  assert.equal(s.firstInputTokens, 1200); assert.equal(s.totalTokens, 50000); assert.equal(s.contextWindow, 10000); assert.equal(s.coverage, 'partial-tools'); assert.equal(s.turns, 1); assert.equal(s.completed, true); assert.ok(!JSON.stringify(s).includes('PRIVATE'));
});
test('Cursor transcript gaps stay unknown rather than becoming zero-use evidence', () => {
  const s = parse('Cursor', [{ role: 'user', message: { content: 'PRIVATE' } }, { role: 'assistant', message: { content: 'PRIVATE' } }]);
  assert.equal(s.coverage, 'messages-only'); assert.equal(s.latestInputTokens, null); assert.equal(s.completed, false); assert.equal(s.turns, 1);
});
test('three-session alerts require eligible matching scopes, no calls, and qualify availability', () => {
  const sessions = [1, 2, 3].map(n => ({ ...parse('Claude Code', claude), id: `s${n}`, tools: [], startedAt: `2026-09-1${n}T00:00:00Z` }));
  const resource = { id: 'resource', kind: 'mcp', provider: 'Claude Code', enabled: true, scope: 'project', project: '/project', name: 'db' };
  assert.equal(usageRecommendations(sessions, [resource])[0].confidence, 'observed availability');
  assert.equal(usageRecommendations(sessions, [{ ...resource, project: '/elsewhere' }]).length, 0);
  assert.equal(usageRecommendations(sessions.slice(1), [resource]).length, 0);
  assert.equal(usageRecommendations([{ ...sessions[0], partial: true }, ...sessions.slice(1)], [resource]).length, 0);
  assert.equal(usageRecommendations(sessions.map(s => ({ ...s, availableTools: [] })), [resource])[0].confidence, 'current configuration only');
  assert.equal(usageRecommendations([{ ...sessions[0], tools: [{ server: 'db', calls: 1 }] }, ...sessions.slice(1)], [resource]).length, 0);
  assert.equal(usageRecommendations(sessions.map(s => ({ ...s, subagent: true })), [resource]).length, 0);
});
test('session reader honors CODEX_HOME, skips symlinks, reports malformed and bounded files, paginates', async t => {
  const f = fixture(t), events = JSON.stringify({ type: 'session_meta', timestamp: stamp, payload: { id: 'one', cwd: '/project' } });
  f.put('custom/sessions/2026/a.jsonl', events + '\n'); f.put('.claude/projects/p/b.jsonl', JSON.stringify(claude[0]) + '\nBROKEN\n');
  const outside = f.put('outside/private.jsonl', events); fs.symlinkSync(outside, join(f.home, 'custom/sessions/link.jsonl'));
  const index = createSessionIndex({ home: f.home, env: { CODEX_HOME: join(f.home, 'custom') } });
  const page = await index.scan({ limit: 1 }); assert.equal(page.totalDiscovered, 2); assert.equal(page.nextOffset, 1);
  const next = await index.scan({ offset: 1, limit: 1 }); assert.equal(next.sessions.length, 1);
  assert.equal([page, next].flatMap(p => p.sessions).filter(s => s.partial).length, 1);
  const bounded = await createSessionIndex({ home: f.home, env: { CODEX_HOME: join(f.home, 'custom') }, maxFileBytes: 10 }).scan(); assert.ok(bounded.sessions.every(s => s.partial));
});
test('observer stores narrow metadata, normalizes MCP names and separates compaction context', () => {
  const record = observerRecord({ conversation_id: 'c', hook_event_name: 'afterMCPExecution', workspace_roots: ['/p'], tool_name: 'query', mcp_server_name: 'db', tool_input: 'PRIVATE', result_json: 'PRIVATE', user_email: 'PRIVATE', prompt: 'PRIVATE' }, 'Cursor', stamp);
  assert.equal(record.tool, 'mcp__db__query'); assert.ok(!JSON.stringify(record).includes('PRIVATE'));
  const s = parse('Observer', [observerRecord({ session_id: 'c', hook_event_name: 'sessionStart' }, 'Cursor', stamp), observerRecord({ session_id: 'c', hook_event_name: 'beforeSubmitPrompt' }, 'Cursor', stamp), record, observerRecord({ session_id: 'c', hook_event_name: 'preCompact', context_tokens: 120, context_usage_percent: 60, context_window_size: 200 }, 'Cursor', stamp), observerRecord({ session_id: 'c', hook_event_name: 'stop', status: 'completed' }, 'Cursor', stamp)]);
  assert.equal(s.provider, 'Cursor'); assert.equal(s.toolCalls, 1); assert.equal(s.coverage, 'tool-events'); assert.equal(s.reportedContext.tokens, 120); assert.equal(s.latestInputTokens, null); assert.equal(s.completed, true);
});
test('observer installed mid-session cannot establish earlier non-use', () => {
  const s = parse('Observer', [observerRecord({ session_id: 'c', hook_event_name: 'beforeSubmitPrompt' }, 'Cursor', stamp), observerRecord({ session_id: 'c', hook_event_name: 'stop', status: 'completed' }, 'Cursor', stamp)]);
  assert.equal(s.coverage, 'partial-tools');
});
test('observer installation/removal preserves other hooks and rejects stale previews', t => {
  const f = fixture(t); f.put('.cursor/hooks.json', '{"version":1,"hooks":{"stop":[{"command":"existing-hook"}]},"custom":true}');
  const a = f.call('observer.preview', { provider: 'Cursor', action: 'install' }); assert.ok(a.after.includes('existing-hook'));
  f.call('observer.apply', { provider: 'Cursor', action: 'install', previewRevision: a.previewRevision });
  assert.equal(f.service.request('observer.apply', { provider: 'Cursor', action: 'install', previewRevision: a.previewRevision }).code, 'CONFLICT');
  const b = f.call('observer.preview', { provider: 'Cursor', action: 'remove' }); f.call('observer.apply', { provider: 'Cursor', action: 'remove', previewRevision: b.previewRevision });
  const native = JSON.parse(fs.readFileSync(join(f.home, '.cursor/hooks.json'))); assert.deepEqual(native.hooks, { stop: [{ command: 'existing-hook' }] }); assert.equal(native.custom, true);
});
test('cleanup previews complete resources and stale plans never overwrite newer state', t => {
  const f = fixture(t), path = f.put('.claude/skills/sample/SKILL.md', '---\nname: sample\ndescription: Sample\n---\nKeep me'); f.put('.claude/skills/sample/data.txt', 'Support');
  const r = f.call('inventory').resources.find(r => r.kind === 'skills'), sources = [{ id: r.id, revision: r.revision }];
  const preview = f.call('cleanup.preview', { sources }); assert.ok(fs.existsSync(path));
  fs.writeFileSync(path, 'Changed by another editor'); assert.equal(f.service.request('cleanup.apply', { sources, previewRevision: preview.previewRevision }).code, 'CONFLICT'); assert.ok(fs.existsSync(path));
  const fresh = f.call('inventory').resources.find(r => r.kind === 'skills'), selected = [{ id: fresh.id, revision: fresh.revision }], next = f.call('cleanup.preview', { sources: selected });
  const archived = f.call('cleanup.apply', { sources: selected, previewRevision: next.previewRevision }).resources.find(r => r.kind === 'skills'); assert.equal(archived.enabled, false);
  f.call('resource.toggle', { id: archived.id, parked: true, revision: archived.revision, enabled: true }); assert.equal(fs.readFileSync(join(dirname(path), 'data.txt'), 'utf8'), 'Support');
});
test('experience preferences survive ordinary preference edits', t => {
  const f = fixture(t); f.call('preferences.experience.save', { preferences: { showDetails: true, sessionsEnabled: false } });
  f.call('preferences.save', { preferences: { theme: 'light', syncInterval: 0, exclusions: [], providerPaths: {} } });
  assert.equal(f.call('preferences.experience.get').preferences.showDetails, true); assert.equal(f.call('preferences.experience.get').preferences.sessionsEnabled, false);
});
test('news prompts select detected harnesses, types, exclusions and bounded lookback', () => {
  const filter = interpretNewsPrompt('Only Codex model releases, last 7 days, exclude Cursor', ['Codex', 'Cursor']);
  assert.deepEqual(filter.providers, ['Codex']); assert.deepEqual(filter.types, ['models']); assert.equal(filter.days, 7);
  assert.deepEqual(interpretNewsPrompt('Claude releases', ['Codex']).providers, []);
  assert.equal(interpretNewsPrompt('last 900 days', ['Codex']).days, 365);
});
const rss = '<rss><channel><item><title>New GPT model</title><link>https://openai.com/index/new-model/</link><pubDate>Sat, 12 Sep 2026 09:00:00 GMT</pubDate><description>Article body not redistributed</description></item><item><title>Bad</title><link>https://evil.test/</link><pubDate>Sat, 12 Sep 2026 09:00:00 GMT</pubDate></item></channel></rss>';
test('official news parser rejects injected links, entities, invalid dates and full article redistribution', () => {
  const source = NEWS_SOURCES.find(s => s.id === 'openai'), rows = parseNews(rss, source); assert.equal(rows.length, 1); assert.equal(rows[0].title, 'New GPT model'); assert.ok(!JSON.stringify(rows).includes('Article body'));
  assert.equal(officialNewsUrl('https://openai.com.evil.test/', source), null); assert.equal(officialNewsUrl('javascript:alert(1)', source), null); assert.equal(officialNewsUrl('https://user:secret@openai.com/', source), null);
  assert.throws(() => parseNews('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>', source)); assert.throws(() => parseNews('<rss>', source));
});
test('official news caches success and keeps stale headlines on network failure', async t => {
  const f = fixture(t); let clock = Date.parse(stamp), calls = 0, offline = false;
  const reader = createNewsReader({ root: f.home, now: () => clock, fetcher: async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); if (offline) throw Error('offline'); return new Response(rss); } });
  const args = { prompt: 'Only Codex models last 7 days', detected: ['Codex'] };
  assert.equal((await reader.read(args)).items.length, 1); await reader.read(args); assert.equal(calls, 1);
  offline = true; clock += 7200000; const stale = await reader.read(args); assert.equal(stale.items.length, 1); assert.equal(stale.sources[0].stale, true); await reader.read({ ...args, refresh: true }); assert.equal(calls, 2); clock += 31000; await reader.read(args); assert.equal(calls, 3);
});
const done = async (lab, id) => { for (let i = 0; i < 500; i++) { const { job } = await lab.request('get', { id }); if (['completed', 'failed', 'canceled'].includes(job.status)) return job; await new Promise(r => setTimeout(r, 5)); } throw Error('timeout'); };
test('quick evaluation exposes no behavior score when no model is available', async t => {
  const f = fixture(t); f.put('.claude/skills/test/SKILL.md', '---\nname: test\ndescription: Test\n---\nUppercase the input.'); const resource = f.call('inventory').resources.find(r => r.kind === 'skills');
  const lab = createLab({ home: f.home, env: {}, service: f.service }); t.after(() => lab.shutdown());
  const started = await lab.request('evaluate.quick', { id: resource.id, settings: { provider: 'local' } }); assert.ok(started.ok, started.error); const job = await done(lab, started.job.id); assert.equal(job.result.complete, false); assert.equal(job.result.score, undefined);
});
test('quick evaluation validates generated tests before executing and scores complete samples only', async t => {
  const f = fixture(t); f.put('.claude/skills/test/SKILL.md', '---\nname: test\ndescription: Test\n---\nUppercase the input.'); const resource = f.call('inventory').resources.find(r => r.kind === 'skills'); let evaluated = 0;
  const suite = { evals: [1, 2, 3, 4].map(n => ({ id: String(n), prompt: `case ${n}`, assertions: [{ type: 'equals', text: 'Uppercase', value: `CASE ${n}` }] })) };
  const evaluator = { check: async () => ({ id: 'codex' }), call: async () => ({ structured: { suite: JSON.stringify(suite), rationale: 'Fixture cases' } }), evaluate: async ({ suite }) => { evaluated++; assert.equal(suite.length, 4); return { complete: true, summary: { baseline: { pass_rate: { mean: 1 } } }, samples: [] }; } };
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); t.after(() => lab.shutdown());
  const started = await lab.request('evaluate.quick', { id: resource.id }); const job = await done(lab, started.job.id); assert.equal(job.status, 'completed', job.error); assert.equal(evaluated, 1); assert.equal(job.result.score, 1); assert.equal(job.quick, true);
  suite.evals[0].assertions = [{ type: 'file_exists', text: 'File', file: 'out.txt' }]; const invalid = await lab.request('evaluate.quick', { id: resource.id }); const failed = await done(lab, invalid.job.id); assert.equal(failed.status, 'failed'); assert.equal(evaluated, 1);
});
test('bulk review chunks large selections, retains completed batches on provider failure', async t => {
  const f = fixture(t); for (let n = 0; n < 11; n++) f.put(`.claude/skills/item-${n}/SKILL.md`, `---\nname: item-${n}\ndescription: Example\n---\nA useful instruction ${n}.`);
  const ids = f.call('inventory').resources.filter(r => r.kind === 'skills').map(r => r.id); let calls = 0;
  const evaluator = { check: async () => ({ id: 'codex' }), call: async () => { if (++calls === 2) throw Object.assign(Error('provider failed'), { code: 'ENGINE_FAILED' }); return { structured: { findings: [], summary: 'Reviewed' } }; } };
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); t.after(() => lab.shutdown());
  const started = await lab.request('ai.reviewAll', { ids }); assert.ok(started.ok, started.error); const job = await done(lab, started.job.id); assert.equal(job.status, 'failed'); assert.equal(job.result.completedFiles, 10); assert.equal(job.result.complete, false); assert.equal(calls, 2);
});

test('observer execution excludes conversation data and invalidates cached coverage after lost events', async t => {
  const f = fixture(t), preview = f.call('observer.preview', { provider: 'Cursor', action: 'install' });
  f.call('observer.apply', { provider: 'Cursor', action: 'install', previewRevision: preview.previewRevision });
  const script = join(f.home, '.aios/session-observer.mjs');
  for (const hook_event_name of ['sessionStart', 'beforeSubmitPrompt', 'stop']) execFileSync(process.execPath, [script, '--capture', 'Cursor'], { input: JSON.stringify({ conversation_id: 'test', hook_event_name, status: 'completed', prompt: 'PRIVATE', result_json: 'PRIVATE' }) });
  const index = createSessionIndex({ home: f.home, env: {} });
  const first = await index.scan(); assert.equal(first.sessions.length, 1); assert.equal(first.sessions[0].partial, false); assert.equal(first.sessions[0].completed, true); assert.ok(!JSON.stringify(first).includes('PRIVATE'));
  execFileSync(process.execPath, [script, '--capture', 'Cursor'], { input: '{bad json' });
  assert.equal((await index.scan()).sessions[0].partial, true);
});
test('large histories retain recent usage while excluding unknown initial load and non-use alerts', async t => {
  const f = fixture(t), events = [{ type: 'session_meta', timestamp: stamp, payload: { id: 'large', cwd: '/project' } }, ...Array.from({ length: 50 }, () => ({ type: 'response_item', payload: { type: 'message', content: 'padding'.repeat(100) } })), { type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 4321 }, model_context_window: 10000 } } }];
  f.put('.codex/sessions/large.jsonl', events.map(e => JSON.stringify(e)).join('\n') + '\n');
  const page = await createSessionIndex({ home: f.home, env: {}, maxFileBytes: 4096 }).scan();
  assert.equal(page.sessions[0].partial, true); assert.equal(page.sessions[0].firstInputTokens, null); assert.equal(page.sessions[0].latestInputTokens, 4321); assert.equal(page.sessions[0].project, '/project');
});

test('a newer incomplete session prevents skipping back to three older unused sessions', () => {
  const older = [1, 2, 3].map(n => ({ ...parse('Claude Code', claude), id: `s${n}`, tools: [], startedAt: `2026-09-0${n}T00:00:00Z` }));
  const newest = { ...older[0], id: 'newer', startedAt: stamp, partial: true };
  assert.equal(usageRecommendations([...older, newest], [{ id: 'r', kind: 'mcp', provider: 'Claude Code', enabled: true, scope: 'user', name: 'db' }]).length, 0);
  assert.equal(parse('Claude Code', [{ type: 'assistant', message: { usage: {}, content: [] } }]).latestInputTokens, null);
});

test('installing an observer preserves native Claude prompt hooks without command fields', t => {
  const f = fixture(t), promptHook = { matcher: '', hooks: [{ type: 'prompt', prompt: 'Check completion' }] };
  f.put('.claude/settings.json', JSON.stringify({ hooks: { Stop: [promptHook] } }));
  const preview = f.call('observer.preview', { provider: 'Claude Code', action: 'install' });
  assert.deepEqual(JSON.parse(preview.after).hooks.Stop[0], promptHook);
  f.call('observer.apply', { provider: 'Claude Code', action: 'install', previewRevision: preview.previewRevision });
  const remove = f.call('observer.preview', { provider: 'Claude Code', action: 'remove' });
  assert.deepEqual(JSON.parse(remove.after).hooks.Stop, [promptHook]);
});
