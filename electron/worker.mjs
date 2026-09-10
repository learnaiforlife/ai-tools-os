import { parentPort, workerData } from 'node:worker_threads';
import { createService } from '../scripts/lib/service.mjs';
const canceled = new Int32Array(workerData.cancelBuffer);
const service = createService({
  ...(workerData.fixtureHome ? { home: workerData.fixtureHome, env: {}, managedRoots: [] } : {}),
  canceled: () => Atomics.load(canceled, 0) === 1,
  progress: progress => parentPort.postMessage({ progress }),
});
parentPort.on('message', ({ id, operation, args }) => parentPort.postMessage({ id, result: service.request(operation, args) }));
