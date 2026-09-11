import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';
import { digest, verifyInstallerMetadata, verifyApplicationSignature, run } from '../scripts/package-checks.mjs';
import siteConfig from '../site/vite.config.js';
import { packagedSession } from '../scripts/packaged-session.mjs';
import { writeInstallerMetadata } from '../scripts/release-metadata.mjs';
import { getReleaseInfo } from '../site/src/release-info.js';

const releaseFixture = () => ({ available: true, channel: 'beta', verification: 'unsigned', version: '1.1.0', minMacOS: '13.0', artifacts: ['arm64', 'x64'].map(arch => ({ name: `app-${arch}.dmg`, arch, size: 100, sha512: digest(Buffer.from(arch)), url: `https://example.test/app-${arch}.dmg` })) });
test('Mac package validation rejects missing seals, altered resources and altered nested code', { skip: process.platform !== 'darwin' }, t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aios-signature-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'Fixture.app');
  const contents = join(app, 'Contents'), resource = join(contents, 'Resources/data.txt');
  fs.mkdirSync(join(contents, 'MacOS'), { recursive: true }); fs.mkdirSync(join(contents, 'Resources'));
  fs.copyFileSync('/bin/echo', join(contents, 'MacOS/Fixture'));
  fs.writeFileSync(join(contents, 'Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Fixture</string><key>CFBundleIdentifier</key><string>test.aios.signature</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  fs.writeFileSync(resource, 'original');
  assert.throws(() => verifyApplicationSignature(app), /codesign failed/);
  const helper = join(contents, 'MacOS/Helper'); fs.copyFileSync('/bin/echo', helper);
  run('/usr/bin/codesign', ['--force', '--sign', '-', helper]);
  run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  verifyApplicationSignature(app);
  fs.writeFileSync(resource, 'modified');
  assert.throws(() => verifyApplicationSignature(app), /codesign failed/);
  fs.writeFileSync(resource, 'original'); verifyApplicationSignature(app);
  run('/usr/bin/codesign', ['--remove-signature', helper]);
  assert.throws(() => verifyApplicationSignature(app), /codesign failed/);
});
test('beta downloads remain available without claiming Apple signing or notarization', () => {
  const result = getReleaseInfo(releaseFixture());
  assert.equal(result.downloads.length, 2); assert.equal(result.needsApproval, true);
  assert.match(result.status, /beta/); assert.match(result.status, /No Apple Developer ID signature or notarization/);
  assert.deepEqual(result.downloads.map(d => d.label), ['Download for Apple Silicon', 'Download for Intel']);
});
test('stable downloads require an explicit signed result and valid complete download metadata', () => {
  const release = releaseFixture(); release.channel = 'stable';
  assert.throws(() => getReleaseInfo(release), /require Developer ID/);
  release.verification = 'developer-id-notarized'; assert.equal(getReleaseInfo(release).needsApproval, false);
  release.artifacts[0].url = 'http://example.test/app.dmg'; assert.throws(() => getReleaseInfo(release), /HTTPS/);
  release.artifacts[0].url = 'https://example.test/app.dmg'; release.artifacts[0].sha512 = 'stale'; assert.throws(() => getReleaseInfo(release), /checksum/);
  release.artifacts.pop(); assert.throws(() => getReleaseInfo(release), /both Mac architectures/);
});
test('the published manifest is renderable and unpublished releases expose no downloads', () => {
  getReleaseInfo(JSON.parse(fs.readFileSync('site/src/release.json', 'utf8')));
  assert.deepEqual(getReleaseInfo({ available: false, version: '1.1.0' }).downloads, []);
});

test('installer metadata must reference the final artifact bytes and primary checksum', t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'aios-release-metadata-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const name = 'app-arm64.zip', bytes = Buffer.from('fixture archive bytes'); fs.writeFileSync(join(dir, name), bytes);
  const metadata = { files: [{ url: name, size: bytes.length, sha512: digest(bytes) }], path: name, sha512: digest(bytes) };
  const put = obj => fs.writeFileSync(join(dir, 'latest-mac.yml'), YAML.stringify(obj));
  put(metadata); verifyInstallerMetadata(dir, [{ name }]);
  put({ ...metadata, sha512: 'stale' }); assert.throws(() => verifyInstallerMetadata(dir, [{ name }]));
  put({ ...metadata, files: [{ ...metadata.files[0], size: 1 }] }); assert.throws(() => verifyInstallerMetadata(dir, [{ name }]));
  put({ ...metadata, files: [{ ...metadata.files[0], url: '../outside.zip' }] }); assert.throws(() => verifyInstallerMetadata(dir, [{ name }]));
  put(metadata); fs.writeFileSync(join(dir, name), 'changed bytes'); assert.throws(() => verifyInstallerMetadata(dir, [{ name }]));
});
test('a clean build generates complete metadata without inferred publishing configuration', t => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'aios-cold-metadata-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const artifacts = [];
  for (const arch of ['arm64','x64']) for (const ext of ['zip','dmg']) {
    const name = `AI-Tools-OS-1.1.0-${arch}.${ext}`;
    artifacts.push({ name }); fs.writeFileSync(join(dir,name), `final ${arch} ${ext} bytes`);
    fs.writeFileSync(join(dir,name + '.blockmap'), 'stale pre-staple data');
  }
  writeInstallerMetadata(dir, '1.1.0'); verifyInstallerMetadata(dir, artifacts);
  assert.equal(YAML.parse(fs.readFileSync(join(dir,'latest-mac.yml'),'utf8')).files.length, 4);
  assert.ok(!fs.readdirSync(dir).some(n => n.endsWith('.blockmap')));
  fs.writeFileSync(join(dir, artifacts[1].name), 'stapled final image');
  assert.throws(() => verifyInstallerMetadata(dir, artifacts));
  writeInstallerMetadata(dir, '1.1.0'); verifyInstallerMetadata(dir, artifacts);
  fs.unlinkSync(join(dir, artifacts[0].name));
  assert.throws(() => writeInstallerMetadata(dir, '1.1.0'), /ENOENT/);
});
test('site builds never copy unreviewed public screenshots or installers', async t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aios-site-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(join(root, 'public'));
  fs.writeFileSync(join(root, 'public/private-screen.png'), 'private screenshot fixture');
  fs.writeFileSync(join(root, 'public/old-installer.dmg'), 'unverified installer fixture');
  fs.writeFileSync(join(root, 'index.html'), '<main>Static site fixture</main>');
  const { build } = await import('vite');
  await build({ ...siteConfig, configFile: false, root, logLevel: 'silent' });
  assert.deepEqual(fs.readdirSync(join(root, 'dist')), ['index.html']);
});
test('packaged test startup handles a missing executable without hanging', async () => {
  await assert.rejects(() => packagedSession({ exe: '/nonexistent-aios-fixture', home: '/nonexistent-fixture-home', userData: '/nonexistent-fixture-data', cwd: process.cwd() }), /ENOENT/);
});
