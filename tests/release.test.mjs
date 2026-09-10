import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';
import { digest, verifyInstallerMetadata } from '../scripts/package-checks.mjs';
import siteConfig from '../site/vite.config.js';
import { packagedSession } from '../scripts/packaged-session.mjs';
import { writeInstallerMetadata } from '../scripts/release-metadata.mjs';

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
