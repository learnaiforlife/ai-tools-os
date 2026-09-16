import fs from 'node:fs';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

// Shared by the development desktop and both packaged architectures. Uses only
// each runner's disposable home, never the operator's native configuration.
export async function runScanUat({ evaluate: js, home, output, screenshot, probe }) {
  const pause = () => new Promise(r => setTimeout(r, 50));
  const wait = async code => { for (let i = 0; i < 600; i++) { if (await js(code)) return; await pause(); } throw Error(`Scan UAT timeout: ${code}`); };
  const button = async (text, scope = 'button') => { await wait(`!![...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`); await js(`[...document.querySelectorAll(${JSON.stringify(scope)})].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); await pause(); };
  const nav = async name => { await js(`[...document.querySelectorAll('.wb-sidebar nav button')].find(b=>b.innerText.startsWith(${JSON.stringify(name)})).click()`); await pause(); };
  const value = async (selector, value) => { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await pause(); };
  const sync = async () => { await button('Sync'); await wait("![...document.querySelectorAll('.wb-topbar button')].some(b=>b.textContent==='Working…')"); };
  const put = (path, content) => { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, content); };
  const root = join(home, 'Documents/Scan UAT'), healthy = join(root, '.claude/commands/scan-healthy.md');
  const invalid = '---\nname: Scan header\ndescription: Tasks: safely\n---\nKeep every body byte.\n';
  put(healthy, '# Healthy scan resource\nKeep working.\n');
  for (let n = 0; n < 132; n++) put(join(root, `.claude/skills/scan-warning-${n}/SKILL.md`), invalid);
  for (const name of ['bin', 'demo', 'man', 'include', 'LICENSE', 'README', 'argFile']) fs.symlinkSync(join(root, 'missing-target', name), join(root, name));
  try {
    await nav('Overview'); await button('All sources', '.scope-tabs button'); await value('[aria-label="Provider"]', 'all'); await sync();
    await probe('Scan completes with skipped paths and groups 132 repeated header warnings', async () => {
      const inv = await js("window.aios.request('inventory')"); assert.equal(inv.scan.completed, true); assert.equal(inv.scan.limited, 0); assert.ok(inv.scan.warnings >= 132); assert.ok(inv.scan.skipped >= 7);
      assert.ok((await js("document.querySelector('main').innerText")).includes('Scan completed with notices'));
      await button('View scan report'); await wait("!!document.querySelector('.scan-report')");
      assert.equal(await js("document.querySelectorAll('.scan-issue-group').length"), 2);
      await js("[...document.querySelectorAll('.scan-issue-group')].find(d=>d.textContent.includes('Invalid resource headers')).open=true;true");
      assert.equal(await js("document.querySelector('.scan-issue-group[open]').querySelectorAll('.scan-issue-path').length"), 30);
      await button('Show more paths (102 remaining)');
      assert.equal(await js("document.querySelector('.scan-issue-group[open]').querySelectorAll('.scan-issue-path').length"), 60);
      if (screenshot) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(join(output, 'scan-report.png'), await screenshot()); }
    });
    await probe('Scan report filters skipped paths and opens a reviewed repair draft', async () => {
      await value('[aria-label="Scan notice type"]', 'skipped'); assert.equal(await js("document.querySelectorAll('.scan-issue-group').length"), 1);
      await value('[aria-label="Search resources"]', 'argFile'); await js("document.querySelector('.scan-issue-group').open=true;true");
      assert.equal(await js("document.querySelectorAll('.scan-issue-path').length"), 1);
      await value('[aria-label="Search resources"]', ''); await value('[aria-label="Scan notice type"]', 'review');
      await js("document.querySelector('.scan-issue-group').open=true;true"); await button('Review file');
      await wait("!!document.querySelector('dialog .markdown-reader')"); await button('Preview header repair'); await wait("!!document.querySelector('dialog .wb-diff')");
      assert.equal(fs.readFileSync(join(root, '.claude/skills/scan-warning-0/SKILL.md'), 'utf8'), invalid);
      assert.equal(await js("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Save changes').disabled"), true);
      await js('window.confirm=()=>true;true'); await button('Close', 'dialog button');
    });
    await probe('Warnings stay off unrelated pages and healthy resources can be edited', async () => {
      await nav('Sessions'); assert.equal(await js("document.querySelectorAll('main [role=alert]').length"), 0);
      assert.ok(!(await js("document.querySelector('main').innerText")).includes('Scan stopped'));
      await nav('Commands'); await value('[aria-label="Search resources"]', 'scan-healthy'); await button('scan-healthy.md');
      await wait("!!document.querySelector('dialog .markdown-reader')"); await button('Edit source'); await value('[aria-label="File content"]', '# Healthy scan resource\nSaved with warnings present.\n'); await button('Save changes'); await wait("!document.querySelector('dialog')");
      assert.ok(fs.readFileSync(healthy, 'utf8').includes('Saved with warnings present'));
    });
    await probe('Resolved paths disappear from the next scan report', async () => {
      fs.rmSync(root, { recursive: true, force: true }); await nav('Scan report'); await button('Retry scan'); await wait("![...document.querySelectorAll('.wb-topbar button')].some(b=>b.textContent==='Working…')");
      assert.equal(await js("document.querySelectorAll('.scan-issue-group').length"), 0);
      assert.ok((await js("document.querySelector('main').innerText")).includes('No notices in this view'));
    });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
