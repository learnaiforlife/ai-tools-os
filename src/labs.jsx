import React, { useState, useEffect, useCallback } from 'react';
import { request, copyText } from './api.js';
import { Button, Notice, Field, Dialog } from './workbench-ui.jsx';
import './labs.css';

export async function lab(operation, args = {}) {
  if (!window.aios?.lab) throw Error('Use the updated desktop app to run evaluations and conversion.');
  const r = await window.aios.lab(operation, args); if (!r.ok) throw Error(r.error); return r;
}
async function native(method, args) { const r = await window.aios[method](args); if (!r.ok) throw Error(r.error); return r; }
const terminal = status => ['completed', 'failed', 'canceled', 'interrupted'].includes(status);
const percent = n => n == null ? 'Not evaluated' : `${(n * 100).toFixed(1)}%`;
const defaultSettings = { model: 'sonnet', repeats: 1, timeout: 120, budget: 1, blind: false, files: false };

export function useLabJobs() {
  const [jobs, setJobs] = useState([]), [error, setError] = useState('');
  const refresh = useCallback(async () => { try { const r = await lab('list'); setJobs(r.jobs); setError(''); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { void refresh(); let timer; const unsub = window.aios?.onLabProgress(() => { clearTimeout(timer); timer = setTimeout(refresh, 100); }); return () => { clearTimeout(timer); unsub?.(); }; }, [refresh]);
  return { jobs, error, refresh };
}

function Settings({ value, change }) {
  const set = (key, v) => change({ ...value, [key]: v });
  return <><div className="wb-form-grid">
    <Field label="Claude model"><input aria-label="Evaluation model" value={value.model} onChange={e => set('model', e.target.value)} /></Field>
    <Field label="Run spending limit (USD)"><input aria-label="Run budget" type="number" min="0.05" max="50" step="0.05" value={value.budget} onChange={e => set('budget', Number(e.target.value))} /></Field>
    <Field label="Repeats per test"><input aria-label="Run repeats" type="number" min="1" max="5" value={value.repeats} onChange={e => set('repeats', Number(e.target.value))} /></Field>
    <Field label="Timeout per model call (seconds)"><input aria-label="Run timeout" type="number" min="15" max="600" value={value.timeout} onChange={e => set('timeout', Number(e.target.value))} /></Field>
  </div><p className="wb-muted">AI runs send selected instructions, inputs and outputs to Claude using your existing Claude Code login. The CLI enforces the remaining spending limit per call; a final in-flight response can cross it. Usage also counts toward your provider limits.</p></>;
}

function FileSelection({ files, change, act }) {
  const add = async result => { if (!result.canceled) change([...files, ...result.files].filter((f, i, a) => a.findIndex(x => x.path === f.path) === i)); };
  return <div className="lab-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const dropped = Array.from(e.dataTransfer.files); act(async () => add(await native('dropFiles', dropped))); }}>
    <Button onClick={() => act(async () => add(await native('pickFiles')))}>Select files</Button><span> or drop files here</span>
    {files.map(f => <div className="wb-row" key={f.token}><span>{f.name} · {(f.bytes / 1024).toFixed(1)} KiB</span><Button onClick={() => change(files.filter(x => x.token !== f.token))}>Remove {f.name}</Button></div>)}
  </div>;
}

function Changes({ source, content, run, close }) {
  const [reviewed, setReviewed] = useState(false), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  return <Dialog title="Review proposed changes" wide close={() => { if (!saving) close(); }}>
    <p className="wb-path">{source.path}</p><p>Saving uses the original source revision. If the file changed since review, AIOS will preserve it and reject the save. A backup will appear in History.</p>
    {error && <Notice error>{error}</Notice>}
    <div className="wb-diff"><section><h3>Original</h3><pre>{source.content}</pre></section><section><h3>Proposed</h3><pre>{content}</pre></section></div>
    <label className="wb-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the complete change</label>
    <Button primary disabled={!reviewed || saving || source.readonly || source.content === content} onClick={async () => { setSaving(true); try { await run('resource.write', { id: source.id, revision: source.revision, parked: false, content }); close(); } catch (e) { setError(e.message); } finally { setSaving(false); } }}>Apply reviewed changes</Button>
  </Dialog>;
}

function RunResult({ job, act, run, onCandidate, started }) {
  const [change, setChange] = useState(false), [feedback, setFeedback] = useState(job.feedback || '');
  const result = job.result, candidate = result?.candidate ?? job.candidate;
  return <section className="wb-card lab-result"><h2>{job.label}</h2><p><strong>{job.status}</strong> · {job.progress}</p>
    {job.error && <Notice error>{job.error}</Notice>}
    {!terminal(job.status) && <Button onClick={() => act(() => lab('cancel', { id: job.id }))}>Cancel job</Button>}
    {result?.complete === false && <Notice error>This run has incomplete or failed cases. Review individual errors; partial averages do not establish an improvement.</Notice>}
    {result?.summary?.baseline && <><div className="lab-table-wrap"><table><thead><tr><th>Metric</th><th>Original</th><th>Candidate</th></tr></thead><tbody>
      <tr><td>Checks passed</td><td>{percent(result.summary.baseline.pass_rate.mean)}</td><td>{percent(result.summary.candidate.pass_rate.mean)}</td></tr>
      <tr><td>Completed samples</td><td>{result.summary.baseline.completed}</td><td>{result.summary.candidate.completed}</td></tr>
      <tr><td>Errors</td><td>{result.summary.baseline.errors}</td><td>{result.summary.candidate.errors}</td></tr>
      <tr><td>Pass-rate standard deviation</td><td>{result.summary.baseline.pass_rate.stddev == null ? 'Needs repeated samples' : percent(result.summary.baseline.pass_rate.stddev)}</td><td>{result.summary.candidate.pass_rate.stddev == null ? 'Needs repeated samples' : percent(result.summary.candidate.pass_rate.stddev)}</td></tr>
      <tr><td>Average seconds</td><td>{result.summary.baseline.time_seconds.mean?.toFixed(1) ?? '—'}</td><td>{result.summary.candidate.time_seconds.mean?.toFixed(1) ?? '—'}</td></tr>
      <tr><td>Average reported tokens</td><td>{result.summary.baseline.tokens.mean?.toFixed(0) ?? '—'}</td><td>{result.summary.candidate.tokens.mean?.toFixed(0) ?? '—'}</td></tr>
    </tbody></table></div>
      <p>{result.summary.delta == null ? 'No comparable score yet.' : `Change: ${(result.summary.delta * 100).toFixed(1)} percentage points.`} Scores apply to this suite and engine, not every use of the skill.</p>
      {!!result.holdout?.baseline.completed && <p>Held-out checks: {percent(result.holdout.baseline.pass_rate.mean)} → {percent(result.holdout.candidate.pass_rate.mean)}.</p>}
    </>}
    {Number.isFinite(result?.cost) && <p>Reported run cost: ${result.cost.toFixed(4)}{result.engine ? ` · ${result.engine}` : ''}</p>}
    {result?.beforeMetrics && <p>Document measurements: {result.beforeMetrics.lines} → {result.afterMetrics.lines} lines; approximately {result.beforeMetrics.estimatedTokens} → {result.afterMetrics.estimatedTokens} text tokens.</p>}
    {(result?.rationale || job.rationale) && <Notice>{result?.rationale || job.rationale}</Notice>}
    {result?.analysis && <pre>{result.analysis}</pre>}
    {job.source?.kind === 'skills' && job.bundleDigest && terminal(job.status) && <Button onClick={() => act(async () => started((await lab('package', { id: job.id })).job.id))}>Create skill package</Button>}
    {result?.package && <Button onClick={() => act(() => native('saveArtifact', { id: job.id, format: 'package' }))}>Save .skill package</Button>}
    {result?.summary?.baseline && terminal(job.status) && <Button onClick={() => act(async () => started((await lab('analyze', { id: job.id, settings: job.settings })).job.id))}>Analyze benchmark with AI</Button>}
    {result?.summary?.baseline && <details><summary>Test results and grading evidence</summary>{result.samples.map((s, i) => <section className="wb-card" key={i}><h3>Test {s.testId} · {s.variant} · repeat {s.repeat + 1}{s.holdout ? ' · held out' : ''}</h3>{s.error ? <Notice error>{s.error}</Notice> : <><pre>{s.output}</pre>{s.expectations.map((g, j) => <p key={j}><strong>{g.passed ? 'Pass' : 'Fail'}</strong> · {g.text} — {g.evidence} <small>({g.method})</small></p>)}{s.artifacts?.map((a, index) => <div className="wb-row" key={a.name}><span>{a.name} · {a.bytes} bytes</span><Button onClick={() => act(() => native('saveArtifact', { id: job.id, format: 'artifact', sample: i, index }))}>Save output file</Button></div>)}</>}</section>)}</details>}
    {!!result?.comparisons?.length && <details><summary>Blind A/B comparisons</summary>{result.comparisons.map((c, i) => <p key={i}>Test {c.testId}: {c.error || `${c.winner} — ${c.reasoning}`}</p>)}</details>}
    {Array.isArray(result?.findings) && <><p>{result.summary}</p>{result.findings.map((f, i) => <article className="wb-card" key={i}><p className="wb-path">{f.path}:{f.line}</p><p>{f.message}</p><p>{f.suggestion}</p></article>)}</>}
    {result?.documents?.map((doc, index) => <article className="wb-card" key={index}><h3>{doc.name}</h3>{doc.error ? <Notice error>{doc.error}</Notice> : <>{doc.warnings.map(w => <Notice key={w}>{w}</Notice>)}<pre aria-label={`Markdown preview ${doc.name}`}>{doc.content}</pre><div className="wb-actions"><Button onClick={() => act(() => native('saveArtifact', { id: job.id, format: 'markdown', index }))}>Save Markdown</Button><Button onClick={() => act(() => copyText(doc.content))}>Copy Markdown</Button></div></>}</article>)}
    {candidate !== undefined && job.source && <div className="wb-actions"><Button onClick={() => setChange(true)}>Review candidate changes</Button>{onCandidate && <Button onClick={() => onCandidate(job, candidate)}>Use candidate for another run</Button>}<Button onClick={() => act(() => native('saveArtifact', { id: job.id, format: 'candidate' }))}>Export candidate</Button></div>}
    <div className="wb-actions"><Button onClick={() => act(() => native('saveArtifact', { id: job.id, format: 'json' }))}>Export run report</Button></div>
    <Field label="Your feedback"><textarea aria-label="Run feedback" value={feedback} onChange={e => setFeedback(e.target.value)} /></Field><Button onClick={() => act(() => lab('feedback', { id: job.id, content: feedback }))}>Save feedback</Button>
    {change && <Changes source={job.source} content={candidate} run={run} close={() => setChange(false)} />}
  </section>;
}

function TestBuilder({ suite, mode, change, act }) {
  const [prompt, setPrompt] = useState(''), [expectation, setExpectation] = useState(''), [holdout, setHoldout] = useState(false), [shouldTrigger, setShouldTrigger] = useState(true), [checkType, setCheckType] = useState('contains'), [outputFile, setOutputFile] = useState('');
  return <details className="lab-builder"><summary>Add or import tests</summary>
    <Field label="Task prompt"><textarea aria-label="Test prompt" value={prompt} onChange={e => setPrompt(e.target.value)} /></Field>
    {mode === 'trigger' ? <label className="wb-check"><input type="checkbox" checked={shouldTrigger} onChange={e => setShouldTrigger(e.target.checked)} />This request should activate the skill</label> : <>
      <Field label="Check type"><select aria-label="Check type" value={checkType} onChange={e => setCheckType(e.target.value)}><option value="contains">Contains text</option><option value="equals">Equals text</option><option value="not_contains">Excludes text</option><option value="json">Valid JSON</option><option value="file_exists">Output file exists</option><option value="judge">AI judges an expectation</option></select></Field>
      <Field label="Output file path (leave empty to check the answer)"><input aria-label="Assertion file" value={outputFile} onChange={e => setOutputFile(e.target.value)} /></Field>
      <Field label="Expected text or instruction for the judge"><input aria-label="Test expectation" value={expectation} onChange={e => setExpectation(e.target.value)} /></Field></>}
    <label className="wb-check"><input type="checkbox" checked={holdout} onChange={e => setHoldout(e.target.checked)} />Hold out this case from improvement training</label>
    <div className="wb-actions"><Button disabled={!prompt.trim() || mode !== 'trigger' && (checkType === 'file_exists' ? !outputFile.trim() : checkType !== 'json' && !expectation.trim())} onClick={() => act(async () => { const parsed = JSON.parse(suite), tests = Array.isArray(parsed) ? parsed : parsed.evals; if (!Array.isArray(tests)) throw Error('The suite must contain an evals array.'); tests.push({ id: crypto.randomUUID().slice(0, 8), prompt, holdout, ...(mode === 'trigger' ? { should_trigger: shouldTrigger } : { assertions: [{ type: checkType, text: expectation || (checkType === 'json' ? 'Valid JSON' : 'Output file exists'), value: expectation, ...(outputFile ? { file: outputFile } : {}) }] }) }); change(JSON.stringify({ evals: tests }, null, 2)); setPrompt(''); setExpectation(''); })}>Add test</Button>
      <Button onClick={() => act(async () => { const r = await native('pickFiles'); if (r.canceled || !r.files.length) return; const text = await lab('files.text', { token: r.files[0].token }); JSON.parse(text.content); change(text.content); })}>Import test JSON</Button></div>
  </details>;
}

function SkillForm({ resources, draft, change, act, started, job }) {
  const [loading, setLoading] = useState(false);
  const source = draft.source, config = draft.settings || defaultSettings, mode = draft.mode || 'evaluate', suite = draft.suite || '{"evals":[]}';
  const set = (key, value) => change({ ...draft, [key]: value });
  const choose = async id => { setLoading(true); try { const r = resources.find(r => r.id === id); if (!r) { set('source', null); return; } const file = await request('resource.read', { id, parked: false }); change({ ...draft, source: { ...r, ...file }, candidate: file.content }); } finally { setLoading(false); } };
  const start = operation => act(async () => { const r = await lab(operation, { id: source.id, candidate: draft.candidate, mode, suite, settings: config, tokens: (draft.files || []).map(f => f.token), feedback: draft.feedback || '' }); started(r.job.id); });
  return <section className="wb-card"><h2>Compare, review and improve instructions</h2>
    <Notice>Text and file evaluations use Claude Code on saved copies. File tools are confined to the run workspace; shell commands and MCP servers are unavailable. For skills that depend on those tools, inspect capability errors instead of treating the run as a quality score.</Notice>
    <Field label="Skill or memory file"><select aria-label="Evaluation resource" value={source?.id || ''} disabled={loading} onChange={e => act(() => choose(e.target.value))}><option value="">Select an instruction file</option>{resources.filter(r => ['skills', 'memory'].includes(r.kind) && !r.parked && !r.error).map(r => <option key={r.id} value={r.id}>{r.name} · {r.provider} · {r.scope} · {r.path}</option>)}</select></Field>
    {source && <><p className="wb-path">{source.path}</p>{job?.source?.id === source.id && job.result?.summary?.baseline ? <Notice>Latest recorded comparison: Original {percent(job.result.summary.baseline.pass_rate.mean)} → Candidate {percent(job.result.summary.candidate.pass_rate.mean)}. Rerun after changing the draft, tests or model.</Notice> : <p>Current score: Not evaluated for this draft and suite. Run results are recorded below.</p>}
      <Field label="Evaluation mode"><select aria-label="Evaluation mode" value={mode} onChange={e => set('mode', e.target.value)}><option value="evaluate">Task performance and A/B comparison</option>{source.kind === 'skills' && <option value="trigger">Native skill triggering</option>}</select></Field>
      <Field label="Candidate instructions"><textarea className="wb-editor" aria-label="Candidate instructions" value={draft.candidate ?? source.content} onChange={e => set('candidate', e.target.value)} /></Field>
      <p className="wb-muted">The original is the selected file on disk at run start. Edit the candidate, or clear it to compare with no instructions (task mode only).</p>
      <TestBuilder suite={suite} mode={mode} change={value => set('suite', value)} act={act} />
      <Field label="Test suite JSON"><textarea className="wb-editor lab-suite" aria-label="Test suite" value={suite} onChange={e => set('suite', e.target.value)} /></Field>
      <details><summary>Input files for every test</summary><FileSelection files={draft.files || []} change={files => set('files', files)} act={act} /></details>
      <Settings value={config} change={settings => set('settings', settings)} />
      {mode !== 'trigger' && <><label className="wb-check"><input type="checkbox" checked={config.blind} onChange={e => set('settings', { ...config, blind: e.target.checked })} />Add a blind AI comparison of the two answers</label><label className="wb-check"><input type="checkbox" checked={config.files} onChange={e => set('settings', { ...config, files: e.target.checked })} />Allow reading and creating files inside each run workspace</label></>}
      <Field label="Feedback for the improvement proposal"><textarea aria-label="Improvement feedback" value={draft.feedback || ''} onChange={e => set('feedback', e.target.value)} /></Field>
      <div className="wb-actions"><Button primary onClick={() => start(mode)}>Run comparison</Button><Button onClick={() => start('improve')}>Improve and retest</Button><Button onClick={() => start('proposal')}>Draft from feedback</Button></div>
      <p className="wb-muted">Improve and retest measures training cases, proposes one revision, then evaluates it against the original including your held-out cases. Repeat from a saved candidate when useful. Nothing is applied to the installed file automatically.</p>
    </>}
  </section>;
}

function MoveSection({ source, section, projects, run, close }) {
  const [project, setProject] = useState(''), [preview, setPreview] = useState(null), [reviewed, setReviewed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const args = { id: source.id, revision: source.revision, start: section.start, end: section.end, project };
  return <Dialog title="Move section to project" wide close={() => { if (!busy) close(); }}><p>{section.title}</p><Field label="Destination project"><select aria-label="Memory destination" value={project} onChange={e => { setProject(e.target.value); setPreview(null); setReviewed(false); }}><option value="">Select project</option>{projects.map(p => <option key={p}>{p}</option>)}</select></Field>
    {error && <Notice error>{error}</Notice>}
    <Button disabled={!project || busy} onClick={async () => { setBusy(true); setError(''); try { setPreview(await request('memory.move.preview', args)); setReviewed(false); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Preview section move</Button>
    {preview && <>{preview.writes.map(w => <section key={w.path}><p className="wb-path">{w.path}</p><div className="wb-diff"><section><h3>Before</h3><pre>{w.before}</pre></section><section><h3>After</h3><pre>{w.content}</pre></section></div></section>)}
      <label className="wb-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed both files and the destination</label>
      <Button primary disabled={!reviewed || busy} onClick={async () => { setBusy(true); try { await run('memory.move.apply', { ...args, previewRevision: preview.previewRevision }); close(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Apply section move</Button></>}
  </Dialog>;
}

function MemoryForm({ resources, projects, draft, change, act, started, run, evaluate, busy }) {
  const [review, setReview] = useState(null), [changes, setChanges] = useState(null), [move, setMove] = useState(null);
  const files = resources.filter(r => r.kind === 'memory' && !r.parked && !r.error).filter((r, i, all) => all.findIndex(a => (a.canonicalPath || a.path) === (r.canonicalPath || r.path)) === i);
  const ids = (draft.ids || []).filter(id => files.some(f => f.id === id)), config = draft.settings || defaultSettings;
  const set = (key, value) => change({ ...draft, [key]: value });
  return <><section className="wb-card"><h2>Review memory and rules</h2><p>Select the files to review together. Scope is discovered from disk; providers decide what is actually loaded into each session.</p>
    <div className="wb-actions"><Button onClick={() => set('ids', files.slice(0, 30).map(f => f.id))}>Select visible files</Button><Button onClick={() => set('ids', [])}>Clear selection</Button></div>
    <div className="lab-memory-files">{files.map(f => <label className="wb-check" key={f.id}><input type="checkbox" checked={ids.includes(f.id)} onChange={e => set('ids', e.target.checked ? [...ids, f.id] : ids.filter(id => id !== f.id))} /><span>{f.name} · {f.provider} · {f.scope}<small className="wb-path">{f.path}</small></span></label>)}</div>
    {!files.length && <Notice>No readable memory files match the current filters. Add a project folder in Settings or broaden the scope.</Notice>}
    <div className="wb-form-grid"><Field label="Length guidance (lines)"><input aria-label="Memory line guidance" type="number" min="20" max="5000" value={draft.maxLines ?? 500} onChange={e => set('maxLines', Number(e.target.value))} /></Field>
      <Field label="Project for scope suggestions"><select aria-label="Memory review project" value={draft.project || ''} onChange={e => set('project', e.target.value)}><option value="">No project selected</option>{projects.map(p => <option key={p}>{p}</option>)}</select></Field></div>
    <Button primary disabled={!ids.length || busy} onClick={() => act(async () => { setReview(null); const r = await lab('memory.check', { ids, maxLines: draft.maxLines ?? 500, project: draft.project || '' }); setReview(r.review); })}>Run local checks</Button>
    <details><summary>AI review and rewrite options</summary><Settings value={config} change={v => set('settings', v)} /><Field label="Rewrite guidance"><textarea aria-label="Memory rewrite guidance" value={draft.feedback || ''} onChange={e => set('feedback', e.target.value)} /></Field><div className="wb-actions">
      <Button disabled={!ids.length} onClick={() => act(async () => started((await lab('memory.ai', { ids, settings: config })).job.id))}>Run AI review</Button>
      <Button disabled={ids.length !== 1} onClick={() => act(async () => started((await lab('proposal', { id: ids[0], settings: config, feedback: draft.feedback || '' })).job.id))}>Propose rewrite of selected file</Button>
      <Button disabled={ids.length !== 1} onClick={() => evaluate(files.find(f => f.id === ids[0]))}>Evaluate behavior in Skill Lab</Button></div></details>
  </section>
    {review && <section className="wb-card"><h2>Local review results</h2><p>{review.documents.length} files · {review.metrics.lines} lines · approximately {review.metrics.estimatedTokens} text tokens · {review.findings.length} findings</p><p>These are document measurements, not model performance scores. Suggestions preserve the original until you review and apply a change.</p>
      {!review.findings.length && <Notice>No issues were found by these local checks. This does not establish that the instructions are complete or effective.</Notice>}
      {review.findings.map(f => <article className="wb-card" key={f.id}><span className="wb-badge">{f.code}</span><p className="wb-path">{f.path}:{f.line}</p><p>{f.message}</p>
        {f.edit && <Button onClick={() => { const source = review.documents.find(d => d.id === f.fileId); setChanges({ source, content: source.content.slice(0, f.edit.start) + f.edit.replacement + source.content.slice(f.edit.end) }); }}>Review removal</Button>}
      </article>)}
      {review.documents.map(source => <details key={source.id}><summary>{source.path} · {source.metrics.lines} lines</summary><pre>{source.content}</pre>{source.scope === 'user' && !source.readonly && source.sections.map(s => <div className="wb-row" key={s.start}><span>{s.title} · lines {s.line}–{s.endLine}</span><Button onClick={() => setMove({ source, section: s })}>Move section</Button></div>)}</details>)}
    </section>}
    {changes && <Changes {...changes} run={async (...args) => { await run(...args); setReview(null); }} close={() => setChanges(null)} />}
    {move && <MoveSection {...move} projects={projects} run={run} close={() => { setMove(null); setReview(null); }} />}
  </>;
}

export function Labs({ page, data, resources, run, jobsState, drafts, setDrafts, navigate }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [job, setJob] = useState(null), [converter, setConverter] = useState(null);
  const draft = drafts[page] || {}, change = value => setDrafts(prev => ({ ...prev, [page]: value }));
  const act = async fn => { setBusy(true); setError(''); try { await fn(); await jobsState.refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const started = id => { setJob(null); setSelected(id); void jobsState.refresh(); };
  useEffect(() => { setSelected(null); setJob(null); setError(''); }, [page]);
  useEffect(() => { if (job?.id) document.querySelector('.lab-result')?.scrollIntoView({ block: 'start' }); }, [job?.id]);
  useEffect(() => { let alive = true; lab('status').then(r => { if (alive) setConverter(r.converter); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [jobsState.jobs]);
  useEffect(() => {
    if (!selected) { setJob(null); return; } let active = true;
    lab('get', { id: selected }).then(r => { if (active) setJob(r.job); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [selected, jobsState.jobs]);
  const evaluate = source => act(async () => { const file = await request('resource.read', { id: source.id, parked: false }); setDrafts(prev => ({ ...prev, 'skill-lab': { ...prev['skill-lab'], source: { ...source, ...file }, candidate: file.content, mode: 'evaluate' } })); navigate('skill-lab'); });
  const kinds = page === 'convert' ? ['convert', 'install'] : page === 'memory-review' ? ['memory-review', 'proposal'] : ['evaluate', 'trigger', 'improve', 'proposal', 'analysis', 'package'];
  return <div className="lab-workspace" aria-busy={busy}>
    {(error || jobsState.error) && <Notice error>{error || jobsState.error}</Notice>}
    {jobsState.jobs.some(j => !terminal(j.status)) && <Notice>A background job is running. You can continue using configuration pages. Return here to review progress or cancel it.</Notice>}
    {page === 'convert' ? <section className="wb-card"><h2>Convert documents to Markdown</h2><p>Local document extraction with Microsoft MarkItDown. No account is needed. Missing dependencies are installed into AIOS’s private environment when you start conversion.</p><p>{converter?.installed ? `MarkItDown ${converter.version} is ready.` : 'The managed converter needs setup.'}</p>
      <p className="wb-muted">PDF, Word, PowerPoint, Excel, CSV, HTML, text, JSON, XML, EPUB, Outlook messages and notebooks. Scanned images, audio and video require additional OCR/transcription and are not part of local document extraction.</p>
      <FileSelection files={draft.files || []} change={files => change({ ...draft, files })} act={act} />
      <div className="wb-actions"><Button primary disabled={busy || !draft.files?.length} onClick={() => act(async () => started((await lab('convert', { tokens: draft.files.map(f => f.token) })).job.id))}>Convert to Markdown</Button><Button disabled={busy || converter?.installed} onClick={() => act(async () => started((await lab('install')).job.id))}>Set up converter</Button></div>
    </section> : page === 'memory-review' ? <MemoryForm resources={resources} projects={data.projects} draft={draft} change={change} act={act} started={started} run={run} evaluate={evaluate} busy={busy} /> : <SkillForm resources={resources} draft={draft} change={change} act={act} started={started} job={job} />}
    <section className="wb-card"><h2>Run history</h2>{!jobsState.jobs.some(j => kinds.includes(j.kind)) && <p>No runs yet.</p>}{jobsState.jobs.filter(j => kinds.includes(j.kind)).map(j => <div className="wb-row" key={j.id}><Button onClick={() => setSelected(j.id)}>{j.label} · {j.status}</Button><span>{new Date(j.createdAt).toLocaleString()}</span>{terminal(j.status) && <Button onClick={() => { if (window.confirm('Delete this run and its saved input/output copies? Installed resources will remain unchanged.')) act(async () => { await lab('delete', { id: j.id }); if (selected === j.id) setSelected(null); }); }}>Delete run</Button>}</div>)}</section>
    {job && <RunResult key={job.id} job={job} act={act} run={run} started={started} onCandidate={(j, candidate) => { setDrafts(prev => ({ ...prev, 'skill-lab': { source: j.source, candidate, suite: JSON.stringify({ evals: j.suite || [] }, null, 2), mode: j.mode || 'evaluate', settings: j.settings, feedback: j.feedback || '' } })); navigate('skill-lab'); }} />}
  </div>;
}
