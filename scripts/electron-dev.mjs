import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const url = 'http://127.0.0.1:5173';
let desktop, stopping = false, viteFailure;
const vite = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], { stdio: 'inherit', env: { ...process.env, ELECTRON_DEV: '1' } });
function stop(code = 0) {
  if (stopping) return; stopping = true;
  desktop?.kill('SIGTERM'); vite.kill('SIGTERM'); process.exitCode = code;
}
vite.on('error', error => { viteFailure = error; console.error(error.message); stop(1); });
vite.on('exit', code => { if (!stopping) { viteFailure = Error(`Vite exited (${code})`); stop(code || 1); } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(0));
try {
  const deadline = Date.now() + 30000;
  let ready = false;
  while (!ready && !stopping) {
    if (viteFailure) throw viteFailure;
    if (Date.now() > deadline) throw Error('Timed out waiting for the development server.');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(1000) }); ready = response.ok && (await response.text()).includes('/src/main.jsx'); } catch {}
    if (!ready) await new Promise(r => setTimeout(r, 150));
  }
  if (!stopping) {
    desktop = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, AIOS_DEV_SERVER_URL: url } });
    desktop.on('error', error => { console.error(error.message); stop(1); });
    desktop.on('exit', code => stop(code || 0));
  }
} catch (error) { console.error(error.message); stop(1); }
