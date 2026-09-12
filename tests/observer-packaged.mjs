// Focused packaged observer acceptance; all native state is confined to a disposable HOME.
import * as fs from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { packagedSession } from '../scripts/packaged-session.mjs';
import { runExperienceUat } from './experience-uat.mjs';
const reports = [];
for (const arch of ['arm64', 'x64']) {
  const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-observer-package-'))), home = join(root, 'home'), userData = join(root, 'chromium');
  fs.mkdirSync(join(home, 'Documents'), { recursive: true }); fs.mkdirSync(userData);
  let session;
  try {
    session = await packagedSession({ exe: resolve('release-local', arch === 'arm64' ? 'mac-arm64' : 'mac', 'AI Tools OS.app/Contents/MacOS/AI Tools OS'), home, userData, cwd: root });
    await runExperienceUat({ evaluate: session.evaluate, home, output: resolve('test-results'), probe: async (name, check) => {
      if (!name.startsWith('Observer setup')) return;
      await check(); reports.push({ arch, name, passed: true }); console.log('PASS', arch, name);
    } });
    assert.deepEqual(session.rendererErrors, []);
  } finally { await session?.close(); fs.rmSync(root, { recursive: true, force: true }); }
}
fs.writeFileSync('test-results/observer-packaged.json', JSON.stringify(reports, null, 2));
