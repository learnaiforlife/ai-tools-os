import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Storage, exists, canonical, inside, readText, fail, hash, MAX_BYTES, atomicWrite } from './storage.mjs';
import { discover, DEFAULT_PREFS, providerPaths, resourceId } from './discovery.mjs';
import { validate, parseConfig, jsonText, validateMcp, mcpEnabledToml, appendMcpToml, editJson, jsonValueText, editTomlValue, suggestFrontmatterRepair } from './formats.mjs';
import { transferPlan, applyTransfer, bundleInventory } from './transfers.mjs';

const INITIAL = { version: 2, roots: null, preferences: DEFAULT_PREFS, parked: {}, profiles: [], prompts: [], activeProfile: null };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function nameSafe(value) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,99}$/u.test(value) || value.includes('..')) fail('INVALID', 'Use a name of 1–100 letters, numbers, spaces, dots, hyphens or underscores.');
  return value;
}
const at = (obj, keys) => keys.reduce((value, key) => value?.[key], obj);
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function createService(options = {}) {
  const home = resolve(options.home || homedir()), env = options.env || process.env;
  const store = new Storage(join(home, '.aios'), options);
  let snapshot;
  const load = () => {
    const state = store.state('state-v2.json', INITIAL);
    if (state.version !== 2 || !object(state.parked) || !Array.isArray(state.profiles) || !Array.isArray(state.prompts) || !object(state.preferences)) fail('STATE_CORRUPT', 'AIOS state has an unsupported schema. Original state has been preserved.');
    if (state.roots === null) {
      const legacy = store.state('sync-roots.json', { roots: [] });
      if (!Array.isArray(legacy.roots)) fail('STATE_CORRUPT', 'Saved scan roots are invalid.');
      state.roots = [...new Set([join(home, 'Documents'), ...legacy.roots])].filter(p => typeof p === 'string' && isAbsolute(p) && exists(p));
    }
    return state;
  };
  const scan = state => {
    snapshot = discover({ home, env, roots: state.roots, prefs: { ...DEFAULT_PREFS, ...state.preferences }, parked: state.parked,
      managedRoots: options.managedRoots, progress: options.progress, canceled: options.canceled, maxEntries: options.maxEntries, maxMs: options.maxMs, now: options.now });
    const legacy = state.legacyImported ? [] : ['disabled-mcp.json', 'disabled-skills', 'disabled-commands', 'disabled-agents'].filter(n => exists(store.privatePath(n)));
    if (legacy.length) snapshot.issues.push({ path: store.dir, code: 'LEGACY_DATA', message: `Legacy disabled data retained (${legacy.join(', ')}). Use Import legacy data in Settings; original files are kept.` });
    return { ...snapshot, preferences: state.preferences, profiles: state.profiles.map(p => ({ ...p })), activeProfile: state.activeProfile, prompts: state.prompts };
  };
  const find = (id, parked) => {
    if (parked !== undefined && typeof parked !== 'boolean') fail('INVALID', 'Select a live or parked resource instance.');
    const matches = snapshot?.resources.filter(r => r.id === id && (parked === undefined || !!r.parked === parked)) || [];
    if (matches.length > 1) fail('CONFLICT', 'Both live and parked copies exist. Select the exact copy to inspect or change.');
    return matches[0] || fail('NOT_FOUND', 'Resource no longer exists. Refresh the inventory.');
  };
  function writable(resource, state) {
    if (resource.readonly) fail('READ_ONLY', 'This managed source or external symbolic link is read-only.');
    checkedPath(resource.path, state);
    if (resource.parked && !exists(resource.path)) return resource.canonicalPath;
    const current = canonical(resource.path);
    if (current !== resource.canonicalPath) fail('CONFLICT', 'The source link changed. Refresh before editing.');
    return current;
  }
  const revision = (resource, wanted) => { if (typeof wanted !== 'string' || resource.revision !== wanted) fail('CONFLICT', 'Resource changed on disk. Refresh and review your draft.'); };
  function checkedPath(path, state) {
    const dirs = providerPaths(home, env, state.preferences), real = canonical(path);
    const roots = [dirs.claude, dirs.codex, dirs.cursor, dirs.shared, ...state.roots].map(canonical);
    const claudeFile = join(canonical(dirname(dirs.claudeJson)), basename(dirs.claudeJson));
    if (real !== claudeFile && !roots.some(root => inside(real, root))) fail('READ_ONLY', 'The file resolves outside selected provider and project folders.');
    return real;
  }
  function contentFor(resource, state) {
    const parked = resource.parked ? state.parked[resource.id] : null;
    if (parked?.config) return { content: parked.configRaw ?? jsonText(parked.config), revision: resource.revision, readonly: true, path: resource.path };
    const path = parked ? resource.kind === 'skills' ? join(parked.parkPath, 'SKILL.md') : parked.parkPath : resource.canonicalPath;
    if (resource.readonly && resource.error) fail('READ_ONLY', resource.error);
    const file = readText(canonical(path));
    if (['mcp', 'plugins'].includes(resource.kind)) {
      const cfg = at(parseConfig(file.content, resource.path), resource.key);
      return { content: resource.kind === 'plugins' ? jsonText({ [resource.name]: cfg }) : resource.path.endsWith('.toml') ? jsonText(cfg) : jsonValueText(file.content, resource.key), revision: file.revision, readonly: true, path: resource.path, sourceId: resource.sourceId };
    }
    return { ...file, readonly: resource.readonly, path: resource.path };
  }
  function mcpPlan(resource, enabled, state, plans) {
    if (resource.kind !== 'mcp') fail('INVALID', 'Expected an MCP resource.');
    const path = writable(resource, state);
    if (!plans.has(path)) {
      const original = exists(path) ? readText(path) : { content: '{}\n', revision: null, mode: 0o600 };
      plans.set(path, { path, ...original });
    }
    const plan = plans.get(path);
    if (path.endsWith('.toml')) {
      plan.content = mcpEnabledToml(plan.content, resource.name, enabled); return;
    }
    const obj = parseConfig(plan.content, path), parentKeys = resource.key.slice(0, -1), key = resource.key.at(-1);
    let parent = obj;
    for (const part of parentKeys) {
      if (!Object.hasOwn(parent, part)) Object.defineProperty(parent, part, { value: {}, enumerable: true, configurable: true, writable: true });
      if (!object(parent[part])) fail('INVALID', 'MCP source structure changed.'); parent = parent[part];
    }
    if (enabled) {
      const parked = state.parked[resource.id];
      if (parked) {
        if (Object.hasOwn(parent, key)) fail('CONFLICT', 'An MCP server already exists at the restore destination. Both configurations were preserved.');
        plan.content = editJson(plan.content, resource.key, parked.config, parked.configRaw);
        delete state.parked[resource.id];
      } else if (!Object.hasOwn(parent, key)) fail('NOT_FOUND', 'MCP server no longer exists.');
    } else {
      if (state.parked[resource.id]) fail('CONFLICT', 'A parked copy already exists. Restore or inspect it before disabling this source.');
      if (!Object.hasOwn(parent, key)) fail('NOT_FOUND', 'MCP server no longer exists.');
      state.parked[resource.id] = { resource, config: parent[key], configRaw: jsonValueText(plan.content, resource.key) };
      plan.content = editJson(plan.content, resource.key, undefined);
    }
  }
  function fileToggle(resource, enabled, state, archived = false) {
    writable(resource, state);
    if (!['skills', 'commands', 'agents', 'memory', 'config', 'scripts'].includes(resource.kind)) fail('INVALID', 'Unsupported file resource.');
    const parked = state.parked[resource.id];
    if (enabled) {
      if (!parked) fail('CONFLICT', 'Resource is already present.');
      if (exists(parked.original)) fail('CONFLICT', 'Restore destination already exists. Both copies were preserved.');
      delete state.parked[resource.id];
      return { from: parked.parkPath, to: parked.original };
    }
    if (parked) fail('CONFLICT', 'Resource is already parked.');
    const original = resource.kind === 'skills' ? dirname(resource.path) : resource.path;
    // Preserve a linked resource as a link. Never rename its external target.
    const parkPath = store.privatePath(join('parked', randomUUID(), basename(original)));
    state.parked[resource.id] = { resource, original, parkPath, archived };
    return { from: original, to: parkPath };
  }
  function destination(args, state) {
    const { kind, provider, scope } = args;
    if (!['Claude Code', 'Codex', 'Cursor'].includes(provider) || !['user', 'project', 'local'].includes(scope)) fail('INVALID', 'Select a supported provider and scope.');
    if (scope === 'local' && (provider !== 'Claude Code' || !['mcp', 'plugins'].includes(kind))) fail('UNSUPPORTED', 'Local scope is supported for Claude MCP and plugin references.');
    const dirs = providerPaths(home, env, state.preferences);
    let root;
    if (scope !== 'user') {
      if (!isAbsolute(args.project || '') || !state.roots.some(r => inside(resolve(args.project), r))) fail('INVALID', 'Select a project inside a registered scan folder.');
      if (!exists(args.project) || !fs.statSync(args.project).isDirectory()) fail('NOT_FOUND', 'Project folder does not exist.');
      root = resolve(args.project);
    }
    const base = scope === 'user' ? provider === 'Claude Code' ? dirs.claude : provider === 'Codex' ? dirs.shared : dirs.cursor
      : join(root, provider === 'Claude Code' ? '.claude' : provider === 'Codex' ? '.agents' : '.cursor');
    const name = kind === 'plugins' ? args.name : nameSafe(args.name);
    if (kind === 'plugins' && (typeof name !== 'string' || !/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(name))) fail('INVALID', 'Select a native plugin-name@marketplace-name reference.');
    if (kind === 'commands' && provider === 'Codex') fail('UNSUPPORTED', 'Use a Codex skill for reusable commands.');
    let path;
    if (kind === 'skills') path = join(base, 'skills', name, 'SKILL.md');
    else if (kind === 'agents' && provider === 'Codex') path = join(scope === 'user' ? dirs.codex : join(root, '.codex'), 'agents', name.endsWith('.toml') ? name : name.replace(/\.md$/, '') + '.toml');
    else if (['commands', 'agents'].includes(kind)) path = join(base, kind, name.endsWith('.md') ? name : name + '.md');
    else if (kind === 'memory') {
      if (provider === 'Cursor' && scope === 'user') fail('UNSUPPORTED', 'Cursor user rules are managed in Cursor settings. Select Project to create a native rule file.');
      const expected = provider === 'Claude Code' ? 'CLAUDE.md' : provider === 'Codex' ? 'AGENTS.md' : '.cursorrules';
      path = args.rule && provider === 'Cursor' ? join(base, 'rules', name.endsWith('.mdc') ? name : name + '.mdc') : join(root || (provider === 'Codex' ? dirs.codex : base), expected);
    } else if (kind === 'plugins') {
      if (provider === 'Cursor') fail('UNSUPPORTED', 'Cursor plugin installations are managed in Cursor Customize; no supported writable plugin registry is exposed.');
      path = provider === 'Claude Code' ? join(base, scope === 'local' ? 'settings.local.json' : 'settings.json') : join(scope === 'user' ? dirs.codex : join(root, '.codex'), 'config.toml');
    } else if (kind === 'mcp') path = provider === 'Claude Code' ? scope === 'user' || scope === 'local' ? dirs.claudeJson : join(root, '.mcp.json')
      : provider === 'Codex' ? join(scope === 'user' ? dirs.codex : join(root, '.codex'), 'config.toml') : join(base, 'mcp.json');
    else fail('UNSUPPORTED', 'Create a skill, command, agent, memory file or MCP configuration.');
    return checkedPath(path, state);
  }
  const saveState = (label, state, writes = [], moves = []) => store.commit(label, [...writes, store.stateWrite('state-v2.json', state)], moves);
  const transferContext = (state, snapshot) => ({ state, snapshot, find, writable, destination, store, saveState,
    nativeRoots: Object.entries(providerPaths(home, env, state.preferences)).filter(([key]) => key !== 'claudeJson').map(([, path]) => canonical(path)) });

  function batchPlan(args, state) {
    if (!Array.isArray(args.sources) || !args.sources.length || args.sources.length > 200 || typeof args.enabled !== 'boolean') fail('INVALID', 'Select 1–200 MCP sources and an enabled state.');
    const selected = args.sources.map(s => { const r = find(s.id, s.parked); revision(r, s.revision); if (r.kind !== 'mcp' || r.error) fail('INVALID', 'Select readable MCP definitions.'); writable(r, state); return r; });
    if (new Set(selected.map(r => r.id)).size !== selected.length) fail('CONFLICT', 'Select each MCP source once.');
    const plans = new Map();
    for (const r of selected) if (r.enabled !== args.enabled) mcpPlan(r, args.enabled, state, plans);
    const sources = selected.map(r => ({ id: r.id, name: r.name, path: r.path, provider: r.provider, scope: r.nativeScope || r.scope, project: r.project, from: r.enabled, to: args.enabled, revision: r.revision }));
    return { sources, plans, previewRevision: hash(JSON.stringify({ sources, plans: [...plans.values()], parked: state.parked })) };
  }

  function projectMcpPlan(args, state) {
    const resource = find(args.id, args.parked);
    if (resource.kind !== 'mcp' || resource.parked || resource.readonly || resource.error) fail('UNSUPPORTED', 'Select a readable, live MCP definition.');
    if (!['enable', 'disable', 'inherit'].includes(args.action)) fail('INVALID', 'Choose Enable, Disable or Inherit.');
    if (resource.provider === 'Cursor') fail('UNSUPPORTED', 'Cursor stores per-workspace toggles in its internal application state. Use Cursor Customize for a project-only override of a user server, or move the definition to the intended project. AIOS can disable the selected native user or project definition.');
    const path = destination({ kind: 'mcp', provider: resource.provider, scope: resource.provider === 'Claude Code' ? 'local' : 'project', project: args.project, name: resource.name }, state);
    const current = exists(path) ? readText(path) : { content: path.endsWith('.toml') ? '' : '{}\n', revision: null };
    const obj = parseConfig(current.content, path); let content, from;
    if (resource.provider === 'Claude Code') {
      const key = ['projects', resolve(args.project), 'disabledMcpServers'];
      const list = at(obj, key) ?? [];
      if (!Array.isArray(list) || list.some(s => typeof s !== 'string')) fail('INVALID', 'The Claude project MCP opt-out list is invalid.');
      from = list.includes(resource.name) ? 'disabled' : 'not disabled';
      const next = list.filter(name => name !== resource.name);
      if (args.action === 'disable') next.push(resource.name);
      content = editJson(current.content, key, next);
    } else {
      const key = ['mcp_servers', resource.name], config = at(obj, key);
      from = config?.enabled === undefined ? 'inherited' : config.enabled ? 'enabled' : 'disabled';
      content = args.action === 'inherit' ? config && Object.keys(config).length === 1 && Object.hasOwn(config, 'enabled') ? editTomlValue(current.content, key, undefined) : editTomlValue(current.content, [...key, 'enabled'], undefined)
        : editTomlValue(current.content, [...key, 'enabled'], args.action === 'enable');
    }
    const result = { path, project: resolve(args.project), provider: resource.provider, name: resource.name, action: args.action, from,
      note: resource.provider === 'Claude Code' ? 'This edits Claude’s per-project opt-out list. Re-enabling does not approve untrusted project servers or override organization policy.' : 'This edits the project config layer. Codex must trust this project for it to apply; more specific config or session overrides may take precedence.' };
    return { ...result, write: { path, content, revision: current.revision }, previewRevision: hash(JSON.stringify({ ...result, current, content, sourceRevision: resource.revision })) };
  }

  function profilePlan(profile, state) {
    if (snapshot.incomplete) fail('INCOMPLETE', 'Resolve discovery issues before previewing or applying a profile.');
    const sources = profile.members.map(member => {
      const r = find(member.id);
      writable(r, state);
      return { id: r.id, name: r.name, provider: r.provider, path: r.path, project: r.project, scope: r.scope,
        from: r.enabled, to: member.enabled, revision: r.revision, parked: !!r.parked,
        sourceRevision: exists(r.path) ? readText(canonical(r.path)).revision : null };
    });
    const previewRevision = hash(JSON.stringify({ profile, sources }));
    const plans = new Map();
    for (const member of profile.members) {
      const r = find(member.id);
      if (r.enabled !== member.enabled) mcpPlan(r, member.enabled, state, plans);
    }
    return { previewRevision, sources, changes: sources.filter(s => s.from !== s.to), plans };
  }

  function handle(operation, args) {
    if (operation === 'history') return { history: store.history() };
    if (operation === 'history.read') {
      const entry = store.history().find(h => h.id === args.id);
      if (!entry || !entry.files.some(f => f.path === args.path)) fail('NOT_FOUND', 'History entry does not exist.');
      const journal = store.readJournal(join(store.journals, entry.id + '.json'));
      const w = journal.writes.find(w => w.path === args.path);
      return { content: w.before?.content ?? '', path: w.path, revision: w.before?.revision, existed: !!w.before };
    }
    if (operation === 'transfer.undo') {
      const entry = store.history().find(h => h.id === args.id && h.transfer && h.status === 'committed');
      if (!entry) fail('NOT_FOUND', 'Select a completed resource transfer.');
      const path = join(store.journals, entry.id + '.json'), journal = store.readJournal(path);
      for (const w of journal.writes) if (!exists(w.path) || readText(w.path).revision !== w.after) fail('CONFLICT', 'Configuration or AIOS state changed after this transfer. Move the resource back using a fresh preview; undo will not overwrite later changes.');
      for (const move of journal.moves) if (exists(move.from) || !exists(move.to) || !move.digest || bundleInventory(move.to).digest !== move.digest) fail('CONFLICT', 'Transferred files changed. Undo would overwrite later work; no files were changed.');
      // Persist the rollback intent first. Existing crash recovery can complete
      // this operation even if the app closes halfway through the undo.
      journal.status = 'pending'; atomicWrite(path, JSON.stringify(journal));
      store.rollback(journal); journal.status = 'undone'; atomicWrite(path, JSON.stringify(journal));
      return scan(load());
    }
    const state = load();
    if (operation === 'tools.detect') {
      const paths = [...new Set([...(env.PATH || '').split(':').filter(isAbsolute), join(home, '.local/bin'), join(home, '.cargo/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])];
      const tools = ['claude', 'codex', 'cursor', 'node', 'python3', 'uv', 'markitdown', 'git'].map(name => {
        const path = paths.map(root => join(root, name)).find(p => { try { return fs.statSync(p).isFile() && !!(fs.statSync(p).mode & 0o111); } catch { return false; } });
        return { name, path: path || null, version: null };
      });
      return { tools };
    }
    if (operation === 'roots.set') {
      if (!Array.isArray(args.roots) || args.roots.length > 30 || args.roots.some(r => typeof r !== 'string' || !isAbsolute(r))) fail('INVALID', 'Provide up to 30 absolute scan folders.');
      state.roots = [...new Set(args.roots.map(r => resolve(r)))];
      for (const root of state.roots) if (!exists(root) || !fs.statSync(root).isDirectory()) fail('NOT_FOUND', 'A selected scan folder does not exist.');
      saveState('Update scan folders', state); return scan(state);
    }
    if (operation === 'preferences.save') {
      const prefs = args.preferences;
      if (!object(prefs) || !['dark', 'light', 'system'].includes(prefs.theme) || ![0, 30, 60, 300].includes(prefs.syncInterval) || !Array.isArray(prefs.exclusions)
        || prefs.exclusions.length > 100 || prefs.exclusions.some(s => typeof s !== 'string' || !s || /[/\\]/.test(s)) || !object(prefs.providerPaths)) fail('INVALID', 'Invalid preferences.');
      providerPaths(home, env, prefs); // validate before persisting
      state.preferences = { theme: prefs.theme, syncInterval: prefs.syncInterval, exclusions: prefs.exclusions, providerPaths: prefs.providerPaths };
      saveState('Update preferences', state); return scan(state);
    }
    if (operation === 'prompts.save') {
      const p = args.prompt;
      if (!object(p) || typeof p.content !== 'string' || Buffer.byteLength(p.content) > 100000) fail('INVALID', 'Prompt text is missing or too large.');
      nameSafe(p.name);
      const old = state.prompts.find(x => x.id === p.id);
      if (p.id && !old) fail('NOT_FOUND', 'Prompt no longer exists.');
      const record = { id: p.id || randomUUID(), name: p.name, content: p.content, favorite: !!p.favorite, updatedAt: new Date().toISOString() };
      state.prompts = [...state.prompts.filter(x => x.id !== record.id), record];
      if (state.prompts.length > 200) fail('LIMIT', 'The local library supports up to 200 prompts.');
      saveState('Save prompt', state); return scan(state);
    }
    if (operation === 'prompts.delete') {
      if (!state.prompts.some(p => p.id === args.id)) fail('NOT_FOUND', 'Prompt no longer exists.');
      state.prompts = state.prompts.filter(p => p.id !== args.id); saveState('Delete prompt', state); return scan(state);
    }
    scan(state);
    if (operation === 'inventory') return { ...snapshot, preferences: state.preferences, profiles: state.profiles, activeProfile: state.activeProfile, prompts: state.prompts };
    if (operation === 'resource.read') return contentFor(find(args.id, args.parked), state);
    if (operation === 'transfer.preview' || operation === 'transfer.apply') {
      const context = transferContext(state, snapshot), plan = transferPlan(args, context);
      if (operation === 'transfer.preview') return plan.preview;
      if (args.previewRevision !== plan.preview.previewRevision) fail('CONFLICT', 'The resource or destination changed. Review a fresh transfer preview.');
      applyTransfer(plan, context); return scan(state);
    }
    if (operation === 'mcp.batch.preview' || operation === 'mcp.batch.apply') {
      const plan = batchPlan(args, state);
      if (operation === 'mcp.batch.preview') return { sources: plan.sources, previewRevision: plan.previewRevision };
      if (args.previewRevision !== plan.previewRevision) fail('CONFLICT', 'MCP sources changed. Review a fresh preview.');
      if (!plan.plans.size) return scan(state);
      state.activeProfile = null; saveState(args.enabled ? 'Enable selected MCP sources' : 'Disable selected MCP sources', state, [...plan.plans.values()]); return scan(state);
    }
    if (operation === 'mcp.project.preview' || operation === 'mcp.project.apply') {
      const { write, ...preview } = projectMcpPlan(args, state);
      if (operation === 'mcp.project.preview') return preview;
      if (args.previewRevision !== preview.previewRevision) fail('CONFLICT', 'Project settings changed. Review a fresh preview.');
      state.activeProfile = null;
      saveState(`${args.action} MCP ${preview.name} in project`, state, [write]); return scan(state);
    }
    if (operation === 'resource.repair.preview') {
      const r = find(args.id, args.parked); writable(r, state);
      if (!['skills', 'agents', 'commands', 'memory'].includes(r.kind) || !/\.(md|mdc)$/.test(r.path)) fail('UNSUPPORTED', 'Select a Markdown resource with a YAML header.');
      const file = contentFor(r, state); revision(file, args.revision);
      const repair = suggestFrontmatterRepair(file.content);
      if (!repair) fail('UNSUPPORTED', 'No unambiguous automatic repair is available. Edit the header using the reported line and compare your changes before saving.');
      return { ...repair, revision: file.revision };
    }
    if (operation === 'resource.write') {
      const r = find(args.id, args.parked); revision(r, args.revision);
      if (['mcp', 'plugins'].includes(r.kind)) fail('READ_ONLY', 'Edit the native source file to change this configuration entry.');
      writable(r, state);
      const parked = r.parked ? state.parked[r.id] : null;
      const path = parked ? r.kind === 'skills' ? join(parked.parkPath, 'SKILL.md') : parked.parkPath : r.canonicalPath;
      if (typeof args.content !== 'string') fail('INVALID', 'Content must be text.');
      validate(args.content, r.path, r.kind);
      store.commit(`Save ${r.name}`, [{ path: canonical(path), content: args.content, revision: args.revision }]);
      return scan(state);
    }
    if (operation === 'resource.toggle' || operation === 'resource.archive') {
      const r = find(args.id, args.parked); revision(r, args.revision);
      const enabled = operation === 'resource.archive' ? false : args.enabled;
      if (typeof enabled !== 'boolean') fail('INVALID', 'Enabled must be a boolean.');
      const plans = new Map(), moves = [];
      if (r.kind === 'plugins') {
        if (operation === 'resource.archive') fail('UNSUPPORTED', 'Disable the plugin reference instead of archiving it.');
        const path = writable(r, state), current = readText(path);
        const content = path.endsWith('.toml') ? editTomlValue(current.content, [...r.key, 'enabled'], enabled) : editJson(current.content, r.key, enabled);
        plans.set(path, { path, content, revision: current.revision });
      } else if (r.kind === 'mcp') mcpPlan(r, enabled, state, plans);
      else moves.push(fileToggle(r, enabled, state, operation === 'resource.archive'));
      state.activeProfile = null;
      saveState(`${enabled ? 'Restore' : 'Disable'} ${r.name}`, state, [...plans.values()], moves); return scan(state);
    }
    if (operation === 'resource.create') {
      if (args.kind === 'mcp') fail('INVALID', 'Use MCP creation to validate the server configuration.');
      if (args.kind === 'plugins') fail('UNSUPPORTED', 'Install plugins through their provider, then manage their discovered native references.');
      const path = destination(args, state);
      if (exists(path)) fail('CONFLICT', 'A resource already exists at this destination.');
      if (typeof args.content !== 'string') fail('INVALID', 'Provide resource content.');
      validate(args.content, path, args.kind); store.commit(`Create ${args.kind}`, [{ path, content: args.content, revision: null }]); return scan(state);
    }
    if (operation === 'mcp.create') {
      const path = destination({ ...args, kind: 'mcp' }, state), name = nameSafe(args.name); validateMcp(args.config);
      const current = exists(path) ? readText(path) : { content: path.endsWith('.toml') ? '' : '{}\n', revision: null };
      const obj = parseConfig(current.content, path);
      const keys = args.provider === 'Claude Code' && args.scope === 'local' ? ['projects', resolve(args.project), 'mcpServers'] : [path.endsWith('.toml') ? 'mcp_servers' : 'mcpServers'];
      const collection = at(obj, keys);
      if (collection !== undefined && !object(collection)) fail('INVALID', 'MCP server collection must be an object.');
      if (Object.hasOwn(collection || {}, name)) fail('CONFLICT', 'An MCP server with this name already exists in the selected source.');
      let content;
      if (path.endsWith('.toml')) content = appendMcpToml(current.content, name, args.config);
      else content = editJson(current.content, [...keys, name], args.config);
      store.commit(`Create MCP ${name}`, [{ path, content, revision: current.revision }]); return scan(state);
    }
    if (operation === 'profiles.capture') {
      const name = nameSafe(args.name);
      const members = snapshot.resources.filter(r => r.kind === 'mcp' && !r.readonly).map(r => ({ id: r.id, enabled: r.enabled }));
      if (snapshot.incomplete || new Set(members.map(m => m.id)).size !== members.length) fail('CONFLICT', 'Complete discovery and resolve duplicate active/parked sources before capturing a profile.');
      if (!members.length) fail('EMPTY_PROFILE', 'Discover at least one writable MCP source before capturing a profile.');
      if (state.profiles.some(p => p.name === name)) fail('CONFLICT', 'A profile with this name already exists.');
      if (state.profiles.length >= 100) fail('LIMIT', 'Delete an unused profile before creating more than 100 profiles.');
      state.profiles.push({ id: randomUUID(), name, members }); saveState('Capture MCP profile', state); return scan(state);
    }
    if (operation === 'profiles.delete') {
      if (!state.profiles.some(p => p.id === args.id)) fail('NOT_FOUND', 'Profile no longer exists.');
      state.profiles = state.profiles.filter(p => p.id !== args.id); if (state.activeProfile === args.id) state.activeProfile = null;
      saveState('Delete MCP profile', state); return scan(state);
    }
    if (operation === 'profiles.preview' || operation === 'profiles.apply') {
      const profile = state.profiles.find(p => p.id === args.id) || fail('NOT_FOUND', 'Profile no longer exists.');
      const { previewRevision, sources, changes, plans } = profilePlan(profile, state);
      if (operation === 'profiles.preview') return { profile: { id: profile.id, name: profile.name }, previewRevision, sources, changes };
      if (args.previewRevision !== previewRevision) fail('CONFLICT', 'The profile or its sources changed. Review a fresh profile preview before applying.');
      state.activeProfile = profile.id; saveState(`Apply profile ${profile.name}`, state, [...plans.values()]); return scan(state);
    }
    if (operation === 'statusline.install') {
      const dirs = providerPaths(home, env, state.preferences), settingsPath = checkedPath(join(dirs.claude, 'settings.json'), state);
      const scriptPath = checkedPath(join(dirs.claude, 'statusline.sh'), state);
      const current = exists(settingsPath) ? readText(settingsPath) : { content: '{}\n', revision: null };
      const script = exists(scriptPath) ? readText(scriptPath) : { revision: null };
      if (args.settingsRevision !== current.revision || args.scriptRevision !== script.revision) fail('CONFLICT', 'Statusline files changed. Refresh the preview before installing.');
      parseConfig(current.content, settingsPath);
      const statusLine = { type: 'command', command: '/bin/bash ' + shellQuote(scriptPath) };
      const content = statuslineScript();
      store.commit('Install statusline', [{ path: scriptPath, content, revision: script.revision, mode: 0o700 }, { path: settingsPath, content: editJson(current.content, ['statusLine'], statusLine), revision: current.revision }]);
      return scan(state);
    }
    if (operation === 'statusline.preview') {
      const dirs = providerPaths(home, env, state.preferences);
      const get = file => { const safe = checkedPath(file, state); return exists(safe) ? readText(safe) : { content: '', revision: null }; };
      return { settings: get(join(dirs.claude, 'settings.json')), script: get(join(dirs.claude, 'statusline.sh')), generated: statuslineScript(), scriptPath: join(dirs.claude, 'statusline.sh') };
    }
    if (operation === 'legacy.import') {
      if (state.legacyImported) return scan(state);
      // Legacy records did not retain provenance. Import only the known old global
      // Claude destinations; never infer a project from a basename.
      const dirs = providerPaths(home, env, state.preferences), moves = [];
      const mcps = store.state('disabled-mcp.json', {});
      if (!object(mcps)) fail('STATE_CORRUPT', 'Legacy MCP state is invalid.');
      const legacyClaude = join(home, '.claude'), legacyJson = join(home, '.claude.json');
      const legacyFiles = ['skills', 'commands', 'agents'].some(kind => {
        const root = store.privatePath('disabled-' + kind);
        return exists(root) && fs.readdirSync(root, { withFileTypes: true }).some(entry => kind === 'skills' ? entry.isDirectory() : entry.isFile() && entry.name.endsWith('.md'));
      });
      if (Object.keys(mcps).length && canonical(dirs.claudeJson) !== canonical(legacyJson) || legacyFiles && canonical(dirs.claude) !== canonical(legacyClaude)) {
        fail('LEGACY_PATH_MISMATCH', 'Legacy data belongs to the original ~/.claude and ~/.claude.json sources. Restore the default Claude paths in Settings (and remove CLAUDE_CONFIG_DIR if set) before importing. No legacy data or native configuration was changed.');
      }
      for (const [name, config] of Object.entries(mcps)) {
        const key = ['mcpServers', name], id = resourceId('Claude Code', 'mcp', dirs.claudeJson, key);
        if (!state.parked[id]) state.parked[id] = { config, resource: { id, kind: 'mcp', name, path: dirs.claudeJson, canonicalPath: canonical(dirs.claudeJson), provider: 'Claude Code', scope: 'user', project: null, key, enabled: false } };
      }
      for (const kind of ['skills', 'commands', 'agents']) {
        const root = store.privatePath('disabled-' + kind); if (!exists(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (kind === 'skills' ? !entry.isDirectory() : !entry.isFile() || !entry.name.endsWith('.md')) continue;
          const path = join(dirs.claude, kind, entry.name, ...(kind === 'skills' ? ['SKILL.md'] : []));
          const id = resourceId('Claude Code', kind, path);
          if (state.parked[id]) continue;
          const original = kind === 'skills' ? dirname(path) : path;
          state.parked[id] = { original, parkPath: join(root, entry.name), resource: { id, kind, name: entry.name, path, canonicalPath: canonical(path), provider: 'Claude Code', scope: 'user', project: null, enabled: false } };
        }
      }
      state.legacyImported = true;
      saveState('Import legacy disabled resources', state, [], moves); return scan(state);
    }
    fail('NOT_FOUND', 'Unknown operation.');
  }
  return {
    request(operation, args = {}) {
      try {
        if (typeof operation !== 'string' || !object(args) || Buffer.byteLength(JSON.stringify(args)) > MAX_BYTES + 65536) fail('INVALID', 'Invalid or oversized request.');
        const result = ['history', 'history.read'].includes(operation) ? handle(operation, args) : store.locked(() => handle(operation, args));
        return { ok: true, ...result };
      } catch (error) { return { ok: false, code: error.code || 'IO_ERROR', error: error.code === 'EACCES' ? 'Permission denied. Check macOS folder access and file permissions.' : error.message }; }
    },
  };
}

export function statuslineScript() {
  return `#!/bin/bash\n# AIOS statusline: local macOS JXA, no third-party executable required.\nexec /usr/bin/osascript -l JavaScript -e '\nObjC.import("Foundation");\nfunction run() {\n  try {\n    const data = $.NSFileHandle.fileHandleWithStandardInput.readDataToEndOfFile;\n    const raw = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));\n    const info = JSON.parse(raw || "{}");\n    const clean = value => String(value || "").replace(/[\\x00-\\x1f\\x7f-\\x9f]/g, "");\n    const model = clean(info.model && (info.model.display_name || info.model.id));\n    const dir = clean(info.workspace && info.workspace.current_dir);\n    const used = info.context_window && info.context_window.used_percentage;\n    return [model, dir, typeof used === "number" ? Math.round(used) + "% context" : ""].filter(Boolean).join(" | ") || "Claude Code";\n  } catch (_) { return "Claude Code"; }\n}\n'\n`;
}
