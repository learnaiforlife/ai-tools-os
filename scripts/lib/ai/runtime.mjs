import * as fs from 'node:fs';
import { executable, runProcess } from '../processes.mjs';
import { fail } from '../storage.mjs';
import { createClaudeAdapter } from './claude.mjs';
import { createTextAdapter } from './cli-adapters.mjs';
import { ENGINE_IDS } from './settings.mjs';
import { validateOutput } from './contracts.mjs';
import { engineEnvironment } from './environment.mjs';

const names = { claude: 'Claude Code', codex: 'Codex CLI', cursor: 'Cursor Agent' };
export const reportedCost = budget => budget.unknown ? null : budget.spent;
export function createAIRuntime({ home, env = process.env, run = runProcess }) {
  const cache = new Map();
  async function probe(id, settings = {}, signal) {
    const path = settings.paths?.[id] || (id === 'cursor' ? executable('agent', home, env) || executable('cursor-agent', home, env) : executable(id, home, env));
    if (!path) fail('TOOL_MISSING', `${names[id]} was not found. Install it or set its executable path in AI settings.`);
    let stat, identity;
    try { stat = fs.statSync(path); identity = `${fs.realpathSync(path)}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`; if (!stat.isFile() || !(stat.mode & 0o111)) throw Error(); }
    catch { fail('TOOL_MISSING', `${names[id]} executable is unavailable.`); }
    const key = `${id}:${identity}`;
    if (cache.has(key)) return cache.get(key);
    const clean = engineEnvironment(id, home, env, path);
    let tool, adapter;
    if (id === 'claude') {
      adapter = createClaudeAdapter({ home, env, run, override: path }); tool = await adapter.check(signal);
    } else {
      const version = await run(path, ['--version'], { env: clean, signal, timeout: 15000 });
      const help = await run(path, id === 'codex' ? ['exec', '--help'] : ['--help'], { env: clean, signal, timeout: 15000 });
      const flags = id === 'codex' ? ['--json', '--strict-config', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--output-schema', '--sandbox'] : ['--mode', '--sandbox', '--workspace', '--output-format'];
      if (id === 'cursor' && !help.stdout.includes('Cursor Agent') || id === 'codex' && !/codex/i.test(version.stdout) || flags.some(flag => !help.stdout.includes(flag))) fail('TOOL_VERSION', `Update ${names[id]}: this version does not support the required isolated text interface.`);
      tool = { path, identity, version: version.stdout.trim().slice(0, 100) };
      if (id === 'codex') {
        const result = await run(path, ['features', 'list'], { env: clean, signal, timeout: 15000 });
        tool.features = result.stdout.split('\n').filter(s => !/\s(?:removed|deprecated)\s/.test(s)).map(s => s.match(/^([a-z][a-z0-9_]*)\s+.*\s(?:true|false)$/)?.[1]).filter(Boolean);
        if (!['shell_tool', 'hooks', 'plugins'].every(f => tool.features.includes(f))) fail('TOOL_VERSION', 'Codex cannot report the required isolation features. Update Codex before using this engine.');
      }
      adapter = createTextAdapter({ id, home, env, run, tool });
    }
    const record = { ...tool, id, name: names[id], capabilities: { text: true, files: id === 'claude', trigger: id === 'claude', dollarLimit: id === 'claude', schema: id === 'cursor' ? 'validated-answer' : 'native-and-validated' }, adapter };
    for (const old of cache.keys()) if (old.startsWith(`${id}:`)) cache.delete(old);
    cache.set(key, record); return record;
  }
  async function check(signal, settings = {}) {
    const provider = settings.provider || 'claude';
    if (provider === 'local') fail('LOCAL_ONLY', 'Local mode selected. Behavioral model evaluations were not run.');
    if (provider !== 'auto' && !ENGINE_IDS.includes(provider)) fail('INVALID', 'Unknown AI engine.');
    const ids = provider === 'auto' ? ENGINE_IDS : [provider], errors = [];
    for (const id of ids) {
      try {
        const record = await probe(id, settings, signal);
        if ((settings.files || settings.trigger) && id !== 'claude' || settings.strictBudget && !record.capabilities.dollarLimit) fail('CAPABILITY', `${record.name} supports text work only and cannot enforce a dollar budget. Select a compatible engine or adjust the run settings.`);
        return record;
      } catch (error) { if (signal?.aborted || provider !== 'auto') throw error; errors.push(error); }
    }
    fail(errors.some(e => e.code === 'CAPABILITY') ? 'CAPABILITY' : 'TOOL_MISSING', `No compatible AI engine is available. ${errors.map(e => e.message).join(' ')}`);
  }
  async function call(args) {
    const { budget, signal, schema } = args;
    const settings = { ...args.settings, trigger: args.trigger };
    if ((budget.calls || 0) >= (settings.maxCalls || 100)) fail('CALL_LIMIT', 'The run reached its model-call limit. Start a new run to continue.');
    const tool = await check(signal, { ...settings, ...(budget.provider ? { provider: budget.provider } : {}) });
    if (budget.identity && budget.identity !== tool.identity) fail('TOOL_VERSION', 'The selected CLI changed during this run. Start a new comparison.');
    budget.provider = tool.id; budget.identity = tool.identity;
    settings.model = settings.model || settings.models?.[tool.id] || '';
    budget.calls = (budget.calls || 0) + 1;
    let result, costReported = false;
    try { result = await tool.adapter.call({ ...args, settings, onCost: cost => { costReported = true; args.onCost?.(cost); } }); }
    catch (error) { if (!costReported && error.code !== 'BUDGET') budget.unknown = true; throw error; }
    if (result.cost == null) budget.unknown = true;
    if (schema) validateOutput(result.structured, schema);
    if (result.model && budget.resolvedModel && result.model !== budget.resolvedModel) fail('CAPABILITY', 'The engine reported a different model during the comparison. Start a new run with a pinned model.');
    if (result.model) budget.resolvedModel = result.model;
    return { ...result, provider: tool.id, requestedModel: settings.model || 'provider default', resolvedModel: result.model || null, model: result.model || settings.model || 'provider default', provenance: 'AI generated' };
  }
  async function status(settings = {}, signal) {
    const results = await Promise.allSettled(ENGINE_IDS.map(id => probe(id, settings, signal)));
    return results.map((r, i) => r.status === 'fulfilled' ? { id: r.value.id, name: r.value.name, path: r.value.path, version: r.value.version, state: 'available_unverified', capabilities: r.value.capabilities } : { id: ENGINE_IDS[i], name: names[ENGINE_IDS[i]], state: r.reason.code === 'TOOL_MISSING' ? 'not_installed' : 'incompatible', error: r.reason.message });
  }
  return { check, call, status };
}
