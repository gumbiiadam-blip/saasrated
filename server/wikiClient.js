import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { cache } from './cache.js';

async function readFixture(name) {
  const raw = await fs.readFile(path.join(config.fixturesDir, name), 'utf8');
  return JSON.parse(raw);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`wiki ${res.status} for ${url}`);
  return res.json();
}

/**
 * Network with a disk safety net. Returns { data, at, fromCache }.
 * - offline mode: fixtures, never the network
 * - freshEnoughMs: if the cached copy is younger than this, don't even ask the wiki
 * - on network failure: last cached copy of any age, or rethrow if there is none
 */
async function cached(key, freshEnoughMs, fetcher) {
  const hit = cache.read(key, freshEnoughMs);
  if (hit) return { data: hit.data, at: hit.at, fromCache: true };
  try {
    const data = await fetcher();
    cache.write(key, data);
    return { data, at: Date.now(), fromCache: false };
  } catch (err) {
    const stale = cache.read(key);
    if (stale) {
      console.warn(`[wiki] ${key}: ${err.message}; serving cached copy from ${new Date(stale.at).toISOString()}`);
      return { data: stale.data, at: stale.at, fromCache: true, error: err.message };
    }
    throw err;
  }
}

export const wiki = {
  async mapping() {
    if (config.offline) return { data: await readFixture('mapping.json'), at: Date.now(), fromCache: true };
    // Item list changes a few times a year. A week is plenty.
    return cached('mapping', 7 * 86_400_000, () => getJson(`${config.wikiBase}/mapping`));
  },
  async latest() {
    if (config.offline) return { data: (await readFixture('latest.json')).data, at: Date.now(), fromCache: true };
    return cached('latest', 0, async () => (await getJson(`${config.wikiBase}/latest`)).data);
  },
  async fiveMin() {
    if (config.offline) return { data: (await readFixture('5m.json')).data, at: Date.now(), fromCache: true };
    return cached('5m', 0, async () => (await getJson(`${config.wikiBase}/5m`)).data);
  },
  async oneHour() {
    if (config.offline) return { data: (await readFixture('1h.json')).data, at: Date.now(), fromCache: true };
    return cached('1h', 0, async () => (await getJson(`${config.wikiBase}/1h`)).data);
  },
  async timeseries(id, timestep = '5m') {
    if (config.offline) {
      const all = await readFixture('timeseries.json');
      return { data: all[String(id)]?.[timestep] || all[String(id)]?.['5m'] || [], at: Date.now(), fromCache: true };
    }
    const ttl = { '5m': 5 * 60_000, '1h': 30 * 60_000, '6h': 2 * 3600_000, '24h': 6 * 3600_000 }[timestep] || 5 * 60_000;
    return cached(`ts_${id}_${timestep}`, ttl, async () => (await getJson(`${config.wikiBase}/timeseries?timestep=${encodeURIComponent(timestep)}&id=${Number(id)}`)).data);
  },
  async newsRss() {
    if (config.offline) return { data: await fs.readFile(path.join(config.fixturesDir, 'news.rss'), 'utf8'), at: Date.now(), fromCache: true };
    return cached('news', 0, async () => {
      const res = await fetch(config.newsRss, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`news rss ${res.status}`);
      return res.text();
    });
  },
};
