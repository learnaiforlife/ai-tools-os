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
  const child = spawn(exe, [`--user-data-dir=${userData}`, '--remote-debugging-port=0', '--disable-gpu'], {
    env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), CODEX_HOME: join(home, '.codex') },
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', socket, ended = false, startupError, serial = 0;
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
    });
    const evaluate = async expression => {
      const id = ++serial;
      const answer = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      try {
        socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
        const response = await deadline(answer, 20000, 'Packaged evaluation timed out.');
        if (response.error || response.result.exceptionDetails) throw Error(JSON.stringify(response.error || response.result.exceptionDetails));
        return response.result.result.value;
      } finally { pending.delete(id); }
    };
    let inventory;
    for (let n = 0; n < 100; n++) {
      inventory = await evaluate("window.aios?.request('inventory',{})");
      if (inventory?.ok || inventory && inventory.code !== 'BUSY') break;
      await pause(100);
    }
    if (!inventory?.ok) throw Error('Packaged inventory failed: ' + JSON.stringify(inventory));
    if (inventory.providerPaths.claude !== join(home, '.claude') || inventory.providerPaths.codex !== join(home, '.codex')) throw Error('Packaged fixture isolation failed; mutations are forbidden.');
    return { inventory, evaluate, close, request: (op, args = {}) => evaluate(`window.aios.request(${JSON.stringify(op)},${JSON.stringify(args)})`) };
  } catch (error) { await close(); throw error; }
}
