import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { notarize } from '@electron/notarize';
import { writeInstallerMetadata } from './release-metadata.mjs';
const run = (command, args, capture = false) => {
  const result = spawnSync(command, args, { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) throw result.error || Error(`${command} failed (${result.status}).`);
  return result.stdout;
};
try {
  if (process.platform !== 'darwin') throw Error('Mac releases must be built and verified on macOS.');
  if (run('git', ['status', '--porcelain'], true)) throw Error('Release blocked: commit and review the source changes first. Release artifacts must correspond to a clean commit.');
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning'], true);
  if (!identities.includes('Developer ID Application:')) throw Error('Release blocked: install a Developer ID Application signing identity. Local unsigned test builds are available through npm run dist:mac:local.');
  const env = process.env;
  if (!(env.APPLE_ID && env.APPLE_APP_SPECIFIC_PASSWORD && env.APPLE_TEAM_ID) && !(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER)) throw Error('Release blocked: configure Apple notarization credentials in the build environment.');
  const pkg = JSON.parse(readFileSync('package.json'));
  const output = resolve('release', pkg.version);
  run('npm', ['run', 'check']); run('npm', ['run', 'test:desktop']); run('npm', ['audit', '--audit-level=moderate']); run('npm', ['--prefix', 'site', 'audit', '--audit-level=moderate']);
  run(resolve('node_modules/.bin/electron-builder'), ['--mac', '--arm64', '--x64', '--publish', 'never', '--config.forceCodeSigning=true', '--config.mac.notarize=true', '--config.dmg.sign=true', `--config.directories.output=${output}`]);
  const authorization = env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER
    ? { appleApiKey: env.APPLE_API_KEY, appleApiKeyId: env.APPLE_API_KEY_ID, appleApiIssuer: env.APPLE_API_ISSUER }
    : { appleId: env.APPLE_ID, appleIdPassword: env.APPLE_APP_SPECIFIC_PASSWORD, teamId: env.APPLE_TEAM_ID };
  for (const arch of ['arm64', 'x64']) {
    console.log(`Notarizing and stapling the ${arch} disk image…`);
    await notarize({ appPath: resolve(output, `AI-Tools-OS-${pkg.version}-${arch}.dmg`), ...authorization });
  }
  writeInstallerMetadata(output, pkg.version);
  run(process.execPath, ['scripts/test-package.mjs', output]);
  if (run('git', ['status', '--porcelain'], true)) throw Error('Release source changed during validation. Review and rebuild from a clean commit.');
  run(process.execPath, ['scripts/verify-release.mjs', output]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
