import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Icon } from './icons.jsx';
import { request, copyText, redactJsonText, contextEstimate } from './api.js';
import './workbench.css';

const PAGES = [['dashboard', 'Overview', 'grid'], ['skills', 'Skills', 'bolt'], ['mcp', 'MCP servers', 'mcp'], ['memory', 'Memory & rules', 'memory'], ['config', 'Config files', 'file'], ['commands', 'Commands', 'terminal'], ['agents', 'Subagents', 'users'], ['prompts', 'Prompt library', 'bookmark'], ['security', 'Security review', 'shield'], ['tokens', 'Context estimates', 'tokens'], ['tools', 'External tools', 'tools'], ['history', 'History & recovery', 'history'], ['tutorial', 'Getting started', 'book'], ['settings', 'Settings', 'settings']];
const KINDS = ['skills', 'mcp', 'memory', 'config', 'commands', 'agents'];
const EMPTY = { resources: [], roots: [], projects: [], issues: [], profiles: [], prompts: [], preferences: { theme: 'dark', syncInterval: 0, exclusions: [], providerPaths: {} } };
const pretty = value => JSON.stringify(value, null, 2);
function Button({ children, primary, ...props }) { return <button className={'wb-button' + (primary ? ' primary' : '')} type="button" {...props}>{children}</button>; }
function Notice({ children, error = false }) { return <div className={'wb-notice' + (error ? ' error' : '')} role={error ? 'alert' : 'status'}>{children}</div>; }
function Field({ label, children }) { return <label className="wb-field"><span>{label}</span>{children}</label>; }
function Dialog({ title, close, children, wide = false }) {
  const ref = useRef(null), closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement, el = ref.current; el.showModal();
    const cancel = event => { event.preventDefault(); closeRef.current(); }; el.addEventListener('cancel', cancel);
    return () => { el.removeEventListener('cancel', cancel); el.close(); previous?.focus?.(); };
  }, []);
  return <dialog className={'wb-dialog' + (wide ? ' wide' : '')} ref={ref} aria-labelledby="dialog-title"><header><h2 id="dialog-title">{title}</h2><Button aria-label="Close dialog" onClick={close}>Close</Button></header>{children}</dialog>;
}
function useDraftGuard(dirty) {
  useEffect(() => { if (!dirty) return; const guard = e => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
}
function Editor({ resource, run, close, openSource, initialDraft }) {
  const [file, setFile] = useState(null), [draft, setDraft] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false), [diff, setDiff] = useState(false);
  const sensitive = ['config', 'mcp', 'scripts'].includes(resource.kind);
  const [revealed, setRevealed] = useState(!sensitive), [reloadKey, setReloadKey] = useState(0);
  const dirty = !!file && draft !== file.content; useDraftGuard(dirty);
  useEffect(() => {
    if (!revealed) return; let active = true; setFile(null); setError('');
    request('resource.read', { id: resource.id, parked: !!resource.parked }).then(result => { if (active) { setFile(result); setDraft(reloadKey === 0 && initialDraft !== undefined ? initialDraft : result.content); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [resource.id, resource.parked, revealed, reloadKey]);
  const leave = () => { if (!saving && (!dirty || window.confirm('Discard this unsaved draft?'))) close(); };
  const save = async () => {
    setSaving(true); setError('');
    try { await run('resource.write', { id: resource.id, parked: !!resource.parked, revision: file.revision, content: draft }); close(); }
    catch (e) { setError(e.message); } finally { setSaving(false); }
  };
  return <Dialog title={resource.name} close={leave} wide>
    <p className="wb-path">{resource.path}</p><p>{resource.provider} · {resource.scope} · {resource.parked ? 'Parked copy' : 'Live source'}{resource.symlink ? ' · symbolic link preserved' : ''}</p>
    {sensitive && !revealed && <Notice>This file may contain credentials. Revealing it reads the complete native file into this local editor. <Button onClick={() => setRevealed(true)}>Reveal content</Button></Notice>}
    {error && <Notice error>{error}</Notice>}
    {revealed && !file && !error && <p role="status">Reading complete file…</p>}
    {file && <>
      <div className="wb-actions"><span>{file.readonly ? 'Read-only inspection' : dirty ? 'Unsaved draft' : 'Matches loaded version'}</span>
        <Button disabled={saving} onClick={() => setDiff(!diff)}>{diff ? 'Editor' : 'Compare changes'}</Button>
        <Button disabled={saving} onClick={() => { if (!dirty || window.confirm('Discard the draft and reload from disk?')) setReloadKey(k => k + 1); }}>Reload from disk</Button>
      </div>
      {diff ? <div className="wb-diff"><section><h3>Loaded version</h3><pre>{file.content}</pre></section><section><h3>Your draft</h3><pre>{draft}</pre></section></div>
        : <textarea className="wb-editor" aria-label="File content" spellCheck={false} value={draft} disabled={saving} readOnly={file.readonly} onChange={e => setDraft(e.target.value)} />}
      <p className="wb-muted">The full file is preserved. JSON, TOML and resource frontmatter are syntax checked on save; plain instruction Markdown is saved as text. Provider semantics remain the provider’s responsibility.</p>
      <div className="wb-actions">
        {!file.readonly && <Button primary disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button>}
        {resource.sourceId && <Button disabled={saving} onClick={() => openSource(resource.sourceId)}>Edit native source</Button>}
        <Button disabled={saving} onClick={async () => { try { await copyText(draft); } catch (e) { setError(e.message); } }}>Copy displayed content</Button>
      </div>
    </>}
  </Dialog>;
}
function CreateResource({ kind, data, scope, project, run, close }) {
  const [form, setForm] = useState({ kind, name: '', provider: 'Claude Code', scope: scope === 'project' ? 'project' : 'user', project, content: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const unsupported = kind === 'memory' && form.provider === 'Cursor' && form.scope === 'user';
  const update = (key, value) => setForm(f => ({ ...f, [key]: value })); useDraftGuard(!!form.name || !!form.content);
  const leave = () => { if (!busy && ((!form.name && !form.content) || window.confirm('Discard the new resource draft?'))) close(); };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { if (kind === 'mcp') await run('mcp.create', { ...form, config: JSON.parse(form.content) }); else await run('resource.create', form); close(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <Dialog title={`New ${kind === 'mcp' ? 'MCP server' : kind}`} close={leave} wide><form onSubmit={submit}>
    <div className="wb-form-grid"><Field label="Name"><input required value={form.name} onChange={e => update('name', e.target.value)} maxLength={100} /></Field>
      <Field label="Provider"><select value={form.provider} onChange={e => update('provider', e.target.value)}>{(['commands', 'agents'].includes(kind) ? ['Claude Code'] : ['Claude Code', 'Codex', 'Cursor']).map(p => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Scope"><select value={form.scope} onChange={e => update('scope', e.target.value)}><option value="user">User</option><option value="project">Project</option></select></Field>
      {form.scope === 'project' && <Field label="Project folder"><select required value={form.project} onChange={e => update('project', e.target.value)}><option value="">Select a folder</option>{[...new Set([...data.projects, ...data.roots])].map(p => <option key={p}>{p}</option>)}</select></Field>}</div>
    {kind === 'memory' && <p>The provider’s native instruction filename will be used: CLAUDE.md, AGENTS.md, or .cursorrules.</p>}
    {unsupported && <Notice>Cursor user rules are configured in Cursor settings. Select Project to create a native instruction file.</Notice>}
    <Field label={kind === 'mcp' ? 'Native MCP configuration (JSON object containing command/args or url/headers)' : 'Complete Markdown, including any YAML frontmatter'}><textarea className="wb-editor" required value={form.content} onChange={e => update('content', e.target.value)} spellCheck={false} /></Field>
    {error && <Notice error>{error}</Notice>}<button className="wb-button primary" disabled={busy || unsupported} type="submit">{busy ? 'Creating…' : 'Create resource'}</button>
  </form></Dialog>;
}
function ShareResource({ resource, close }) {
  const [text, setText] = useState(''), [error, setError] = useState(''), [reviewed, setReviewed] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { let active = true; request('resource.read', { id: resource.id, parked: !!resource.parked }).then(file => {
    let content = file.content;
    if (resource.kind === 'mcp' || resource.path.endsWith('.json')) content = redactJsonText(content);
    if (active) setText(pretty({ format: 'aios-resource', version: 1, resource: { name: resource.name, kind: resource.kind, provider: resource.provider, content } }));
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [resource.id, resource.parked]);
  return <Dialog title="Export resource" close={close} wide><Notice>Review the text before sharing. Common JSON credential fields and arguments are redacted. Markdown, TOML and scripts require manual secret review. Local source paths are omitted from the bundle metadata.</Notice>
    <textarea className="wb-editor" aria-label="Export bundle" value={text} onChange={e => { setText(e.target.value); setReviewed(false); }} spellCheck={false} />
    <label className="wb-check"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed this bundle and removed private information.</label>
    {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    <Button disabled={!text || !reviewed} onClick={async () => { try { JSON.parse(text); await copyText(text); setMessage('Reviewed bundle copied.'); } catch (e) { setError(e.message); } }}>Copy reviewed bundle</Button>
    <p>Import by creating the matching resource and pasting its content. Skills with support files must be shared as their complete directory outside AIOS; this bundle contains only the selected text file.</p>
  </Dialog>;
}
function PromptEditor({ prompt, close, run }) {
  const [p, setP] = useState(prompt || { name: '', content: '', favorite: false }), [error, setError] = useState(''), [busy, setBusy] = useState(false), [vars, setVars] = useState({});
  const dirty = pretty(p) !== pretty(prompt || { name: '', content: '', favorite: false }); useDraftGuard(dirty);
  const names = [...new Set([...p.content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].map(m => m[1]))];
  const leave = () => { if (!busy && (!dirty || window.confirm('Discard prompt changes?'))) close(); };
  return <Dialog title={prompt ? 'Edit prompt' : 'New prompt'} close={leave} wide>
    <Field label="Prompt name"><input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} /></Field>
    <Field label="Prompt content"><textarea className="wb-editor" value={p.content} onChange={e => setP({ ...p, content: e.target.value })} /></Field>
    <label className="wb-check"><input type="checkbox" checked={p.favorite} onChange={e => setP({ ...p, favorite: e.target.checked })} />Favorite</label>
    {names.map(name => <Field key={name} label={`Variable: ${name}`}><input value={vars[name] || ''} onChange={e => setVars({ ...vars, [name]: e.target.value })} /></Field>)}
    {error && <Notice error>{error}</Notice>}<div className="wb-actions"><Button primary disabled={busy || !p.name || !p.content} onClick={async () => { setBusy(true); try { await run('prompts.save', { prompt: p }); close(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Save prompt</Button>
      <Button disabled={names.some(name => !vars[name])} onClick={async () => { try { await copyText(p.content.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, name) => vars[name])); } catch (e) { setError(e.message); } }}>Copy rendered prompt</Button></div>
  </Dialog>;
}
function Settings({ data, run, busy, report, onDirty }) {
  const [prefs, setPrefs] = useState(data.preferences), [root, setRoot] = useState('');
  const preferenceKey = pretty(data.preferences);
  useEffect(() => setPrefs(data.preferences), [preferenceKey]);
  const dirty = pretty(prefs) !== pretty(data.preferences); useDraftGuard(dirty);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  return <>
    <section className="wb-card"><h2>Scan folders</h2><p>User tool locations are detected automatically. Add project folders to discover their native configuration. Removing a scan folder does not delete files.</p>
      {data.roots.map(path => <div className="wb-row" key={path}><code>{path}</code><Button disabled={busy} onClick={() => void run('roots.set', { roots: data.roots.filter(p => p !== path) }).catch(report)}>Remove scan folder</Button></div>)}
      <div className="wb-actions"><input aria-label="Absolute scan folder" placeholder="Absolute folder path" value={root} onChange={e => setRoot(e.target.value)} /><Button disabled={busy || !root} onClick={() => void run('roots.set', { roots: [...data.roots, root] }).then(() => setRoot('')).catch(report)}>Add folder</Button>
        <Button disabled={busy} onClick={async () => { try { const result = await window.aios.pickFolder(); if (!result.ok) throw Error(result.error); if (!result.canceled) await run('roots.set', { roots: [...data.roots, result.path] }); } catch (e) { report(e); } }}>Choose folder…</Button></div>
    </section>
    <section className="wb-card"><h2>Preferences</h2><div className="wb-form-grid">
      <Field label="Appearance"><select value={prefs.theme} onChange={e => setPrefs({ ...prefs, theme: e.target.value })}>{['dark', 'light', 'system'].map(v => <option key={v}>{v}</option>)}</select></Field>
      <Field label="Automatic refresh"><select value={prefs.syncInterval} onChange={e => setPrefs({ ...prefs, syncInterval: Number(e.target.value) })}><option value={0}>Manual</option><option value={30}>Every 30 seconds</option><option value={60}>Every minute</option><option value={300}>Every 5 minutes</option></select></Field>
      <Field label="Excluded directory names (comma separated)"><input value={prefs.exclusions.join(', ')} onChange={e => setPrefs({ ...prefs, exclusions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></Field>
      {['claude', 'codex'].map(provider => <Field key={provider} label={`${provider} configuration directory override`}><input placeholder="Use environment or default location" value={prefs.providerPaths[provider] || ''} onChange={e => setPrefs({ ...prefs, providerPaths: { ...prefs.providerPaths, [provider]: e.target.value } })} /></Field>)}
    </div><Button primary disabled={busy || !dirty} onClick={() => void run('preferences.save', { preferences: prefs }).catch(report)}>Save preferences</Button></section>
    <section className="wb-card"><h2>Detected paths</h2>{Object.entries(data.providerPaths || {}).map(([k, v]) => <div className="wb-row" key={k}><span>{k}</span><code>{v}</code></div>)}
      <p>GUI apps may not inherit shell environment variables. Use the directory overrides above when your tools use a custom location.</p>
      <p>AIOS makes no network requests and does not run discovered tools. It does not change provider sandbox, telemetry, permissions or login settings.</p>
      {data.issues.some(i => i.code === 'LEGACY_DATA') && <Button disabled={busy} onClick={() => void run('legacy.import').catch(report)}>Import legacy disabled data</Button>}
    </section>
  </>;
}
function History({ data, busy, report, edit }) {
  const [history, setHistory] = useState([]), [preview, setPreview] = useState(null), [previewError, setPreviewError] = useState('');
  const restoreTarget = preview && data.resources.find(r => !r.parked && !r.readonly && r.canonicalPath === preview.path && r.kind !== 'mcp');
  useEffect(() => { let active = true; request('history').then(r => { if (active) setHistory(r.history); }).catch(report); return () => { active = false; }; }, [data.syncedAt, report]);
  return <><p>The latest 100 transactions retain private backups. Restoring opens a draft so you can compare it with the current file before saving. Parked resources are restored from their inventory page.</p>
    {!history.length && <Notice>No transactions recorded.</Notice>}
    {history.map(entry => <section className="wb-card" key={entry.id}><h3>{entry.label} <span className="wb-muted">{entry.status}</span></h3><p>{new Date(entry.at).toLocaleString()}</p>
      {entry.files.map(file => <div className="wb-row" key={file.path}><code>{file.path}</code><Button disabled={busy} onClick={async () => { try { setPreviewError(''); setPreview(await request('history.read', { id: entry.id, path: file.path })); } catch (e) { report(e); } }}>Inspect previous version</Button></div>)}
      {entry.moves.map(move => <p className="wb-path" key={move.from}>{move.from} → {move.to}</p>)}
    </section>)}
    {preview && <Dialog title="Previous version" close={() => setPreview(null)} wide><p className="wb-path">{preview.path}</p><textarea className="wb-editor" aria-label="Previous file content" readOnly value={preview.content} />
      {previewError && <Notice error>{previewError}</Notice>}
      {!restoreTarget && <Notice>Draft restoration requires a writable live resource in the inventory. Add the original folder to your scan or restore the parked resource from its inventory page first.</Notice>}
      <Button onClick={async () => { try { await copyText(preview.content); } catch (e) { setPreviewError(e.message); } }}>Copy previous content</Button>
      <Button disabled={!restoreTarget} onClick={() => { setPreview(null); edit(restoreTarget, preview.content); }}>Restore as a draft for review</Button>
    </Dialog>}
  </>;
}
function Statusline({ run, close }) {
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => { let active = true; setPreview(null); setError(''); setConfirmed(false); request('statusline.preview').then(p => { if (active) setPreview(p); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [reload]);
  return <Dialog title="Claude Code statusline" close={() => { if (!busy) close(); }} wide>{error && <Notice error>{error}</Notice>}{preview ? <>
    <p className="wb-path">{preview.scriptPath}</p><p>Install a local statusline showing the model, working directory and context percentage supplied by Claude Code. Both the script and settings are backed up together.</p>
    <details><summary>Current settings</summary><pre>{preview.settings.content || '(no settings file)'}</pre></details>
    <details><summary>Current script</summary><pre>{preview.script.content || '(no script)'}</pre></details>
    <details open><summary>Generated script</summary><pre>{preview.generated}</pre></details>
    <label className="wb-check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Replace the current statusline with this script.</label>
    <Button primary disabled={!confirmed || busy || !!error} onClick={async () => { setBusy(true); try { await run('statusline.install', { settingsRevision: preview.settings.revision, scriptRevision: preview.script.revision }); close(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Install statusline</Button>
  </> : !error && <p>Loading existing files…</p>}{error && <Button disabled={busy} onClick={() => setReload(n => n + 1)}>Reload preview</Button>}</Dialog>;
}

export function Workbench() {
  const [data, setData] = useState(EMPTY), [page, setPage] = useState('dashboard'), [scope, setScope] = useState('all'), [project, setProject] = useState(''), [provider, setProvider] = useState('all');
  const [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [progress, setProgress] = useState(null), [modal, setModal] = useState(null), [status, setStatus] = useState('Loading local inventory…');
  const [operation, setOperation] = useState(null);
  const busyRef = useRef(false), modalRef = useRef(null), searchRef = useRef(null); modalRef.current = modal;
  const settingsDirty = useRef(false);
  const [hasSettingsDraft, setHasSettingsDraft] = useState(false);
  const onSettingsDirty = useCallback(value => { settingsDirty.current = value; setHasSettingsDraft(value); }, []);
  const navigate = key => { if (!settingsDirty.current || key === page || window.confirm('Discard unsaved preference changes?')) { setPage(key); setSearch(''); } };
  const report = useCallback(e => { setError(e.message || String(e)); }, []);
  const run = useCallback(async (op = 'inventory', args = {}) => {
    if (op === 'inventory' && settingsDirty.current) { const e = Error('Save or discard preference changes before syncing.'); report(e); throw e; }
    if (busyRef.current) throw Error('An operation is already in progress.');
    busyRef.current = true; setBusy(true); setOperation(op); setError(''); setProgress(null);
    try { const result = await request(op, args); if (result.resources) setData(result); setStatus(op === 'inventory' ? 'Inventory refreshed from disk' : 'Changes saved to disk'); return result; }
    catch (e) { report(e); setStatus('Operation failed; inspect the message above'); throw e; }
    finally { busyRef.current = false; setBusy(false); setOperation(null); setProgress(null); }
  }, [report]);
  useEffect(() => {
    void run().catch(() => {});
    return window.aios?.onProgress(p => setProgress(p.complete || !busyRef.current ? null : p));
  }, [run]);
  useEffect(() => {
    const seconds = data.preferences.syncInterval; if (!seconds) return;
    const timer = setInterval(() => { if (!busyRef.current && !modalRef.current && !settingsDirty.current) void run().catch(() => {}); }, seconds * 1000); return () => clearInterval(timer);
  }, [data.preferences.syncInterval, run]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.setAttribute('data-theme', data.preferences.theme === 'system' ? media.matches ? 'dark' : 'light' : data.preferences.theme);
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [data.preferences.theme]);
  useEffect(() => { const key = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus(); } }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, []);
  const resources = useMemo(() => data.resources.filter(r => (provider === 'all' || r.provider === provider) && (scope === 'all' || r.scope === scope)
    && (scope !== 'project' || !!project && r.project === project) && (!search || [r.name, r.path, r.provider, r.description].some(s => String(s || '').toLowerCase().includes(search.toLowerCase())))), [data.resources, provider, scope, project, search]);
  const sourceIssues = data.issues.filter(issue => issue.code !== 'LEGACY_DATA');
  const retainedData = data.issues.filter(issue => issue.code === 'LEGACY_DATA');
  const scanLimited = sourceIssues.some(issue => issue.code === 'SCAN_LIMIT');
  const edit = (r, initialDraft) => setModal({ type: 'edit', resource: r, initialDraft });
  const toggle = r => { if (window.confirm(`${r.enabled ? 'Disable' : 'Restore'} ${r.name} in ${r.path}? The provider may require a reload.`)) void run('resource.toggle', { id: r.id, parked: !!r.parked, revision: r.revision, enabled: !r.enabled }).catch(() => {}); };
  const resourceList = items => <div className="wb-list">{!items.length && <Notice>No matching resources found. Choose a scope or add a project folder in Settings.</Notice>}{items.map(r => <article className="wb-resource" key={r.id + (r.parked ? '-parked' : '-live')}>
    <div><button className="wb-resource-name" onClick={() => edit(r)}>{r.name}</button><span className="wb-badge">{r.provider}</span><span className="wb-badge">{r.scope}</span><span className="wb-badge">{r.readonly ? 'Read-only' : r.archived ? 'Archived' : r.enabled ? 'Configured' : 'Disabled'}</span>
      <p className="wb-path">{r.path}</p>{r.description && <p>{r.description}</p>}{r.error && <Notice error>{r.error}</Notice>}
      {r.kind === 'mcp' && <p className="wb-muted">{r.transport || 'Native'} · Runtime connection unknown{r.hasSecrets ? ' · Credential fields present' : ''}</p>}
    </div><div className="wb-resource-actions"><Button disabled={busy || !!r.error && r.readonly} onClick={() => edit(r)}>Inspect / edit</Button>
      {!r.readonly && ['mcp', 'skills', 'commands', 'agents'].includes(r.kind) && <Button disabled={busy} aria-label={`${r.enabled ? 'Disable' : 'Restore'} ${r.name} from ${r.path}`} onClick={() => toggle(r)}>{r.enabled ? 'Disable' : 'Restore'}</Button>}
      {!r.readonly && !['mcp', 'config'].includes(r.kind) && r.enabled && <Button disabled={busy} onClick={() => { if (window.confirm(`Archive ${r.path}? The complete resource will be recoverable.`)) void run('resource.archive', { id: r.id, parked: !!r.parked, revision: r.revision }).catch(() => {}); }}>Archive</Button>}
      {!r.enabled && !['mcp', 'skills', 'commands', 'agents'].includes(r.kind) && <Button disabled={busy} onClick={() => toggle(r)}>Restore</Button>}
      <Button disabled={busy || !!r.error} onClick={() => setModal({ type: 'share', resource: r })}>Export</Button>
    </div></article>)}</div>;
  let screen;
  if (KINDS.includes(page)) screen = <>{page !== 'config' && <div className="wb-actions"><Button primary disabled={busy} onClick={() => setModal({ type: 'create', kind: page })}>New {page === 'mcp' ? 'MCP server' : page}</Button>{page === 'memory' && <span>Instruction files are listed by source; actual precedence is decided by the provider.</span>}</div>}
    {page === 'mcp' && <section className="wb-card"><h2>Saved MCP profiles</h2><p>Capture the current enable/disable state. Applying a saved profile affects its recorded sources across projects; newly discovered servers remain unchanged.</p>
      <Button disabled={busy || data.incomplete} onClick={() => setModal({ type: 'profile' })}>Capture current configuration</Button>{data.profiles.map(p => <div key={p.id} className="wb-row"><span>{p.name} · {p.members.length} sources {data.activeProfile === p.id ? '· last applied' : ''}</span><div className="wb-actions"><Button disabled={busy || data.incomplete} onClick={() => setModal({ type: 'profile-preview', profile: p })}>Review / apply</Button><Button disabled={busy} onClick={() => { if (window.confirm(`Delete profile ${p.name}? Configurations will remain unchanged.`)) void run('profiles.delete', { id: p.id }).catch(() => {}); }}>Delete profile</Button></div></div>)}</section>}
    {page === 'config' && <div className="wb-actions"><Button disabled={busy} onClick={() => setModal({ type: 'statusline' })}>Configure Claude statusline</Button><span>Edit native files with full content, syntax checks and conflict protection.</span></div>}
    {resourceList(resources.filter(r => r.kind === page))}</>;
  else if (page === 'dashboard') screen = <><div className="wb-metrics">{KINDS.map(kind => <button key={kind} className="wb-card" onClick={() => setPage(kind)}><strong>{resources.filter(r => r.kind === kind).length}</strong><span>{PAGES.find(p => p[0] === kind)[1]}</span></button>)}</div>
    <section className="wb-card"><h2>Your machine’s configuration</h2><p>AIOS discovers native tool files and lets you inspect, edit, disable and restore them. Every listed resource belongs to a specific provider and source path.</p><p>{data.syncedAt ? `Last scan: ${new Date(data.syncedAt).toLocaleString()}` : 'Waiting for the first scan.'}</p><p>{data.roots.length} scan folders · {data.projects.length} discovered projects · {sourceIssues.length} reported source issues</p><Button onClick={() => setPage('settings')}>Manage scan folders</Button></section>
    {!!sourceIssues.length && <section className="wb-card"><h2>Discovery issues</h2>{sourceIssues.map((i, n) => <Notice key={n} error><strong>{i.code}</strong> · {i.message}<p className="wb-path">{i.path}</p></Notice>)}</section>}
    {!!retainedData.length && <section className="wb-card"><h2>Older AIOS data available</h2>{retainedData.map((i, n) => <Notice key={n}>{i.message}<p className="wb-path">{i.path}</p></Notice>)}<Button onClick={() => navigate('settings')}>Review import options</Button></section>}
    {data.supportNotes?.map(note => <p key={note} className="wb-muted">{note}</p>)}
    <section className="wb-card"><h2>Provider support and precedence</h2>{data.providers?.map(p => <details key={p.name}><summary>{p.name}</summary><p>{p.formats}</p><p>{p.scopes}</p><p>{p.precedence}</p><p className="wb-muted">{p.limitations}</p></details>)}</section></>;
  else if (page === 'settings') screen = <Settings data={data} run={run} busy={busy} report={report} onDirty={onSettingsDirty} />;
  else if (page === 'history') screen = <History data={data} run={run} busy={busy} report={report} edit={edit} />;
  else if (page === 'security') screen = <><Notice>Configuration review only. AIOS cannot verify a server’s behavior or enforce a provider sandbox. Credential presence and source permissions below are direct observations; they are not a safety score.</Notice>
    {resourceList(resources.filter(r => r.kind === 'mcp'))}<section className="wb-card"><h2>File permissions</h2>{resources.filter(r => r.kind !== 'mcp').map(r => <div className="wb-row" key={r.id + (r.parked ? '-parked' : '-live')}><code>{r.path}{r.parked ? ' (parked copy)' : ''}</code><span>{r.mode != null ? '0' + r.mode.toString(8) : 'Unavailable'}{r.mode & 0o022 ? ' · writable by group/others' : ''}</span></div>)}</section></>;
  else if (page === 'tokens') { const estimate = contextEstimate(resources); screen = <><section className="wb-card"><h2>{estimate.tokens.toLocaleString()} estimated text tokens</h2><p>Character count ÷ 4, rounded up per file. {estimate.files.length} distinct readable files; files shared by providers are counted once. This measures selected files, not actual model usage, billing or startup context. Providers load different subsets depending on the task, project and trust settings. MCP schemas and remote resources are not measured.</p></section>{resourceList(estimate.files)}</>; }
  else if (page === 'prompts') screen = <><Button primary onClick={() => setModal({ type: 'prompt' })}>New prompt</Button>{!data.prompts.length && <Notice>Your local prompt library is empty.</Notice>}{data.prompts.filter(p => !search || (p.name + p.content).toLowerCase().includes(search.toLowerCase())).map(p => <section className="wb-card" key={p.id}><h2>{p.name}{p.favorite ? ' ★' : ''}</h2><p className="wb-preview">{p.content}</p><div className="wb-actions"><Button onClick={() => setModal({ type: 'prompt', prompt: p })}>Edit / use</Button><Button disabled={busy} onClick={() => { if (window.confirm(`Delete prompt ${p.name}?`)) void run('prompts.delete', { id: p.id }).catch(() => {}); }}>Delete prompt</Button></div></section>)}</>;
  else if (page === 'tools') screen = <Tools report={report} />;
  else screen = <section className="wb-card wb-guide"><h2>Get started with your own configuration</h2><ol><li>Open Settings and review the detected provider directories. Custom shell locations can be entered as overrides.</li><li>Add your project folder. Use Sync to scan it and inspect any reported errors.</li><li>Choose User or Project in the top bar. Each row shows the exact file and provider it belongs to.</li><li>Inspect a resource to load its complete text. Review both versions before saving. If another program changes the file, reload and reconcile your draft.</li><li>Disable a resource to park it safely, and Restore to return it to its original source. Reload the provider if necessary.</li><li>Use History to inspect the protected pre-edit backups. Export only text you have reviewed for secrets.</li></ol><h3>Supported responsibilities</h3><p>AIOS manages local configuration. Provider runtime controls, remote tool health, AI skill evaluations, automatic memory rewriting and file conversion are not implemented. Those prototype controls have been removed to avoid reporting actions that did not occur.</p></section>;
  return <div className="wb-app"><aside className="wb-sidebar"><div className="wb-brand"><span className="brand-mark" /> <div>AI Tools OS<small>Local configuration manager</small></div></div><nav aria-label="Main navigation">{PAGES.map(([key, title, icon]) => <button key={key} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon name={icon} size={17} /><span>{title}</span>{KINDS.includes(key) && <small>{resources.filter(r => r.kind === key).length}</small>}</button>)}</nav><p className="wb-sidebar-note">Your files. Your machine.<br />No cloud account required.</p></aside>
    <header className="wb-topbar"><label>Scope<select aria-label="Scope" value={scope} onChange={e => setScope(e.target.value)}><option value="all">All sources</option><option value="user">User</option><option value="project">Project</option><option value="managed">Managed</option></select></label>
      {scope === 'project' && <select aria-label="Project" value={project} onChange={e => setProject(e.target.value)}><option value="">Select project</option>{data.projects.map(p => <option key={p}>{p}</option>)}</select>}
      <select aria-label="Provider" value={provider} onChange={e => setProvider(e.target.value)}><option value="all">All providers</option>{['Claude Code', 'Codex', 'Cursor'].map(p => <option key={p}>{p}</option>)}</select>
      <input ref={searchRef} aria-label="Search resources" placeholder="Search names and paths… ⌘K" value={search} onChange={e => setSearch(e.target.value)} />
      <Button disabled={busy || hasSettingsDraft} onClick={() => void run().catch(() => {})}>{busy ? 'Working…' : 'Sync'}</Button>{busy && operation === 'inventory' && <Button onClick={() => void window.aios?.cancelScan().then(result => { if (!result.ok) report(Error(result.error)); }).catch(report)}>Cancel scan</Button>}
    </header><main className="wb-main"><div className="wb-page-title"><div><small>YOUR AI WORKSPACE</small><h1>{PAGES.find(p => p[0] === page)?.[1]}</h1></div><span className="wb-badge">{provider === 'all' ? 'All providers' : provider}</span></div>
      {busy && operation === 'inventory' && <Notice>Scanning local files. If macOS asks for access to a scan folder, respond to that prompt to continue. Cancellation takes effect after the current file operation returns.</Notice>}
      {error && <Notice error>{error}<Button onClick={() => setError('')}>Dismiss message</Button></Notice>}{data.incomplete && <Notice error>{scanLimited ? 'Scan stopped before checking every folder. Review scan limits in Overview; select narrower folders or add exclusions.' : `Scan finished with ${sourceIssues.length} source ${sourceIssues.length === 1 ? 'issue' : 'issues'}. Valid resources are available. Review the affected files in Overview.`}{page !== 'dashboard' && <Button onClick={() => navigate('dashboard')}>Review source issues</Button>}</Notice>}{!data.incomplete && page !== 'dashboard' && sourceIssues.length > 0 && <Notice>{sourceIssues.length} discovery issues need review. <Button onClick={() => navigate('dashboard')}>Review source issues</Button></Notice>}{screen}</main>
    <footer className="wb-status" role="status"><span>{progress ? `Scanning ${progress.entries || 0} entries…` : status}</span><span>{data.syncedAt ? new Date(data.syncedAt).toLocaleTimeString() : 'No completed scan'} · {resources.length} matching resources</span></footer>
    {modal?.type === 'edit' && <Editor key={modal.resource.id + (modal.resource.parked ? '-parked' : '-live')} resource={modal.resource} initialDraft={modal.initialDraft} run={run} close={() => setModal(null)} openSource={id => { const r = data.resources.find(r => r.id === id && !r.parked); if (r) edit(r); else report(Error('Source is unavailable. Restore the MCP entry first.')); }} />}
    {modal?.type === 'create' && <CreateResource kind={modal.kind} data={data} scope={scope} project={project} run={run} close={() => setModal(null)} />}
    {modal?.type === 'share' && <ShareResource resource={modal.resource} close={() => setModal(null)} />}
    {modal?.type === 'prompt' && <PromptEditor prompt={modal.prompt} run={run} close={() => setModal(null)} />}
    {modal?.type === 'profile' && <ProfileDialog run={run} close={() => setModal(null)} />}
    {modal?.type === 'profile-preview' && <ProfilePreview profile={modal.profile} run={run} close={() => setModal(null)} />}
    {modal?.type === 'statusline' && <Statusline run={run} report={report} close={() => setModal(null)} />}
  </div>;
}
function ProfileDialog({ run, close }) {
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  return <Dialog title="Capture MCP profile" close={() => { if (!busy) close(); }}><Field label="Profile name"><input value={name} onChange={e => setName(e.target.value)} /></Field><p>This captures actual configured and disabled states for all writable MCP sources currently discovered.</p>{error && <Notice error>{error}</Notice>}<Button primary disabled={!name || busy} onClick={async () => { setBusy(true); try { await run('profiles.capture', { name }); close(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Capture profile</Button></Dialog>;
}
function ProfilePreview({ profile, run, close }) {
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true; setPreview(null); setError('');
    request('profiles.preview', { id: profile.id }).then(p => { if (active) setPreview(p); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [profile.id, reload]);
  return <Dialog title={`Review profile: ${profile.name}`} close={() => { if (!busy) close(); }} wide>
    <p>Review the recorded sources below. Applying rechecks their revisions and changes only their enable/disable state. Runtime connections are not controlled.</p>
    {error && <Notice error>{error}</Notice>}{!preview && !error && <p role="status">Reading current configuration…</p>}
    {preview && <><p>{preview.changes.length} changes across {preview.sources.length} recorded sources.</p>
      {preview.sources.map(s => <section className="wb-card" key={s.id}><strong>{s.name} · {s.provider}</strong><p className="wb-path">{s.path}</p><p>{s.from === s.to ? 'No change' : s.to ? 'Restore / enable' : 'Disable'} · {s.scope}{s.project ? ` · ${s.project}` : ''}</p></section>)}
      <Button primary disabled={busy || !!error} onClick={async () => { setBusy(true); try { await run('profiles.apply', { id: profile.id, previewRevision: preview.previewRevision }); close(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Apply reviewed profile</Button>
    </>}
    <Button disabled={busy} onClick={() => setReload(k => k + 1)}>Refresh preview</Button>
  </Dialog>;
}
function Tools({ report }) {
  const [tools, setTools] = useState(null);
  useEffect(() => { let active = true; request('tools.detect').then(r => { if (active) setTools(r.tools); }).catch(report); return () => { active = false; }; }, [report]);
  return <><Notice>Executable detection only. AIOS does not install, execute or convert files with external tools. Version and runtime health are unknown until checked with the tool itself.</Notice>{tools ? tools.map(tool => <section className="wb-card" key={tool.name}><h2>{tool.name}</h2><p>{tool.path ? 'Executable found' : 'Not found in searched locations'}</p>{tool.path && <code>{tool.path}</code>}</section>) : <p>Checking executable locations…</p>}</>;
}
