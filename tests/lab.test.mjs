import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { runProcess } from '../scripts/lib/processes.mjs';
import { createEvaluator, gradeDeterministic, summarize, validateSuite } from '../scripts/lib/evaluator.mjs';
import { reviewMemory, memorySections, applyReviewEdits, relocateMemoryText } from '../scripts/lib/memory-review.mjs';
import { createLab } from '../scripts/lib/lab.mjs';
import { createService } from '../scripts/lib/service.mjs';
import { createConverter } from '../scripts/lib/converter.mjs';
import { hash } from '../scripts/lib/storage.mjs';

function fixture(t) {
  const home = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'aios-lab-test-')));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const put = (name, text) => { const path = join(home, name); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); return path; };
  const skill = put('.claude/skills/example/SKILL.md', '---\nname: example\ndescription: Test skill\n---\nSay ORIGINAL.\n');
  const memory = put('.claude/CLAUDE.md', '# Preferences\nKeep responses brief.\n\n# Project commands\nRun npm test before changes.\n');
  const project = join(home, 'Documents/Test project ü'); put('Documents/Test project ü/CLAUDE.md', '# Project\nExisting instruction.\n');
  put('.local/bin/claude', '#!/bin/sh\nexit 1\n'); fs.chmodSync(join(home, '.local/bin/claude'), 0o700);
  const service = createService({ home, env: {}, managedRoots: [] });
  const inventory = service.request('inventory');
  const resource = inventory.resources.find(r => r.path === skill), mem = inventory.resources.find(r => r.path === memory);
  return { home, put, skill, memory, project, service, resource, mem };
}
const settings = { model: 'test-model', repeats: 1, timeout: 30, budget: 1, files: false, blind: false };
const suite = { evals: [{ id: 1, prompt: 'Answer the task', assertions: [{ type: 'contains', text: 'Uses improved result', value: 'CANDIDATE' }] }] };
const done = async (lab, id) => { for (let n = 0; n < 1000; n++) { const { job } = await lab.request('get', { id }); if (['completed', 'failed', 'canceled'].includes(job.status)) return job; await new Promise(r => setTimeout(r, 5)); } throw Error('Job never completed'); };
const fakeRun = handler => async (_command, args, options) => {
  if (args[0] === '--help') return { stdout: '--safe-mode --restricted --json-schema --max-budget-usd --setting-sources', stderr: '' };
  if (args[0] === '--version') return { stdout: 'Test Claude', stderr: '' };
  return handler(args, options);
};
const response = (result, extra = {}) => ({ stdout: JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 2 }, ...extra }), stderr: '', exitCode: 0 });

