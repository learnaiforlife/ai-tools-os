import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createService } from '../scripts/lib/service.mjs';
import { handleAiosApiRequest, aiosBridge } from '../scripts/aios-bridge.mjs';
import { redactConfig, copyText } from '../src/api.js';
import { hash, readText, MAX_BYTES } from '../scripts/lib/storage.mjs';
import { frontmatter, validate } from '../scripts/lib/formats.mjs';

const fixture = t => {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-boundary-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  fs.mkdirSync(join(home, 'Documents'));
  const put = (path, content) => { const file = join(home, path); fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, content); return file; };
  const service = createService({ home, env: {}, managedRoots: [] });
  const call = (op, args) => { const r = service.request(op, args); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  return { home, put, service, call };
};
test('browser dev/preview APIs reject reads and foreign-origin malformed writes', async t => {
  const server = createServer((req, res) => handleAiosApiRequest(req, res));
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/resources`;
  assert.equal((await fetch(url)).status, 403);
  const response = await fetch(url, { method: 'POST', headers: { origin: 'https://evil.test', 'content-type': 'text/plain' }, body: '{malformed' });
  assert.equal(response.status, 403); assert.equal((await response.json()).code, 'DESKTOP_REQUIRED');
});
test('Vite dev and preview integration starts and denies filesystem APIs', async t => {
  const { createServer: createVite, preview } = await import('vite');
  const dev = await createVite({ configFile: false, plugins: [aiosBridge()], server: { host: '127.0.0.1', port: 0 } });
  await dev.listen(); t.after(() => dev.close());
  const devPort = dev.httpServer.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${devPort}/api/resources`)).status, 403);
  const previewServer = await preview({ configFile: false, plugins: [aiosBridge()], preview: { host: '127.0.0.1', port: 0 } });
  t.after(() => previewServer.close());
  assert.equal((await fetch(`http://127.0.0.1:${previewServer.httpServer.address().port}/api/resources`)).status, 403);
});
test('global Claude JSON symlink cannot authorize an arbitrary file', t => {
  const f = fixture(t), target = f.put('private/outside.json', '{"private":true}'); fs.symlinkSync(target, join(f.home, '.claude.json'));
  const r = f.call('inventory').resources.find(r => r.kind === 'config'); assert.equal(r.readonly, true);
  assert.equal(f.service.request('resource.read', { id: r.id }).ok, false);
});
test('linked skill directories preserve the link through disable and restore', t => {
  const f = fixture(t); f.put('custom/skill/SKILL.md', 'Linked skill'); fs.mkdirSync(join(f.home, '.claude/skills'), { recursive: true }); fs.symlinkSync(join(f.home, 'custom/skill'), join(f.home, '.claude/skills/link'));
  f.call('roots.set', { roots: [join(f.home, 'custom')] });
  let r = f.call('inventory').resources.find(r => r.kind === 'skills');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  r = f.call('inventory').resources.find(r => r.kind === 'skills'); assert.equal(r.enabled, false);
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: true });
  assert.equal(fs.lstatSync(join(f.home, '.claude/skills/link')).isSymbolicLink(), true); assert.equal(fs.readFileSync(join(f.home, 'custom/skill/SKILL.md'), 'utf8'), 'Linked skill');
});
test('MCP restore refuses an occupied name and preserves both configurations', t => {
  const f = fixture(t), path = f.put('.claude.json', '{"mcpServers":{"x":{"command":"old"}}}');
  let r = f.call('inventory').resources.find(r => r.kind === 'mcp'); f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false });
  fs.writeFileSync(path, '{"mcpServers":{"x":{"command":"new"}}}');
  r = f.call('inventory').resources.find(r => r.kind === 'mcp' && r.enabled);
  assert.equal(f.service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: true }).code, 'CONFLICT');
  assert.equal(JSON.parse(fs.readFileSync(path)).mcpServers.x.command, 'new');
  assert.equal(f.service.request('profiles.capture', { name: 'ambiguous' }).code, 'CONFLICT');
});
test('oversized file and payload failures are explicit and leave originals intact', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', 'x'.repeat(2 * 1024 * 1024 + 1));
  const inv = f.call('inventory'); assert.ok(inv.issues.some(i => i.code === 'TOO_LARGE')); assert.equal(inv.resources.length, 0);
  assert.equal(f.service.request('resource.create', { kind: 'memory', content: 'a'.repeat(3 * 1024 * 1024) }).code, 'INVALID');
  assert.equal(fs.statSync(path).size, 2 * 1024 * 1024 + 1);
});
test('managed sources are visible but cannot be mutated', t => {
  const f = fixture(t), root = join(f.home, 'managed'); f.put('managed/managed-mcp.json', '{"mcpServers":{"x":{"command":"managed"}}}');
  const service = createService({ home: f.home, env: {}, managedRoots: [root] }); const r = service.request('inventory').resources.find(r => r.kind === 'mcp');
  assert.equal(r.scope, 'managed'); assert.equal(service.request('resource.toggle', { id: r.id, revision: r.revision, enabled: false }).code, 'READ_ONLY');
});
test('history remains inspectable during ambiguous crash recovery', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', 'external');
  f.put('.aios/history/recovery.json', JSON.stringify({ id: 'recovery', at: new Date().toISOString(), label: 'Interrupted edit', status: 'pending', moves: [], writes: [{ path, after: hash('after'), before: { content: 'before', revision: hash('before'), mode: 0o600 } }] }));
  assert.equal(f.service.request('inventory').code, 'RECOVERY_CONFLICT');
  assert.equal(f.call('history').history[0].status, 'pending'); assert.equal(f.call('history.read', { id: 'recovery', path }).content, 'before');
});
test('legacy disabled records import without guessing project provenance', t => {
  const f = fixture(t); f.put('.aios/disabled-mcp.json', '{"legacy":{"command":"old"}}'); f.put('.aios/disabled-commands/old.md', 'Legacy command');
  const inv = f.call('legacy.import'); assert.equal(inv.resources.filter(r => r.parked).length, 2);
  const r = inv.resources.find(r => r.kind === 'commands'); f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: true });
  assert.equal(fs.readFileSync(join(f.home, '.claude/commands/old.md'), 'utf8'), 'Legacy command');
  assert.ok(fs.existsSync(join(f.home, '.aios/disabled-mcp.json')));
});
test('legacy import refuses to reassign original sources to custom Claude paths', t => {
  for (const override of ['.claude', 'Custom Claude']) {
    const f = fixture(t);
    const legacy = f.put('.aios/disabled-mcp.json', '{"legacy":{"command":"old"}}');
    f.put('.aios/disabled-commands/old.md', 'Legacy command');
    const custom = f.put(override + '/.claude.json', '{"mcpServers":{"keep":{"command":"new"}}}');
    const service = createService({ home: f.home, env: { CLAUDE_CONFIG_DIR: join(f.home, override) }, managedRoots: [] });
    const before = [legacy, custom].map(path => fs.readFileSync(path, 'utf8'));
    assert.equal(service.request('legacy.import').code, 'LEGACY_PATH_MISMATCH');
    assert.deepEqual([legacy, custom].map(path => fs.readFileSync(path, 'utf8')), before);
    assert.equal(fs.existsSync(join(f.home, '.aios/state-v2.json')), false);
    assert.equal(fs.existsSync(join(f.home, '.claude/commands/old.md')), false);
  }
  const f = fixture(t);
  f.put('.aios/disabled-commands/old.md', 'Legacy command');
  f.call('preferences.save', { preferences: { ...f.call('inventory').preferences, providerPaths: { claude: join(f.home, 'Custom Claude') } } });
  const state = fs.readFileSync(join(f.home, '.aios/state-v2.json'), 'utf8');
  assert.equal(f.service.request('legacy.import').code, 'LEGACY_PATH_MISMATCH');
  assert.equal(fs.readFileSync(join(f.home, '.aios/state-v2.json'), 'utf8'), state);
});
test('legacy MCP identity remains stable after restoring through an authorized file link', t => {
  const f = fixture(t), native = f.put('.claude/native.json', '{"mcpServers":{}}');
  fs.symlinkSync(native, join(f.home, '.claude.json'));
  f.put('.aios/disabled-mcp.json', '{"legacy":{"command":"old"}}');
  const parked = f.call('legacy.import').resources.find(r => r.parked);
  const restored = f.call('resource.toggle', { id: parked.id, parked: true, revision: parked.revision, enabled: true });
  const live = restored.resources.find(r => r.kind === 'mcp');
  assert.equal(live.id, parked.id);
  assert.equal(JSON.parse(fs.readFileSync(native, 'utf8')).mcpServers.legacy.command, 'old');
  assert.ok(fs.lstatSync(join(f.home, '.claude.json')).isSymbolicLink());
});
test('export redacts credential fields and preserves argument array structure', () => {
  const result = redactConfig({ command: 'npx', args: ['a b', '--token=private'], url: 'https://user:pass@example.test/mcp?token=private', env: { TOKEN: 'secret' }, headers: { Authorization: 'Bearer private' }, nested: { api_key: 'private' } });
  assert.equal(JSON.stringify(result).includes('private'), false); assert.equal(result.args.length, 2); assert.equal(result.url, 'https://example.test/mcp');
});
test('clipboard rejection is surfaced to callers', async () => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw Error('denied'); } } } });
  try { await assert.rejects(() => copyText('test'), /denied/); }
  finally { if (before) Object.defineProperty(globalThis, 'navigator', before); else delete globalThis.navigator; }
});
test('invalid UTF-8 is rejected without replacing original bytes', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', Buffer.from([0xff, 0xfe, 0x00]));
  const inv = f.call('inventory'); assert.ok(inv.issues.some(i => i.code === 'ENCODING'));
  assert.deepEqual(fs.readFileSync(path), Buffer.from([0xff, 0xfe, 0x00]));
});
test('frontmatter errors identify the line and repair without exposing header values', t => {
  const raw = '---\nname: example\ndescription: private-header-value: another value\n---\nBody';
  const check = error => error.code === 'INVALID' && error.message.includes('line 3') && error.message.includes('Quote text') && !error.message.includes('private-header-value');
  assert.throws(() => frontmatter(raw), check); assert.throws(() => validate(raw, 'SKILL.md', 'skills'), check);
  const f = fixture(t); f.put('.claude/skills/example/SKILL.md', raw);
  const inventory = f.call('inventory'); assert.equal(inventory.incomplete, false);
  const issue = inventory.issues.find(i => i.code === 'FRONTMATTER_INVALID'); assert.equal(issue.severity, 'warning'); assert.ok(issue.message.includes('line 3')); assert.ok(!issue.message.includes('private-header-value'));
  const repaired = raw.replace('description: private-header-value: another value', 'description: "private-header-value: another value"');
  assert.equal(frontmatter(repaired).metadata.description, 'private-header-value: another value'); assert.equal(frontmatter(repaired).body, 'Body');
});
test('special native files cannot block discovery or text reads', t => {
  const f = fixture(t), path = join(f.home, '.claude/CLAUDE.md');
  fs.mkdirSync(dirname(path)); execFileSync('mkfifo', [path]);
  // A separate process with a deadline makes the former blocking-open failure
  // observable without hanging the entire test runner.
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { createService } from ${JSON.stringify(new URL('../scripts/lib/service.mjs', import.meta.url).href)};
    const result = createService({home:process.argv[1],env:{},managedRoots:[]}).request('inventory');
    process.stdout.write(JSON.stringify(result));`, f.home], { timeout: 4000, encoding: 'utf8' });
  const inventory = JSON.parse(result);
  assert.equal(inventory.ok, true); assert.ok(inventory.issues.some(i => i.path === path && i.code === 'NOT_FILE'));
  assert.throws(() => readText(path), e => e.code === 'NOT_FILE'); assert.ok(fs.lstatSync(path).isFIFO());
});
test('text reads accept the size boundary and reject larger native files', t => {
  const f = fixture(t), path = f.put('.claude/CLAUDE.md', 'a'.repeat(MAX_BYTES));
  assert.equal(readText(path).content.length, MAX_BYTES);
  fs.appendFileSync(path, 'b'); assert.throws(() => readText(path), e => e.code === 'TOO_LARGE');
});
test('statusline preview and install cannot escape through an existing link', t => {
  const f = fixture(t), target = f.put('private/script.sh', 'private');
  fs.mkdirSync(join(f.home, '.claude')); fs.symlinkSync(target, join(f.home, '.claude/statusline.sh'));
  assert.equal(f.service.request('statusline.preview').code, 'READ_ONLY');
  assert.equal(f.service.request('statusline.install', { settingsRevision: null, scriptRevision: hash('private') }).code, 'READ_ONLY');
  assert.equal(fs.readFileSync(target, 'utf8'), 'private');
});
