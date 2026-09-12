import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { fail } from './storage.mjs';

export function executable(name, home, env = process.env) {
  const paths = [...new Set([...(env.PATH || '').split(':').filter(isAbsolute), join(home, '.local/bin'), join(home, '.npm-global/bin'), join(home, '.cargo/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])];
  return paths.map(p => join(p, name)).find(p => { try { return fs.statSync(p).isFile() && !!(fs.statSync(p).mode & 0o111); } catch { return false; } }) || null;
}

// Arguments are always an array; no shell, interpolation, or inherited stdin.
// A process group lets cancellation also stop grandchildren started by uv/CLI.
export function runProcess(command, args, { cwd, env = process.env, signal, timeout = 180000, maxBytes = 2 * 1024 * 1024, input = '', onOutput, allowFailure = false } = {}) {
  if (signal?.aborted) return Promise.reject(Object.assign(Error('Job canceled.'), { code: 'CANCELED' }));
  return new Promise((resolve, reject) => {
    let child, stdout = '', stderr = '', size = 0, failure, timer;
    const stop = (code, message) => {
      failure ||= Object.assign(Error(message), { code });
      if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const abort = () => stop('CANCELED', 'Job canceled.');
    try { child = spawn(command, args, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch (e) { reject(e); return; }
    const collect = (data, isError) => {
      size += Buffer.byteLength(data);
      if (size > maxBytes) { stop('OUTPUT_LIMIT', 'Tool output exceeded the job limit. Reduce the input or test size.'); return; }
      if (isError) stderr += data.toString(); else stdout += data.toString();
      onOutput?.(data.toString(), isError);
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => collect(data, false)); child.stderr.on('data', data => collect(data, true));
    child.stdin.on('error', () => {});
    child.on('error', e => { failure ||= Object.assign(Error(`Could not start ${command.split('/').at(-1)}: ${e.code || 'unknown error'}`), { code: 'TOOL_MISSING' }); });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0 && !allowFailure) reject(Object.assign(Error(`Tool exited ${code ?? exitSignal}. ${stderr.trim().slice(-1500) || stdout.trim().slice(-800) || 'Check its installation and authentication.'}`), { code: 'TOOL_FAILED' }));
      else resolve({ stdout, stderr, exitCode: code });
    });
    timer = setTimeout(() => stop('TIMEOUT', 'The tool exceeded the selected timeout. Partial results were retained.'), timeout);
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    child.stdin.end(input);
  });
}

export function boundedString(value, name, max = 100000) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > max || value.includes('\0')) fail('INVALID', `${name} must be text of at most ${max.toLocaleString()} bytes.`);
  return value;
}
