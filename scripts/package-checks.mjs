import * as fs from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { listPackage, extractFile } from '@electron/asar';
import assert from 'node:assert/strict';
import YAML from 'yaml';

export const digest = data => createHash('sha512').update(data).digest('base64');
export function run(command, args) {
  const r = spawnSync(command, args, { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw Error(`${command} failed: ${r.stderr || r.error?.message || r.status}`);
  return r.stdout.trim();
}
const files = root => fs.readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(root, e.name)) : [join(root, e.name)]);

export function verifyApplicationSignature(app) {
  // This checks the bundle seal and nested code, including ad-hoc beta builds.
  // It does not imply Developer ID trust, notarization or Gatekeeper approval.
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
}

export function inspectApplication(app, pkg, arch) {
  verifyApplicationSignature(app);
  const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]));
  assert.equal(info.CFBundleShortVersionString, pkg.version);
  assert.equal(info.LSMinimumSystemVersion, pkg.build.mac.minimumSystemVersion);
  const architectures = run('/usr/bin/lipo', ['-archs', join(app, 'Contents/MacOS', pkg.build.productName)]);
  assert.deepEqual(architectures.split(/\s+/), [arch === 'x64' ? 'x86_64' : arch]);
  const asar = join(app, 'Contents/Resources/app.asar'), paths = listPackage(asar);
  assert.ok(!paths.some(p => /^\/(docs|tests|src|release|\.aios|\.claude|\.codex|\.agents|\.cursor)\//.test(p)), 'Unexpected development or personal files packaged');
  // Compare every current renderer asset and native implementation module,
  // including newly added adapters. A fixed filename list can miss new code.
  const expected = ['dist', 'electron', 'scripts/lib'].flatMap(files);
  for (const file of expected) assert.deepEqual(extractFile(asar, file), fs.readFileSync(file), `Packaged file differs: ${file}`);
  const packagedFiles = paths.filter(p => /^\/(dist|electron|scripts\/lib)\//.test(p) && /\.[^/]+$/.test(p));
  for (const file of packagedFiles) assert.ok(expected.includes(file.slice(1)), `Stale packaged file: ${file}`);
  const packaged = JSON.parse(extractFile(asar, 'package.json'));
  assert.equal(packaged.version, pkg.version); assert.deepEqual(packaged.dependencies, pkg.dependencies);
  return { arch, minimumMacOS: info.LSMinimumSystemVersion, architectures, codeSignatureValid: true, entries: paths.length, comparedSourceFiles: expected.length, asarSha512: digest(fs.readFileSync(asar)) };
}

export function verifyInstallerMetadata(directory, artifacts) {
  const metadata = YAML.parse(fs.readFileSync(join(directory, 'latest-mac.yml'), 'utf8'));
  assert.ok(Array.isArray(metadata.files) && metadata.files.length > 0, 'Missing installer metadata');
  const seen = new Set();
  for (const item of metadata.files) {
    const name = decodeURIComponent(item.url);
    assert.ok(artifacts.some(a => a.name === name), `Unexpected metadata artifact ${name}`);
    assert.ok(!seen.has(name), 'Duplicate update metadata'); seen.add(name);
    const bytes = fs.readFileSync(join(directory, name));
    assert.equal(item.size, bytes.length); assert.equal(item.sha512, digest(bytes));
  }
  if (metadata.path) {
    const name = decodeURIComponent(metadata.path);
    assert.ok(seen.has(name), 'Primary update artifact missing from metadata');
    assert.equal(metadata.sha512, digest(fs.readFileSync(join(directory, name))));
  }
}

export function inspectDmg(dmg, pkg, arch, expectedAsar) {
  const mount = fs.mkdtempSync(join(tmpdir(), 'aios-dmg-check-'));
  let attached = false;
  try {
    run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, dmg]); attached = true;
    const app = join(mount, pkg.build.productName + '.app');
    const record = inspectApplication(app, pkg, arch);
    assert.equal(record.asarSha512, expectedAsar, 'DMG and ZIP contain different application code');
    assert.equal(fs.readlinkSync(join(mount, 'Applications')), '/Applications', 'DMG Applications shortcut is missing');
    return { ...record, mountedReadOnly: true, installer: relative(process.cwd(), dmg) };
  } finally {
    if (attached) run('/usr/bin/hdiutil', ['detach', mount]);
    fs.rmdirSync(mount);
  }
}
