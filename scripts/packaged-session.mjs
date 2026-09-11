import { spawn } from 'node:child_process';
import { join } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function deadline(promise, ms, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); })]); }
  finally { clearTimeout(timer); }
}

// Test-only CDP session, using an ephemeral loopback port and disposable HOME.
// The caller must verify the returned provider paths before any mutation.
export async function packagedSession({ exe, home, userData, cwd }) {
  const env = { ...process.env, HOME: home };
  for (const key of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'AIOS_DEV_SERVER_URL', 'ELECTRON_RUN_AS_NODE']) delete env[key];
  const child = spawn(exe, [`--user-data-dir=${userData}`, '--remote-debugging-port=0', '--disable-gpu'], {
    env,
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', socket, ended = false, startupError, serial = 0;
  const rendererErrors = [], loadedFrames = new Set();
  const pending = new Map();
  const exited = new Promise(resolveExit => child.once('exit', () => { ended = true; resolveExit(); }));
  child.on('error', error => { startupError = error; });
  child.stdout.on('data', b => { output = (output + b).slice(-65536); });
  child.stderr.on('data', b => { output = (output + b).slice(-65536); });
  const close = async () => {
    socket?.close();
    for (const { reject } of pending.values()) reject(Error('Packaged test session closed.')); pending.clear();
    if (!child.pid || ended) return;
    child.kill('SIGTERM');
    try { await deadline(exited, 5000, 'Packaged app did not stop.'); }
    catch { child.kill('SIGKILL'); await deadline(exited, 5000, 'Packaged app could not be terminated.'); }
  };
  try {
    let url;
    const end = Date.now() + 45000;
    while (Date.now() < end && !url) {
      if (startupError) throw startupError;
      if (ended) throw Error('Packaged process exited before startup: ' + output);
      const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (match) {
        try {
          const pages = await fetch(`http://127.0.0.1:${match[1]}/json/list`, { signal: AbortSignal.timeout(5000) }).then(r => r.json());
          url = pages.find(p => p.type === 'page' && p.url.startsWith('aios://app/'))?.webSocketDebuggerUrl;
        } catch (error) {
          // A cold process (especially under Rosetta) may announce the port
          // before its page listing responds. Poll the same live process until
          // the overall deadline; an observation timeout is not process exit.
          if (ended || startupError || Date.now() >= end) throw error;
        }
      }
      if (!url) await pause(80);
    }
    if (!url) throw Error('Packaged renderer did not start: ' + output);
    socket = new WebSocket(url);
    await deadline(new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); }), 5000, 'Debug connection did not open.');
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)), entry = pending.get(message.id);
      if (entry) { pending.delete(message.id); entry.resolve(message); }
      if (message.method === 'Page.lifecycleEvent' && message.params.name === 'load') loadedFrames.add(`${message.params.frameId}:${message.params.loaderId}`);
      if (message.method === 'Runtime.exceptionThrown') rendererErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') rendererErrors.push(message.params.entry.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') rendererErrors.push(message.params.args.map(a => a.value || a.description).join(' '));
    });
    const command = async (method, params = {}) => {
      const id = ++serial;
      const answer = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      try {
        socket.send(JSON.stringify({ id, method, params }));
        const response = await deadline(answer, 20000, 'Packaged evaluation timed out.');
        if (response.error) throw Error(JSON.stringify(response.error));
        return response.result;
      } finally { pending.delete(id); }
    };
    const evaluate = async expression => {
      const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    // Enabling Runtime during the initial empty document can force Electron to
    // initialize a preload before its navigation startup data exists. Observe
    // the committed document's load event first, without evaluating JavaScript.
    // Enabling lifecycle events also delivers the current loader's past events.
    await command('Page.enable'); await command('Page.setLifecycleEventsEnabled', { enabled: true });
    const loadEnd = Date.now() + 20000;
    let loaded = false;
    while (Date.now() < loadEnd) {
      const { frameTree: { frame } } = await command('Page.getFrameTree');
      if (frame.url.startsWith('aios://app/') && loadedFrames.has(`${frame.id}:${frame.loaderId}`)) { loaded = true; break; }
      await pause(80);
    }
    if (!loaded) throw Error('Packaged document did not finish loading.');
    await command('Runtime.enable'); await command('Log.enable');
    let rendered = false, view;
    for (let n = 0; n < 150; n++) {
      view = await evaluate("({ready:document.readyState,root:!!document.querySelector('#root'),ui:!!document.querySelector('.wb-app main h1'),styled:!!document.querySelector('.wb-app')&&getComputedStyle(document.querySelector('.wb-app')).display==='grid',text:document.body?.innerText.slice(0,300)||''})");
      if (view.ui && view.styled) { rendered = true; break; }
      if (n >= 5 && view.ready === 'complete' && !view.root && view.text) throw Error('Packaged interface failed to load: ' + view.text);
      await pause(100);
    }
    if (!rendered) throw Error('Packaged interface did not render its styled navigation and main view: ' + view?.text);
    let inventory;
    for (let n = 0; n < 100; n++) {
      inventory = await evaluate("window.aios?.request('inventory',{})");
      if (inventory?.ok || inventory && inventory.code !== 'BUSY') break;
      await pause(100);
    }
    if (!inventory?.ok) throw Error('Packaged inventory failed: ' + JSON.stringify(inventory));
    if (inventory.providerPaths.claude !== join(home, '.claude') || inventory.providerPaths.codex !== join(home, '.codex') || inventory.providerPaths.claudeJson !== join(home, '.claude.json')) throw Error('Packaged fixture isolation failed; mutations are forbidden.');
    return { inventory, evaluate, close, rendered, rendererErrors,
      dropFiles: async paths => {
        await evaluate("(()=>{const e=document.createElement('input');e.type='file';e.multiple=true;e.id='uat-local-files';document.body.appendChild(e)})()");
        try {
          const { root } = await command('DOM.getDocument'); const { nodeId } = await command('DOM.querySelector', { nodeId: root.nodeId, selector: '#uat-local-files' });
          await command('DOM.setFileInputFiles', { nodeId, files: paths });
          await evaluate("(()=>{const dt=new DataTransfer();for(const f of document.querySelector('#uat-local-files').files)dt.items.add(f);document.querySelector('.lab-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));})()");
        } finally { await evaluate("document.querySelector('#uat-local-files')?.remove()"); }
      },
      screenshot: async () => Buffer.from((await command('Page.captureScreenshot', { format: 'png' })).data, 'base64'),
      viewport: (width, height) => command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
      request: (op, args = {}) => evaluate(`window.aios.request(${JSON.stringify(op)},${JSON.stringify(args)})`) };
  } catch (error) { await close(); throw error; }
}
