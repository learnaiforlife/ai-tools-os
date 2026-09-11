import YAML from 'yaml';
import * as TOML from '@ltd/j-toml';
import { parseForESLint } from 'toml-eslint-parser';
import { parseTree, findNodeAtLocation, modify, applyEdits } from 'jsonc-parser';
import { fail } from './storage.mjs';

export function frontmatter(raw) {
  const match = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { metadata: {}, body: raw };
  let metadata;
  try { metadata = YAML.parse(match[1], { maxAliasCount: 20, uniqueKeys: true }); }
  catch (error) {
    const line = error.linePos?.[0]?.line;
    const hint = error.code === 'BLOCK_AS_IMPLICIT_KEY' ? 'Quote text containing a colon followed by a space, or use a YAML block scalar.'
      : error.code === 'DUPLICATE_KEY' ? 'Each frontmatter field must have a unique name.' : 'Check indentation, quotes and field values.';
    // Parser messages can contain source text, including private header values.
    fail('INVALID', `Invalid YAML frontmatter${Number.isInteger(line) ? ` at line ${line + 1}` : ''}. ${hint}`);
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) fail('INVALID', 'Frontmatter must be a YAML mapping.');
  return { metadata, body: raw.slice(match[0].length) };
}
export function parseConfig(raw, path) {
  try {
    if (!path.endsWith('.toml')) jsonTree(raw);
    const result = path.endsWith('.toml') ? TOML.parse(raw, { joiner: '\n', bigint: false }) : JSON.parse(raw);
    if (!result || typeof result !== 'object' || Array.isArray(result)) fail('INVALID', 'Configuration must be an object.');
    return result;
  } catch { fail('INVALID', `Invalid ${path.endsWith('.toml') ? 'TOML' : 'JSON'} configuration. Original file was preserved.`); }
}
function jsonTree(raw) {
  const errors = [], tree = parseTree(raw, errors, { disallowComments: true, allowTrailingComma: false });
  if (errors.length || tree?.type !== 'object') fail('INVALID', 'Invalid JSON object. Original file was preserved.');
  function unique(node) {
    if (node.type === 'object') {
      const keys = node.children.map(p => p.children[0].value);
      if (new Set(keys).size !== keys.length) fail('INVALID', 'Duplicate JSON keys are ambiguous. Resolve them in the native source before changing entries.');
    }
    for (const child of node.children || []) unique(child);
  }
  unique(tree); return tree;
}
export function jsonValueText(raw, path) {
  const node = findNodeAtLocation(jsonTree(raw), path);
  if (!node) fail('NOT_FOUND', 'The JSON entry no longer exists.');
  return raw.slice(node.offset, node.offset + node.length);
}
export function editJson(raw, path, value, valueText) {
  jsonTree(raw);
  let result = applyEdits(raw, modify(raw, path, valueText === undefined ? value : null, {}));
  if (valueText !== undefined) {
    const node = findNodeAtLocation(jsonTree(result), path);
    result = result.slice(0, node.offset) + valueText + result.slice(node.offset + node.length);
  }
  jsonTree(result); return result;
}
export function validate(raw, path, kind) {
  if (/\.(json|toml)$/.test(path)) {
    const config = parseConfig(raw, path);
    if (kind === 'agents' && path.endsWith('.toml') && ['name', 'description', 'developer_instructions'].some(key => typeof config[key] !== 'string' || !config[key].trim())) fail('INVALID', 'A Codex subagent needs name, description and developer_instructions strings.');
  }
  else if (/\.(md|mdc)$/.test(path) && (kind !== 'memory' || path.endsWith('.mdc'))) {
    try { frontmatter(raw); } catch (error) { fail('INVALID', `${error.message} Original file was preserved.`); }
  }
}
export const jsonText = (obj, original = '') => JSON.stringify(obj, null, original.match(/^\{\r?\n([\t ]+)/)?.[1] || 2) + (original.includes('\r\n') ? '\r\n' : '\n');
export function mcpEnabledToml(raw, name, enabled) {
  const ast = parseForESLint(raw).ast;
  const nl = raw.includes('\r\n') ? '\r\n' : '\n';
  let value, table, inline;
  const keys = key => key.keys.map(k => k.name ?? k.value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const target = ['mcp_servers', name];
  function visit(node, prefix = []) {
    if (node.type === 'TOMLTable') {
      prefix = node.resolvedKey;
      if (same(prefix, target)) table = node;
    }
    if (node.type === 'TOMLKeyValue') {
      const path = [...prefix, ...keys(node.key)];
      if (same(path, [...target, 'enabled'])) value = node.value;
      if (same(path, target) && node.value.type === 'TOMLInlineTable') inline = node.value;
      if (node.value.type === 'TOMLInlineTable') for (const child of node.value.body) visit(child, path);
      return;
    }
    for (const child of node.body || []) visit(child, prefix);
  }
  visit(ast);
  let result;
  if (value) result = raw.slice(0, value.range[0]) + String(enabled) + raw.slice(value.range[1]);
  else if (inline) {
    const at = inline.range[1] - 1;
    result = raw.slice(0, at) + `${inline.body.length ? ', ' : ''}enabled = ${enabled}` + raw.slice(at);
  } else if (table) {
    // Insert after the parsed header, preserving comments, whitespace and all unrelated bytes.
    const at = raw.indexOf('\n', table.key.range[1]);
    result = at < 0 ? raw + nl + `enabled = ${enabled}` + nl : raw.slice(0, at + 1) + `enabled = ${enabled}` + nl + raw.slice(at + 1);
  } else result = raw + nl + `[mcp_servers.${JSON.stringify(name)}]` + nl + `enabled = ${enabled}` + nl;
  parseConfig(result, 'config.toml');
  return result;
}
export function appendMcpToml(raw, name, config) {
  const tail = TOML.stringify({ mcp_servers: TOML.Section({ [name]: TOML.Section(config) }) }, { newline: '\n' });
  const result = raw + '\n' + (Array.isArray(tail) ? tail.join('\n') : tail) + '\n';
  parseConfig(result, 'config.toml'); return result;
}
// Edit one TOML value/subtree while preserving unrelated bytes, including
// comments, dotted keys and inline tables. Never stringify the whole config.
export function editTomlValue(raw, target, value) {
  parseConfig(raw, 'config.toml');
  const ast = parseForESLint(raw).ast, nodes = [], tables = [];
  const prefix = (a, b) => b.every((key, i) => a[i] === key);
  function visit(node, path = []) {
    if (node.type === 'TOMLTable') { path = node.resolvedKey; tables.push({ node, path }); }
    if (node.type === 'TOMLKeyValue') {
      path = [...path, ...node.key.keys.map(k => k.name ?? k.value)]; nodes.push({ node, path });
      if (node.value.type === 'TOMLInlineTable') for (const child of node.value.body) visit(child, path);
      return;
    }
    for (const child of node.body || []) visit(child, path);
  }
  visit(ast);
  const keyText = keys => keys.map(JSON.stringify).join('.');
  const literal = v => {
    if (typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v))) return String(v);
    if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
    if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)} = ${literal(x)}`).join(', ')} }`;
    fail('UNSUPPORTED', 'This value cannot be transferred losslessly to TOML.');
  };
  const exact = nodes.find(n => n.path.length === target.length && prefix(n.path, target));
  const changes = [];
  if (value !== undefined && exact) changes.push([exact.node.value.range[0], exact.node.value.range[1], literal(value)]);
  else if (value !== undefined) {
    const inline = nodes.filter(n => prefix(target, n.path) && n.node.value.type === 'TOMLInlineTable').sort((a, b) => b.path.length - a.path.length)[0];
    if (inline) { const at = inline.node.value.range[1] - 1; changes.push([at, at, `${inline.node.value.body.length ? ', ' : ''}${keyText(target.slice(inline.path.length))} = ${literal(value)}`]); }
    else {
      const table = tables.filter(t => prefix(target, t.path) && t.path.length < target.length && t.node.kind !== 'array').sort((a, b) => b.path.length - a.path.length)[0];
      if (table) { const at = raw.indexOf('\n', table.node.key.range[1]); changes.push(at < 0 ? [raw.length, raw.length, `\n${keyText(target.slice(table.path.length))} = ${literal(value)}\n`] : [at + 1, at + 1, `${keyText(target.slice(table.path.length))} = ${literal(value)}\n`]); }
      else changes.push([0, 0, `${keyText(target)} = ${literal(value)}\n`]);
    }
  } else {
    for (const { node, path } of tables) if (prefix(path, target)) changes.push([...node.range, '']);
    for (const { node, path } of nodes) {
      if (!prefix(path, target) || changes.some(([start, end]) => node.range[0] >= start && node.range[1] <= end)) continue;
      let [start, end] = node.range;
      if (node.parent.type === 'TOMLInlineTable') {
        const siblings = node.parent.body, index = siblings.indexOf(node);
        if (index < siblings.length - 1) end = siblings[index + 1].range[0];
        else if (index > 0) start = siblings[index - 1].range[1];
      }
      changes.push([start, end, '']);
    }
  }
  let result = raw;
  for (const [start, end, text] of changes.sort((a, b) => b[0] - a[0])) result = result.slice(0, start) + text + result.slice(end);
  parseConfig(result, 'config.toml'); return result;
}
export function validateMcp(cfg) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail('INVALID', 'MCP configuration must be an object.');
  const command = typeof cfg.command === 'string' && cfg.command.trim().length > 0;
  const url = typeof cfg.url === 'string' && cfg.url.trim().length > 0;
  if (command === url || cfg.command !== undefined && !command || cfg.url !== undefined && !url) fail('INVALID', 'MCP configuration needs exactly one nonempty command or URL.');
  if (cfg.args !== undefined && (!Array.isArray(cfg.args) || cfg.args.some(a => typeof a !== 'string'))) fail('INVALID', 'MCP arguments must be an array of strings.');
  if (cfg.url) { try { if (!['https:', 'http:'].includes(new URL(cfg.url).protocol)) throw Error(); } catch { fail('INVALID', 'MCP URL must use HTTP or HTTPS.'); } }
  if (cfg.enabled !== undefined && typeof cfg.enabled !== 'boolean') fail('INVALID', 'MCP enabled must be a boolean.');
  for (const field of ['env', 'headers', 'http_headers', 'env_http_headers']) {
    const map = cfg[field];
    if (map !== undefined && (!map || typeof map !== 'object' || Array.isArray(map) || Object.values(map).some(v => typeof v !== 'string'))) fail('INVALID', `MCP ${field} must map names to strings.`);
  }
}
