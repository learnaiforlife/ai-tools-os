import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { digest } from './package-checks.mjs';

export function writeInstallerMetadata(directory, version) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) throw Error('Invalid release version.');
  const files = [];
  for (const arch of ['arm64', 'x64']) for (const ext of ['zip', 'dmg']) {
    const url = `AI-Tools-OS-${version}-${arch}.${ext}`, bytes = fs.readFileSync(join(directory, url));
    files.push({ url, size: bytes.length, sha512: digest(bytes) });
  }
  const metadata = { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: new Date().toISOString() };
  const temp = join(directory, `.metadata-${randomUUID()}.tmp`);
  try { fs.writeFileSync(temp, YAML.stringify(metadata)); fs.renameSync(temp, join(directory, 'latest-mac.yml')); }
  finally { fs.rmSync(temp, { force: true }); }
  // AIOS uses manual full-installer updates. Build-time differential blockmaps
  // predate possible DMG stapling and must not be distributed as final metadata.
  for (const file of files) fs.rmSync(join(directory, file.url + '.blockmap'), { force: true });
  return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  writeInstallerMetadata(resolve(process.argv[2] || 'release-local'), pkg.version);
  console.log('Generated installer metadata from all four final artifacts.');
}
