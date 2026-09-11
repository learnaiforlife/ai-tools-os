import { app, BrowserWindow, dialog } from 'electron';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { seedLabUat, runLabUat } from './lab-uat.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..'), base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-lab-desktop-'))), home = join(base, 'User ü'), fixture = join(base, 'App ü');
const nodePath = process.env.npm_node_execpath;
if (!nodePath) throw Error('Run this through npm run test:labs:desktop so the fixture can find Node.');
seedLabUat(home, nodePath);
const put = (file, value) => { fs.mkdirSync(dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
put(join(fixture, 'electron/main.mjs'), fs.readFileSync(join(repo, 'electron/main.mjs'), 'utf8').replace('workerData: { cancelBuffer }', `workerData: { cancelBuffer, fixtureHome: ${JSON.stringify(home)} }`));
for (const name of fs.readdirSync(join(repo, 'electron')).filter(n => n !== 'main.mjs')) put(join(fixture, 'electron', name), fs.readFileSync(join(repo, 'electron', name)));
fs.mkdirSync(join(fixture, 'scripts')); fs.symlinkSync(join(repo, 'scripts/lib'), join(fixture, 'scripts/lib')); fs.symlinkSync(join(repo, 'node_modules'), join(fixture, 'node_modules')); fs.cpSync(join(repo, 'dist'), join(fixture, 'dist'), { recursive: true });
app.setPath('userData', join(base, 'data')); app.setPath('sessionData', join(base, 'session')); app.setPath('logs', join(base, 'logs')); app.commandLine.appendSwitch('disable-gpu');
let win; const errors = [], results = [];
app.on('browser-window-created', (_, window) => { win = window; window.on('show', () => window.hide()); window.webContents.on('console-message', (event, level, message) => { if ((event.level ?? level) === 'error' || level >= 3) errors.push(event.message || message); }); });
const js = code => win.webContents.executeJavaScript(code), pause = () => new Promise(r => setTimeout(r, 50));
const capture = async () => { win.removeAllListeners('show'); win.showInactive(); await new Promise(r => setTimeout(r, 250)); return (await win.webContents.capturePage()).toPNG(); };
const probe = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); console.log('PASS', name); } catch (error) { results.push({ name, passed: false, error: error.stack }); throw error; } };
const out = join(repo, 'test-results'); fs.mkdirSync(out, { recursive: true });
let originalOpen, originalSave;
async function main() {
try {
  await import(pathToFileURL(join(fixture, 'electron/main.mjs')));
  for (let i = 0; i < 400; i++) { if (win && await js("document.querySelector('.wb-status')?.textContent.includes('Inventory refreshed')").catch(() => false)) break; await pause(); }
  const inventory = await js("window.aios.request('inventory')"); assert.equal(inventory.providerPaths.claude, join(home, '.claude'));
  await runLabUat({ evaluate: js, home, output: out, screenshot: capture, probe });
  await probe('Native picker, real conversion, copy-free Save As and canceled picker', async () => {
    const root = fs.readFileSync('/tmp/aios-verified-converter-root', 'utf8');
    fs.mkdirSync(join(home, '.aios/lab/runtime'), { recursive: true }); fs.symlinkSync(join(root, 'runtime/markitdown-0.1.7'), join(home, '.aios/lab/runtime/markitdown-0.1.7'));
    const file = join(home, 'Document ü.csv'), exported = join(home, 'Saved Markdown.md'); fs.writeFileSync(file, 'Name,Value\nDesktop UAT,42\n');
    originalOpen = dialog.showOpenDialog; originalSave = dialog.showSaveDialog;
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); dialog.showSaveDialog = async () => ({ canceled: false, filePath: exported });
    await js("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Select files').click()");
    for (let i = 0; i < 100; i++) { if (await js("document.querySelector('main').innerText.includes('Document ü.csv')")) break; await pause(); }
    await js("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Convert to Markdown').click()");
    for (let i = 0; i < 1000; i++) { if (await js("!!document.querySelector('[aria-label=\"Markdown preview Document ü.csv\"]')")) break; await pause(); }
    assert.ok(await js("document.querySelector('[aria-label=\"Markdown preview Document ü.csv\"]')?.textContent.includes('Desktop UAT')"));
    await js("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Save Markdown').click()");
    for (let i = 0; i < 100 && !fs.existsSync(exported); i++) await pause(); assert.ok(fs.readFileSync(exported, 'utf8').includes('Desktop UAT'));
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }); const cancel = await js('window.aios.pickFiles()'); assert.equal(cancel.canceled, true);
    const invalid = await js("window.aios.lab('files.register',{paths:['/etc/passwd']})"); assert.equal(invalid.ok, false);
    fs.writeFileSync(join(out, 'markdown-converter.png'), await capture());
  });
  await probe('New pages remain usable at a narrow size in light mode', async () => {
    win.setSize(800, 700); await js("document.documentElement.setAttribute('data-theme','light')"); await pause();
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true); fs.writeFileSync(join(out, 'labs-light-small.png'), await capture());
  });
  await probe('New feature UAT has no renderer errors', async () => assert.deepEqual(errors, []));
} catch (error) { results.push({ name: 'UAT error', passed: false, error: error.stack }); console.error(error.stack); if (win) console.error(await js('document.body.innerText').catch(() => 'No renderer')); }
finally {
  if (originalOpen) dialog.showOpenDialog = originalOpen; if (originalSave) dialog.showSaveDialog = originalSave;
  fs.writeFileSync(join(out, 'lab-desktop.json'), JSON.stringify({ results, rendererErrors: errors, cli: 'deterministic double', conversion: 'actual MarkItDown' }, null, 2));
  for (const window of BrowserWindow.getAllWindows()) window.destroy(); app.exit(results.length < 10 || results.some(r => !r.passed) ? 1 : 0);
}
}
void main();