test('bounded process runner preserves literal shell characters and Unicode', async () => {
  const input = '`echo should-not-execute` $(echo nope) é 漢字';
  const r = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', input]); assert.equal(r.stdout, input);
});
test('process cancellation and timeout stop execution with explicit states', async () => {
  const controller = new AbortController(); const p = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal }); controller.abort();
  await assert.rejects(p, { code: 'CANCELED' });
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 25 }), { code: 'TIMEOUT' });
});
test('process output limits fail rather than silently truncating evidence', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { maxBytes: 100 }), { code: 'OUTPUT_LIMIT' });
});
test('suite validation rejects duplicates, malformed assertions and imported file paths', () => {
  assert.equal(validateSuite(suite).length, 1);
  for (const value of ['{', { evals: [] }, { evals: [...suite.evals, ...suite.evals] }, { evals: [{ ...suite.evals[0], files: ['/private/file'] }] }, { evals: [{ prompt: 'x', assertions: [{ type: 'execute' }] }] }]) assert.throws(() => validateSuite(value));
  assert.throws(() => validateSuite([{ query: 'test' }], 'trigger'));
});
test('deterministic grading handles exact, contains, exclusion and JSON checks', () => {
  assert.equal(gradeDeterministic('  answer\n', { type: 'equals', value: 'answer' }).passed, true);
  assert.equal(gradeDeterministic('answer', { type: 'contains', value: 'missing' }).passed, false);
  assert.equal(gradeDeterministic('answer', { type: 'not_contains', value: 'bad' }).passed, true);
  assert.equal(gradeDeterministic('{"n":1}', { type: 'json' }).passed, true);
  assert.equal(gradeDeterministic('bad', { type: 'json' }).passed, false);
});
test('failed and unpaired samples never create an improvement delta', () => {
  const base = { status: 'completed', testId: '1', repeat: 0, pass_rate: 0, durationMs: 1000, tokens: 20 };
  let r = summarize([{ ...base, variant: 'baseline' }, { ...base, variant: 'candidate', pass_rate: 1 }]); assert.equal(r.delta, 1);
  r = summarize([{ ...base, variant: 'baseline' }, { ...base, variant: 'candidate', testId: '2', pass_rate: 1 }]); assert.equal(r.delta, null);
  r = summarize([{ ...base, variant: 'baseline' }, { variant: 'candidate', status: 'error' }]); assert.equal(r.candidate.pass_rate.mean, null); assert.equal(r.delta, null);
});
test('local memory checks preserve CRLF, identify locations and exclude fenced examples', t => {
  const { memory } = fixture(t), paragraph = 'Always run the established project checks before committing.';
  const content = `# Rules\r\n${paragraph}\r\n\r\n${paragraph}\r\n\r\n\`\`\`md\r\n${paragraph}\r\n\`\`\`\r\n`;
  const review = reviewMemory([{ id: 'm', path: memory, content, scope: 'user' }]);
  const matches = review.findings.filter(f => f.code === 'DUPLICATE'); assert.equal(matches.length, 1); assert.equal(matches[0].line, 4);
  const edited = applyReviewEdits(content, matches.map(f => f.edit)); assert.ok(edited.includes(`\`\`\`md\r\n${paragraph}`)); assert.equal((edited.match(/\r\n/g) || []).length, 7);
  assert.throws(() => applyReviewEdits(content, [{ start: 3, end: 20, replacement: '' }, { start: 5, end: 9, replacement: '' }]));
});
test('memory review deduplicates physical files and flags unresolved references and project scope', t => {
  const f = fixture(t), content = '# Build\nRun npm test.\nSee [missing](missing.md) and /Users/example/Documents/project.\n';
  const source = { id: 'm', path: f.memory, content, scope: 'user' };
  const r = reviewMemory([source, { ...source, id: 'alias' }], { project: f.project, maxLines: 20 });
  assert.equal(r.documents.length, 1); for (const code of ['PROJECT_SCOPE', 'MISSING_REFERENCE', 'MACHINE_PATH']) assert.ok(r.findings.some(f => f.code === code));
});
test('memory section relocation previews both files, rejects stale target, then commits with backup', t => {
  const f = fixture(t), original = fs.readFileSync(f.memory, 'utf8'), section = memorySections(original)[1];
  const args = { id: f.mem.id, revision: f.mem.revision, start: section.start, end: section.end, project: f.project };
  const preview = f.service.request('memory.move.preview', args); assert.equal(preview.ok, true, preview.error); assert.equal(preview.writes.length, 2);
  fs.appendFileSync(join(f.project, 'CLAUDE.md'), 'External edit\n');
  assert.equal(f.service.request('memory.move.apply', { ...args, previewRevision: preview.previewRevision }).code, 'CONFLICT'); assert.equal(fs.readFileSync(f.memory, 'utf8'), original);
  const fresh = f.service.request('memory.move.preview', args); assert.equal(f.service.request('memory.move.apply', { ...args, previewRevision: fresh.previewRevision }).ok, true);
  assert.ok(!fs.readFileSync(f.memory, 'utf8').includes('npm test')); assert.ok(fs.readFileSync(join(f.project, 'CLAUDE.md'), 'utf8').includes('npm test'));
  assert.ok(f.service.request('history').history.some(h => h.label === 'Move memory section to project'));
});
test('evaluation runs paired snapshots with restricted tools and real assertion results', async t => {
  const f = fixture(t), calls = [];
  const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun((args, opts) => { calls.push({ args, opts }); return response(args[args.indexOf('--system-prompt') + 1].includes('Say CANDIDATE') ? 'CANDIDATE' : 'ORIGINAL'); }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); t.after(() => lab.shutdown());
  const started = await lab.request('evaluate', { id: f.resource.id, candidate: fs.readFileSync(f.skill, 'utf8').replace('Say ORIGINAL', 'Say CANDIDATE'), suite, settings });
  assert.equal(started.ok, true, started.error); const j = await done(lab, started.job.id);
  assert.equal(j.status, 'completed', j.error); assert.equal(j.result.summary.baseline.pass_rate.mean, 0); assert.equal(j.result.summary.candidate.pass_rate.mean, 1); assert.equal(j.result.cost, 0.02);
  assert.equal(fs.readFileSync(f.skill, 'utf8').includes('Say ORIGINAL'), true);
  for (const c of calls) { assert.ok(c.args.includes('--safe-mode')); assert.ok(c.args.includes('--restricted')); assert.ok(c.args.includes('--strict-mcp-config')); assert.equal(c.opts.env.CLAUDECODE, undefined); assert.ok(c.opts.cwd.startsWith(join(f.home, '.aios/lab/'))); }
  assert.notEqual(calls[0].opts.cwd, calls[1].opts.cwd);
  const reopened = createLab({ home: f.home, env: {}, service: f.service }); assert.equal((await reopened.request('get', { id: j.id })).job.result.summary.delta, 1);
});
test('engine authentication failures stop the run without recording a zero score', async t => {
  const f = fixture(t), evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(() => response('OAuth session expired', { is_error: true })) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('evaluate', { id: f.resource.id, candidate: '', suite, settings }); const j = await done(lab, r.job.id);
  assert.equal(j.status, 'failed'); assert.equal(j.code, 'AUTH_REQUIRED'); assert.equal(j.result.summary.delta, null); assert.ok(j.error.includes('claude auth login'));
});
test('invalid grading responses produce errors, not fabricated passes', async t => {
  const f = fixture(t), evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(args => args.includes('--json-schema') ? response('', { structured_output: { expectations: [] } }) : response('answer')) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('evaluate', { id: f.resource.id, suite: { evals: [{ prompt: 'answer', assertions: ['A complete answer'] }] }, settings }); const j = await done(lab, r.job.id);
  assert.equal(j.result.complete, false); assert.equal(j.result.summary.baseline.pass_rate.mean, null); assert.ok(j.result.samples.every(s => s.code === 'JUDGE_RESPONSE'));
});
test('improvement requires training and holdout cases and does not overwrite installed instructions', async t => {
  const f = fixture(t), lab = createLab({ home: f.home, env: {}, service: f.service });
  const r = await lab.request('improve', { id: f.resource.id, suite, settings }); assert.equal(r.ok, false); assert.ok(r.error.includes('holdout'));
  assert.equal(fs.readFileSync(f.skill, 'utf8').includes('ORIGINAL'), true);
});
test('conversion snapshots selected input and retains errors for unsupported files', async t => {
  const f = fixture(t), converter = { status: () => ({ installed: true }), convert: async path => ({ content: fs.readFileSync(path, 'utf8'), warnings: [] }) };
  const lab = createLab({ home: f.home, env: {}, service: f.service, converter });
  const path = f.put('input ü/converted.md', 'Document content'), selection = await lab.request('files.register', { paths: [path] });
  const r = await lab.request('convert', { tokens: selection.files.map(f => f.token) }); const j = await done(lab, r.job.id);
  assert.equal(j.status, 'completed'); assert.equal(j.result.documents[0].content, 'Document content');
  assert.equal((await lab.request('export.content', { id: j.id, format: 'markdown', index: 0 })).content, 'Document content');
  assert.equal(fs.readFileSync(path, 'utf8'), 'Document content'); assert.equal((await lab.request('convert', { tokens: ['unregistered'] })).ok, false);
});
test('job cancellation leaves history, allows retry and blocks concurrent starts', async t => {
  const f = fixture(t), converter = { status: () => ({}), ensure: signal => new Promise((resolve, reject) => { if (signal.aborted) reject(Error('aborted')); else signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }); }) };
  const lab = createLab({ home: f.home, env: {}, service: f.service, converter });
  const r = await lab.request('install'); assert.equal((await lab.request('install')).code, 'BUSY'); await lab.request('cancel', { id: r.job.id });
  assert.equal((await done(lab, r.job.id)).status, 'canceled'); assert.equal((await lab.request('list')).jobs.length, 1);
  assert.equal((await lab.request('delete', { id: r.job.id })).ok, true); assert.equal((await lab.request('list')).jobs.length, 0);
});
test('interrupted jobs are recovered as interrupted, not restarted automatically', async t => {
  const f = fixture(t), id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  f.put(`.aios/lab/${id}/job.json`, JSON.stringify({ id, kind: 'evaluate', status: 'running', createdAt: new Date().toISOString(), result: { partial: true } }));
  const lab = createLab({ home: f.home, env: {}, service: f.service }); const { job } = await lab.request('get', { id }); assert.equal(job.status, 'interrupted'); assert.equal(job.result.partial, true);
});
test('installer rejects unverified downloads before executing extracted code', async t => {
  const f = fixture(t), calls = [];
  const c = createConverter({ root: join(f.home, 'runtime'), home: f.home, env: {}, findExecutable: () => null, fetcher: async () => new Response('tampered installer'), run: (...args) => calls.push(args) });
  await assert.rejects(c.ensure(new AbortController().signal, () => {}), { code: 'DOWNLOAD_FAILED' }); assert.equal(calls.length, 0);
});
test('converter rejects unsupported types before dependency installation', async t => {
  const f = fixture(t), c = createConverter({ root: f.home, home: f.home, findExecutable: () => { throw Error('must not install'); } });
  await assert.rejects(c.convert('/test/video.mp4', f.home, new AbortController().signal, () => {}), { code: 'UNSUPPORTED_FORMAT' });
});
test('source revision binds proposed edits even when an external writer changes the file', t => {
  const f = fixture(t), before = fs.readFileSync(f.memory, 'utf8'); fs.appendFileSync(f.memory, 'External change');
  const r = f.service.request('resource.write', { id: f.mem.id, parked: false, revision: hash(before), content: 'candidate' }); assert.equal(r.code, 'CONFLICT'); assert.ok(fs.readFileSync(f.memory, 'utf8').includes('External change'));
});

