import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createService } from '../scripts/lib/service.mjs';
import { discover } from '../scripts/lib/discovery.mjs';
import { contextEstimate, redactJsonText } from '../src/api.js';
import { Storage, inside } from '../scripts/lib/storage.mjs';

function fixture(t, options = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-completion-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(join(home, 'Documents'));
  const put = (path, content) => { const file = join(home, path); fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
  const service = createService({ home, env: {}, managedRoots: [], ...options });
  const call = (op = 'inventory', args) => { const result = service.request(op, args); assert.equal(result.ok, true, JSON.stringify(result)); return result; };
  return { home, put, service, call };
}
test('project indexing skips provider caches and skill support trees', t => {
  const f = fixture(t, { maxEntries: 40 });
  for (let i = 0; i < 80; i++) {
    f.put(`Documents/p/.claude/plugins/cache/pkg${i}/CLAUDE.md`, 'cache');
    f.put(`Documents/p/.claude/skills/real/examples/${i}/AGENTS.md`, 'example');
  }
  f.put('Documents/p/.claude/skills/real/SKILL.md', 'real');
  f.put('Documents/p/.claude/skills/README.md', 'Folder documentation');
  f.put('Documents/q/CLAUDE.md', 'project q');
  const inv = f.call();
  assert.equal(inv.incomplete, false, JSON.stringify(inv.issues));
  assert.equal(inv.resources.length, 2);
  assert.ok(inv.resources.some(r => r.path.endsWith('/q/CLAUDE.md')));
});
test('one oversized scan root does not starve other selected roots', t => {
  const f = fixture(t, { maxEntries: 20 });
  for (let i = 0; i < 60; i++) f.put(`Documents/large/${i}/ordinary.txt`, 'unrelated');
  f.put('selected/nested/CLAUDE.md', 'later root');
  const inv = f.call('roots.set', { roots: [join(f.home, 'Documents'), join(f.home, 'selected')] });
  assert.equal(inv.incomplete, true); assert.ok(inv.issues.some(i => i.code === 'SCAN_LIMIT'));
  assert.ok(inv.resources.some(r => r.path.endsWith('/selected/nested/CLAUDE.md')));
});
test('a broken sibling link does not hide valid commands or projects', t => {
  const f = fixture(t);
  f.put('.claude/commands/z-valid.md', 'valid'); f.put('Documents/z-project/CLAUDE.md', 'valid');
  fs.symlinkSync(join(f.home, 'missing'), join(f.home, '.claude/commands/a-broken'));
  fs.symlinkSync(join(f.home, 'missing'), join(f.home, 'Documents/a-broken'));
  const inv = f.call();
  assert.ok(inv.resources.some(r => r.kind === 'commands'));
  assert.ok(inv.resources.some(r => r.path.endsWith('/z-project/CLAUDE.md')));
  assert.equal(inv.incomplete, true); assert.equal(inv.issues.filter(i => i.code === 'ENOENT').length, 2);
});
test('missing selected roots and broken provider roots are visible without hiding other providers', t => {
  const f = fixture(t); f.put('.cursor/mcp.json', '{"mcpServers":{"x":{"command":"x"}}}');
  fs.symlinkSync(join(f.home, 'missing'), join(f.home, '.claude'));
  const inv = discover({ home: f.home, env: {}, roots: [join(f.home, 'deleted')], managedRoots: [] });
  assert.equal(inv.incomplete, true); assert.ok(inv.issues.some(i => i.code === 'NOT_FOUND'));
  assert.ok(inv.resources.some(r => r.provider === 'Cursor' && r.kind === 'mcp'));
});
test('shared skill directories are not invented config locations; Cursor creation follows its scope', t => {
  const f = fixture(t);
  f.put('.agents/config.toml', '[mcp_servers.false]\ncommand="ignored"');
  f.put('.agents/AGENTS.md', 'not a Codex user instruction source');
  assert.equal(f.call().resources.length, 0);
  const args = { kind: 'memory', provider: 'Cursor', scope: 'user', name: 'rules', content: 'native rules' };
  assert.equal(f.service.request('resource.create', args).code, 'UNSUPPORTED');
  assert.equal(fs.existsSync(join(f.home, '.cursor/.cursorrules')), false);
  const inv = f.call('resource.create', { ...args, scope: 'project', project: join(f.home, 'Documents') });
  assert.ok(inv.resources.some(r => r.provider === 'Cursor' && r.path.endsWith('/Documents/.cursorrules')));
});
test('live and parked copies have independent inspection and edits during a collision', t => {
  const f = fixture(t), path = f.put('.claude/commands/same.md', 'parked original');
  let r = f.call().resources.find(r => r.kind === 'commands');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  fs.writeFileSync(path, 'live replacement');
  let inv = f.call();
  assert.equal(f.service.request('resource.read', { id: r.id }).code, 'CONFLICT');
  assert.equal(f.call('resource.read', { id: r.id, parked: true }).content, 'parked original');
  assert.equal(f.call('resource.read', { id: r.id, parked: false }).content, 'live replacement');
  r = inv.resources.find(r => r.parked);
  f.call('resource.write', { id: r.id, parked: true, revision: r.revision, content: 'edited parked' });
  assert.equal(fs.readFileSync(path, 'utf8'), 'live replacement');
  inv = f.call(); r = inv.resources.find(r => r.parked);
  assert.equal(f.service.request('resource.toggle', { id: r.id, parked: true, revision: r.revision, enabled: true }).code, 'CONFLICT');
  fs.unlinkSync(path);
  f.call('resource.toggle', { id: r.id, parked: true, revision: r.revision, enabled: true });
  assert.equal(fs.readFileSync(path, 'utf8'), 'edited parked');
});
test('MCP parked and live inspection never swaps their configurations', t => {
  const f = fixture(t), path = f.put('.claude.json', '{"mcpServers":{"x":{"command":"old"}}}');
  const r = f.call().resources.find(r => r.kind === 'mcp');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  fs.writeFileSync(path, '{"mcpServers":{"x":{"command":"new"}}}');
  assert.equal(JSON.parse(f.call('resource.read', { id: r.id, parked: true }).content).command, 'old');
  assert.equal(JSON.parse(f.call('resource.read', { id: r.id, parked: false }).content).command, 'new');
});
test('profile capture refuses missing malformed sources and preview is read-only', t => {
  const f = fixture(t); f.put('.claude.json', '{"mcpServers":{"x":{"command":"x"}}}');
  const malformed = f.put('Documents/p/.codex/config.toml', 'malformed = [');
  assert.equal(f.service.request('profiles.capture', { name: 'partial' }).code, 'CONFLICT');
  fs.unlinkSync(malformed);
  const profile = f.call('profiles.capture', { name: 'Enabled' }).profiles[0];
  const r = f.call().resources.find(r => r.kind === 'mcp');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  const statePath = join(f.home, '.aios/state-v2.json'), state = fs.readFileSync(statePath, 'utf8');
  const preview = f.call('profiles.preview', { id: profile.id });
  assert.equal(preview.changes.length, 1); assert.equal(preview.changes[0].path, r.path);
  assert.equal(fs.readFileSync(statePath, 'utf8'), state);
  assert.equal(f.service.request('profiles.apply', { id: profile.id }).code, 'CONFLICT');
  f.call('profiles.apply', { id: profile.id, previewRevision: preview.previewRevision });
  assert.equal(f.call().resources.find(r => r.kind === 'mcp').enabled, true);
});
test('profile apply refuses stale native files even when the parked entry did not change', t => {
  const f = fixture(t), path = f.put('.claude.json', '{"mcpServers":{"x":{"command":"x"}}}');
  const profile = f.call('profiles.capture', { name: 'Enabled' }).profiles[0], r = f.call().resources.find(r => r.kind === 'mcp');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  const preview = f.call('profiles.preview', { id: profile.id });
  fs.writeFileSync(path, '{"mcpServers":{"new":{"command":"new"}}}');
  assert.equal(f.service.request('profiles.apply', { id: profile.id, previewRevision: preview.previewRevision }).code, 'CONFLICT');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path)).mcpServers), ['new']);
  const refreshed = f.call('profiles.preview', { id: profile.id });
  f.call('profiles.apply', { id: profile.id, previewRevision: refreshed.previewRevision });
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path)).mcpServers).sort(), ['new', 'x']);
});
test('JSON native mutations preserve unknown numeric literals and exact parked entry bytes', t => {
  const f = fixture(t);
  const entry = '{ "command" : "x", "future" : 900719925474099312345, "fraction": 0.12345678901234567890 }';
  const path = f.put('.claude.json', '{\r\n\t"unknown": 900719925474099312345,\r\n\t"mcpServers": {"x": ' + entry + '}\r\n}\r\n');
  let r = f.call().resources.find(r => r.kind === 'mcp');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  assert.ok(fs.readFileSync(path, 'utf8').includes('"unknown": 900719925474099312345'));
  r = f.call().resources.find(r => r.kind === 'mcp'); assert.equal(f.call('resource.read', { id: r.id }).content, entry);
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: true });
  assert.ok(fs.readFileSync(path, 'utf8').includes(entry));
  f.call('mcp.create', { provider: 'Claude Code', scope: 'user', name: 'second', config: { command: 'two' } });
  assert.ok(fs.readFileSync(path, 'utf8').includes(entry));
});
test('ambiguous JSON and malformed MCP creation never report a successful write', t => {
  const f = fixture(t), path = f.put('.claude.json', '{"mcpServers":[]}');
  const args = { provider: 'Claude Code', scope: 'user', name: 'x', config: { command: 'x' } };
  assert.equal(f.service.request('mcp.create', args).code, 'INVALID');
  assert.equal(fs.readFileSync(path, 'utf8'), '{"mcpServers":[]}');
  fs.writeFileSync(path, '{"mcpServers":{"x":{"command":"one"},"x":{"command":"two"}}}');
  assert.equal(f.call().incomplete, true);
  assert.equal(f.service.request('mcp.create', args).code, 'INVALID');
  fs.unlinkSync(path);
  for (const config of [{ command: '' }, { command: 'x', url: 'https://example.test' }, { command: 'x', env: { KEY: 12 } }, { command: 'x', enabled: 'false' }]) {
    assert.equal(f.service.request('mcp.create', { ...args, config }).code, 'INVALID');
    assert.equal(fs.existsSync(path), false);
  }
});
test('MCP structural validation is visible without concealing the native source', t => {
  const f = fixture(t); f.put('.claude.json', '{"mcpServers":{"broken":{"command":""},"valid":{"command":"x"}}}');
  const inv = f.call();
  assert.equal(inv.incomplete, true); assert.ok(inv.issues.some(i => i.code === 'MCP_INVALID'));
  assert.equal(inv.resources.filter(r => r.kind === 'mcp').length, 2);
  const source = inv.resources.find(r => r.kind === 'config');
  assert.ok(f.call('resource.read', { id: source.id }).content.includes('broken'));
});
test('context estimates count shared files once and omit unreadable sources', () => {
  const base = { kind: 'memory', enabled: true, canonicalPath: '/fixture/AGENTS.md', estimatedTokens: 100 };
  const result = contextEstimate([{ ...base, provider: 'Codex' }, { ...base, provider: 'Cursor' }, { ...base, canonicalPath: '/fixture/broken.md', error: 'unreadable' }]);
  assert.equal(result.tokens, 100); assert.equal(result.files.length, 1);
});
test('plain instruction Markdown is not rejected as malformed YAML metadata', t => {
  const f = fixture(t), text = '---\n- Start with a plan\n---\nKeep edits small.\n';
  f.put('Documents/p/AGENTS.md', text);
  const inv = f.call(); assert.equal(inv.incomplete, false, JSON.stringify(inv.issues));
  const r = inv.resources.find(r => r.provider === 'Codex' && r.kind === 'memory');
  assert.equal(r.name, 'AGENTS.md');
  f.call('resource.write', { id: r.id, revision: r.revision, content: text + 'Check the result.\n' });
  assert.equal(fs.readFileSync(r.path, 'utf8'), text + 'Check the result.\n');
  f.call('resource.create', { kind: 'memory', provider: 'Claude Code', scope: 'user', name: 'instructions', content: text });
  assert.equal(fs.readFileSync(join(f.home, '.claude/CLAUDE.md'), 'utf8'), text);
  const rulePath = f.put('Documents/p/.cursor/rules/rule.mdc', '---\nalwaysApply: true\n---\nNative rule.\n');
  const rule = f.call().resources.find(r => r.path === rulePath);
  assert.equal(f.service.request('resource.write', { id: rule.id, revision: rule.revision, content: text }).code, 'INVALID');
  assert.equal(fs.readFileSync(rulePath, 'utf8'), '---\nalwaysApply: true\n---\nNative rule.\n');
  assert.equal(f.service.request('resource.create', { kind: 'commands', provider: 'Claude Code', scope: 'user', name: 'command', content: text }).code, 'INVALID');
  assert.equal(fs.existsSync(join(f.home, '.claude/commands/command.md')), false);
});
test('selected filesystem root includes absolute descendants without prefix confusion', () => {
  assert.equal(inside('/fixture/project', '/'), true);
  assert.equal(inside('relative', '/'), false);
  assert.equal(inside('/fixture-other', '/fixture'), false);
  assert.equal(inside('/fixture/project', '/fixture/'), true);
});
test('JSON export redacts secrets without rounding unknown fields', () => {
  const raw = '{"big":900719925474099312345,"fraction":0.12345678901234567890,"args":["--token=private"],"env":{"TOKEN":"secret"}}';
  const result = redactJsonText(raw);
  assert.ok(result.includes('900719925474099312345')); assert.ok(result.includes('0.12345678901234567890'));
  assert.ok(!result.includes('private')); assert.ok(!result.includes('secret'));
  assert.throws(() => redactJsonText('{bad'));
});
test('profile restore rolls back every write boundary across two native sources and state', t => {
  for (const failureIndex of [0, 1, 2]) {
    let injecting = false;
    const f = fixture(t, { fault: (phase, index) => { if (injecting && phase === 'write' && index === failureIndex) throw Error('fixture interruption'); } });
    f.put('.claude.json', '{"mcpServers":{"same":{"command":"global"}}}');
    f.put('Documents/p/.mcp.json', '{"mcpServers":{"same":{"command":"project"}}}');
    const profile = f.call('profiles.capture', { name: 'Both sources' }).profiles[0];
    for (const r of f.call().resources.filter(r => r.kind === 'mcp')) f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
    const paths = [join(f.home, '.claude.json'), join(f.home, 'Documents/p/.mcp.json'), join(f.home, '.aios/state-v2.json')];
    const before = paths.map(p => fs.readFileSync(p, 'utf8'));
    const preview = f.call('profiles.preview', { id: profile.id }); injecting = true;
    assert.equal(f.service.request('profiles.apply', { id: profile.id, previewRevision: preview.previewRevision }).ok, false);
    injecting = false;
    assert.deepEqual(paths.map(p => fs.readFileSync(p, 'utf8')), before);
    assert.equal(f.call().resources.filter(r => r.kind === 'mcp' && r.parked).length, 2);
  }
});
test('directory parking failures preserve complete contents before and after state write', t => {
  for (const phase of ['move', 'write']) {
    let injecting = false;
    const f = fixture(t, { fault: current => { if (injecting && current === phase) throw Error('fixture interruption'); } });
    const path = f.put('.claude/skills/full/SKILL.md', 'original'); f.put('.claude/skills/full/scripts/tool.sh', 'support');
    const r = f.call().resources.find(r => r.kind === 'skills'); injecting = true;
    assert.equal(f.service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: false }).ok, false);
    injecting = false;
    assert.equal(fs.readFileSync(path, 'utf8'), 'original');
    assert.equal(fs.readFileSync(join(dirname(path), 'scripts/tool.sh'), 'utf8'), 'support');
    assert.equal(f.call().resources.find(r => r.kind === 'skills').enabled, true);
  }
});
test('a destination created between transaction moves is not overwritten', t => {
  const f = fixture(t), first = f.put('first', 'first'), second = f.put('second', 'second');
  const one = join(f.home, 'one'), two = join(f.home, 'two');
  const storage = new Storage(join(f.home, '.aios'), { fault: (phase, i) => { if (phase === 'move' && i === 0) fs.writeFileSync(two, 'external'); } });
  assert.throws(() => storage.locked(() => storage.commit('fixture move', [], [{ from: first, to: one }, { from: second, to: two }])), e => e.code === 'RECOVERY_CONFLICT');
  assert.equal(fs.readFileSync(two, 'utf8'), 'external'); assert.equal(fs.readFileSync(second, 'utf8'), 'second');
  fs.unlinkSync(two); storage.locked(() => {});
  assert.equal(fs.readFileSync(first, 'utf8'), 'first'); assert.equal(fs.existsSync(one), false);
});
