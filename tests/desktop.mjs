// Actual Electron main, preload, worker and production React bundle. Every tool
// resource and all application state are redirected into a temporary fixture.
import { app, BrowserWindow, clipboard, dialog } from 'electron';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-desktop-test-'))), home = join(base, 'User space % ü'), fixtureApp = join(base, 'AI Tools OS space % ü');
const write = (path, content) => { fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, content); };
const userSkill = join(home, '.claude/skills/user/SKILL.md');
write(userSkill, '---\nname: User skill\ndescription: Fixture\n---\n' + 'Complete content\n'.repeat(400));
write(join(home, 'Documents/project/.claude/skills/project/SKILL.md'), '---\nname: Project skill\n---\nProject only');
write(join(home, '.claude/settings.json'), '{"model":"fixture-model","permissions":{"allow":["Read"]}}');
write(join(home, '.claude.json'), '{"mcpServers":{"fixture-server":{"command":"fixture-only","args":["value with spaces"],"env":{"TOKEN":"fixture-secret"}}}}');
write(join(fixtureApp, 'electron/main.mjs'), fs.readFileSync(join(repo, 'electron/main.mjs'), 'utf8').replace('workerData: { cancelBuffer }', `workerData: { cancelBuffer, fixtureHome: ${JSON.stringify(home)} }`));
for (const file of fs.readdirSync(join(repo, 'electron')).filter(file => file !== 'main.mjs')) write(join(fixtureApp, 'electron', file), fs.readFileSync(join(repo, 'electron', file)));
fs.mkdirSync(join(fixtureApp, 'scripts')); fs.symlinkSync(join(repo, 'scripts/lib'), join(fixtureApp, 'scripts/lib'));
fs.cpSync(join(repo, 'dist'), join(fixtureApp, 'dist'), { recursive: true }); fs.symlinkSync(join(repo, 'node_modules'), join(fixtureApp, 'node_modules'));
app.setPath('userData', join(base, 'electron-data')); app.setPath('sessionData', join(base, 'electron-session')); app.setPath('logs', join(base, 'logs'));
app.commandLine.appendSwitch('disable-gpu');
let win, mainModule, loaded = false;
let copied;
// Exercise the real IPC route without modifying the user's system clipboard.
const nativeCopy = clipboard.writeText;
clipboard.writeText = value => { copied = value; };
const nativeMessageBox = dialog.showMessageBox, displayRecovery = [];
dialog.showMessageBox = async (_window, options) => {
  displayRecovery.push(options);
  fs.copyFileSync(join(repo, 'dist/index.html'), join(fixtureApp, 'dist/index.html'));
  return { response: 0, checkboxChecked: false };
};
const errors = [], results = [];
app.on('browser-window-created', (_, window) => {
  win = window; loaded = false; window.on('show', () => window.hide());
  window.webContents.on('did-start-loading', () => { loaded = false; });
  window.webContents.on('did-finish-load', () => { loaded = true; });
  window.webContents.on('console-message', (event, level, message) => {
    const text = event.message || message, severity = event.level ?? level;
    if (severity === 'error' || severity >= 3) errors.push(text);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const js = code => win.webContents.executeJavaScript(code);
async function waitFor(code, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { if (loaded && win && !win.isDestroyed() && await js(code).catch(() => false)) return; await sleep(40); } throw Error('Timed out: ' + code); }
async function click(text, selector = 'button') { await js(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!el)throw Error('Missing button: '+${JSON.stringify(text)});if(el.disabled)throw Error('Disabled button');el.click()})()`); await sleep(40); }
async function nav(text) { await js(`(()=>{const el=[...document.querySelectorAll('.wb-sidebar nav button')].find(e=>e.innerText.startsWith(${JSON.stringify(text)}));if(!el)throw Error('Missing navigation');el.click()})()`); await sleep(70); }
async function value(selector, value) { await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); await sleep(40); }
async function idle() { await waitFor("[...document.querySelectorAll('.wb-topbar button')].some(e=>e.textContent==='Sync'&&!e.disabled)"); }
async function probe(name, fn) {
  try { await fn(); results.push({ name, passed: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); console.error('FAIL', name, error.message); throw error; }
}
async function run() {
  try {
    mainModule = await import(pathToFileURL(join(fixtureApp, 'electron/main.mjs')));
    await waitFor("document.querySelector('.wb-status')?.textContent.includes('Inventory refreshed')", 20000);
    await js('window.confirm = () => true; true');
    const inventory = await js("window.aios.request('inventory')");
    assert.equal(inventory.providerPaths.claude, join(home, '.claude'), 'Fixture isolation must be verified before any mutation');
    await probe('private desktop connection loads actual fixture inventory', async () => {
      assert.equal(win.webContents.getURL(), 'aios://app/index.html'); assert.equal(inventory.resources.filter(r => r.kind === 'skills').length, 2);
      assert.equal(await js('typeof window.require'), 'undefined'); assert.equal(await js('typeof window.aios.request'), 'function');
    });
    await probe('IPC rejects subframes and untrusted origins', async () => {
      const frame = { url: 'https://evil.test' }; assert.throws(() => mainModule.validateSender({ senderFrame: frame, sender: { mainFrame: frame, isDestroyed: () => false } }));
      assert.throws(() => mainModule.validateSender({ senderFrame: { url: 'aios://app/index.html' }, sender: { mainFrame: {}, isDestroyed: () => false } }));
      const response = await js("fetch('/api/resources').then(r=>r.status)"); assert.equal(response, 404);
    });
    await probe('native clipboard route writes requested text and rejects oversized input', async () => {
      assert.equal((await js("window.aios.copyText('fixture clipboard text')")).ok, true); assert.equal(copied, 'fixture clipboard text');
      assert.equal((await js("window.aios.copyText('x'.repeat(3*1024*1024))")).ok, false); assert.equal(copied, 'fixture clipboard text');
    });
    await probe('all screens use real global scope and selected project', async () => {
      await nav('Skills'); assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 2);
      await value('[aria-label="Scope"]', 'user'); assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1);
      assert.ok((await js("document.querySelector('main').innerText")).includes('User skill'));
      await value('[aria-label="Scope"]', 'project'); await value('[aria-label="Project"]', join(home, 'Documents/project'));
      assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 1); assert.ok((await js("document.querySelector('main').innerText")).includes('Project skill'));
      await value('[aria-label="Scope"]', 'all');
    });
    await probe('full skill editor saves real bytes and closes only after success', async () => {
      await click('User skill'); await waitFor("document.querySelector('[aria-label=\"File content\"]')?.value.length > 4000");
      const original = fs.readFileSync(userSkill, 'utf8'); assert.equal(await js("document.querySelector('[aria-label=\"File content\"]').value"), original);
      await value('[aria-label="File content"]', original + 'saved by UI'); await click('Compare changes');
      assert.ok((await js("document.querySelector('.wb-diff').innerText")).includes('saved by UI')); await click('Editor');
      await click('Save changes'); await waitFor("!document.querySelector('dialog')"); await idle();
      assert.equal(fs.readFileSync(userSkill, 'utf8'), original + 'saved by UI');
    });
    await probe('stale save fails visibly and keeps the complete draft', async () => {
      await click('User skill'); await waitFor("!!document.querySelector('[aria-label=\"File content\"]')");
      await value('[aria-label="File content"]', 'unsaved draft'); fs.writeFileSync(userSkill, 'external edit'); await click('Save changes');
      await waitFor("document.querySelector('dialog').innerText.includes('changed on disk')");
      assert.equal(fs.readFileSync(userSkill, 'utf8'), 'external edit'); assert.equal(await js("document.querySelector('[aria-label=\"File content\"]').value"), 'unsaved draft');
      await click('Close', 'dialog button'); await idle();
    });
    await probe('sync refreshes the visible resource list immediately', async () => {
      write(join(home, '.claude/skills/new/SKILL.md'), '---\nname: Added from disk\n---\nNew'); await click('Sync'); await idle();
      assert.equal(await js("document.querySelectorAll('.wb-resource').length"), 3);
    });
    await probe('new skill dialog writes native full content to chosen provider', async () => {
      await click('New skills'); await value('dialog input', 'created'); await value('dialog textarea', '---\nname: Created in UI\n---\nPersistent');
      await click('Create resource'); await waitFor("!document.querySelector('dialog')"); await idle();
      assert.ok(fs.readFileSync(join(home, '.claude/skills/created/SKILL.md'), 'utf8').includes('Persistent'));
    });
    await probe('MCP disable and restore mutate actual source and shared security inventory', async () => {
      await nav('MCP servers'); await click('Disable'); await idle();
      assert.deepEqual(JSON.parse(fs.readFileSync(join(home, '.claude.json'))).mcpServers, {});
      await nav('Security review'); assert.ok((await js("document.querySelector('main').innerText")).includes('fixture-server'));
      await click('Restore'); await idle(); assert.equal(JSON.parse(fs.readFileSync(join(home, '.claude.json'))).mcpServers['fixture-server'].command, 'fixture-only');
    });
    await probe('native MCP inspector preserves arguments and guards credential reveal', async () => {
      await click('fixture-server'); assert.equal(await js("document.querySelector('dialog textarea')"), null);
      await click('Reveal content'); await waitFor("!!document.querySelector('dialog textarea')");
      const content = JSON.parse(await js("document.querySelector('dialog textarea').value")); assert.deepEqual(content.args, ['value with spaces']); assert.equal(content.env.TOKEN, 'fixture-secret');
      await click('Close', 'dialog button');
    });
    await probe('profile review shows exact paths and rejects edits made after preview', async () => {
      await nav('MCP servers'); await click('Capture current configuration'); await value('dialog input', 'Desktop profile');
      await click('Capture profile'); await waitFor("!document.querySelector('dialog')"); await idle();
      await click('Disable'); await idle(); await click('Review / apply');
      await waitFor("document.querySelector('dialog')?.innerText.includes('Restore / enable')");
      assert.ok((await js("document.querySelector('dialog').innerText")).includes(join(home, '.claude.json')));
      const path = join(home, '.claude.json'); fs.writeFileSync(path, '{"mcpServers":{},"external":true}');
      await click('Apply reviewed profile');
      await waitFor("document.querySelector('dialog')?.innerText.includes('sources changed')");
      assert.deepEqual(JSON.parse(fs.readFileSync(path)).mcpServers, {});
      await click('Refresh preview'); await waitFor("!!document.querySelector('dialog .wb-button.primary')");
      await click('Apply reviewed profile'); await waitFor("!document.querySelector('dialog')"); await idle();
      const saved = JSON.parse(fs.readFileSync(path)); assert.equal(saved.external, true); assert.ok(saved.mcpServers['fixture-server']);
    });
    await probe('collision inspection opens the selected parked skill and never edits the live replacement', async () => {
      await nav('Skills');
      await js("[...document.querySelectorAll('.wb-resource')].find(r=>r.innerText.includes('Created in UI')).querySelector('[aria-label^=Disable]').click()"); await idle();
      const path = join(home, '.claude/skills/created/SKILL.md'); write(path, '---\nname: Live replacement\n---\nLive bytes');
      await click('Sync'); await idle(); await click('Created in UI');
      await waitFor("!!document.querySelector('dialog textarea')");
      assert.ok((await js("document.querySelector('dialog textarea').value")).includes('Persistent'));
      assert.ok((await js("document.querySelector('dialog').innerText")).includes('Parked copy'));
      await value('dialog textarea', '---\nname: Created in UI\n---\nEdited parked bytes'); await click('Save changes');
      await waitFor("!document.querySelector('dialog')"); await idle(); assert.ok(fs.readFileSync(path, 'utf8').includes('Live bytes'));
      fs.rmSync(dirname(path), { recursive: true }); await click('Sync'); await idle();
      await js("[...document.querySelectorAll('.wb-resource')].find(r=>r.innerText.includes('Created in UI')).querySelector('[aria-label^=Restore]').click()"); await idle();
      assert.ok(fs.readFileSync(path, 'utf8').includes('Edited parked bytes'));
    });
    await probe('Cursor user-rule creation explains its limitation before writing', async () => {
      await nav('Memory & rules'); await click('New memory');
      await value('dialog select', 'Cursor');
      assert.equal(await js("document.querySelector('dialog button[type=submit]').disabled"), true);
      assert.ok((await js("document.querySelector('dialog').innerText")).includes('Cursor settings'));
      assert.equal(fs.existsSync(join(home, '.cursor/.cursorrules')), false);
      await click('Close', 'dialog button');
    });
    await probe('config editor displays and saves the selected native config', async () => {
      await nav('Config files'); await click('settings.json'); await click('Reveal content'); await waitFor("!!document.querySelector('dialog textarea')");
      const obj = JSON.parse(await js("document.querySelector('dialog textarea').value")); assert.equal(obj.model, 'fixture-model'); obj.model = 'updated-model';
      await value('dialog textarea', JSON.stringify(obj, null, 2)); await click('Save changes'); await waitFor("!document.querySelector('dialog')"); await idle();
      assert.equal(JSON.parse(fs.readFileSync(join(home, '.claude/settings.json'))).model, 'updated-model');
    });
    await probe('preferences persist through navigation and window recreation', async () => {
      await nav('Settings'); await value('.wb-form-grid select', 'light'); await click('Save preferences'); await idle();
      await nav('Overview'); await nav('Settings'); assert.equal(await js("document.querySelector('.wb-form-grid select').value"), 'light');
      await js("localStorage.setItem('stable-origin','retained')"); const first = win.webContents.getURL(); const old = win; win = null; old.close(); await sleep(100); app.emit('activate');
      await waitFor("document.querySelector('.wb-status')?.textContent.includes('Inventory refreshed')"); assert.equal(win.webContents.getURL(), first);
      assert.equal(await js("localStorage.getItem('stable-origin')"), 'retained'); assert.equal(await js("document.documentElement.getAttribute('data-theme')"), 'light');
      await js('window.confirm = () => true; true');
    });
    await probe('onboarding guide cannot mutate MCP state or crash the app', async () => {
      const before = fs.readFileSync(join(home, '.claude.json'), 'utf8'); await nav('Getting started');
      assert.ok((await js("document.querySelector('main').innerText")).includes('Get started')); assert.equal(fs.readFileSync(join(home, '.claude.json'), 'utf8'), before);
    });
    await probe('prompt creation is real and accessible dialog traps focus', async () => {
      await nav('Prompt library'); await click('New prompt'); await value('dialog input', 'Saved prompt'); await value('dialog textarea', 'Hello {{name}}');
      assert.equal(await js("document.querySelector('dialog').open"), true); assert.ok(await js("document.querySelector('dialog').contains(document.activeElement)"));
      await click('Save prompt'); await waitFor("!document.querySelector('dialog')"); await idle();
      assert.ok((await js("document.querySelector('main').innerText")).includes('Saved prompt'));
    });
    await probe('external tools report detected executables without fabricated installs', async () => {
      await nav('External tools'); await waitFor("document.querySelector('main').innerText.includes('markitdown')");
      assert.ok(!(await js("document.querySelector('main').innerText")).includes('invoice'));
    });
    await probe('history exposes real backups and all buttons have accessible text', async () => {
      await nav('History & recovery'); await waitFor("document.querySelector('main').innerText.includes('Inspect previous version')");
      assert.equal(await js("[...document.querySelectorAll('button')].filter(b=>!b.textContent.trim()&&!b.getAttribute('aria-label')).length"), 0);
    });
    await probe('missing interface files produce a recovery dialog and reload successfully after repair', async () => {
      fs.writeFileSync(join(fixtureApp, 'dist/index.html'), '<html><body>Missing application entry point</body></html>');
      win.reload();
      const deadline = Date.now() + 15000;
      while (!displayRecovery.length && Date.now() < deadline) await sleep(50);
      assert.equal(displayRecovery[0]?.message, 'AIOS could not display its interface');
      await waitFor("document.querySelector('.wb-status')?.textContent.includes('Inventory refreshed')");
    });
    await probe('no unexpected renderer errors occurred during desktop acceptance', async () => { assert.deepEqual(errors, []); });
    await nav('Overview'); await idle();
    await waitFor("!document.querySelector('dialog')");
    win.removeAllListeners('show'); win.showInactive(); await sleep(300);
    fs.mkdirSync(join(repo, 'test-results'), { recursive: true });
    fs.writeFileSync(join(repo, 'test-results/desktop.png'), (await win.webContents.capturePage()).toPNG());
  } catch (error) {
    console.error(error.stack);
    const detail = win && !win.isDestroyed() ? await js("({body:document.body.innerText,url:location.href,hasBridge:!!window.aios,ready:document.readyState})").catch(() => null) : null;
    console.error('Failure state:', JSON.stringify(detail));
    results.push({ name: 'Failure context', passed: false, error: error.stack, detail });
  }
  finally {
    clipboard.writeText = nativeCopy;
    dialog.showMessageBox = nativeMessageBox;
    fs.mkdirSync(join(repo, 'test-results'), { recursive: true });
    fs.writeFileSync(join(repo, 'test-results/desktop.json'), JSON.stringify({ results, rendererErrors: errors }, null, 2));
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    fs.rmSync(base, { recursive: true, force: true });
    app.exit(results.some(r => !r.passed) ? 1 : 0);
  }
}
void run();
