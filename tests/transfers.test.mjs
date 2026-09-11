import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createService } from '../scripts/lib/service.mjs';
import { parseConfig, editTomlValue, frontmatter } from '../scripts/lib/formats.mjs';
import { convertMcp, convertAgent } from '../scripts/lib/transfers.mjs';

function fixture(t, options = {}) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-transfers-'))), project = join(home, 'Documents', 'project one');
  fs.mkdirSync(project, { recursive: true }); t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const service = createService({ home, env: {}, managedRoots: [], ...options });
  const call = (op, args) => { const r = service.request(op, args); assert.equal(r.ok, true, JSON.stringify(r)); return r; };
  const put = (path, text, mode = 0o600) => { path = join(home, path); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text, { mode }); return path; };
  const resource = (kind, name, provider) => call('inventory').resources.find(r => r.kind === kind && r.name === name && (!provider || r.provider === provider));
  const args = (r, extra = {}) => ({ id: r.id, parked: !!r.parked, revision: r.revision, mode: 'copy', provider: r.provider, scope: 'project', project, name: r.name, ...extra });
  const transfer = input => { const preview = call('transfer.preview', input); call('transfer.apply', { ...input, previewRevision: preview.previewRevision }); return preview; };
  return { home, project, service, put, call, resource, args, transfer };
}

