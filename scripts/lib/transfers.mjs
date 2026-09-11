import * as fs from 'node:fs';
import { basename, dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { canonical, exists, inside, readText, hash, fail } from './storage.mjs';
import { frontmatter, parseConfig, validateMcp, editJson, editTomlValue, jsonValueText } from './formats.mjs';
import { resourceId } from './discovery.mjs';

const at = (obj, keys) => keys.reduce((v, k) => v?.[k], obj);
const keyFor = (kind, provider, scope, project, name) => kind === 'plugins' ? [provider === 'Claude Code' ? 'enabledPlugins' : 'plugins', name]
  : provider === 'Claude Code' && scope === 'local' ? ['projects', project, 'mcpServers', name] : [provider === 'Codex' ? 'mcp_servers' : 'mcpServers', name];
const read = path => exists(path) ? readText(path) : { content: path.endsWith('.toml') ? '' : '{}\n', revision: null, mode: 0o600 };
const edit = (plan, key, value, raw) => { plan.content = plan.path.endsWith('.toml') ? editTomlValue(plan.content, key, value) : editJson(plan.content, key, value, raw); };

// Inspect every support file, not just SKILL.md. This digest binds a preview to
// the bytes, modes and relative links that will actually be copied or moved.
export function bundleInventory(root) {
  const entries = []; let bytes = 0;
  if (fs.lstatSync(root).isSymbolicLink()) fail('UNSUPPORTED', 'Transfer the original resource folder instead of a symbolic-link alias.');
  function visit(path) {
    const st = fs.lstatSync(path), name = relative(root, path);
    if (entries.length >= 2000) fail('LIMIT', 'A transfer supports at most 2,000 files and folders.');
    if (st.isSymbolicLink()) {
      const target = fs.readlinkSync(path);
      if (isAbsolute(target) || !inside(resolve(dirname(path), target), root) || !inside(canonical(path), canonical(root))) fail('UNSUPPORTED', 'A support-file link leaves this resource. Make the resource self-contained before transferring it.');
      entries.push({ name, type: 'link', target });
    } else if (st.isDirectory()) {
      entries.push({ name, type: 'directory', mode: st.mode & 0o777 });
      for (const child of fs.readdirSync(path).sort()) visit(join(path, child));
    } else if (st.isFile()) {
      if ((bytes += st.size) > 50 * 1024 * 1024) fail('LIMIT', 'A transfer supports at most 50 MiB of resource files.');
      const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      let data;
      try {
        const current = fs.fstatSync(fd); if (!current.isFile() || current.size !== st.size) fail('CONFLICT', 'A support file changed during review.');
        data = Buffer.alloc(st.size + 1); let count = 0;
        while (count < data.length) { const read = fs.readSync(fd, data, count, data.length - count, null); if (!read) break; count += read; }
        data = data.subarray(0, count);
      }
      finally { fs.closeSync(fd); }
      if (data.length !== st.size) fail('CONFLICT', 'A support file changed during review.');
      entries.push({ name, type: 'file', mode: st.mode & 0o777, size: data.length, hash: hash(data) });
    } else fail('UNSUPPORTED', 'Special files cannot be transferred. Remove them from the resource first.');
  }
  visit(root); return { entries, bytes, digest: hash(JSON.stringify(entries)) };
}

export function convertMcp(config, source, target) {
  validateMcp(config);
  if (source === target) return structuredClone(config);
  const allowed = new Set(['command', 'args', 'env', 'url', 'type', 'headers', 'http_headers', 'env_http_headers', 'bearer_token_env_var', 'enabled']);
  const extra = Object.keys(config).filter(k => !allowed.has(k));
  if (extra.length) fail('UNSUPPORTED', `This MCP uses provider-specific fields (${extra.join(', ')}). Adapt those fields in the source editor before transferring between providers.`);
  if (config.type && !['http', 'sse', 'stdio'].includes(config.type)) fail('UNSUPPORTED', 'This MCP transport cannot be converted.');
  if (target === 'Codex' && config.type === 'sse') fail('UNSUPPORTED', 'Codex requires Streamable HTTP. An SSE endpoint cannot be converted automatically.');
  const output = Object.fromEntries(['command', 'args', 'env', 'url'].filter(k => config[k] !== undefined).map(k => [k, structuredClone(config[k])]));
  const headers = { ...config.headers, ...config.http_headers };
  const envHeaders = { ...config.env_http_headers };
  let bearer;
  if (source !== 'Codex') {
    const envPattern = source === 'Cursor' ? /^\$\{env:([A-Za-z_][A-Za-z_0-9]*)\}$/ : /^\$\{([A-Za-z_][A-Za-z_0-9]*)\}$/;
    for (const [key, value] of Object.entries(headers)) {
      const token = target === 'Codex' && key.toLowerCase() === 'authorization' && value.match(/^Bearer \$\{(?:env:)?([A-Za-z_][A-Za-z_0-9]*)\}$/);
      if (token) { bearer = token[1]; delete headers[key]; continue; }
      const match = value.match(envPattern);
      if (match) { envHeaders[key] = match[1]; delete headers[key]; }
    }
  }
  if (target === 'Codex') {
    if (JSON.stringify({ ...output, headers }).includes('${')) fail('UNSUPPORTED', 'This MCP uses interpolated values that Codex will not expand. Use a supported environment-header reference or an explicit executable path.');
    if (Object.keys(headers).length) output.http_headers = headers;
    if (Object.keys(envHeaders).length) output.env_http_headers = envHeaders;
    if (bearer) output.bearer_token_env_var = bearer;
  } else {
    const template = name => target === 'Cursor' ? '${env:' + name + '}' : '${' + name + '}';
    for (const [key, name] of Object.entries(envHeaders)) headers[key] = template(name);
    if (config.bearer_token_env_var) headers.Authorization = 'Bearer ' + template(config.bearer_token_env_var);
    const raw = JSON.stringify({ ...output, headers });
    if (source !== 'Codex' && source !== target && /\$\{(?:workspaceFolder|userHome|input:|[^}]*:-)/.test(raw)) fail('UNSUPPORTED', 'This MCP uses provider-specific variable expansion. Adapt it before transferring between providers.');
    const translate = value => typeof value === 'string' ? source === 'Cursor' ? value.replace(/\$\{env:([A-Za-z_][A-Za-z_0-9]*)\}/g, (_, name) => template(name)) : source === 'Claude Code' ? value.replace(/\$\{([A-Za-z_][A-Za-z_0-9]*)\}/g, (_, name) => template(name)) : value
      : Array.isArray(value) ? value.map(translate) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, translate(v)])) : value;
    Object.assign(output, translate(output));
    if (Object.keys(headers).length) output.headers = translate(headers);
    if (target === 'Claude Code') output.type = output.url ? config.type === 'sse' ? 'sse' : 'http' : 'stdio';
  }
  validateMcp(output); return output;
}

