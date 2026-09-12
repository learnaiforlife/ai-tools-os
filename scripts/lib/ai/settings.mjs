import { isAbsolute } from 'node:path';
import { fail } from '../storage.mjs';

export const ENGINE_IDS = ['claude', 'codex', 'cursor'];
export const AI_DEFAULTS = { engine: 'auto', models: {}, paths: {}, timeout: 120, maxCalls: 40, budget: 1, strictBudget: false };
export function aiPreferences(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID', 'Invalid AI preferences.');
  const v = { ...AI_DEFAULTS, ...value };
  if (!['auto', 'local', ...ENGINE_IDS].includes(v.engine)) fail('INVALID', 'Select an AI engine or Local only.');
  for (const key of ['models', 'paths']) {
    if (!v[key] || typeof v[key] !== 'object' || Array.isArray(v[key])) fail('INVALID', `Invalid AI ${key}.`);
    for (const [id, text] of Object.entries(v[key])) {
      if (!ENGINE_IDS.includes(id) || typeof text !== 'string' || text.length > (key === 'paths' ? 2000 : 100) || /[\0\r\n]/.test(text) || key === 'paths' && text && !isAbsolute(text) || key === 'models' && text && !/^[\w./:[\]-]+$/.test(text)) fail('INVALID', `Invalid AI ${key} entry.`);
    }
  }
  if (!Number.isInteger(v.timeout) || v.timeout < 15 || v.timeout > 600 || !Number.isInteger(v.maxCalls) || v.maxCalls < 1 || v.maxCalls > 500 || !Number.isFinite(v.budget) || v.budget < 0.05 || v.budget > 50 || typeof v.strictBudget !== 'boolean') fail('INVALID', 'Use 15–600 seconds, 1–500 calls and a $0.05–$50 Claude budget.');
  return { engine: v.engine, models: { ...v.models }, paths: { ...v.paths }, timeout: v.timeout, maxCalls: v.maxCalls, budget: v.budget, strictBudget: v.strictBudget };
}

export function runSettings(value = {}, preferences = AI_DEFAULTS) {
  const prefs = aiPreferences(preferences), provider = value.provider ?? prefs.engine;
  const config = aiPreferences({ ...prefs, engine: provider, timeout: value.timeout ?? prefs.timeout, maxCalls: value.maxCalls ?? prefs.maxCalls, budget: value.budget ?? prefs.budget, strictBudget: value.strictBudget ?? prefs.strictBudget });
  const model = value.model ?? '';
  if (typeof model !== 'string' || model.length > 100 || model && !/^[\w./:[\]-]+$/.test(model)) fail('INVALID', 'Enter a model ID accepted by the selected engine, or leave it empty for its default.');
  const repeats = value.repeats ?? 1;
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) fail('INVALID', 'Use 1–5 repeats.');
  return { provider, model, models: config.models, paths: config.paths, repeats, timeout: config.timeout, maxCalls: config.maxCalls, budget: config.budget, strictBudget: config.strictBudget, files: value.files === true, blind: value.blind === true };
}
