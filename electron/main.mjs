import { app, BrowserWindow, Menu, dialog, clipboard, ipcMain, protocol, session } from 'electron';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { assetResponse } from './assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..'), DIST = join(ROOT, 'dist');
const DEV_URL = !app.isPackaged ? process.env.AIOS_DEV_SERVER_URL : null;
if (DEV_URL && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(DEV_URL)) throw Error('Development server must use a loopback address.');
const START = DEV_URL || 'aios://app/index.html';
const trusted = url => {
  try { const u = new URL(url); return DEV_URL ? u.origin === new URL(DEV_URL).origin : u.protocol === 'aios:' && u.hostname === 'app'; }
  catch { return false; }
};
protocol.registerSchemesAsPrivileged([{ scheme: 'aios', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let worker, workerFailure, serial = 0, busy = false, currentOperation, quitting = false;
const pending = new Map(), cancelBuffer = new SharedArrayBuffer(4), cancellation = new Int32Array(cancelBuffer);
export function validateSender(event) {
  if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame || !trusted(event.senderFrame.url) || event.sender.isDestroyed()) throw Error('Untrusted renderer request.');
}
function backend(operation, args) {
  try {
    if (typeof operation !== 'string' || operation.length > 80 || !args || typeof args !== 'object' || Array.isArray(args) || Buffer.byteLength(JSON.stringify(args)) > 2 * 1024 * 1024 + 65536) throw Error();
  } catch { return Promise.resolve({ ok: false, code: 'INVALID', error: 'Invalid or oversized request.' }); }
  if (workerFailure) return Promise.resolve({ ok: false, code: 'BACKEND_FAILED', error: workerFailure });
  if (busy) return Promise.resolve({ ok: false, code: 'BUSY', error: 'An operation is already running. Please wait.' });
  busy = true; currentOperation = operation; Atomics.store(cancellation, 0, 0);
  return new Promise(resolveRequest => { const id = ++serial; pending.set(id, resolveRequest); worker.postMessage({ id, operation, args }); });
}
function failWorker(error) {
  workerFailure = `The local engine stopped: ${error.message || error}. Restart AIOS; pending transactions will be checked on startup.`;
  busy = false;
  for (const done of pending.values()) done({ ok: false, code: 'BACKEND_FAILED', error: workerFailure }); pending.clear();
}
async function createWindow() {
  const win = new BrowserWindow({ width: 1440, height: 960, minWidth: 720, minHeight: 520, title: 'AI Tools OS', backgroundColor: '#0c0d11', show: false,
    webPreferences: { preload: join(ROOT, 'electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  let startupTimer, reporting = false;
  const showDisplayFailure = async detail => {
    if (win.isDestroyed() || reporting || quitting) return;
    reporting = true; win.show();
    try {
      const answer = await dialog.showMessageBox(win, { type: 'error', buttons: ['Reload application', 'Close window'], defaultId: 0, cancelId: 1,
        message: 'AIOS could not display its interface', detail: `${detail}\nYour configuration files have not been changed by this display failure.` });
      if (!win.isDestroyed()) { if (answer.response === 0) win.reload(); else win.close(); }
    } finally { reporting = false; }
  };
  win.webContents.on('did-start-loading', () => {
    clearTimeout(startupTimer);
    startupTimer = setTimeout(async () => {
      if (win.isDestroyed()) return;
      const rendered = await win.webContents.executeJavaScript("!!document.querySelector('.wb-app, [data-aios-recovery]')").catch(() => false);
      if (!rendered) void showDisplayFailure('The local application files did not finish loading. Reload, or reinstall the current download if this continues.');
    }, 10000);
  });
  win.on('closed', () => clearTimeout(startupTimer));
  win.webContents.on('render-process-gone', (_event, details) => void showDisplayFailure(`The display process stopped (${details.reason}).`));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (!trusted(url)) event.preventDefault(); });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, message: 'Discard unsaved changes?' });
    if (response === 1) event.preventDefault();
  });
  await win.loadURL(START);
  if (!app.isPackaged && process.env.AIOS_OPEN_DEVTOOLS === '1') win.webContents.openDevTools({ mode: 'detach' });
  return win;
}
function startupError(error) { dialog.showErrorBox('AIOS could not start', String(error.message || error)); app.quit(); }
async function start() {
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => { const win = BrowserWindow.getAllWindows()[0]; if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  await app.whenReady();
  protocol.handle('aios', request => assetResponse(request, DIST));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = trusted(details.url) || details.url.startsWith('devtools://') || (DEV_URL && details.url.startsWith(DEV_URL.replace('http:', 'ws:')));
    callback({ cancel: !allowed });
  });
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { cancelBuffer } });
  worker.on('message', message => {
    if (message.progress) { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('aios:progress', message.progress); return; }
    const done = pending.get(message.id); pending.delete(message.id); busy = false; done?.(message.result);
  });
  worker.on('error', failWorker); worker.on('exit', code => { if (!quitting) failWorker(Error(`Worker exited (${code})`)); });
  ipcMain.handle('aios:request', (event, operation, args) => { validateSender(event); return backend(operation, args); });
  ipcMain.handle('aios:copy', (event, text) => {
    validateSender(event);
    if (typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024) return { ok: false, error: 'Clipboard text exceeds the 2 MiB limit.' };
    try { clipboard.writeText(text); return { ok: true }; } catch { return { ok: false, error: 'Could not write to the system clipboard.' }; }
  });
  ipcMain.handle('aios:cancel-scan', event => {
    validateSender(event);
    if (!busy || currentOperation !== 'inventory') return { ok: false, error: 'Only an inventory scan can be canceled. File transactions must finish.' };
    Atomics.store(cancellation, 0, 1); return { ok: true };
  });
  ipcMain.handle('aios:pick-folder', async event => {
    validateSender(event);
    try { const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Choose a project or scan folder', properties: ['openDirectory'] });
      return { ok: true, canceled: result.canceled, path: result.filePaths[0] || null };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  await createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow().catch(startupError); });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { quitting = true; void worker?.terminate(); });
void start().catch(startupError);