test('native trigger tests verify registration and observe actual tool events', async t => {
  const f = fixture(t), evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun((args, opts) => {
    assert.ok(args.includes('--plugin-dir')); assert.ok(fs.existsSync(join(opts.cwd, 'trigger-plugin/skills/aios-evaluated-skill/SKILL.md')));
    const events = [{ type: 'system', subtype: 'init', skills: ['aios-evaluation:aios-evaluated-skill'], plugins: [{ name: 'aios-evaluation' }], mcp_servers: [] }];
    if (opts.input.includes('activate')) events.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'aios-evaluation:aios-evaluated-skill' } }] } });
    events.push(JSON.parse(response('done').stdout)); return { stdout: events.map(e => JSON.stringify(e)).join('\n'), stderr: '', exitCode: 0 };
  }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('trigger', { id: f.resource.id, suite: [{ query: 'activate', should_trigger: true }, { query: 'unrelated task', should_trigger: false }], settings });
  const j = await done(lab, r.job.id); assert.equal(j.result.summary.baseline.pass_rate.mean, 1); assert.equal(j.result.summary.candidate.pass_rate.mean, 1);
});
test('missing trigger registration is an error rather than a false negative', async t => {
  const f = fixture(t), evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(() => ({ stdout: JSON.stringify({ type: 'system', subtype: 'init', skills: [], mcp_servers: [] }) + '\n' + response('done').stdout, stderr: '' })) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('trigger', { id: f.resource.id, suite: [{ query: 'test', should_trigger: false }], settings }); const j = await done(lab, r.job.id);
  assert.equal(j.status, 'failed'); assert.equal(j.result.complete, false); assert.equal(j.result.summary.candidate.pass_rate.mean, null); assert.ok(j.result.samples.every(s => s.code === 'TRIGGER_SETUP')); assert.equal(j.result.samples.length, 1); assert.equal(j.result.cost, 0.01);
});
test('output-file assertions inspect saved bytes, and export detects later tampering', async t => {
  const f = fixture(t), evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun((_args, opts) => { fs.writeFileSync(join(opts.cwd, 'answer.txt'), 'Actual answer bytes'); return response('I created a file.'); }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('evaluate', { id: f.resource.id, suite: { evals: [{ prompt: 'Create answer.txt', assertions: [{ type: 'contains', text: 'Correct file', file: 'answer.txt', value: 'Actual answer' }, { type: 'file_exists', file: 'answer.txt' }] }] }, settings: { ...settings, files: true } });
  const j = await done(lab, r.job.id); assert.equal(j.result.summary.baseline.pass_rate.mean, 1);
  const exported = await lab.request('export.content', { id: j.id, format: 'artifact', sample: 0, index: 0 }); assert.equal(Buffer.from(exported.content, 'base64').toString(), 'Actual answer bytes');
  fs.appendFileSync(join(f.home, '.aios/lab', j.id, j.result.samples[0].artifacts[0].storedPath), 'changed'); assert.equal((await lab.request('export.content', { id: j.id, format: 'artifact', sample: 0, index: 0 })).code, 'CONFLICT');
});
test('improvement keeps held-out prompts out of drafting and retests the original against its proposal', async t => {
  const f = fixture(t), drafts = [];
  const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun((args, opts) => {
    if (args.includes('--json-schema')) { drafts.push(opts.input); return response('', { structured_output: { content: fs.readFileSync(f.skill, 'utf8').replace('ORIGINAL', 'CANDIDATE'), rationale: 'Improve the answer.' } }); }
    return response(args[args.indexOf('--system-prompt') + 1].includes('Say CANDIDATE') ? 'CANDIDATE' : 'ORIGINAL');
  }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
  const r = await lab.request('improve', { id: f.resource.id, suite: { evals: [suite.evals[0], { ...suite.evals[0], id: 2, prompt: 'SECRET_HELDOUT_PROMPT', holdout: true }] }, settings }); const j = await done(lab, r.job.id);
  assert.equal(j.status, 'completed', j.error); assert.equal(j.result.holdout.candidate.pass_rate.mean, 1); assert.equal(j.result.holdout.baseline.pass_rate.mean, 0); assert.equal(drafts.length, 1); assert.ok(!drafts[0].includes('SECRET_HELDOUT_PROMPT'));
  assert.ok(fs.readFileSync(f.skill, 'utf8').includes('ORIGINAL'));
  const packed = await lab.request('package', { id: j.id }); const pkg = await done(lab, packed.job.id); assert.equal(pkg.status, 'completed', pkg.error);
  const bytes = Buffer.from((await lab.request('export.content', { id: pkg.id, format: 'package' })).content, 'base64'); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
});
test('blind judgments cannot see variant labels or original skill instructions', async t => {
  const f = fixture(t), judged = [];
  const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun((args, opts) => {
    if (args.includes('--json-schema')) { judged.push(JSON.parse(opts.input)); return response('', { structured_output: { winner: 'TIE', reasoning: 'Equivalent answers' } }); }
    return response('answer');
  }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); const r = await lab.request('evaluate', { id: f.resource.id, suite, settings: { ...settings, blind: true } }); const j = await done(lab, r.job.id);
  assert.equal(j.result.comparisons[0].winner, 'tie'); assert.equal(judged.length, 1); assert.ok(!JSON.stringify(judged[0]).includes('Say ORIGINAL')); assert.ok(!Object.keys(judged[0]).includes('baseline'));
});
test('a timeout stops further paid calls because unreported spend is unknown', async t => {
  const f = fixture(t); let calls = 0;
  const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(() => { calls++; throw Object.assign(Error('timeout'), { code: 'TIMEOUT' }); }) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); const r = await lab.request('evaluate', { id: f.resource.id, suite, settings: { ...settings, repeats: 5 } });
  assert.equal((await done(lab, r.job.id)).status, 'failed'); assert.equal(calls, 1);
});
test('blind judge failures stop spending and suppress incomplete improvement claims', async t => {
  for (const code of ['TIMEOUT', 'AUTH_REQUIRED', 'ENGINE_RESPONSE']) {
    const f = fixture(t); let calls = 0;
    const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(args => {
      calls++;
      if (args.includes('--json-schema')) throw Object.assign(Error('Judge unavailable'), { code });
      return response('CANDIDATE');
    }) });
    const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator });
    const r = await lab.request('evaluate', { id: f.resource.id, suite, settings: { ...settings, repeats: 3, blind: true } });
    const j = await done(lab, r.job.id);
    assert.equal(j.status, 'failed'); assert.equal(j.code, code); assert.equal(calls, 3);
    assert.equal(j.result.samples.length, 2); assert.equal(j.result.complete, false); assert.equal(j.result.summary.delta, null);
    assert.equal(j.result.comparisons[0].code, code); assert.equal(j.result.cost, 0.02);
  }
});
test('job storage rejects a symlink before changing destination permissions', t => {
  const f = fixture(t), external = join(f.home, 'external'); fs.mkdirSync(external, { mode: 0o755 }); fs.symlinkSync(external, join(f.home, '.aios/lab'));
  assert.throws(() => createLab({ home: f.home, env: {}, service: f.service })); assert.equal(fs.statSync(external).mode & 0o777, 0o755);
});
test('section relocation rebases relative references and leaves fenced examples untouched', () => {
  const before = '# References\nSee [guide](docs/guide.md#section).\n@rules/test.md\n```md\n[example](docs/example.md)\n```\n';
  const moved = relocateMemoryText(before, '/home/.claude/CLAUDE.md', '/home/project/CLAUDE.md');
  assert.ok(moved.includes('[guide](../.claude/docs/guide.md#section)')); assert.ok(moved.includes('@../.claude/rules/test.md')); assert.ok(moved.includes('[example](docs/example.md)'));
});
test('long code fences cannot be closed by shorter example fences during review', () => {
  const paragraph = 'Repeated example text should not become an actionable instruction.';
  const content = `# File\n\n\`\`\`\`md\n\`\`\`\n${paragraph}\n\n${paragraph}\n\`\`\`\`\n`;
  const r = reviewMemory([{ id: 'm', path: '/test/CLAUDE.md', scope: 'user', content }]); assert.equal(r.findings.filter(f => f.code === 'DUPLICATE').length, 0);
});
test('malformed model answers and rewrite rationales are rejected before rendering', async t => {
  const f = fixture(t), invalidAnswer = createEvaluator({ home: f.home, env: {}, run: fakeRun(() => response({ unexpected: 'object' })) });
  await assert.rejects(invalidAnswer.call({ prompt: 'test', directory: f.home, settings, signal: new AbortController().signal, budget: { limit: 1, spent: 0 } }), { code: 'ENGINE_RESPONSE' });
  const evaluator = createEvaluator({ home: f.home, env: {}, run: fakeRun(() => response('', { structured_output: { content: fs.readFileSync(f.skill, 'utf8'), rationale: { invalid: true } } })) });
  const lab = createLab({ home: f.home, env: {}, service: f.service, evaluator }); const r = await lab.request('proposal', { id: f.resource.id, settings });
  const j = await done(lab, r.job.id); assert.equal(j.status, 'failed'); assert.equal(j.code, 'INVALID');
});
