import * as fs from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { inspectApplication, inspectDmg, verifyInstallerMetadata, digest as hash, run } from './package-checks.mjs';
import { packagedSession } from './packaged-session.mjs';

const directory = resolve(process.argv[2] || 'release-local'), pkg = JSON.parse(fs.readFileSync('package.json'));
const testArch = process.argv[3] || process.arch;
assert.ok(['arm64', 'x64'].includes(testArch), 'Select arm64 or x64 for the packaged runtime test.');
const results = { version: pkg.version, artifacts: [], bundle: [], smoke: null };
for (const arch of ['arm64', 'x64']) {
  const app = join(directory, arch === 'arm64' ? 'mac-arm64' : 'mac', 'AI Tools OS.app');
  const record = inspectApplication(app, pkg, arch);
  const extracted = fs.mkdtempSync(join(tmpdir(), 'aios-zip-check-'));
  try {
    run('/usr/bin/ditto', ['-x', '-k', join(directory, `AI-Tools-OS-${pkg.version}-${arch}.zip`), extracted]);
    const zip = inspectApplication(join(extracted, pkg.build.productName + '.app'), pkg, arch);
    assert.equal(zip.asarSha512, record.asarSha512, 'ZIP differs from built app');
    const dmg = inspectDmg(join(directory, `AI-Tools-OS-${pkg.version}-${arch}.dmg`), pkg, arch, zip.asarSha512);
    results.bundle.push({ ...record, zipVerified: true, dmgVerified: dmg.mountedReadOnly });
  } finally { fs.rmSync(extracted, { recursive: true, force: true }); }
  for (const ext of ['dmg', 'zip']) { const name = `AI-Tools-OS-${pkg.version}-${arch}.${ext}`, bytes = fs.readFileSync(join(directory, name)); results.artifacts.push({ name, arch, size: bytes.length, sha512: hash(bytes) }); }
}
verifyInstallerMetadata(directory, results.artifacts);
console.log('PASS both architectures, ZIP/DMG contents, source equality and final hashes');

const base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-package-test-'))), home = join(base, 'user'), userData = join(base, 'chromium');
const path = join(home, '.claude/skills/packaged/SKILL.md'); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, 'Packaged fixture');
fs.mkdirSync(join(home, 'Documents'), { recursive: true }); fs.mkdirSync(userData);
const applications = join(base, 'Applications'), installed = join(applications, pkg.build.productName + '.app'); fs.mkdirSync(applications);
const exe = join(installed, 'Contents/MacOS', pkg.build.productName);
const install = () => run('/usr/bin/ditto', ['-x', '-k', join(directory, `AI-Tools-OS-${pkg.version}-${testArch}.zip`), applications]);
let session;
const call = async (operation, args = {}) => { const result = await session.request(operation, args); assert.equal(result.ok, true, JSON.stringify(result)); return result; };
try {
  install(); session = await packagedSession({ exe, home, userData, cwd: base });
  const resource = session.inventory.resources.find(r => r.path === path); assert.ok(resource, 'Fixture source missing');
  await call('resource.write', { id: resource.id, revision: resource.revision, content: 'saved from packaged app' });
  assert.equal(fs.readFileSync(path, 'utf8'), 'saved from packaged app');
  await call('preferences.save', { preferences: { theme: 'light', syncInterval: 0, exclusions: ['ignored-fixture'], providerPaths: {} } });
  const prompt = (await call('prompts.save', { prompt: { name: 'Persisted fixture', content: 'Saved library text' } })).prompts[0];
  const fresh = (await call('inventory')).resources.find(r => r.id === resource.id);
  await call('resource.toggle', { id: resource.id, revision: fresh.revision, enabled: false });
  const statePath = join(home, '.aios/state-v2.json'), state = fs.readFileSync(statePath, 'utf8');
  await session.close(); session = null;

  // Replace the installed bundle, retaining the exact same HOME and user data.
  // This proves reinstall persistence; it does not claim an older-version upgrade.
  fs.rmSync(installed, { recursive: true }); install();
  session = await packagedSession({ exe, home, userData, cwd: base });
  assert.equal(fs.readFileSync(statePath, 'utf8'), state, 'Reinstall modified saved state on startup');
  const restored = session.inventory;
  assert.equal(restored.preferences.theme, 'light'); assert.ok(restored.prompts.some(p => p.id === prompt.id));
  const parked = restored.resources.find(r => r.id === resource.id && r.parked); assert.ok(parked);
  assert.equal((await call('resource.read', { id: parked.id, parked: true })).content, 'saved from packaged app');
  await call('resource.toggle', { id: parked.id, parked: true, revision: parked.revision, enabled: true });
  assert.equal(fs.readFileSync(path, 'utf8'), 'saved from packaged app');
  assert.ok((await call('history')).history.some(h => h.files.some(f => f.path === path)));
  results.smoke = { arch: testArch, hostArch: process.arch, translated: testArch !== process.arch, origin: 'aios://app', fixtureIsolated: true,
    nativeWriteVerified: true, installedFromZip: true, reinstallVerified: true, retained: ['native content', 'preferences', 'prompts', 'parked resources', 'history'] };
  console.log(`PASS ${testArch} installed app, native save and reinstall persistence`);
} finally {
  await session?.close(); fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync('test-results', { recursive: true });
  for (const name of ['package.json', `package-${testArch}.json`]) fs.writeFileSync(join('test-results', name), JSON.stringify(results, null, 2) + '\n');
}
