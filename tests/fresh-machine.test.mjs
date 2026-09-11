import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { discover } from '../scripts/lib/discovery.mjs';
import { createService } from '../scripts/lib/service.mjs';
import { frontmatter, suggestFrontmatterRepair } from '../scripts/lib/formats.mjs';

function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-fresh-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const put = (name, body) => { const path = join(home, name); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, body); return path; };
  return { home, put };
}
test('a two-minute filesystem permission wait does not exhaust discovery or starve providers', t => {
  const f = fixture(t), path = f.put('.claude/skills/one/SKILL.md', 'Skill');
  f.put('.cursor/mcp.json', '{"mcpServers":{"test":{"command":"never-run"}}}');
  f.put('Documents/project/CLAUDE.md', 'Instructions');
  let time = 0;
  const original = fs.readdirSync;
  t.mock.method(fs, 'readdirSync', (...args) => { time += 120000; return original(...args); }); syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const result = discover({ home: f.home, env: {}, managedRoots: [], roots: [join(f.home, 'Documents')], now: () => time, maxMs: 15 });
  assert.equal(result.incomplete, false); assert.deepEqual(result.issues, []);
  assert.ok(result.resources.some(r => r.path === path)); assert.ok(result.resources.some(r => r.provider === 'Cursor'));
  assert.ok(result.resources.some(r => r.path.endsWith('/project/CLAUDE.md')));
});
test('processing timeout stays local to one root and later roots still discover nested resources', t => {
  const f = fixture(t);
  for (let i = 0; i < 220; i++) f.put(`Documents/ordinary-${i}.txt`, 'Unrelated');
  const later = f.put('selected/nested/CLAUDE.md', 'Later project');
  let time = 0;
  const result = discover({ home: f.home, env: {}, managedRoots: [], roots: [join(f.home, 'Documents'), join(f.home, 'selected')],
    now: () => time, maxMs: 5, progress: p => { if (!p.complete) time += 10; } });
  assert.equal(result.incomplete, true);
  assert.deepEqual(result.issues.map(i => [i.path, i.code]), [[join(f.home, 'Documents'), 'SCAN_TIMEOUT']]);
  assert.ok(result.resources.some(r => r.path === later));
});
test('cancellation is still honored immediately after a blocked filesystem operation returns', t => {
  const f = fixture(t); f.put('.claude/skills/one/SKILL.md', 'Skill');
  let canceled = false;
  const original = fs.readdirSync;
  t.mock.method(fs, 'readdirSync', (...args) => { canceled = true; return original(...args); }); syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  assert.throws(() => discover({ home: f.home, env: {}, managedRoots: [], canceled: () => canceled }), error => error.code === 'CANCELED');
});
test('invalid metadata keeps complete resources inspectable without blocking unrelated MCP profiles', t => {
  const f = fixture(t), raw = '---\nname: orchestration\ndescription: Run tasks: safely\n---\nFull instructions\n';
  const path = f.put('.agents/skills/orchestration/SKILL.md', raw);
  f.put('.claude.json', '{"mcpServers":{"test":{"command":"never-run"}}}');
  const service = createService({ home: f.home, env: {}, managedRoots: [] }), result = service.request('inventory');
  assert.equal(result.ok, true); assert.equal(result.incomplete, false);
  assert.equal(result.issues[0].severity, 'warning');
  const resource = result.resources.find(r => r.path === path); assert.equal(resource.name, 'orchestration');
  assert.equal(service.request('resource.read', { id: resource.id }).content, raw);
  assert.equal(service.request('profiles.capture', { name: 'Valid MCPs' }).ok, true);
  assert.equal(service.request('transfer.preview', { id: resource.id, revision: resource.revision, mode: 'copy', provider: 'Cursor', scope: 'user', name: 'test' }).code, 'UNSUPPORTED');
  assert.equal(fs.readFileSync(path, 'utf8'), raw);
});
test('repair previews preserve BOM, CRLF, comments, full body and require a separate conflict-checked save', t => {
  const f = fixture(t), raw = '\uFEFF---\r\nname: example\r\n# Keep this comment\r\ndescription: Plan tasks: carefully\r\n---\r\nBody : [unchanged]\r\n';
  const path = f.put('.claude/skills/example/SKILL.md', raw), service = createService({ home: f.home, env: {}, managedRoots: [] });
  const r = service.request('inventory').resources[0], preview = service.request('resource.repair.preview', { id: r.id, revision: r.revision });
  assert.equal(preview.ok, true); assert.deepEqual(preview.changedLines, [4]);
  assert.equal(preview.content, raw.replace('Plan tasks: carefully', '"Plan tasks: carefully"'));
  assert.equal(fs.readFileSync(path, 'utf8'), raw); assert.equal(service.request('history').history.length, 0);
  fs.writeFileSync(path, raw + 'New edit');
  assert.equal(service.request('resource.repair.preview', { id: r.id, revision: r.revision }).code, 'CONFLICT');
  assert.equal(service.request('resource.write', { id: r.id, revision: preview.revision, content: preview.content }).code, 'CONFLICT');
  fs.writeFileSync(path, raw);
  const result = service.request('resource.write', { id: r.id, revision: preview.revision, content: preview.content });
  assert.equal(result.ok, true); assert.equal(result.issues.length, 0);
  assert.equal(frontmatter(fs.readFileSync(path, 'utf8')).metadata.description, 'Plan tasks: carefully');
  const history = service.request('history').history[0];
  assert.equal(service.request('history.read', { id: history.id, path }).content, raw);
});
test('repair suggestions refuse ambiguous comments, duplicate fields, multiline and unrelated syntax errors', () => {
  for (const header of ['description: valid', 'description: Tasks: one # ambiguous comment', 'name: x\nname: y\ndescription: Task: one',
    'description: Task: one\n  continuation', 'name: [broken\ndescription: Task: one', 'description: "Task: one', 'name broken\ndescription: Task: one']) {
    assert.equal(suggestFrontmatterRepair(`---\n${header}\n---\nBody`), null, header);
  }
});
