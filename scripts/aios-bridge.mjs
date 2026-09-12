// Filesystem access is private Electron IPC. Browser servers have no filesystem API.
export { createService } from './lib/service.mjs';
export function handleAiosApiRequest(req, res, next) {
  if (!(req.url || '').startsWith('/api/')) return next?.();
  const body = JSON.stringify({ ok: false, code: 'DESKTOP_REQUIRED', error: 'Open AIOS with npm run dev or the installed desktop app.' });
  res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) }); res.end(body);
}
export function aiosBridge() {
  const configure = server => { server.middlewares.use(handleAiosApiRequest); };
  return { name: 'aios-desktop-boundary', configureServer: configure, configurePreviewServer: configure };
}