export function convertAgent(raw, source, target) {
  if (source === target) return raw;
  const parsed = source === 'Codex' ? parseConfig(raw, 'agent.toml') : frontmatter(raw).metadata;
  const body = source === 'Codex' ? parsed.developer_instructions : frontmatter(raw).body;
  const allowed = new Set(['name', 'description', 'developer_instructions', 'model', 'readonly', 'sandbox_mode', 'permissionMode']);
  const unsupported = Object.keys(parsed).filter(k => !allowed.has(k));
  if (unsupported.length) fail('UNSUPPORTED', `This subagent uses provider-specific fields (${unsupported.join(', ')}). They cannot be silently dropped or translated.`);
  if (!parsed.name || !parsed.description || typeof body !== 'string') fail('INVALID', 'A portable subagent needs a name, description and instruction body.');
  const readOnly = parsed.readonly === true || parsed.sandbox_mode === 'read-only' || parsed.permissionMode === 'plan';
  if (parsed.sandbox_mode && parsed.sandbox_mode !== 'read-only' || parsed.permissionMode && parsed.permissionMode !== 'plan') fail('UNSUPPORTED', 'This subagent has provider-specific permissions. Review them in the destination provider before converting.');
  if (target === 'Codex') return editTomlValue('', ['name'], parsed.name) + `description = ${JSON.stringify(parsed.description)}\ndeveloper_instructions = ${JSON.stringify(body)}\n${readOnly ? 'sandbox_mode = "read-only"\n' : ''}`;
  const metadata = { name: parsed.name, description: parsed.description, ...(readOnly ? target === 'Cursor' ? { readonly: true } : { permissionMode: 'plan' } : {}) };
  return `---\n${YAML.stringify(metadata)}---\n${body}`;
}

