import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assetResponse } from '../electron/assets.mjs';

test('desktop assets load from spaces, percent signs and Unicode paths with valid MIME types', async t => {
  const base = fs.mkdtempSync(join(tmpdir(), 'aios assets % ü '));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const get = (url, method = 'GET') => assetResponse({ url, method }, base);
  for (const [name, type, content] of [['index.html', 'text/html', '<main>Ready</main>'], ['app space % ü.js', 'text/javascript', 'export const ready=true;'], ['styles.css', 'text/css', 'main{display:grid}']]) {
    fs.writeFileSync(join(base, name), content);
    const response = await get('aios://app/' + encodeURIComponent(name));
    assert.equal(response.status, 200); assert.equal(await response.text(), content);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.equal((await get('aios://app/missing.js')).status, 404);
  assert.equal((await get('aios://app/index.html', 'POST')).status, 403);
  assert.equal((await get('aios://other/index.html')).status, 403);
  assert.equal((await get('aios://user:pass@app/index.html')).status, 403);
  assert.equal((await get('aios://app/%ZZ')).status, 400);
  assert.equal((await get('aios://app/%2e%2e%2foutside')).status, 403);
  fs.symlinkSync('/etc/hosts', join(base, 'outside'));
  assert.equal((await get('aios://app/outside')).status, 404);
});
