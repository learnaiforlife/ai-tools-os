import React, { useState, useEffect, useCallback } from 'react';
import { request, copyText } from './api.js';
import { Button, Field, Notice } from './workbench-ui.jsx';

const completed = status => ['completed', 'failed', 'canceled', 'interrupted'].includes(status);
export const defaultAISettings = { provider: 'auto', model: '', repeats: 1, timeout: 120, maxCalls: 40, budget: 1, strictBudget: false, blind: false, files: false };
export const settingsFromPreferences = prefs => ({ ...defaultAISettings, provider: prefs?.engine || 'auto', timeout: prefs?.timeout ?? 120, budget: prefs?.budget ?? 1, maxCalls: prefs?.maxCalls ?? 40, strictBudget: prefs?.strictBudget ?? false });
export async function aiRequest(operation, args = {}) {
  if (!window.aios?.lab) throw Error('Use the updated desktop application for AI work.');
  const result = await window.aios.lab(operation, args);
  if (!result?.ok) throw Object.assign(Error(result?.error || 'The AI job could not start.'), { code: result?.code });
  return result;
}
export function useAIJob() {
  const [id, setId] = useState(null), [job, setJob] = useState(null), [error, setError] = useState(''), [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!id) return; let alive = true;
    const read = () => aiRequest('get', { id }).then(r => { if (alive) setJob(r.job); }).catch(e => { if (alive) setError(e.message); });
    void read(); const unsubscribe = window.aios?.onLabProgress(p => { if (p.id === id) void read(); });
    return () => { alive = false; unsubscribe?.(); };
  }, [id]);
  const start = async (operation, args) => {
    if (starting || job && !completed(job.status)) return;
    setStarting(true); setError(''); setJob(null);
    try { const r = await aiRequest(operation, args); setId(r.job.id); setJob(r.job); } catch (e) { setError(e.message); } finally { setStarting(false); }
  };
  const cancel = async () => { try { await aiRequest('cancel', { id }); } catch (e) { setError(e.message); } };
  return { job, error, start, cancel, busy: starting || !!job && !completed(job.status) };
}
export function AIControls({ value, change, showModel = true }) {
  const v = { ...defaultAISettings, ...value }, set = (key, val) => change({ ...v, [key]: val });
  return <><div className="wb-form-grid">
    <Field label="AI engine"><select aria-label="AI engine" value={v.provider} onChange={e => change({ ...v, provider: e.target.value, model: '', files: e.target.value === 'claude' && v.files })}><option value="auto">Auto — available compatible engine</option><option value="claude">Claude Code</option><option value="codex">Codex CLI</option><option value="cursor">Cursor Agent</option><option value="local">Local only</option></select></Field>
    {showModel && <Field label="Model ID (optional)"><input aria-label="Evaluation model" value={v.model} disabled={v.provider === 'local'} placeholder="Saved preference or engine default" onChange={e => set('model', e.target.value)} /></Field>}
    <Field label="Timeout per call (seconds)"><input aria-label="Run timeout" form="aios-ai-controls" type="number" min="15" max="600" value={v.timeout} onChange={e => set('timeout', Number(e.target.value))} /></Field>
    <Field label="Maximum model calls"><input aria-label="Maximum model calls" form="aios-ai-controls" type="number" min="1" max="500" value={v.maxCalls} onChange={e => set('maxCalls', Number(e.target.value))} /></Field>
    <Field label="Claude run budget (USD)"><input aria-label="Run budget" form="aios-ai-controls" type="number" min="0.05" max="50" step="0.05" value={v.budget} onChange={e => set('budget', Number(e.target.value))} /></Field>
  </div><label className="wb-check"><input type="checkbox" checked={v.strictBudget} onChange={e => set('strictBudget', e.target.checked)} />Require an engine with a dollar-limit control</label>
    <p className="wb-muted">Uses your existing CLI login and sends selected content to that engine's model service. Codex and Cursor support text work; file and native trigger tests currently use Claude. Unknown cost is shown as not reported. Auto falls back to local templates/checks when no compatible tool is installed; a failed model request is never silently retried.</p></>;
}
function JobStatus({ state }) {
  const { job, error, busy, cancel } = state;
  return <>{error && <Notice error>{error}</Notice>}{job && <><p role="status">{job.status} · {job.progress}</p>{job.error && <Notice error>{job.error}</Notice>}{job.result && <p>{job.result.provenance || job.result.provider || job.settings?.provider}{job.result.engine ? ` · ${job.result.engine}` : ''}{job.result.model ? ` · ${job.result.model}` : ''} · {Number.isFinite(job.result.cost) ? `$${job.result.cost.toFixed(4)} reported` : 'Cost not reported / no model run'}</p>}</>}{busy && job && <Button onClick={cancel}>Cancel AI job</Button>}</>;
}
export function AIDraft({ spec, onDraft }) {
  const [goal, setGoal] = useState(''), [settings, setSettings] = useState(defaultAISettings), [submitted, setSubmitted] = useState('');
  const state = useAIJob(), signature = JSON.stringify(spec), result = state.job?.result;
  useEffect(() => { let alive = true; request('preferences.ai.get').then(r => { if (alive) setSettings(current => current === defaultAISettings ? settingsFromPreferences(r.preferences) : current); }).catch(() => {}); return () => { alive = false; }; }, []);
  return <details className="wb-card"><summary>Draft with AI or a local template</summary>
    <Field label="What should this resource do?"><textarea aria-label="Creation goal" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Purpose, inputs, expected output, constraints and examples" /></Field>
    <details><summary>Engine & advanced controls</summary><AIControls value={settings} change={setSettings} /></details>
    <div className="wb-actions"><Button disabled={state.busy || !spec.name || !goal.trim()} onClick={() => { setSubmitted(signature); void state.start('ai.draft', { ...spec, goal, settings }); }}>Generate draft</Button><Button disabled={state.busy || !spec.name || !goal.trim()} onClick={() => { setSubmitted(signature); void state.start('ai.draft', { ...spec, goal, settings: { ...settings, provider: 'local' } }); }}>Use local template</Button></div>
    <JobStatus state={state} />
    {result?.content && <><Notice>{result.rationale}</Notice><pre aria-label="Generated resource draft">{result.content}</pre>{submitted !== signature && <Notice>The destination changed. Generate a new draft for the selected resource.</Notice>}<Button disabled={submitted !== signature} onClick={() => onDraft(result.content)}>Put draft in editor</Button><p>Review the editor before saving to the selected provider and scope.</p></>}
  </details>;
}
export function AIProposal({ resource, file, onDraft }) {
  const [feedback, setFeedback] = useState('Improve clarity and remove repetition while preserving the resource’s scope and essential instructions.'), [settings, setSettings] = useState(defaultAISettings);
  const state = useAIJob(), result = state.job?.result;
  useEffect(() => { let alive = true; request('preferences.ai.get').then(r => { if (alive) setSettings(current => current === defaultAISettings ? settingsFromPreferences(r.preferences) : current); }).catch(() => {}); return () => { alive = false; }; }, []);
  return <details className="wb-card"><summary>Enhance with AI</summary><p>Proposals use the saved file on disk. Putting a proposal in the editor replaces the current draft.</p><Field label="Requested change"><textarea value={feedback} onChange={e => setFeedback(e.target.value)} /></Field><details><summary>Engine & advanced controls</summary><AIControls value={settings} change={setSettings} /></details>
    <Button disabled={state.busy || !feedback.trim()} onClick={() => state.start('ai.propose', { id: resource.id, feedback, settings })}>Propose edit</Button><JobStatus state={state} />
    {result?.candidate !== undefined && <><p>{result.rationale}</p><pre>{result.candidate}</pre><Button disabled={state.job.source.revision !== file.revision || state.job.source.id !== resource.id} onClick={() => onDraft(result.candidate)}>Review proposal in editor</Button>{state.job.source.revision !== file.revision && <Notice>Reload the source before reviewing this proposal; the versions differ.</Notice>}</>}
  </details>;
}
export function AIReviewPanel({ resources, focus = 'Review security, instruction quality and scope.' }) {
  const available = resources.filter(r => !r.parked && !r.error), [ids, setIds] = useState([]), [guidance, setGuidance] = useState(focus), [settings, setSettings] = useState(defaultAISettings), [preview, setPreview] = useState(null), [error, setError] = useState('');
  const state = useAIJob(), selected = ids.filter(id => available.some(r => r.id === id)), result = state.job?.result;
  useEffect(() => { let alive = true; request('preferences.ai.get').then(r => { if (alive) setSettings(current => current === defaultAISettings ? settingsFromPreferences(r.preferences) : current); }).catch(() => {}); return () => { alive = false; }; }, []);
  const select = next => { setIds(next); setPreview(null); };
  return <section className="wb-card ai-panel"><h2>Review selected resources</h2><p>Review instructions, permissions, configuration risks and resource organization. Findings cite selected content; this does not test running servers or certify security.</p>
    <div className="wb-actions"><Button onClick={() => select(available.slice(0, 30).map(r => r.id))}>Select first 30 visible resources</Button><Button onClick={() => select([])}>Clear review selection</Button></div>
    <div className="lab-memory-files">{available.map(r => <label className="wb-check" key={r.id}><input type="checkbox" checked={selected.includes(r.id)} disabled={!selected.includes(r.id) && selected.length >= 30} onChange={e => select(e.target.checked ? [...selected, r.id] : selected.filter(id => id !== r.id))} />{r.name} · {r.kind} · {r.provider} · {r.scope}</label>)}</div>
    <Field label="Review focus"><textarea value={guidance} onChange={e => setGuidance(e.target.value)} /></Field><details><summary>Engine & advanced controls</summary><AIControls value={settings} change={setSettings} /></details>
    <div className="wb-actions"><Button disabled={!selected.length || state.busy} onClick={() => state.start('ai.review', { ids: selected, focus: guidance, settings })}>Review with selected engine</Button><Button disabled={!selected.length || state.busy} onClick={() => state.start('ai.review', { ids: selected, focus: guidance, settings: { ...settings, provider: 'local' } })}>Run local resource checks</Button><Button disabled={!selected.length} onClick={async () => { try { setPreview((await aiRequest('ai.context', { ids: selected })).files); setError(''); } catch (e) { setError(e.message); } }}>Preview context</Button></div>
    {error && <Notice error>{error}</Notice>}{preview && <details open><summary>Selected context after recognizable-secret filtering</summary>{preview.map(f => <section key={f.id}><h3>{f.name}{f.redacted ? ' · values redacted' : ''}</h3><pre>{f.content}</pre></section>)}</details>}
    <JobStatus state={state} />
    {result && <><p>{result.summary}</p>{result.findings.map((f, i) => <article className="wb-card" key={i}><p>{f.severity || 'suggestion'} · {f.method}</p><p className="wb-path">{f.path}:{f.line}</p><strong>{f.message}</strong><pre>{f.evidence}</pre><p>{f.suggestion}</p></article>)}<Button onClick={async () => { try { await copyText(JSON.stringify(result, null, 2)); } catch (e) { setError(e.message); } }}>Copy review report</Button></>}
  </section>;
}
export function AISettingsPanel({ onSaved, onDirty }) {
  const [prefs, setPrefs] = useState(null), [engines, setEngines] = useState([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const dirty = !!prefs && JSON.stringify(prefs) !== saved;
  useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false); }, [dirty, onDirty]);
  useEffect(() => { if (!dirty) return; const guard = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
  const load = useCallback(async () => { try { const r = await request('preferences.ai.get'); setPrefs(r.preferences); setSaved(JSON.stringify(r.preferences)); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const probe = async () => { setBusy(true); setError(''); try { setEngines((await aiRequest('ai.status')).engines); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  if (!prefs) return <p>Loading AI preferences…{error}</p>;
  return <section className="wb-card"><h2>AI engines</h2><p>Choose how AIOS drafts, evaluates and reviews. Engine choice is independent of the resource destination. Settings are local to this machine.</p>
    <AIControls showModel={false} value={settingsFromPreferences(prefs)} change={v => setPrefs({ ...prefs, engine: v.provider, timeout: v.timeout, maxCalls: v.maxCalls, budget: v.budget, strictBudget: v.strictBudget })} />
    {['claude', 'codex', 'cursor'].map(id => <div className="wb-form-grid" key={id}><Field label={`${id} model preference`}><input value={prefs.models[id] || ''} onChange={e => setPrefs({ ...prefs, models: { ...prefs.models, [id]: e.target.value } })} placeholder="Use engine default" /></Field><Field label={`${id} executable override`}><input value={prefs.paths[id] || ''} onChange={e => setPrefs({ ...prefs, paths: { ...prefs.paths, [id]: e.target.value } })} placeholder="Discover on this machine" /></Field></div>)}
    <div className="wb-actions"><Button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const r = await request('preferences.ai.save', { preferences: prefs }); setPrefs(r.preferences); setSaved(JSON.stringify(r.preferences)); onSaved?.(r.preferences); setMessage('AI preferences saved. New job defaults will use them; existing draft selections are retained.'); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Save AI preferences</Button><Button disabled={busy} onClick={probe}>Check installed engines</Button></div>
    {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    {engines.map(e => <article className="wb-card" key={e.id}><strong>{e.name}</strong><p>{e.version || e.state}</p><p className="wb-path">{e.path}</p>{e.error ? <Notice>{e.error}</Notice> : <p>CLI capabilities detected. Login/model access are verified when a job runs. Text: supported; file/native trigger tests: {e.capabilities.files ? 'supported' : 'unavailable'}.</p>}</article>)}
    <p className="wb-muted">Sign in using the native tools: claude auth login, codex login, or agent login. AIOS uses their authentication; credentials are not saved in these preferences.</p>
  </section>;
}
