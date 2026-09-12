import { fail } from '../storage.mjs';
export const EXPERIENCE_DEFAULTS = { showDetails: false, sessionsEnabled: true, newsEnabled: true, newsPrompt: 'Harness and model releases from my tools in the last 90 days', dismissed: [] };
export function experiencePreferences(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID', 'Invalid experience preferences.');
  const v = { ...EXPERIENCE_DEFAULTS, ...input };
  for (const key of ['showDetails', 'sessionsEnabled', 'newsEnabled']) if (typeof v[key] !== 'boolean') fail('INVALID', 'Invalid experience preference.');
  if (typeof v.newsPrompt !== 'string' || v.newsPrompt.length > 2000) fail('INVALID', 'News preference must be at most 2,000 characters.');
  if (!Array.isArray(v.dismissed) || v.dismissed.length > 500 || v.dismissed.some(x => typeof x !== 'string' || x.length > 100)) fail('INVALID', 'Invalid dismissed recommendation list.');
  return Object.fromEntries(Object.keys(EXPERIENCE_DEFAULTS).map(key => [key, v[key]]));
}
