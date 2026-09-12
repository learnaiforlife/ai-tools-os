import * as fs from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inspectApplication, inspectDmg, verifyInstallerMetadata } from './package-checks.mjs';

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw Error(`${command} verification failed: ${result.stderr || result.error?.message}`);
  return result.stdout.trim();
};
const work = fs.mkdtempSync(join(tmpdir(), 'aios-release-check-'));
try {
  const directory = resolve(process.argv[2] || 'release'), pkg = JSON.parse(fs.readFileSync('package.json'));
  const artifacts = fs.readdirSync(directory).filter(n => /\.(zip|dmg)$/.test(n));
  const records = [];
  for (const arch of ['arm64', 'x64']) {
    const zip = artifacts.find(n => n === `AI-Tools-OS-${pkg.version}-${arch}.zip`);
    const dmg = artifacts.find(n => n === `AI-Tools-OS-${pkg.version}-${arch}.dmg`);
    if (!zip || !dmg) throw Error(`Missing ZIP or DMG for ${arch}.`);
    const destination = join(work, arch); fs.mkdirSync(destination);
    run('/usr/bin/ditto', ['-x', '-k', join(directory, zip), destination]);
    const app = join(destination, 'AI Tools OS.app');
    const inspected = inspectApplication(app, pkg, arch);
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
    run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', app]);
    run('/usr/bin/xcrun', ['stapler', 'validate', app]);
    const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')]));
    if (info.CFBundleShortVersionString !== pkg.version) throw Error('Artifact version differs from package.json.');
    if (info.LSMinimumSystemVersion !== '13.0') throw Error('Unexpected minimum macOS version.');
    const actual = run('/usr/bin/lipo', ['-archs', join(app, 'Contents/MacOS/AI Tools OS')]);
    if (!actual.includes(arch === 'x64' ? 'x86_64' : arch)) throw Error(`Architecture mismatch for ${zip}.`);
    run('/usr/bin/xcrun', ['stapler', 'validate', join(directory, dmg)]);
    run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=2', join(directory, dmg)]);
    run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=2', join(directory, dmg)]);
    inspectDmg(join(directory, dmg), pkg, arch, inspected.asarSha512);
    for (const name of [zip, dmg]) {
      const bytes = fs.readFileSync(join(directory, name));
      records.push({ name, arch, version: pkg.version, minMacOS: info.LSMinimumSystemVersion, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') });
    }
  }
  verifyInstallerMetadata(directory, records);
  const commit = run('git', ['rev-parse', 'HEAD']);
  fs.writeFileSync(join(directory, 'verified-release.json'), JSON.stringify({ version: pkg.version, commit, verifiedAt: new Date().toISOString(), artifacts: records }, null, 2) + '\n');
  const base = process.env.AIOS_DOWNLOAD_BASE_URL;
  if (base) {
    const url = new URL(base); if (url.protocol !== 'https:') throw Error('Download hosting must use HTTPS.');
    const manifest = { available: true, channel: 'stable', verification: 'developer-id-notarized', version: pkg.version, minMacOS: '13.0', artifacts: records.map(r => ({ ...r, url: new URL(encodeURIComponent(basename(r.name)), url.href.replace(/\/?$/, '/')).href })) };
    fs.writeFileSync('site/src/release.json', JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log(`Verified ${records.length} signed and notarized artifacts. Checksums generated from final bytes.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { fs.rmSync(work, { recursive: true, force: true }); }
