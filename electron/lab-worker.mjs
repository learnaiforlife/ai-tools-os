import { parentPort, workerData } from 'node:worker_threads';
import { createLab } from '../scripts/lib/lab.mjs';

const lab = createLab({
  ...(workerData.fixtureHome ? { home: workerData.fixtureHome, env: {}, managedRoots: [] } : {}),
  notify: progress => parentPort.postMessage({ progress }),
});
parentPort.on('message', async ({ id, operation, args }) => {
  if (operation === '_shutdown') { await lab.shutdown(); parentPort.postMessage({ id, result: { ok: true } }); return; }
  parentPort.postMessage({ id, result: await lab.request(operation, args) });
});