export function transferPlan(args, context) {
  const { state, snapshot, find, writable, destination } = context;
  const source = find(args.id, args.parked);
  if (source.revision !== args.revision) fail('CONFLICT', 'Source changed. Refresh before transferring.');
  if (!['copy', 'move'].includes(args.mode)) fail('INVALID', 'Choose Copy or Move.');
  if (!['skills', 'commands', 'agents', 'memory', 'mcp', 'plugins'].includes(source.kind)) fail('UNSUPPORTED', 'Transfer individual resources; whole provider configuration files cannot be moved between providers.');
  writable(source, state);
  if (source.error || source.overrideOnly) fail('UNSUPPORTED', 'Repair the source or select the full MCP definition before transferring.');
  if (source.kind === 'plugins' && args.provider !== source.provider) fail('UNSUPPORTED', 'Plugin marketplace identities and installation formats differ between providers. Move this plugin reference within its provider, or transfer its standalone skills and MCP definitions separately. Cursor plugin installations remain managed in Cursor Customize.');
  if (source.kind === 'plugins' && args.name !== source.name) fail('INVALID', 'Keep the plugin’s native marketplace identity when changing its scope.');
  const targetKind = source.kind === 'commands' && args.provider === 'Codex' ? 'skills' : source.kind;
  if (source.path.endsWith('.mdc') && args.provider !== 'Cursor') fail('UNSUPPORTED', 'Cursor rule globs and activation settings do not transfer to another provider. Review and adapt the rule as a native instruction file.');
  const path = destination({ ...args, kind: targetKind, rule: source.path.endsWith('.mdc') }, state);
  const project = args.scope === 'user' ? null : resolve(args.project), key = keyFor(source.kind, args.provider, args.scope, project, args.name);
  const id = resourceId(args.provider, targetKind, path, ['mcp', 'plugins'].includes(source.kind) ? key : []);
  if (id === source.id || !['mcp', 'plugins'].includes(source.kind) && path === source.canonicalPath) fail('CONFLICT', 'Choose a different destination.');
  if (snapshot.resources.some(r => r.id === id) || state.parked[id]) fail('CONFLICT', 'A live or disabled resource already exists at this destination. Choose a different name or scope.');
  const writes = new Map(), planAt = target => { if (!writes.has(target)) writes.set(target, { path: target, ...read(target) }); return writes.get(target); };
  const warnings = ['Start a new provider session or reload its configuration after applying. Existing sessions may retain loaded resources.'];
  if (args.scope === 'user') warnings.push('The destination is available across your projects.');
  else warnings.push(args.scope === 'local' ? 'This Claude configuration is private to this project.' : 'Project files may be committed and shared with teammates. Review embedded credentials before applying.');
  if (args.provider !== source.provider) warnings.push('Provider-specific references inside prompts and supporting scripts are preserved as written. Review them for compatibility.');
  if (source.kind === 'agents' && args.provider !== source.provider) warnings.push('The destination inherits its provider model; source model names are not portable. Read-only settings are translated when supported.');
  const target = { ...source, id, provider: args.provider, kind: targetKind, path, canonicalPath: path, scope: project ? 'project' : 'user', nativeScope: args.scope, project, key, name: args.name, sourceId: undefined, parked: false };
  let bundle, physical, content, converted = false;
  const saved = source.parked ? state.parked[source.id] : null;
  if (['mcp', 'plugins'].includes(source.kind)) {
    const origin = planAt(source.canonicalPath), dest = planAt(path);
    const config = saved?.config ?? at(parseConfig(origin.content, source.path), source.key);
    if (at(parseConfig(dest.content, path), key) !== undefined) fail('CONFLICT', 'The destination entry already exists.');
    let value = config;
    if (source.kind === 'mcp') {
      value = convertMcp(config, source.provider, args.provider);
      if (args.provider === 'Codex') value.enabled = source.enabled;
      else if (source.provider !== args.provider) delete value.enabled;
      warnings.push('Relative executable paths and arguments keep their spelling; the provider working directory may change. OAuth sign-ins are not copied.');
    } else warnings.push('Only the native plugin reference moves. The provider manages installation, dependencies and marketplace access; cached plugin code is not relocated.');
    const raw = args.provider === source.provider && !path.endsWith('.toml') ? saved?.configRaw ?? jsonValueText(origin.content, source.key) : undefined;
    if (source.kind === 'mcp' && !source.enabled && args.provider !== 'Codex') state.parked[id] = { resource: target, config: value, configRaw: raw ?? JSON.stringify(value) };
    else edit(dest, key, value, raw);
    if (args.mode === 'move') {
      if (saved) delete state.parked[source.id];
      else if (source.kind === 'plugins' && source.scope === 'user' && project) {
        edit(origin, source.provider === 'Codex' ? [...source.key, 'enabled'] : source.key, false);
        warnings.push('The user plugin reference stays disabled so the destination project can override it. Removing the user flag could reactivate an installed plugin through defaults.');
      } else edit(origin, source.key, undefined);
    }
    converted = args.provider !== source.provider;
  } else {
    if (source.symlink) fail('UNSUPPORTED', 'Transfer the original resource rather than a symbolic-link alias.');
    physical = saved ? saved.parkPath : source.kind === 'skills' ? dirname(source.path) : source.path;
    bundle = bundleInventory(physical);
    if (exists(source.kind === 'skills' || targetKind === 'skills' ? dirname(path) : path)) fail('CONFLICT', 'The destination file or skill folder already exists.');
    const sourceFile = source.kind === 'skills' ? join(physical, 'SKILL.md') : physical;
    content = readText(sourceFile).content;
    if (source.kind === 'agents') { content = convertAgent(content, source.provider, args.provider); converted = source.provider !== args.provider; }
    if (['skills', 'agents'].includes(source.kind)) {
      if (target.provider === 'Codex' && target.kind === 'agents') {
        if (parseConfig(content, 'agent.toml').name !== args.name) { content = editTomlValue(content, ['name'], args.name); converted = true; }
      } else {
        const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (match && frontmatter(content).metadata.name && frontmatter(content).metadata.name !== args.name) {
          const document = YAML.parseDocument(match[1]); document.set('name', args.name);
          content = `${content.startsWith('\uFEFF') ? '\uFEFF' : ''}---\n${document.toString()}---\n${content.slice(match[0].length)}`; converted = true;
        }
      }
    }
    if (source.kind === 'commands' && targetKind === 'skills') {
      const { metadata, body } = frontmatter(content);
      const extra = Object.keys(metadata).filter(k => !['name', 'description'].includes(k));
      if (extra.length) fail('UNSUPPORTED', `Command-specific fields (${extra.join(', ')}) need manual adaptation before conversion to a Codex skill.`);
      content = `---\n${YAML.stringify({ name: args.name, description: metadata.description || `Run ${args.name}` })}---\n${body}`; converted = true;
      warnings.push('Codex receives a SKILL.md skill because it does not use this provider’s commands directory.');
    }
  }
  const preview = { source: { id: source.id, name: source.name, path: source.path, provider: source.provider }, destination: { path, provider: args.provider, scope: args.scope, project, kind: targetKind, name: args.name }, mode: args.mode,
    enabled: source.enabled, converted, convertedContent: converted && source.kind !== 'mcp' && source.kind !== 'plugins' ? content : undefined,
    files: bundle?.entries.filter(e => e.type !== 'directory').length || 1, bytes: bundle?.bytes, warnings };
  const previewRevision = hash(JSON.stringify({ args: { ...args, previewRevision: undefined }, source, target, bundle, writes: [...writes.values()], content, parked: state.parked }));
  return { preview: { ...preview, previewRevision }, source, target, state, writes: [...writes.values()].filter(w => w.content !== read(w.path).content), bundle, physical, content, converted, saved };
}

