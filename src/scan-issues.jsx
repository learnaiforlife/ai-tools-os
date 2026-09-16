import React, { useMemo, useState } from 'react';
import { Button, Field, Notice } from './workbench-ui.jsx';

const within = (path, root) => !!root && (path === root || path.startsWith(root.replace(/\/$/, '') + '/'));
const category = issue => issue.disposition || (['SCAN_LIMIT', 'SCAN_TIMEOUT'].includes(issue.code) ? 'limited' : issue.severity === 'warning' ? 'review' : 'skipped');
const labels = { skipped: 'Skipped paths', review: 'Files to review', limited: 'Scan limits' };
const titles = { ENOENT: 'Missing paths or broken links', ELOOP: 'Symbolic-link loops', EACCES: 'Restricted access', EPERM: 'Restricted access',
  ENOTDIR: 'Folder replaced or unavailable', NOT_FOUND: 'Missing scan folders', SYMLINK_BOUNDARY: 'Links outside selected folders',
  FRONTMATTER_INVALID: 'Invalid resource headers', METADATA_INVALID: 'Invalid resource metadata', PARSE_ERROR: 'Invalid configuration',
  MCP_INVALID: 'Invalid MCP entries', TOO_LARGE: 'Files over the size limit', ENCODING: 'Unsupported text encoding', NOT_FILE: 'Not a regular file', SCAN_LIMIT: 'Folder or depth limits', SCAN_TIMEOUT: 'Processing time limits' };

function IssueGroup({ group, edit, busy, showDetails }) {
  const [limit, setLimit] = useState(30);
  return <details className="wb-card scan-issue-group" open={showDetails || undefined}>
    <summary><strong>{titles[group.code] || group.code}</strong><span className="wb-badge">{labels[group.category]} · {group.items.length}</span></summary>
    <p>{group.message}</p><p className="wb-muted">{group.category === 'review' ? 'The source text is available for inspection. AIOS has not changed it.' : 'Omitted from this scan. Sync retries these paths; no source files were changed.'}</p>
    {group.items.slice(0, limit).map((item, index) => <div className="scan-issue-path" key={`${item.path}:${index}`}><code>{item.path}</code>{item.resource && <Button disabled={busy} onClick={() => edit(item.resource)}>Review file</Button>}</div>)}
    {group.items.length > limit && <Button onClick={() => setLimit(n => n + 30)}>Show more paths ({group.items.length - limit} remaining)</Button>}
    <small className="wb-muted">Diagnostic code: {group.code}</small>
  </details>;
}

export function ScanIssues({ data, edit, busy, retry, settings, search, provider, scope, project, showDetails }) {
  const [filter, setFilter] = useState('all');
  const issues = useMemo(() => data.issues.filter(i => i.code !== 'LEGACY_DATA').map(issue => {
    const resource = data.resources.find(r => r.path === issue.path && r.kind !== 'mcp' && r.kind !== 'plugins' && !!r.revision);
    const native = Object.entries(data.providerPaths || {}).find(([, path]) => within(issue.path, path));
    const inferredProvider = native ? ({ claude: 'Claude Code', claudeJson: 'Claude Code', codex: 'Codex', shared: 'Codex', cursor: 'Cursor' })[native[0]]
      : /\/\.claude(?:\/|$)|\/(?:CLAUDE(?:\.local)?\.md|\.mcp\.json)$/.test(issue.path) ? 'Claude Code'
        : /\/\.(?:codex|agents)(?:\/|$)/.test(issue.path) ? 'Codex' : /\/\.cursor(?:\/|$)/.test(issue.path) ? 'Cursor' : null;
    return { ...issue, resource, provider: resource?.provider || inferredProvider, scope: resource?.scope || (native ? 'user' : 'project'),
      project: resource?.project || [...data.projects].sort((a, b) => b.length - a.length).find(root => within(issue.path, root)), category: category(issue) };
  }).filter(i => (provider === 'all' || i.provider === provider)
    && (scope === 'all' || scope === 'folder' ? scope !== 'folder' || within(i.path, project) : i.scope === scope)
    && (scope !== 'project' || !project || i.project === project || within(i.path, project))
    && (!search || [i.path, i.message, i.code].some(s => s.toLowerCase().includes(search.toLowerCase())))), [data, provider, scope, project, search]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const i of issues.filter(i => filter === 'all' || i.category === filter)) {
      const key = JSON.stringify([i.category, i.code, i.message]);
      if (!map.has(key)) map.set(key, { key, category: i.category, code: i.code, message: i.message, items: [] });
      map.get(key).items.push(i);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [issues, filter]);
  return <div className="scan-report"><section className="wb-card"><h2>{!data.syncedAt ? 'Waiting for scan results' : data.scan?.limited ? 'Scan finished with coverage limits' : 'Scan completed'}</h2>
    <p>Healthy resources are available. Skipped paths and files that need review are listed here; they do not block work on other files.</p>
    <p className="wb-muted">{data.scan?.healthy ?? data.resources.filter(r => !r.error).length} healthy resources · {data.scan?.skipped ?? 0} skipped-path notices · {data.scan?.warnings ?? 0} file warnings · {data.scan?.limited ?? 0} coverage limits</p>
    <div className="wb-actions"><Button disabled={busy} onClick={retry}>Retry scan</Button><Button onClick={settings}>Manage scan folders</Button></div>
    {data.scan?.limited > 0 && <Notice>Some descendants were not checked. Other scan locations continued. Select a narrower folder or configure exclusions in Settings to inspect the remaining files.</Notice>}
  </section><div className="library-toolbar"><span>{issues.length} notices match your scope and search</span><Field label="Notice type"><select aria-label="Scan notice type" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All notices</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label} ({issues.filter(i => i.category === value).length})</option>)}</select></Field></div>
    {!groups.length && <div className="empty-state"><h2>No notices in this view</h2><p>Try another filter, or keep working with your resources.</p></div>}
    {groups.map(group => <IssueGroup key={group.key} group={group} busy={busy} edit={edit} showDetails={showDetails} />)}
  </div>;
}
