// Opt-in paid native CLI smoke test. Synthetic instructions only; no native sources are edited.
import * as fs from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createService } from '../scripts/lib/service.mjs';
import { createEvaluator } from '../scripts/lib/evaluator.mjs';
import { createLab } from '../scripts/lib/lab.mjs';
const provider = process.argv[2];
if (!['claude', 'codex', 'cursor'].includes(provider)) throw Error('Pass the native engine to test.');
const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-quick-live-'))), path = join(home, '.claude/skills/uppercase/SKILL.md');
fs.mkdirSync(join(home, '.claude/skills/uppercase'), { recursive: true });
const original = '---\nname: uppercase\ndescription: Convert a supplied word to uppercase\n---\nWhen given one ASCII word, return the word in uppercase with no other text. For any other input, return exactly INVALID.\n';fs.writeFileSync(path, original);
const service = createService({ home, env: {}, managedRoots: [] }), evaluator = createEvaluator({ home: homedir(), env: process.env });
const lab = createLab({ home, env: {}, managedRoots: [], service, evaluator });
let report;
try {
  const source = service.request('inventory').resources.find(r => r.kind === 'skills');
  const start = await lab.request('evaluate.quick', { id: source.id, settings: { provider, timeout: 120, maxCalls: 35, budget: 2, model: '' } });
  if (!start.ok) throw Error(start.error);
  let job;
  do { await new Promise(r => setTimeout(r, 1000)); job = (await lab.request('get', { id: start.job.id })).job; } while (!['completed', 'failed', 'canceled'].includes(job.status));
  report = { provider, status: job.status, error: job.error || null, complete: job.result?.complete ?? false, score: job.result?.score ?? null, suite: job.suite, summary: job.result?.summary, samples: job.result?.samples, rationale: job.result?.rationale, cost: job.result?.cost ?? null, originalUnchanged: fs.readFileSync(path, 'utf8') === original, testedAt: new Date().toISOString() };
  console.log(JSON.stringify({ provider, status: report.status, score: report.score, complete: report.complete, originalUnchanged: report.originalUnchanged, error: report.error }));
} finally { await lab.shutdown(); fs.rmSync(home, { recursive: true, force: true }); if (report) fs.writeFileSync(`docs/experience-2026-09-12/live-${provider}.json`, JSON.stringify(report, null, 2)); }
