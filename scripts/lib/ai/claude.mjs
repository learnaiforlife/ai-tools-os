import * as fs from 'node:fs';
import { join } from 'node:path';
import { fail } from '../storage.mjs';
import { executable, runProcess } from '../processes.mjs';
import { engineEnvironment } from './environment.mjs';

export function createClaudeAdapter({ home, env = process.env, run = runProcess, override }) {
  const cli = () => override || executable('claude', home, env) || fail('TOOL_MISSING', 'Claude Code was not found. Install it, sign in from Terminal, then retry. AIOS uses that existing authentication.');
  let capabilities;
  async function check(signal) {
    const path = cli(), stat = fs.statSync(path), identity = `${fs.realpathSync(path)}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    if (capabilities?.identity === identity) return capabilities;
    const help = await run(path, ['--help'], { env, signal, timeout: 20000 });
    for (const flag of ['--safe-mode', '--restricted', '--json-schema', '--max-budget-usd', '--setting-sources']) if (!help.stdout.includes(flag)) fail('TOOL_VERSION', `Update Claude Code: this integration requires ${flag}.`);
    const version = await run(path, ['--version'], { env, signal, timeout: 20000 });
    capabilities = { path, identity, version: version.stdout.trim().slice(0, 100) }; return capabilities;
  }
  async function call({ prompt, system = 'Complete the user task. Return the requested answer.', directory, settings, signal, schema, trigger = false, files = false, budget, onCost }) {
    const tool = await check(signal), remaining = budget.limit - budget.spent;
    if (remaining < 0.01) fail('BUDGET', 'The run reached its spending limit. Increase the limit for a new run.');
    const cleanEnv = engineEnvironment('claude', home, env, tool.path);
    const args = ['-p', '--output-format', trigger ? 'stream-json' : 'json', '--no-session-persistence', ...(settings.model ? ['--model', settings.model] : []),
      '--max-budget-usd', String(Math.round(remaining * 100) / 100), '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-chrome',
      '--permission-mode', 'dontAsk', '--restricted', '--settings', JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }), '--system-prompt', system];
    if (trigger) args.push('--verbose', '--plugin-dir', join(directory, 'trigger-plugin'), '--tools', 'Skill,Read', '--allowedTools', 'Skill,Read');
    else args.push('--safe-mode', '--tools', files ? 'Read,Write,Edit,Glob,Grep' : '', ...(files ? ['--allowedTools', 'Read,Write,Edit,Glob,Grep'] : []));
    if (schema) args.push('--json-schema', JSON.stringify(schema));
    const began = Date.now();
    const raw = await run(tool.path, args, { cwd: directory, env: cleanEnv, signal, timeout: settings.timeout * 1000, input: prompt, maxBytes: 2 * 1024 * 1024, allowFailure: true });
    let result, events = [];
    try {
      if (trigger) { events = raw.stdout.split('\n').filter(Boolean).map(s => JSON.parse(s)); result = events.findLast(e => e.type === 'result'); }
      else result = JSON.parse(raw.stdout);
    } catch { fail('ENGINE_RESPONSE', 'Claude did not return JSON. Check that Claude Code is signed in and updated. No score was recorded.'); }
    if (!result || result.type !== 'result') fail('ENGINE_RESPONSE', 'Claude did not return a completed result. No score was recorded.');
    if (result.result !== undefined && typeof result.result !== 'string') fail('ENGINE_RESPONSE', 'Claude returned an invalid answer type. No score was recorded.');
    if (result.is_error && /authenticat|OAuth|sign.?in|login|API key/i.test(String(result.result))) fail('AUTH_REQUIRED', 'Claude Code is not authenticated. Run claude auth login in Terminal, then retry this job.');
    const cost = Number.isFinite(result.total_cost_usd) && result.total_cost_usd >= 0 ? result.total_cost_usd : null;
    if (cost == null) fail('ENGINE_RESPONSE', 'Claude did not report usage cost. Stopping to preserve the spending limit.');
    budget.spent += cost; onCost?.(budget.spent);
    if (raw.exitCode || result.is_error || result.subtype && result.subtype !== 'success') fail('ENGINE_FAILED', `Claude could not complete the run. ${String(result.result || result.errors?.join('; ') || 'Check authentication and model access.').slice(0, 700)}`);
    if (trigger) {
      const init = events.find(e => e.type === 'system' && e.subtype === 'init');
      if (!init?.skills?.includes('aios-evaluation:aios-evaluated-skill') || init.mcp_servers?.length || init.plugins?.some(p => p.name !== 'aios-evaluation')) fail('TRIGGER_SETUP', 'The isolated evaluation skill was not loaded cleanly. Update Claude Code; no trigger score was recorded.');
    }
    if (result.permission_denials?.length) fail('CAPABILITY', 'The task requested tools outside this evaluation mode. Command/MCP-dependent tasks cannot be scored by the text and file runner.');
    const usage = result.usage, tokens = usage ? ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((sum, key) => sum + (Number(usage[key]) || 0), 0) : null;
    if (schema && (!result.structured_output || typeof result.structured_output !== 'object')) fail('JUDGE_RESPONSE', 'The model did not return a structured assessment. No judgment was recorded.');
    const models = Object.keys(result.modelUsage || {});
    return { text: result.result || '', structured: result.structured_output, durationMs: Date.now() - began, tokens, cost, events, engine: tool.version, model: typeof result.model === 'string' ? result.model : models.length === 1 ? models[0] : null };
  }

  return { check, call };
}
