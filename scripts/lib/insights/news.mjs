import * as fs from 'node:fs';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { load } from 'cheerio';
import { atomicWrite, fail, hash } from '../storage.mjs';

export const NEWS_SOURCES = [
  { id: 'codex', provider: 'Codex', type: 'harness', name: 'OpenAI · Codex releases', url: 'https://github.com/openai/codex/releases.atom', host: 'github.com', path: '/openai/codex/releases/' },
  { id: 'claude-code', provider: 'Claude Code', type: 'harness', name: 'Anthropic · Claude Code releases', url: 'https://github.com/anthropics/claude-code/releases.atom', host: 'github.com', path: '/anthropics/claude-code/releases/' },
  { id: 'cursor', provider: 'Cursor', type: 'harness', name: 'Cursor · Changelog', url: 'https://cursor.com/changelog/rss.xml', host: 'cursor.com', path: '/changelog/' },
  { id: 'openai', provider: 'OpenAI', type: 'models', name: 'OpenAI · News', url: 'https://openai.com/news/rss.xml', host: 'openai.com', path: '/' },
  { id: 'anthropic', provider: 'Anthropic', type: 'models', name: 'Anthropic · News', url: 'https://www.anthropic.com/news', host: 'www.anthropic.com', path: '/news/' },
];
const clean = x => typeof x === 'string' ? load(x).text().replace(/\s+/g, ' ').trim() : '';
const array = v => v == null ? [] : Array.isArray(v) ? v : [v];
const aliases = { 'Claude Code': /\bclaude(?: code)?\b|\banthropic\b/i, Codex: /\bcodex\b|\bopenai\b|\bgpt\b/i, Cursor: /\bcursor\b/i };
export function interpretNewsPrompt(prompt, detected = []) {
  if (typeof prompt !== 'string' || prompt.length > 2000) fail('INVALID', 'Use a news preference of up to 2,000 characters.');
  const excluded = Object.entries(aliases).filter(([, re]) => new RegExp(`(?:exclude|except|without|no|not)\\s+(?:any\\s+)?(?:${re.source})`, 'i').test(prompt)).map(([p]) => p);
  const positive = prompt.replace(/\b(?:exclude|except|without|no|not)\s+(?:any\s+)?(?:claude(?: code)?|anthropic|codex|openai|gpt|cursor)\b/gi, '');
  const named = Object.entries(aliases).filter(([, re]) => re.test(positive)).map(([p]) => p);
  const providers = [...new Set(detected)].filter(p => (!named.length || named.includes(p)) && !excluded.includes(p));
  const days = Math.min(365, Math.max(1, Number(/(?:last|past)\s+(\d+)\s*days?\b/i.exec(prompt)?.[1]) || (/\bweek\b/i.test(prompt) ? 7 : /\bmonth\b/i.test(prompt) ? 30 : 90)));
  const categoryPrompt = prompt.replace(/\b(?:codex|openai|gpt|claude(?: code)?|anthropic|cursor)\b/gi, '').replace(/\s+/g, ' ');
  const modelOnly = /(?:only\s+(?:new\s+)?models?|models?\s+(?:releases?\s+)?only|no\s+harness)/i.test(categoryPrompt);
  const harnessOnly = /(?:only\s+harness|harness(?:es)?\s+(?:releases?\s+)?only|no\s+models?)/i.test(categoryPrompt);
  return { providers, days, types: modelOnly && !harnessOnly ? ['models'] : harnessOnly && !modelOnly ? ['harness'] : ['harness', 'models'],
    explanation: 'Interprets harness names, only models / only harness releases, exclusions, and last N days. Only detected tools and their model families are eligible.' };
}
export function officialNewsUrl(value, source) {
  try { const u = new URL(value, source.url); return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname === source.host && u.pathname.startsWith(source.path) ? u.href : null; }
  catch { return null; }
}
export function parseNews(text, source) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 2 * 1024 * 1024) fail('LIMIT', 'Official feed exceeds the 2 MiB limit.');
  let rows;
  if (source.id === 'anthropic') {
    const $ = load(text); rows = $('a[href^="/news/"]').map((_, el) => {
      const node = $(el), all = node.text().replace(/\s+/g, ' ').trim();
      const published = node.find('time').attr('datetime') || node.find('time').text().trim() || /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/.exec(all)?.[0];
      const title = node.find('h2,h3,h4').first().text().trim() || all.replace(published || '', '').replace(/^(Announcements|Product|Research|Policy)/, '').trim();
      return { title, url: node.attr('href'), publishedAt: published, description: '' };
    }).get();
  } else {
    if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) fail('INVALID', 'The official feed is not valid supported XML.');
    const parsed = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(text);
    rows = parsed.rss ? array(parsed.rss.channel?.item).map(item => ({ title: item.title, url: item.link, publishedAt: item.pubDate, description: item.description }))
      : array(parsed.feed?.entry).map(item => ({ title: item.title, url: array(item.link).find(l => l['@_rel'] === 'alternate')?.['@_href'] || array(item.link)[0]?.['@_href'], publishedAt: item.published || item.updated, description: item.summary || item.content?.['#text'] || item.content }));
  }
  const seen = new Set();
  return rows.flatMap(row => {
    const url = officialNewsUrl(row.url, source), title = clean(row.title).slice(0, 240), stamp = Date.parse(row.publishedAt);
    if (!url || !title || !Number.isFinite(stamp) || seen.has(url)) return [];
    seen.add(url);
    if (source.type === 'models' && !/introduc|launch|releas|new|available|next.generation|preview|upgrad|updat|model card|system card/i.test(title)) return [];
    if (source.type === 'models' && !/\b(gpt(?:[-\s]?\d)?|o[1-9]\b|claude|opus|sonnet|haiku)\b/i.test(title)) return [];
    // Display the publisher's headline, link and date. Avoid redistributing full articles.
    return [{ id: hash(url), title, url, publishedAt: new Date(stamp).toISOString(), source: source.name, sourceId: source.id, provider: source.provider, type: source.type }];
  });
}
export function createNewsReader({ root, fetcher = fetch, now = Date.now } = {}) {
  const file = join(root, 'official-news.json'); let running = null;
  function cached() { try { const st = fs.lstatSync(file); if (!st.isFile() || st.size > 1024 * 1024) return {}; return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
  async function read({ prompt, detected, models = [], refresh = false }) {
    const filter = interpretNewsPrompt(prompt, detected), sources = NEWS_SOURCES.filter(s => filter.types.includes(s.type) &&
      (filter.providers.includes(s.provider) || s.id === 'openai' && (filter.providers.includes('Codex') || filter.providers.includes('Cursor') && models.some(m => /gpt|^o\d/i.test(m))) || s.id === 'anthropic' && (filter.providers.includes('Claude Code') || filter.providers.includes('Cursor') && models.some(m => /claude|opus|sonnet|haiku/i.test(m)))));
    const cache = cached(), results = await Promise.all(sources.map(async source => {
      let entry = cache[source.id];
      const age = entry?.fetchedAt ? now() - Date.parse(entry.fetchedAt) : Infinity;
      if (entry?.error && now() - Date.parse(entry.attemptedAt) < 30000) return { source: source.name, ...entry, stale: true };
      if (!entry || age > 3600000 || refresh && age > 30000) {
        try {
          const response = await fetcher(source.url, { signal: AbortSignal.timeout(12000), redirect: 'error', headers: { Accept: 'application/rss+xml, application/atom+xml, text/html', 'User-Agent': 'AIOS official-release-reader' } });
          if (!response.ok) fail('NETWORK', `Official source returned HTTP ${response.status}.`);
          if (Number(response.headers.get('content-length')) > 2 * 1024 * 1024) fail('LIMIT', 'Official source is too large.');
          const chunks = []; let length = 0;
          for await (const chunk of response.body) { length += chunk.length; if (length > 2 * 1024 * 1024) fail('LIMIT', 'Official source is too large.'); chunks.push(chunk); }
          entry = { fetchedAt: new Date(now()).toISOString(), items: parseNews(Buffer.concat(chunks).toString('utf8'), source) }; cache[source.id] = entry;
        } catch (error) { entry = { items: entry?.items || [], fetchedAt: entry?.fetchedAt || null, attemptedAt: new Date(now()).toISOString(), error: error.code === 'LIMIT' ? error.message : 'Official source could not be refreshed. Showing cached headlines when available.' }; cache[source.id] = entry; return { source: source.name, ...entry, stale: true }; }
      }
      return { source: source.name, ...entry, stale: false };
    }));
    atomicWrite(file, JSON.stringify(cache));
    const items = results.flatMap(r => r.items).filter(i => { const t = Date.parse(i.publishedAt); return t >= now() - filter.days * 86400000 && t <= now() + 3600000; }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 30);
    return { items, filter, sources: results.map(({ items: _items, ...rest }) => rest), checkedAt: new Date(now()).toISOString() };
  }
  return { async read(args) { if (running) fail('BUSY', 'Official news is already refreshing.'); running = read(args); try { return await running; } finally { running = null; } } };
}
