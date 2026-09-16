import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { discover } from '../scripts/lib/discovery.mjs';
import { createService } from '../scripts/lib/service.mjs';

function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-scan-isolation-')));
  const put = (name, text = 'Healthy instructions') => { const path = join(home, name); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); return path; };
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const scan = options => discover({ home, env: {}, roots: [join(home, 'Documents')], managedRoots: [], ...options });
  return { home, put, scan };
}

test('JDK broken links and repeated worktree metadata warnings finish without modifying sources', t => {
  const f = fixture(t), raw = '---\nname: example\ndescription: Tasks: safely\n---\nPreserve the full body.\n';
  const healthy = f.put('Documents/healthy/CLAUDE.md');
  const bad = Array.from({ length: 132 }, (_, n) => f.put(`Documents/worktrees/work-${n}/.claude/skills/example/SKILL.md`, raw));
  const sdk = join(f.home, 'Documents/SDK'); fs.mkdirSync(sdk);
  for (const name of ['demo', 'man', 'DISCLAIMER', 'bin', 'include', 'LICENSE', 'argFile']) fs.symlinkSync(join(f.home, 'missing', name), join(sdk, name));
  const result = f.scan();
  assert.equal(result.scan.completed, true); assert.equal(result.scan.status, 'completed_with_skips');
  assert.equal(result.scan.skipped, 7); assert.equal(result.scan.warnings, 132); assert.equal(result.scan.limited, 0);
  assert.ok(result.resources.some(r => r.path === healthy && !r.error));
  assert.equal(result.resources.filter(r => r.metadataWarning).length, 132);
  for (const path of bad) assert.equal(fs.readFileSync(path, 'utf8'), raw);
});

test('one large provider collection does not starve skills, agents or later projects', t => {
  const f = fixture(t);
  for (let i = 0; i < 60; i++) f.put(`Documents/a-large/.claude/commands/cmd-${i}.md`);
  const skill = f.put('Documents/a-large/.claude/skills/healthy/SKILL.md');
  const agent = f.put('Documents/a-large/.claude/agents/healthy.md');
  const peer = f.put('Documents/z-healthy/CLAUDE.md');
  const result = f.scan({ maxEntries: 20 });
  for (const path of [skill, agent, peer]) assert.ok(result.resources.some(r => r.path === path), path);
  assert.equal(result.scan.completed, true); assert.equal(result.scan.status, 'partial');
  assert.ok(result.issues.some(i => i.path.endsWith('/commands') && i.code === 'SCAN_LIMIT'));
});

test('a wide unrelated directory preserves queued healthy peer projects and honest limits', t => {
  const f = fixture(t);
  for (let i = 0; i < 60; i++) f.put(`Documents/a-sdk/dir-${i}/unrelated.txt`);
  const peer = f.put('Documents/z-healthy/CLAUDE.md');
  const result = f.scan({ maxEntries: 20 });
  assert.ok(result.resources.some(r => r.path === peer)); assert.equal(result.scan.status, 'partial');
  assert.ok(result.issues.some(i => i.disposition === 'limited'));
});

test('broken provider roots cannot block healthy edits or grant access through unresolved roots', t => {
  const f = fixture(t), path = f.put('Documents/project/CLAUDE.md');
  fs.symlinkSync(join(f.home, 'missing'), join(f.home, '.codex'));
  const service = createService({ home: f.home, env: {}, managedRoots: [] });
  const inv = service.request('inventory'), resource = inv.resources.find(r => r.path === path);
  assert.equal(inv.ok, true); assert.equal(inv.scan.completed, true);
  const changed = service.request('resource.write', { id: resource.id, revision: resource.revision, content: 'Healthy updated' });
  assert.equal(changed.ok, true, changed.error); assert.equal(fs.readFileSync(path, 'utf8'), 'Healthy updated');
  assert.equal(fs.existsSync(join(f.home, 'missing')), false);
});

test('restricted directories are skipped while later siblings are indexed', t => {
  const f = fixture(t); const restricted = join(f.home, 'Documents/restricted'); fs.mkdirSync(restricted, { recursive: true });
  const peer = f.put('Documents/healthy/CLAUDE.md'), original = fs.opendirSync;
  t.mock.method(fs, 'opendirSync', (...args) => { if (args[0] === restricted) throw Object.assign(Error('fixture denied'), { code: 'EPERM' }); return original(...args); });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = f.scan(); assert.ok(result.resources.some(r => r.path === peer));
  assert.equal(result.scan.completed, true); assert.equal(result.scan.skipped, 1);
  assert.equal(result.issues.find(i => i.code === 'EPERM').disposition, 'skipped');
});

test('link cycles and outside targets are reported without following them', t => {
  const f = fixture(t); f.put('Documents/healthy/CLAUDE.md');
  const outside = f.put('outside/CLAUDE.md', 'Not authorized');
  fs.symlinkSync(dirname(outside), join(f.home, 'Documents/outside-link'));
  fs.symlinkSync('loop-b', join(f.home, 'Documents/loop-a')); fs.symlinkSync('loop-a', join(f.home, 'Documents/loop-b'));
  const result = f.scan(); assert.ok(!result.resources.some(r => r.canonicalPath === outside));
  assert.ok(result.issues.some(i => i.code === 'ELOOP')); assert.ok(result.issues.some(i => i.code === 'SYMLINK_BOUNDARY'));
  assert.equal(result.scan.completed, true);
});

test('malformed config remains inspectable and valid sibling MCP entries stay writable', t => {
  const f = fixture(t); f.put('Documents/project/CLAUDE.md');
  const config = f.put('.claude.json', '{"mcpServers":{"bad":{"command":""},"healthy":{"command":"fixture"}}}');
  f.put('.codex/config.toml', 'broken = [');
  const service = createService({ home: f.home, env: {}, managedRoots: [] }), inv = service.request('inventory');
  assert.equal(inv.scan.completed, true); assert.equal(inv.scan.warnings, 2);
  const r = inv.resources.find(r => r.kind === 'mcp' && r.name === 'healthy');
  const result = service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  assert.equal(result.ok, true, result.error); assert.ok(!JSON.parse(fs.readFileSync(config)).mcpServers.healthy);
  assert.equal(service.request('profiles.capture', { name: 'Cannot pretend all sources parsed' }).code, 'CONFLICT');
});
