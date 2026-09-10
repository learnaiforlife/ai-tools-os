import * as fs from 'node:fs';
import { basename, dirname, join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { canonical, exists, inside, readText, hash, fail } from './storage.mjs';
import { frontmatter, parseConfig, validateMcp } from './formats.mjs';
import { PROVIDERS } from './providers.mjs';

export const resourceId = (provider, kind, path, key = []) => hash(JSON.stringify([provider, kind, canonical(path), key]));
export const DEFAULT_PREFS = { theme: 'dark', syncInterval: 0, exclusions: [], providerPaths: {} };
const SKIP = new Set(['node_modules', '.git', '.aios', 'dist', 'build', 'release', '.next', '.venv', 'venv', 'Library', 'Applications', '.cache']);
const PROVIDER_DIRS = new Set(['.claude', '.codex', '.agents', '.cursor']);
const MARKERS = new Set([...PROVIDER_DIRS, '.mcp.json', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', 'AGENTS.override.md', '.cursorrules']);
export function providerPaths(home, env, prefs) {
  const expand = value => {
    if (typeof value !== 'string' || !value) fail('INVALID', 'Provider path is empty.');
    const path = value.replace(/^~(?=\/|$)/, home);
    if (!isAbsolute(path)) fail('INVALID', 'Provider paths must be absolute.');
    return resolve(path);
  };
  const claudeOverride = prefs.providerPaths?.claude || env.CLAUDE_CONFIG_DIR;
  const claude = expand(claudeOverride || join(home, '.claude'));
  const codex = expand(prefs.providerPaths?.codex || env.CODEX_HOME || join(home, '.codex'));
  return { claude, codex, cursor: join(home, '.cursor'), shared: join(home, '.agents'),
    claudeJson: claudeOverride ? join(claude, '.claude.json') : join(home, '.claude.json') };
}

export function discover({ home = homedir(), env = process.env, roots = [], prefs = DEFAULT_PREFS, parked = {}, managedRoots,
  progress = () => {}, canceled = () => false, maxEntries = 50000, maxMs = 15000 }) {
  const dirs = providerPaths(home, env, prefs);
  const managed = managedRoots ?? ['/Library/Application Support/ClaudeCode'];
  const resources = [], issues = [], projects = new Set(), known = new Map();
  let entries = 0, passEntries = 0, incomplete = false;
  const start = Date.now();
  const issue = (path, error, code = 'SOURCE_ERROR') => { incomplete = true; issues.push({ path, code, message: error }); };
  const canonicalRoots = paths => paths.flatMap(path => { try { return [canonical(path)]; } catch (e) { issue(path, 'Cannot resolve the configured folder.', e.code); return []; } });
  const nativeRoots = canonicalRoots(Object.values(dirs).filter(p => p !== dirs.claudeJson));
  const allowedRoots = [...nativeRoots, ...canonicalRoots(roots)];
  const managedCanonical = canonicalRoots(managed);
  const allowedParent = canonicalRoots([dirname(dirs.claudeJson)])[0];
  const allowedFile = allowedParent ? join(allowedParent, basename(dirs.claudeJson)) : null;
  const check = (path, cost = 1) => {
    if (canceled()) fail('CANCELED', 'Scan canceled. Previous inventory remains available.');
    if (++entries % 100 === 0) progress({ entries, path });
    passEntries += cost;
    if (passEntries > maxEntries || Date.now() - start > maxMs) fail('SCAN_LIMIT', 'Scan limit reached. Add a narrower folder or configure exclusions.');
  };
  function attempt(path, fn) {
    try { return fn(); }
    catch (e) {
      if (['SCAN_LIMIT', 'CANCELED'].includes(e.code)) throw e;
      issue(path, e.code === 'EACCES' || e.code === 'EPERM' ? 'Permission denied. Grant access in macOS Privacy settings.' : e.message, e.code || 'SOURCE_ERROR');
    }
  }
  function pass(path, fn) {
    passEntries = 0;
    try { fn(); } catch (e) { if (e.code === 'CANCELED') throw e; issue(path, e.message, e.code); }
  }
  function add(path, kind, provider, project = null, extras = {}) {
    const scope = extras.managed ? 'managed' : project ? 'project' : 'user';
    try {
      if (!exists(path)) return;
      check(path);
      const real = canonical(path);
      const authorized = real === allowedFile || allowedRoots.some(r => inside(real, r)) || (extras.managed && managedCanonical.some(r => inside(real, r)));
      const base = { id: resourceId(provider, kind, path), kind, provider, scope, project, path, name: basename(path),
        enabled: true, effective: 'Provider decides precedence and project trust', canonicalPath: real,
        readonly: !!extras.managed || !authorized, symlink: real !== path, ...extras };
      if (!authorized) {
        resources.push({ ...base, error: 'Symbolic link target is outside selected folders. Add its folder explicitly to allow access.' });
        issue(path, base.error || 'Symbolic link target is outside selected folders.', 'SYMLINK_BOUNDARY'); return;
      }
      const file = readText(real);
      const item = { ...base, revision: file.revision, bytes: Buffer.byteLength(file.content), mode: file.mode,
        estimatedTokens: Math.ceil(file.content.length / 4), modifiedAt: fs.statSync(real).mtime.toISOString() };
      // Deduplicate aliases of the same native source, while retaining provider identity.
      const dedupe = `${provider}:${kind}:${real}`;
      if (known.has(dedupe)) return;
      known.set(dedupe, item); resources.push(item);
      if (project) projects.add(project);
      if (kind === 'memory' && !path.endsWith('.mdc')) item.syntax = 'plain-text';
      if (['skills', 'commands', 'agents', 'memory'].includes(kind) && (kind !== 'memory' || path.endsWith('.mdc'))) {
        try {
          const { metadata } = frontmatter(file.content);
          item.name = typeof metadata.name === 'string' ? metadata.name : kind === 'skills' ? basename(dirname(path)) : basename(path);
          item.description = typeof metadata.description === 'string' ? metadata.description : '';
          item.syntax = 'parsed';
        } catch { item.error = 'Invalid YAML frontmatter'; issue(path, item.error, 'PARSE_ERROR'); }
      }
      if (kind === 'config') {
        try {
          const obj = parseConfig(file.content, path); item.syntax = 'parsed';
          const groups = extras.mcp ? [{ key: [extras.mcp], obj: obj[extras.mcp], project }] : [];
          if (path === dirs.claudeJson) for (const [projectPath, config] of Object.entries(obj.projects || {})) {
            if (isAbsolute(projectPath)) groups.push({ key: ['projects', projectPath, 'mcpServers'], obj: config?.mcpServers, project: projectPath });
          }
          for (const group of groups) {
            if (!group.obj) continue;
            if (typeof group.obj !== 'object' || Array.isArray(group.obj)) { issue(path, 'MCP server collection is not an object.', 'PARSE_ERROR'); continue; }
            if (group.project) projects.add(group.project);
            for (const [name, cfg] of Object.entries(group.obj)) {
              if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) { issue(path, `Invalid MCP entry: ${name}`, 'PARSE_ERROR'); continue; }
              const key = [...group.key, name];
              const server = { ...item, id: resourceId(provider, 'mcp', path, key), kind: 'mcp', sourceId: item.id, name, key,
                project: group.project, scope: extras.managed ? 'managed' : group.project ? 'project' : scope,
                enabled: provider === 'Codex' ? cfg.enabled !== false : true, transport: cfg.url ? 'http' : 'stdio',
                hasSecrets: !!(cfg.env && Object.keys(cfg.env).length || cfg.headers && Object.keys(cfg.headers).length || cfg.http_headers && Object.keys(cfg.http_headers).length || cfg.env_http_headers && Object.keys(cfg.env_http_headers).length || cfg.bearer_token || cfg.bearer_token_env_var),
                runtime: 'unknown', estimatedTokens: null, description: 'Native configuration; runtime connection is not monitored.' };
              try { validateMcp(cfg); } catch (e) { server.error = e.message; issue(path, `MCP ${name}: ${e.message}`, 'MCP_INVALID'); }
              resources.push(server);
            }
          }
        } catch (e) { item.error = e.message; issue(path, e.message, 'PARSE_ERROR'); }
      }
    } catch (e) { if (['SCAN_LIMIT', 'CANCELED'].includes(e.code)) throw e; issue(path, e.code === 'EACCES' ? 'Permission denied. Grant access in macOS Privacy settings.' : e.message, e.code); }
  }
  function files(root, visit, depth = 0, seen = new Set()) {
    attempt(root, () => {
      if (!exists(root)) return;
      const real = canonical(root);
      if (!allowedRoots.some(r => inside(real, r))) { issue(root, 'Symbolic link target is outside selected folders.', 'SYMLINK_BOUNDARY'); return; }
      if (seen.has(real)) return; seen.add(real);
      if (depth > 16) { incomplete = true; issue(root, 'Depth limit reached; add this folder as a scan root.', 'SCAN_LIMIT'); return; }
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        check(root);
        if (SKIP.has(entry.name) || prefs.exclusions?.includes(entry.name)) continue;
        const path = join(root, entry.name);
        attempt(path, () => {
          const st = entry.isSymbolicLink() ? fs.statSync(path) : entry;
          if (st.isDirectory()) files(path, visit, depth + 1, seen);
          else if (st.isFile()) visit(path);
        });
      }
    });
  }
  function provider(base, name, project, skillsOnly = false) {
    if (!skillsOnly && name === 'Claude Code') {
      for (const file of ['settings.json', 'settings.local.json']) add(join(base, file), 'config', name, project);
      for (const file of ['CLAUDE.md', 'CLAUDE.local.md']) add(join(base, file), 'memory', name, project);
      add(join(base, 'statusline.sh'), 'scripts', name, project);
      files(join(base, 'commands'), p => { if (p.endsWith('.md')) add(p, 'commands', name, project); });
      files(join(base, 'agents'), p => { if (p.endsWith('.md')) add(p, 'agents', name, project); });
    } else if (!skillsOnly && name === 'Codex') {
      add(join(base, 'config.toml'), 'config', name, project, { mcp: 'mcp_servers' });
      for (const file of ['AGENTS.md', 'AGENTS.override.md']) add(join(base, file), 'memory', name, project);
    } else if (!skillsOnly && name === 'Cursor') {
      add(join(base, 'mcp.json'), 'config', name, project, { mcp: 'mcpServers' });
      if (project) files(join(base, 'rules'), p => { if (p.endsWith('.mdc')) add(p, 'memory', name, project); });
    }
    // Native skill roots only: do not traverse cache, template or plugin folders.
    const skillRoot = join(base, 'skills');
    attempt(skillRoot, () => {
      if (exists(skillRoot)) for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
        check(skillRoot);
        if (!entry.name.startsWith('.') && (entry.isDirectory() || entry.isSymbolicLink())) add(join(skillRoot, entry.name, 'SKILL.md'), 'skills', name, project);
      }
    });
  }
  const visitedProjects = new Set();
  function project(root) {
    const real = canonical(root);
    if (visitedProjects.has(real) || nativeRoots.some(r => inside(real, r)) || inside(real, canonical(join(home, '.aios')))) return;
    visitedProjects.add(real);
    provider(join(root, '.claude'), 'Claude Code', root);
    provider(join(root, '.codex'), 'Codex', root);
    provider(join(root, '.agents'), 'Codex', root, true);
    provider(join(root, '.cursor'), 'Cursor', root);
    add(join(root, '.mcp.json'), 'config', 'Claude Code', root, { mcp: 'mcpServers' });
    for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) add(join(root, name), 'memory', 'Claude Code', root);
    for (const name of ['AGENTS.md', 'AGENTS.override.md']) add(join(root, name), 'memory', 'Codex', root);
    add(join(root, 'AGENTS.md'), 'memory', 'Cursor', root);
    add(join(root, '.cursorrules'), 'memory', 'Cursor', root);
  }
  // Project indexing inspects directory entries, never provider caches or skill
  // support trees. Resource adapters alone enumerate native provider folders.
  const indexed = new Set();
  function index(root, depth = 0) {
    attempt(root, () => {
      if (!exists(root)) { issue(root, 'Selected folder no longer exists.', 'NOT_FOUND'); return; }
      const real = canonical(root);
      if (indexed.has(real)) return;
      if (!allowedRoots.some(r => inside(real, r))) { issue(root, 'Symbolic link target is outside selected folders.', 'SYMLINK_BOUNDARY'); return; }
      if (nativeRoots.some(r => inside(real, r)) || inside(real, canonical(join(home, '.aios')))) return;
      if (depth > 16) { issue(root, 'Depth limit reached; select this folder directly.', 'SCAN_LIMIT'); return; }
      indexed.add(real);
      const directory = fs.opendirSync(root);
      try {
        let entry;
        while ((entry = directory.readSync())) {
          // Ordinary files require no stat/content read. Bound actual directory
          // and native-resource work, while checking time/cancellation for every
          // entry. Stream enumeration instead of retaining enormous listings.
          check(root, entry.isDirectory() || entry.isSymbolicLink() ? 1 : 0);
          if (MARKERS.has(entry.name)) project(root);
          if (SKIP.has(entry.name) || PROVIDER_DIRS.has(entry.name) || prefs.exclusions?.includes(entry.name)) continue;
          const path = join(root, entry.name);
          attempt(path, () => {
            if (entry.isDirectory() || entry.isSymbolicLink() && fs.statSync(path).isDirectory()) index(path, depth + 1);
          });
        }
      } finally { directory.closeSync(); }
    });
  }
  {
    for (const [base, name] of [[dirs.claude, 'Claude Code'], [dirs.codex, 'Codex'], [dirs.shared, 'Codex'], [dirs.cursor, 'Cursor']]) {
      pass(base, () => provider(base, name, null, base === dirs.shared));
    }
    pass(dirs.claudeJson, () => add(dirs.claudeJson, 'config', 'Claude Code', null, { mcp: 'mcpServers' }));
    for (const root of managed) {
      pass(root, () => {
      add(join(root, 'managed-settings.json'), 'config', 'Claude Code', null, { managed: true });
      add(join(root, 'managed-mcp.json'), 'config', 'Claude Code', null, { managed: true, mcp: 'mcpServers' });
      });
    }
    // Inspect every explicit root before starting recursive discovery. One large
    // root gets its own entry budget and cannot consume a later root's budget.
    for (const root of roots) pass(root, () => attempt(root, () => project(root)));
    for (const root of roots) pass(root, () => index(root));
  }
  for (const saved of Object.values(parked)) {
    const item = { ...saved.resource, enabled: false, archived: saved.archived || false };
    if (saved.config) resources.push({ ...item, revision: hash(saved.configRaw ?? JSON.stringify(saved.config)), parked: true });
    else {
      try {
        const path = item.kind === 'skills' ? join(saved.parkPath, 'SKILL.md') : saved.parkPath;
        const real = canonical(path);
        if (!inside(real, canonical(join(home, '.aios'))) && !allowedRoots.some(root => inside(real, root))) fail('READ_ONLY', 'Parked link target is outside selected folders.');
        const content = readText(real);
        resources.push({ ...item, revision: content.revision, bytes: Buffer.byteLength(content.content), parked: true });
      } catch (e) { issue(item.path, `Parked resource cannot be read: ${e.code || e.message}`); }
    }
    if (item.project) projects.add(item.project);
  }
  progress({ entries, complete: true });
  return { resources, issues, projects: [...projects].sort(), roots, providerPaths: dirs, providers: PROVIDERS, syncedAt: new Date().toISOString(), incomplete, entries,
    supportNotes: ['Inventory reports configured sources. Provider trust, precedence, runtime connections and remotely managed policies must be checked in the provider.',
      'Plugin caches, cloud settings, credentials and provider session history are not scanned.'] };
}
