import React, { useState } from 'react';
import { request } from './api.js';
import { Button, Notice, Field, Dialog } from './workbench-ui.jsx';

const projects = data => [...new Set([...data.projects, ...data.roots])];
export function TransferDialog({ resource, data, run, close }) {
  const [form, setForm] = useState({ id: resource.id, parked: !!resource.parked, revision: resource.revision, mode: 'copy', provider: resource.provider,
    scope: resource.scope === 'user' ? 'project' : 'user', project: resource.project || '', name: !['mcp', 'plugins', 'skills'].includes(resource.kind) && resource.name === resource.path.split('/').at(-1) ? resource.name.replace(/\.(md|toml)$/, '') : resource.name });
  const [preview, setPreview] = useState(null), [reviewed, setReviewed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = (key, value) => { setForm(f => ({ ...f, [key]: value, ...(key === 'provider' && value !== 'Claude Code' && f.scope === 'local' ? { scope: 'project' } : {}) })); setPreview(null); setReviewed(false); setError(''); };
  const operation = async apply => {
    setBusy(true); setError('');
    try {
      if (apply) { await run('transfer.apply', { ...form, previewRevision: preview.previewRevision }); close(); }
      else { setPreview(await request('transfer.preview', form)); setReviewed(false); }
    } catch (e) { setError(e.message); setPreview(null); } finally { setBusy(false); }
  };
  return <Dialog title={`Copy or move ${resource.kind === 'plugins' ? 'plugin reference' : 'resource'}`} close={() => { if (!busy) close(); }} wide>
    <p><strong>{resource.name}</strong> · {resource.provider}<br /><span className="wb-path">{resource.path}</span></p>
    <div className="wb-form-grid"><Field label="Transfer action"><select disabled={busy} value={form.mode} onChange={e => update('mode', e.target.value)}><option value="copy">Copy — keep the source</option><option value="move">Move — remove the source after transfer</option></select></Field>
      <Field label="Destination provider"><select disabled={busy} value={form.provider} onChange={e => update('provider', e.target.value)}>{(resource.kind === 'plugins' ? [resource.provider] : ['Claude Code', 'Codex', 'Cursor']).map(p => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Destination scope"><select disabled={busy} value={form.scope} onChange={e => update('scope', e.target.value)}><option value="user">User — all projects</option><option value="project">Project — shared files</option>{form.provider === 'Claude Code' && ['mcp', 'plugins'].includes(resource.kind) && <option value="local">Local — private to one project</option>}</select></Field>
      {form.scope !== 'user' && <Field label="Destination project"><select disabled={busy} value={form.project} onChange={e => update('project', e.target.value)}><option value="">Select a project</option>{projects(data).map(p => <option key={p}>{p}</option>)}</select></Field>}
      <Field label={resource.kind === 'plugins' ? 'Plugin identity' : 'Destination name'}><input disabled={busy || resource.kind === 'plugins'} value={form.name} onChange={e => update('name', e.target.value)} /></Field></div>
    {error && <Notice error>{error}</Notice>}
    <Button disabled={busy || !form.name || form.scope !== 'user' && !form.project} onClick={() => void operation(false)}>Review transfer</Button>
    {preview && <section className="wb-card"><h3>{preview.mode === 'copy' ? 'Copy' : 'Move'} to {preview.destination.provider}</h3><p className="wb-path">{preview.destination.path}</p><p>{preview.files} files · {preview.enabled ? 'Keeps enabled state' : 'Stays disabled'}{preview.converted ? ' · Native format conversion' : ''}</p>
      {preview.warnings.map(w => <p key={w}>{w}</p>)}
      {preview.convertedContent !== undefined && <Field label="Converted resource preview"><textarea className="wb-editor" readOnly value={preview.convertedContent} /></Field>}
      <label className="wb-check"><input disabled={busy} type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />I reviewed the destination, sharing scope and compatibility notes.</label>
      <Button primary disabled={busy || !reviewed} onClick={() => void operation(true)}>Apply transfer</Button>
    </section>}
  </Dialog>;
}

export function McpBatchDialog({ resources, enabled, run, close }) {
  const [selected, setSelected] = useState(() => new Set(resources.map(r => r.id))), [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const args = { enabled, sources: resources.filter(r => selected.has(r.id)).map(r => ({ id: r.id, parked: !!r.parked, revision: r.revision })) };
  const act = async apply => {
    setBusy(true); setError('');
    try { if (apply) { await run('mcp.batch.apply', { ...args, previewRevision: preview.previewRevision }); close(); } else setPreview(await request('mcp.batch.preview', args)); }
    catch (e) { setError(e.message); setPreview(null); } finally { setBusy(false); }
  };
  return <Dialog title={`${enabled ? 'Enable' : 'Disable'} selected MCP sources`} close={() => { if (!busy) close(); }} wide>
    <p>These are the sources matching your current filters. User definitions affect all projects. A same-named server in another scope or a plugin may still load; use Project access for a Claude or Codex project-specific override.</p>
    {resources.map(r => <label key={r.id} className="wb-card wb-check"><input disabled={busy} type="checkbox" checked={selected.has(r.id)} onChange={e => { const next = new Set(selected); if (e.target.checked) next.add(r.id); else next.delete(r.id); setSelected(next); setPreview(null); }} /><span><strong>{r.name} · {r.provider} · {r.nativeScope || r.scope}</strong><span className="wb-path">{r.path}</span></span></label>)}
    {error && <Notice error>{error}</Notice>}<Button disabled={busy || !selected.size} onClick={() => void act(false)}>Review selected sources</Button>
    {preview && <section className="wb-card"><p>{preview.sources.filter(s => s.from !== s.to).length} changes across {preview.sources.length} selected sources. Restart or reload the provider after applying; AIOS does not disconnect an already-running session.</p><Button primary disabled={busy} onClick={() => void act(true)}>Apply MCP changes</Button></section>}
  </Dialog>;
}

export function McpProjectDialog({ resource, data, project: currentProject, run, close }) {
  const [project, setProject] = useState(currentProject || resource.project || ''), [action, setAction] = useState('disable');
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const args = { id: resource.id, parked: !!resource.parked, project, action };
  const act = async apply => {
    setBusy(true); setError('');
    try { if (apply) { await run('mcp.project.apply', { ...args, previewRevision: preview.previewRevision }); close(); } else setPreview(await request('mcp.project.preview', args)); }
    catch (e) { setError(e.message); setPreview(null); } finally { setBusy(false); }
  };
  return <Dialog title={`Project access: ${resource.name}`} close={() => { if (!busy) close(); }} wide>
    <p>{resource.provider} · Control this MCP name in one project while keeping its user configuration.</p>
    {resource.provider === 'Cursor' ? <Notice>Cursor keeps project-only toggles in its application state. In Cursor, open Customize and toggle this MCP for your workspace. AIOS can copy or move its native definition into a project, or disable its selected user/project definition. It does not modify Cursor’s private settings database.</Notice> : <>
      <Field label="Target project"><select disabled={busy} value={project} onChange={e => { setProject(e.target.value); setPreview(null); }}><option value="">Select a project</option>{projects(data).map(p => <option key={p}>{p}</option>)}</select></Field>
      <Field label="Project MCP access"><select disabled={busy} value={action} onChange={e => { setAction(e.target.value); setPreview(null); }}><option value="disable">Disable in this project</option><option value="enable">{resource.provider === 'Claude Code' ? 'Remove project opt-out' : 'Enable in this project'}</option>{resource.provider === 'Codex' && <option value="inherit">Inherit from other config layers</option>}</select></Field>
      {error && <Notice error>{error}</Notice>}<Button disabled={busy || !project} onClick={() => void act(false)}>Review project access</Button>
      {preview && <section className="wb-card"><p>Current project setting: {preview.from}</p><p className="wb-path">{preview.path}</p><p>{preview.note}</p><p>Start a new session or reload the provider to use the changed configuration.</p><Button primary disabled={busy} onClick={() => void act(true)}>Apply project access</Button></section>}
    </>}
  </Dialog>;
}