export function applyTransfer(plan, context) {
  const { store, saveState } = context, { source, target, state, preview, bundle, physical, saved } = plan;
  const moves = [], stages = [];
  if (bundle) {
    if (bundleInventory(physical).digest !== bundle.digest) fail('CONFLICT', 'Resource supporting files changed. Review a fresh transfer preview.');
    const destinationRoot = target.kind === 'skills' ? dirname(target.path) : target.path;
    const destination = source.parked ? store.privatePath(join('parked', randomUUID(), basename(destinationRoot))) : destinationRoot;
    fs.mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    const privateOnVolume = (parent, category, project) => {
      if (fs.statSync(parent).dev === fs.statSync(store.dir).dev) return store.privatePath(join(category, randomUUID()));
      // Keep external-volume backups outside native commands/agents/skills
      // directories so the provider cannot discover a disabled original.
      const native = context.nativeRoots?.filter(root => inside(parent, root)).sort((a, b) => b.length - a.length)[0];
      const base = canonical(project || (native ? dirname(native) : parent));
      if (fs.statSync(base).dev !== fs.statSync(parent).dev) fail('CROSS_DEVICE', 'This resource is on a nested volume without a private staging location. Select a project folder on that volume.');
      const directory = fs.mkdtempSync(join(base, '.aios-transfer-')); fs.chmodSync(directory, 0o700); return directory;
    };
    const sameVolume = fs.statSync(dirname(physical)).dev === fs.statSync(dirname(destination)).dev;
    if (!plan.converted && preview.mode === 'move' && sameVolume) moves.push({ from: physical, to: destination });
    else {
      const stage = join(privateOnVolume(dirname(destination), 'transfer-staging', target.project), basename(destinationRoot));
      fs.mkdirSync(dirname(stage), { recursive: true, mode: 0o700 }); stages.push(stage);
      if (source.kind === 'skills') {
        fs.cpSync(physical, stage, { recursive: true, dereference: false, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true, force: false });
        if (bundleInventory(stage).digest !== bundle.digest) fail('CONFLICT', 'The skill changed while it was copied. Its source was preserved.');
        if (plan.converted) fs.writeFileSync(join(stage, 'SKILL.md'), plan.content);
      }
      else if (target.kind === 'skills') { fs.mkdirSync(stage, { mode: 0o700 }); fs.writeFileSync(join(stage, 'SKILL.md'), plan.content, { mode: fs.statSync(physical).mode & 0o777 }); }
      else fs.writeFileSync(stage, plan.content, { mode: fs.statSync(physical).mode & 0o777 });
      if (source.kind !== 'skills') fs.chmodSync(target.kind === 'skills' ? join(stage, 'SKILL.md') : stage, fs.statSync(physical).mode & 0o777);
      if (!plan.converted && bundleInventory(stage).digest !== bundle.digest) fail('CONFLICT', 'Copied resource verification failed. The source was preserved.');
      moves.push({ from: stage, to: destination });
      if (preview.mode === 'move') moves.push({ from: physical, to: join(privateOnVolume(dirname(physical), 'transfer-originals', source.project), basename(physical)) });
    }
    if (source.parked) {
      state.parked[target.id] = { resource: target, original: destinationRoot, parkPath: destination, archived: saved.archived || false };
      if (preview.mode === 'move') delete state.parked[source.id];
    }
  }
  for (const move of moves) {
    const digest = bundleInventory(move.from).digest;
    move.digest = digest;
    move.validate = path => { if (bundleInventory(path).digest !== digest) fail('CONFLICT', 'A resource changed during the transfer. Its files were preserved.'); };
  }
  state.activeProfile = null;
  try { saveState(`${preview.mode === 'copy' ? 'Copy' : 'Move'} ${source.name} to ${target.provider} ${target.nativeScope}`, state, plan.writes, moves); }
  catch (error) {
    // Pending recovery may still need staged files. Never remove them after an
    // ambiguous transaction failure.
    if (error.code !== 'RECOVERY_CONFLICT') for (const stage of stages) if (exists(stage)) fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