test('TOML subtree edits retain unrelated table, inline and dotted entries', () => {
  for (const raw of ['# retain\n[mcp_servers.one]\ncommand="a"\n[mcp_servers.one.env]\nK="v"\n[mcp_servers.two]\ncommand="b"\n', 'mcp_servers={one={command="a"},two={command="b"}}\n', 'mcp_servers.one.command="a"\nmcp_servers.two.command="b"\n']) {
    const removed = editTomlValue(raw, ['mcp_servers', 'one'], undefined), config = parseConfig(removed, 'x.toml');
    assert.equal(config.mcp_servers.one, undefined); assert.equal(config.mcp_servers.two.command, 'b');
    const changed = editTomlValue(raw, ['mcp_servers', 'one', 'enabled'], false); assert.equal(parseConfig(changed, 'x.toml').mcp_servers.one.enabled, false);
  }
});
test('skill copy includes binary assets, executable modes and internal relative links', t => {
  const f = fixture(t), original = f.put('.claude/skills/build/SKILL.md', '---\nname: build\ndescription: Build things\n---\nDo the work.\n');
  f.put('.claude/skills/build/scripts/run.sh', '#!/bin/sh\nexit 0\n', 0o755); f.put('.claude/skills/build/assets/icon.bin', Buffer.from([0, 255, 1, 128]));
  fs.symlinkSync('scripts/run.sh', join(dirname(original), 'run'));
  const r = f.resource('skills', 'build'), preview = f.transfer(f.args(r, { provider: 'Cursor' }));
  const dest = join(f.project, '.cursor/skills/build');
  assert.equal(preview.files, 4); assert.equal(fs.readFileSync(join(dest, 'SKILL.md'), 'utf8'), fs.readFileSync(original, 'utf8'));
  assert.deepEqual(fs.readFileSync(join(dest, 'assets/icon.bin')), Buffer.from([0, 255, 1, 128]));
  assert.equal(fs.statSync(join(dest, 'scripts/run.sh')).mode & 0o777, 0o755); assert.equal(fs.readlinkSync(join(dest, 'run')), 'scripts/run.sh');
});
test('skill move preserves bundle and removes only the selected native source', t => {
  const f = fixture(t), path = f.put('.claude/skills/one/SKILL.md', 'one'); f.put('.claude/skills/one/support.txt', 'support');
  f.transfer(f.args(f.resource('skills', 'one'), { provider: 'Codex', mode: 'move' }));
  assert.equal(fs.existsSync(path), false); assert.equal(fs.readFileSync(join(f.project, '.agents/skills/one/support.txt'), 'utf8'), 'support');
  assert.ok(f.call('history').history[0].moves.some(m => m.from === dirname(path)));
});
test('transfer detects supporting-file and destination changes after preview', t => {
  const f = fixture(t); f.put('.claude/skills/one/SKILL.md', 'one'); const support = f.put('.claude/skills/one/support.txt', 'before');
  const args = f.args(f.resource('skills', 'one')), preview = f.call('transfer.preview', args);
  fs.writeFileSync(support, 'after'); assert.equal(f.service.request('transfer.apply', { ...args, previewRevision: preview.previewRevision }).code, 'CONFLICT');
  const next = f.call('transfer.preview', args); f.put('Documents/project one/.claude/skills/one/unrelated', 'preserve');
  assert.equal(f.service.request('transfer.apply', { ...args, previewRevision: next.previewRevision }).code, 'CONFLICT');
});
test('failed multi-step transfer restores the native source and destination', t => {
  const f = fixture(t, { fault: kind => { if (kind === 'write') throw Error('simulated write failure'); } });
  const path = f.put('.claude/skills/one/SKILL.md', 'one'); const args = f.args(f.resource('skills', 'one'), { mode: 'move' });
  const preview = f.call('transfer.preview', args); assert.equal(f.service.request('transfer.apply', { ...args, previewRevision: preview.previewRevision }).ok, false);
  assert.equal(fs.readFileSync(path, 'utf8'), 'one'); assert.equal(fs.existsSync(join(f.project, '.claude/skills/one')), false);
});
test('disabled skill can change scope while remaining absent from provider discovery', t => {
  const f = fixture(t); f.put('.claude/skills/one/SKILL.md', 'one'); let r = f.resource('skills', 'one');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false }); r = f.resource('skills', 'one');
  f.transfer(f.args(r, { mode: 'move', provider: 'Cursor' }));
  const moved = f.resource('skills', 'one', 'Cursor'); assert.equal(moved.enabled, false); assert.equal(fs.existsSync(moved.path), false);
  f.call('resource.toggle', { id: moved.id, parked: true, revision: moved.revision, enabled: true }); assert.equal(fs.readFileSync(moved.path, 'utf8'), 'one');
});
test('MCP moves across JSON and TOML retain args, headers and unrelated configuration', t => {
  const f = fixture(t), source = f.put('.claude.json', '{"keep":9007199254740993,"mcpServers":{"docs":{"type":"http","url":"https://example.test/mcp","headers":{"X-Key":"${DOCS_KEY}"}},"other":{"command":"unchanged"}}}');
  f.put('Documents/project one/.codex/config.toml', '# Keep exactly\nmodel = "own-model"\n');
  f.transfer(f.args(f.resource('mcp', 'docs'), { provider: 'Codex', mode: 'move' }));
  assert.match(fs.readFileSync(source, 'utf8'), /9007199254740993/); assert.equal(JSON.parse(fs.readFileSync(source)).mcpServers.docs, undefined);
  const dest = fs.readFileSync(join(f.project, '.codex/config.toml'), 'utf8'); assert.match(dest, /# Keep exactly\nmodel = "own-model"/);
  assert.equal(parseConfig(dest, 'x.toml').mcp_servers.docs.env_http_headers['X-Key'], 'DOCS_KEY');
});
test('disabled JSON MCP transfers without reactivating it and can be restored', t => {
  const f = fixture(t); f.put('.claude.json', '{"mcpServers":{"one":{"command":"node","args":["a b"]}}}'); let r = f.resource('mcp', 'one');
  f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false }); r = f.resource('mcp', 'one');
  f.transfer(f.args(r, { provider: 'Cursor', mode: 'move' })); const moved = f.resource('mcp', 'one', 'Cursor'); assert.equal(moved.enabled, false);
  f.call('resource.toggle', { id: moved.id, parked: true, revision: moved.revision, enabled: true }); assert.deepEqual(JSON.parse(fs.readFileSync(moved.path)).mcpServers.one.args, ['a b']);
});
test('Claude local MCP creation and same-file scope move keep other project data', t => {
  const f = fixture(t); f.put('.claude.json', '{"mcpServers":{"one":{"command":"node"}},"keep":true}');
  f.transfer(f.args(f.resource('mcp', 'one'), { scope: 'local', mode: 'move' }));
  const config = JSON.parse(fs.readFileSync(join(f.home, '.claude.json'))); assert.equal(config.keep, true); assert.equal(config.mcpServers.one, undefined); assert.equal(config.projects[f.project].mcpServers.one.command, 'node');
  assert.equal(f.resource('mcp', 'one').nativeScope, 'local');
});
test('Claude project-only MCP opt-out preserves global server, trust and other projects', t => {
  const f = fixture(t); f.put('.claude.json', JSON.stringify({ mcpServers: { one: { command: 'node' } }, projects: { [f.project]: { hasTrustDialogAccepted: false, disabledMcpServers: ['other'] }, elsewhere: { disabledMcpServers: ['keep'] } } }));
  const r = f.resource('mcp', 'one'), args = { id: r.id, project: f.project, action: 'disable' }, p = f.call('mcp.project.preview', args);
  f.call('mcp.project.apply', { ...args, previewRevision: p.previewRevision });
  const cfg = JSON.parse(fs.readFileSync(join(f.home, '.claude.json'))); assert.equal(cfg.mcpServers.one.command, 'node'); assert.equal(cfg.projects[f.project].hasTrustDialogAccepted, false);
  assert.deepEqual(cfg.projects[f.project].disabledMcpServers, ['other', 'one']); assert.deepEqual(cfg.projects.elsewhere.disabledMcpServers, ['keep']);
});
test('Codex project override disables inherited MCP and can return to inheritance', t => {
  const f = fixture(t), source = f.put('.codex/config.toml', '[mcp_servers.one]\ncommand="node"\n');
  const r = f.resource('mcp', 'one'), args = { id: r.id, project: f.project, action: 'disable' };
  let preview = f.call('mcp.project.preview', args); f.call('mcp.project.apply', { ...args, previewRevision: preview.previewRevision });
  let inv = f.call('inventory'); assert.equal(inv.incomplete, false); assert.ok(inv.resources.some(r => r.overrideOnly && !r.enabled)); assert.equal(fs.readFileSync(source, 'utf8'), '[mcp_servers.one]\ncommand="node"\n');
  args.action = 'inherit'; preview = f.call('mcp.project.preview', args); f.call('mcp.project.apply', { ...args, previewRevision: preview.previewRevision });
  inv = f.call('inventory'); assert.equal(inv.incomplete, false); assert.equal(inv.resources.filter(r => r.kind === 'mcp').length, 1);
});
test('scoped bulk MCP mutation is atomic and ignores unselected sources', t => {
  const f = fixture(t); f.put('.cursor/mcp.json', '{"mcpServers":{"one":{"command":"node"}}}');
  const projectFile = f.put('Documents/project one/.cursor/mcp.json', '{"mcpServers":{"one":{"command":"project"},"two":{"command":"two"}}}');
  const selected = f.call('inventory').resources.filter(r => r.kind === 'mcp' && r.project === f.project);
  const args = { sources: selected.map(r => ({ id: r.id, parked: false, revision: r.revision })), enabled: false }, preview = f.call('mcp.batch.preview', args);
  f.call('mcp.batch.apply', { ...args, previewRevision: preview.previewRevision }); assert.deepEqual(JSON.parse(fs.readFileSync(projectFile)).mcpServers, {});
  assert.equal(JSON.parse(fs.readFileSync(join(f.home, '.cursor/mcp.json'))).mcpServers.one.command, 'node');
});
test('plugin references can toggle and move scope without moving provider caches', t => {
  const f = fixture(t); const path = f.put('.claude/settings.json', '{"enabledPlugins":{"one@market":true},"other":17}');
  let r = f.resource('plugins', 'one@market'); f.call('resource.toggle', { id: r.id, revision: r.revision, enabled: false }); r = f.resource('plugins', 'one@market');
  f.transfer(f.args(r, { scope: 'local', mode: 'move' })); assert.equal(JSON.parse(fs.readFileSync(path)).other, 17);
  assert.equal(JSON.parse(fs.readFileSync(join(f.project, '.claude/settings.local.json'))).enabledPlugins['one@market'], false);
  f.put('.codex/config.toml', '[plugins."two@local"]\nenabled = true\n[plugins."two@local".mcp_servers.docs]\nenabled=false\n');
  r = f.resource('plugins', 'two@local'); f.transfer(f.args(r)); const dest = parseConfig(fs.readFileSync(join(f.project, '.codex/config.toml'), 'utf8'), 'x.toml'); assert.equal(dest.plugins['two@local'].mcp_servers.docs.enabled, false);
});
test('subagent discovery and conversion use current provider file formats', t => {
  const f = fixture(t); f.put('.cursor/agents/reviewer.md', '---\nname: reviewer\ndescription: Review code\nreadonly: true\n---\nInspect the diff.\n');
  const r = f.resource('agents', 'reviewer', 'Cursor'); f.transfer(f.args(r, { provider: 'Codex' }));
  const agent = f.resource('agents', 'reviewer', 'Codex'); assert.ok(agent.path.endsWith('.codex/agents/reviewer.toml'));
  const cfg = parseConfig(fs.readFileSync(agent.path, 'utf8'), 'x.toml'); assert.equal(cfg.sandbox_mode, 'read-only'); assert.equal(cfg.developer_instructions, 'Inspect the diff.\n');
  assert.equal(frontmatter(convertAgent(fs.readFileSync(agent.path, 'utf8'), 'Codex', 'Claude Code')).metadata.permissionMode, 'plan');
});
test('Claude command becomes a real Codex skill, preserving its instructions', t => {
  const f = fixture(t); f.put('.claude/commands/check.md', '---\nname: check\ndescription: Check code\n---\nInspect this project.\n');
  const r = f.resource('commands', 'check'); f.transfer(f.args(r, { provider: 'Codex' }));
  assert.equal(frontmatter(fs.readFileSync(join(f.project, '.agents/skills/check/SKILL.md'), 'utf8')).body, 'Inspect this project.\n');
});
test('unsupported conversions, unsafe links and out-of-scope destinations preserve sources', t => {
  const f = fixture(t); const source = f.put('.claude/skills/one/SKILL.md', 'one'); fs.symlinkSync('/etc/passwd', join(dirname(source), 'outside'));
  assert.equal(f.service.request('transfer.preview', f.args(f.resource('skills', 'one'))).code, 'UNSUPPORTED'); assert.equal(fs.readFileSync(source, 'utf8'), 'one');
  assert.throws(() => convertMcp({ url: 'https://example.test/sse', type: 'sse' }, 'Claude Code', 'Codex'), /Streamable HTTP/);
  assert.throws(() => convertMcp({ command: 'node', envFile: '.env' }, 'Cursor', 'Codex'), /provider-specific/);
  assert.throws(() => convertAgent('---\nname: agent\ndescription: test\ntools: Read\n---\nBody', 'Claude Code', 'Codex'), /cannot be silently dropped/);
});
test('renaming a copied skill updates its native name and keeps the source unchanged', t => {
  const f = fixture(t), original = '---\nname: original\ndescription: Keep this\n---\nBody unchanged.\n';
  const source = f.put('.claude/skills/original/SKILL.md', original); f.put('.claude/skills/original/notes.txt', 'notes');
  f.transfer(f.args(f.resource('skills', 'original'), { name: 'renamed' }));
  const copied = frontmatter(fs.readFileSync(join(f.project, '.claude/skills/renamed/SKILL.md'), 'utf8'));
  assert.equal(copied.metadata.name, 'renamed'); assert.equal(copied.body, 'Body unchanged.\n'); assert.equal(fs.readFileSync(source, 'utf8'), original);
  assert.equal(fs.readFileSync(join(f.project, '.claude/skills/renamed/notes.txt'), 'utf8'), 'notes');
});
test('undo transfer restores original files and refuses externally changed destinations', t => {
  const f = fixture(t), source = f.put('.claude/skills/one/SKILL.md', 'one');
  f.transfer(f.args(f.resource('skills', 'one'), { mode: 'move' }));
  let entry = f.call('history').history.find(h => h.transfer); f.call('transfer.undo', { id: entry.id });
  assert.equal(fs.readFileSync(source, 'utf8'), 'one'); assert.equal(fs.existsSync(join(f.project, '.claude/skills/one')), false);
  f.transfer(f.args(f.resource('skills', 'one'))); entry = f.call('history').history.find(h => h.transfer && h.status === 'committed');
  fs.writeFileSync(join(f.project, '.claude/skills/one/SKILL.md'), 'later work');
  assert.equal(f.service.request('transfer.undo', { id: entry.id }).code, 'CONFLICT'); assert.equal(fs.readFileSync(join(f.project, '.claude/skills/one/SKILL.md'), 'utf8'), 'later work');
});
test('undo converted MCP transfer restores both native configurations', t => {
  const f = fixture(t), original = '{"mcpServers":{"one":{"command":"node"}},"keep":true}';
  const path = f.put('.claude.json', original); f.transfer(f.args(f.resource('mcp', 'one'), { provider: 'Codex', mode: 'move' }));
  f.call('transfer.undo', { id: f.call('history').history.find(h => h.transfer).id });
  assert.equal(fs.readFileSync(path, 'utf8'), original); assert.equal(fs.existsSync(join(f.project, '.codex/config.toml')), false);
});
test('bulk and project previews reject later changes without touching any sources', t => {
  const f = fixture(t), path = f.put('.codex/config.toml', '[mcp_servers.one]\ncommand="node"\n'), r = f.resource('mcp', 'one');
  const args = { sources: [{ id: r.id, revision: r.revision, parked: false }], enabled: false }, p = f.call('mcp.batch.preview', args);
  fs.appendFileSync(path, '# external\n'); assert.equal(f.service.request('mcp.batch.apply', { ...args, previewRevision: p.previewRevision }).code, 'CONFLICT');
  const project = { id: r.id, project: f.project, action: 'disable' }, preview = f.call('mcp.project.preview', project);
  f.put('Documents/project one/.codex/config.toml', '# later\n'); assert.equal(f.service.request('mcp.project.apply', { ...project, previewRevision: preview.previewRevision }).code, 'CONFLICT');
  assert.equal(fs.readFileSync(join(f.project, '.codex/config.toml'), 'utf8'), '# later\n');
});
test('copy, move and undo work across real filesystems without discoverable backup agents', { skip: process.platform !== 'darwin' }, t => {
  const f = fixture(t), image = join(f.home, 'external.dmg'), mount = join(f.home, 'external-volume'); fs.mkdirSync(mount);
  const run = args => execFileSync('/usr/bin/hdiutil', args, { stdio: 'pipe', timeout: 30000 });
  run(['create', '-size', '32m', '-fs', 'HFS+', '-volname', 'AIOS transfer fixture', '-type', 'UDIF', image]);
  let attached = false;
  try {
    run(['attach', '-nobrowse', '-mountpoint', mount, image]); attached = true;
    assert.notEqual(fs.statSync(mount).dev, fs.statSync(f.home).dev);
    const project = join(mount, 'project'); fs.mkdirSync(project);
    f.call('roots.set', { roots: [join(f.home, 'Documents'), project] });
    f.put('.claude/skills/external/SKILL.md', 'External-volume skill'); f.put('.claude/skills/external/asset.bin', Buffer.from([0,255,128]));
    f.transfer(f.args(f.resource('skills', 'external'), { provider: 'Cursor', project }));
    const external = f.resource('skills', 'external', 'Cursor'); assert.ok(external.path.startsWith(project));
    f.transfer(f.args(external, { mode: 'move', provider: 'Codex', scope: 'user' }));
    assert.equal(fs.existsSync(external.path), false); const moved = f.resource('skills', 'external', 'Codex');
    assert.deepEqual(fs.readFileSync(join(dirname(moved.path),'asset.bin')), Buffer.from([0,255,128]));
    const history = f.call('history').history.find(h => h.transfer && h.label.startsWith('Move'));
    const backup = history.moves.find(m => m.from === dirname(external.path));
    assert.ok(backup.to.startsWith(join(project,'.aios-transfer-'))); assert.ok(!backup.to.includes('/.cursor/'));
    f.call('transfer.undo', { id: history.id }); assert.equal(fs.existsSync(external.path), true); assert.equal(fs.existsSync(moved.path), false);
    assert.equal(f.call('inventory').resources.filter(r => r.kind === 'skills').length, 2);
  } finally { if (attached) run(['detach', mount]); }
});
