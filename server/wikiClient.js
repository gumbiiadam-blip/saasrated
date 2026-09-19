import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

async function readFixture(name) {
  const raw = await fs.readFile(path.join(config.fixturesDir, name), 'utf8');
  return JSON.parse(raw);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`wiki ${res.status} for ${url}`);
  return res.json();
}

/**
 * Thin client for the OSRS Wiki real-time prices API.
 * In offline mode it serves the JSON fixtures in data/fixtures instead.
 */
export const wiki = {
  async mapping() {
    if (config.offline) return readFixture('mapping.json');
    return getJson(`${config.wikiBase}/mapping`);
  },
  async latest() {
    if (config.offline) return readFixture('latest.json');
    return getJson(`${config.wikiBase}/latest`);
  },
  async fiveMin() {
    if (config.offline) return readFixture('5m.json');
    return getJson(`${config.wikiBase}/5m`);
  },
  async oneHour() {
    if (config.offline) return readFixture('1h.json');
    return getJson(`${config.wikiBase}/1h`);
  },
  async timeseries(id, timestep = '5m') {
    if (config.offline) {
      const all = await readFixture('timeseries.json');
      return { data: all[String(id)]?.[timestep] || all[String(id)]?.['5m'] || [] };
    }
    return getJson(`${config.wikiBase}/timeseries?timestep=${encodeURIComponent(timestep)}&id=${Number(id)}`);
  },
  async newsRss() {
    if (config.offline) return fs.readFile(path.join(config.fixturesDir, 'news.rss'), 'utf8');
    const res = await fetch(config.newsRss, { headers: { 'User-Agent': config.userAgent } });
    if (!res.ok) throw new Error(`news rss ${res.status}`);
    return res.text();
  },
};
