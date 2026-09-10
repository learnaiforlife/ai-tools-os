import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createService, statuslineScript } from '../scripts/lib/service.mjs';
import { Storage, readText, hash } from '../scripts/lib/storage.mjs';
import { frontmatter, mcpEnabledToml, parseConfig } from '../scripts/lib/formats.mjs';
import { spawnSync } from 'node:child_process';

function fixture(t, options = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-test-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(join(home, 'Documents'), { recursive: true });
  const service = createService({ home, env: {}, managedRoots: [], ...options });
  const put = (path, content, mode = 0o600) => { const p = join(home, path); fs.mkdirSync(dirname(p), { recursive: true }); fs.writeFileSync(p, content, { mode }); return p; };
  const call = (op, args) => { const result = service.request(op, args); assert.equal(result.ok, true, JSON.stringify(result)); return result; };
  const inventory = () => call('inventory');
  const find = (kind, name) => inventory().resources.find(r => r.kind === kind && (r.name === name || r.path.endsWith(name)));
  return { home, put, call, inventory, find, service };
}
test('empty machine contains no invented resources', t => { const f = fixture(t); assert.deepEqual(f.inventory().resources, []); });
test('provider and project identity prevents duplicate-name mutations', t => {
  const f = fixture(t);
  f.put('.claude.json', JSON.stringify({ mcpServers: { same: { command: 'global', args: ['a b'] } } }));
  const project = f.put('Documents/项目 A/.mcp.json', JSON.stringify({ mcpServers: { same: { command: 'project' } } }));
  const items = f.inventory().resources.filter(r => r.kind === 'mcp'); assert.equal(new Set(items.map(r => r.id)).size, 2);
  const item = items.find(r => r.path === project);
  f.call('resource.toggle', { id: item.id, revision: item.revision, enabled: false });
  assert.equal(JSON.parse(fs.readFileSync(join(f.home, '.claude.json'))).mcpServers.same.command, 'global');
  assert.deepEqual(JSON.parse(fs.readFileSync(project)).mcpServers, {});
  const parked = f.inventory().resources.find(r => r.id === item.id); assert.equal(parked.enabled, false);
  f.call('resource.toggle', { id: parked.id, revision: parked.revision, enabled: true });
  assert.equal(JSON.parse(fs.readFileSync(project)).mcpServers.same.command, 'project');
});
test('full content, complex YAML and empty bodies round trip', t => {
  const f = fixture(t), raw = '---\r\nname: Test\r\ntools: [Read, "Write"]\r\ndescription: >\r\n  long description\r\n  second line\r\n---\r\n' + 'body\n'.repeat(2000);
  const path = f.put('.claude/skills/test/SKILL.md', raw);
  const r = f.find('skills', 'Test'); assert.equal(r.error, undefined);
  const file = f.call('resource.read', { id: r.id }); assert.equal(file.content, raw);
  f.call('resource.write', { id: r.id, revision: file.revision, content: raw + 'end' });
  assert.equal(fs.readFileSync(path, 'utf8'), raw + 'end'); assert.equal(fs.statSync(path).mode & 0o777, 0o600);
  assert.deepEqual(frontmatter(raw).metadata.tools, ['Read', 'Write']);
});
test('external changes reject stale saves without destroying drafts or files', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', 'before'); const r = f.find('memory', 'CLAUDE.md');
  fs.writeFileSync(path, 'external'); const result = f.service.request('resource.write', { id: r.id, revision: r.revision, content: 'draft' });
  assert.equal(result.code, 'CONFLICT'); assert.equal(fs.readFileSync(path, 'utf8'), 'external');
});
test('only discovered resources can be read or written', t => {
  const f = fixture(t); f.put('Documents/secrets.env.local', 'secret');
  assert.equal(f.inventory().resources.length, 0);
  assert.equal(f.service.request('resource.read', { id: join(f.home, 'Documents/secrets.env.local') }).code, 'NOT_FOUND');
  assert.equal(f.service.request('/api/file', { path: '/etc/passwd' }).code, 'NOT_FOUND');
});
test('symlink boundary blocks reads until target folder is explicitly registered', t => {
  const f = fixture(t), outside = f.put('private/secret.md', 'private');
  fs.mkdirSync(join(f.home, '.claude')); fs.symlinkSync(outside, join(f.home, '.claude/CLAUDE.md'));
  let r = f.find('memory', 'CLAUDE.md'); assert.equal(r.readonly, true);
  assert.equal(f.service.request('resource.read', { id: r.id }).ok, false);
  f.call('roots.set', { roots: [join(f.home, 'private')] }); r = f.find('memory', 'CLAUDE.md');
  f.call('resource.write', { id: r.id, revision: r.revision, content: 'updated' });
  assert.equal(fs.lstatSync(join(f.home, '.claude/CLAUDE.md')).isSymbolicLink(), true); assert.equal(fs.readFileSync(outside, 'utf8'), 'updated');
});
test('source-correct nested commands and full skill directories restore without overwriting', t => {
  const f = fixture(t), path = f.put('Documents/p/.claude/commands/nested/same.md', 'project command');
  f.put('.claude/commands/same.md', 'global');
  let r = f.inventory().resources.find(r => r.path === path);
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  assert.equal(fs.readFileSync(join(f.home, '.claude/commands/same.md'), 'utf8'), 'global');
  r = f.inventory().resources.find(x => x.id === r.id); assert.equal(r.enabled, false);
  f.put('Documents/p/.claude/commands/nested/same.md', 'new file');
  const collision = f.service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: true });
  assert.equal(collision.code, 'CONFLICT'); assert.equal(fs.readFileSync(path, 'utf8'), 'new file');
  fs.unlinkSync(path); r = f.inventory().resources.find(x => x.id === r.id);
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: true }); assert.equal(fs.readFileSync(path, 'utf8'), 'project command');
  f.put('.agents/skills/complete/SKILL.md', 'complete'); f.put('.agents/skills/complete/scripts/tool.py', 'support file');
  let skill = f.find('skills', 'complete'); f.call('resource.toggle', { id: skill.id, revision: skill.revision, enabled: false });
  skill = f.find('skills', 'complete'); f.call('resource.toggle', { id: skill.id, revision: skill.revision, enabled: true });
  assert.equal(fs.readFileSync(join(f.home, '.agents/skills/complete/scripts/tool.py'), 'utf8'), 'support file');
});
test('malformed config is isolated and visible; invalid saves are rejected', t => {
  const f = fixture(t); f.put('.claude.json', '{broken'); f.put('.claude/CLAUDE.md', 'valid');
  const inv = f.inventory(); assert.ok(inv.issues.some(i => i.code === 'PARSE_ERROR')); assert.ok(inv.resources.some(r => r.kind === 'memory'));
  const r = inv.resources.find(r => r.kind === 'config'); assert.equal(f.service.request('resource.write', { id: r.id, revision: r.revision, content: '{}' + 'x' }).code, 'INVALID');
});
test('environment overrides, native Cursor rules, shared skills and local settings are discovered', t => {
  const f = fixture(t); const custom = join(f.home, 'custom');
  f.put('custom/.claude.json', '{"mcpServers":{"x":{"command":"x"}}}'); f.put('custom/settings.local.json', '{}');
  f.put('.cursor/mcp.json', '{"mcpServers":{"x":{"url":"https://example.test/mcp"}}}');
  f.put('Documents/p/.cursor/rules/test.mdc', '---\nalwaysApply: true\n---\nRule');
  const service = createService({ home: f.home, env: { CLAUDE_CONFIG_DIR: custom, CODEX_HOME: join(f.home, 'codex-custom') }, managedRoots: [] });
  f.put('codex-custom/config.toml', '[mcp_servers.x]\ncommand="x"\n');
  const inv = service.request('inventory'); assert.equal(inv.resources.filter(r => r.kind === 'mcp').length, 3);
  assert.ok(inv.resources.some(r => r.path.endsWith('.mdc'))); assert.ok(inv.resources.some(r => r.path.endsWith('settings.local.json')));
});
test('Codex enable/disable preserves comments, argument boundaries and unknown fields', t => {
  const f = fixture(t), raw = '# keep header\nmodel="x"\n[mcp_servers."has.dot"] # server comment\ncommand = "npx"\nargs = ["a b", "--value=c d"]\n# retain\n[mcp_servers."has.dot".env]\nTOKEN="secret"\n';
  const path = f.put('.codex/config.toml', raw); let r = f.find('mcp', 'has.dot');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  const next = fs.readFileSync(path, 'utf8'); assert.equal(next.replace('enabled = false\n', ''), raw);
  assert.equal(parseConfig(next, path).mcp_servers['has.dot'].enabled, false);
  r = f.find('mcp', 'has.dot'); f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: true });
  assert.equal(parseConfig(fs.readFileSync(path, 'utf8'), path).mcp_servers['has.dot'].enabled, true);
});
test('TOML edits support dotted and inline forms without stripping comments', () => {
  for (const raw of ['mcp_servers.x = {command="x"}\n', 'mcp_servers.x.command="x"\nmcp_servers.x.enabled=true # keep\n', '[mcp_servers.x]\ncommand="x"']) {
    const changed = mcpEnabledToml(raw, 'x', false); assert.equal(parseConfig(changed, 'c.toml').mcp_servers.x.enabled, false);
    if (raw.includes('# keep')) assert.ok(changed.includes('# keep'));
  }
});
test('failed MCP restore rolls all writes back and retains parked configuration', t => {
  let failWrite = false;
  const f = fixture(t, { fault: (phase, index) => { if (failWrite && phase === 'write' && index === 0) throw Error('injected failure'); } });
  f.put('.claude.json', '{"mcpServers":{"x":{"command":"x","env":{"TOKEN":"secret"}}}}');
  let r = f.find('mcp', 'x'); f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  r = f.find('mcp', 'x'); failWrite = true;
  assert.equal(f.service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: true }).ok, false);
  failWrite = false; r = f.find('mcp', 'x'); assert.equal(r.enabled, false);
  assert.ok(f.call('resource.read', { id: r.id }).content.includes('secret'));
});
test('captured profiles restore actual memberships, and no default empty profile exists', t => {
  const f = fixture(t); assert.deepEqual(f.inventory().profiles, []); assert.equal(f.service.request('profiles.capture', { name: 'empty' }).code, 'EMPTY_PROFILE');
  f.put('.claude.json', '{"mcpServers":{"x":{"command":"x"}}}');
  const profile = f.call('profiles.capture', { name: 'All' }).profiles[0]; let r = f.find('mcp', 'x');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  const preview = f.call('profiles.preview', { id: profile.id });
  f.call('profiles.apply', { id: profile.id, previewRevision: preview.previewRevision }); assert.equal(f.find('mcp', 'x').enabled, true);
});
test('scan root removal and preferences persist across service restarts', t => {
  const f = fixture(t); f.call('roots.set', { roots: [] });
  const prefs = { theme: 'light', syncInterval: 60, exclusions: ['large'], providerPaths: {} };
  f.call('preferences.save', { preferences: prefs });
  const other = createService({ home: f.home, env: {}, managedRoots: [] }).request('inventory');
  assert.deepEqual(other.roots, []); assert.deepEqual(other.preferences, prefs);
});
test('state corruption cannot silently reset parked data', t => {
  const f = fixture(t); f.put('.aios/state-v2.json', 'invalid'); assert.equal(f.service.request('inventory').code, 'STATE_CORRUPT');
  assert.equal(fs.readFileSync(join(f.home, '.aios/state-v2.json'), 'utf8'), 'invalid');
});
test('private state and transaction history are protected', t => {
  const f = fixture(t); f.put('.claude/CLAUDE.md', 'a'); const r = f.find('memory', 'CLAUDE.md');
  f.call('resource.write', { id: r.id, revision: r.revision, content: 'b' });
  const history = f.call('history').history; assert.equal(history[0].files[0].path, r.path);
  assert.equal(f.call('history.read', { id: history[0].id, path: r.path }).content, 'a');
  assert.equal(fs.statSync(join(f.home, '.aios')).mode & 0o777, 0o700);
  assert.equal(fs.statSync(join(f.home, '.aios/history', history[0].id + '.json')).mode & 0o777, 0o600);
});
test('pending journal recovery preserves preimage and detects external conflicts', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', 'after'), storage = new Storage(join(f.home, '.aios'));
  const journal = { id: 'test', status: 'pending', moves: [], writes: [{ path, after: hash('after'), before: { content: 'before', revision: hash('before'), mode: 0o600 } }] };
  f.put('.aios/history/test.json', JSON.stringify(journal)); storage.locked(() => {}); assert.equal(readText(path).content, 'before');
  fs.writeFileSync(path, 'external'); f.put('.aios/history/test.json', JSON.stringify(journal));
  assert.throws(() => storage.locked(() => {}), e => e.code === 'RECOVERY_CONFLICT'); assert.equal(readText(path).content, 'external');
});
test('new resources use selected project paths and reject traversal', t => {
  const f = fixture(t); fs.mkdirSync(join(f.home, 'Documents/p'));
  f.call('resource.create', { kind: 'skills', provider: 'Codex', scope: 'project', project: join(f.home, 'Documents/p'), name: 'new skill', content: '---\nname: new skill\n---\nFull text' });
  assert.ok(fs.existsSync(join(f.home, 'Documents/p/.agents/skills/new skill/SKILL.md')));
  assert.equal(f.service.request('resource.create', { kind: 'skills', provider: 'Codex', scope: 'project', project: join(f.home, 'Documents/p'), name: '../escape', content: 'no' }).code, 'INVALID');
});
test('MCP creation preserves remote URL, headers and structured arguments', t => {
  const f = fixture(t); f.call('mcp.create', { provider: 'Claude Code', scope: 'user', name: 'remote', config: { url: 'https://example.test/mcp', headers: { Authorization: 'Bearer value' } } });
  const r = f.find('mcp', 'remote'); assert.equal(r.hasSecrets, true); assert.equal(r.runtime, 'unknown');
  assert.deepEqual(JSON.parse(f.call('resource.read', { id: r.id }).content).headers, { Authorization: 'Bearer value' });
  f.call('mcp.create', { provider: 'Codex', scope: 'user', name: 'cmd', config: { command: 'npx', args: ['one two'], env: { X: 'y' } } });
  assert.deepEqual(parseConfig(fs.readFileSync(join(f.home, '.codex/config.toml'), 'utf8'), 'x.toml').mcp_servers.cmd.args, ['one two']);
});
test('statusline install validates both baselines before touching either file', t => {
  const f = fixture(t), settings = f.put('.claude/settings.json', '{bad'), script = f.put('.claude/statusline.sh', 'working');
  const p = f.call('statusline.preview');
  assert.equal(f.service.request('statusline.install', { settingsRevision: p.settings.revision, scriptRevision: p.script.revision }).code, 'INVALID');
  assert.equal(fs.readFileSync(script, 'utf8'), 'working'); assert.equal(fs.readFileSync(settings, 'utf8'), '{bad');
  fs.writeFileSync(settings, '{}'); const p2 = f.call('statusline.preview'); f.call('statusline.install', { settingsRevision: p2.settings.revision, scriptRevision: p2.script.revision });
  assert.ok(JSON.parse(fs.readFileSync(settings)).statusLine.command.includes('/bin/bash'));
});
test('generated statusline actually executes on macOS', { skip: process.platform !== 'darwin' }, () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'aios-status-')); const path = join(dir, 'status.sh');
  try { fs.writeFileSync(path, statuslineScript()); const run = spawnSync('/bin/bash', [path], { input: JSON.stringify({ model: { display_name: 'Test' }, workspace: { current_dir: '/project with spaces' }, context_window: { used_percentage: 25 } }), encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout.trim(), 'Test | /project with spaces | 25% context');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('scan limits report omissions and cancellation explicitly', t => {
  const f = fixture(t, { maxEntries: 2 }); f.put('.claude/skills/a/SKILL.md', 'a'); f.put('.claude/skills/b/SKILL.md', 'b'); f.put('.claude/skills/c/SKILL.md', 'c');
  assert.equal(f.inventory().incomplete, true);
  const canceled = createService({ home: f.home, env: {}, managedRoots: [], canceled: () => true }); assert.equal(canceled.request('inventory').code, 'CANCELED');
});
test('prompt library survives restart with no seeded examples', t => {
  const f = fixture(t); assert.deepEqual(f.inventory().prompts, []);
  const saved = f.call('prompts.save', { prompt: { name: 'Mine', content: 'Hello {{name}}', favorite: true } }).prompts[0];
  const state = createService({ home: f.home, env: {}, managedRoots: [] }).request('inventory'); assert.deepEqual(state.prompts, [saved]);
  f.call('prompts.delete', { id: saved.id }); assert.deepEqual(f.inventory().prompts, []);
});
