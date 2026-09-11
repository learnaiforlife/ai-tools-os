import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

export async function assetResponse(request, directory) {
  const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' };
  const failure = (message, status) => new Response(message, { status, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'aios:' || url.hostname !== 'app' || url.port || url.username || url.password || request.method !== 'GET') return failure('Forbidden', 403);
    const root = await realpath(directory), path = resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!path.startsWith(root + sep)) return failure('Forbidden', 403);
    const canonical = await realpath(path);
    if (!canonical.startsWith(root + sep) || !(await stat(canonical)).isFile()) return failure('Not found', 404);
    // Electron's fs implementation reads ASAR entries directly. Do not fetch a
    // file: URL through webRequest: encoded application paths were being blocked
    // by the network policy, so /Applications/AI Tools OS.app loaded a 400 page.
    return new Response(await readFile(canonical), { headers: { ...headers, 'Content-Type': TYPES[extname(canonical)] || 'application/octet-stream' } });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return failure('Not found', 404);
    return failure('Unable to load the local application file', 400);
  }
}
