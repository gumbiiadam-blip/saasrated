import { wiki } from './wikiClient.js';
import { config } from './config.js';

/**
 * One poller, two snapshots.
 *
 * The server pulls fresh prices from the wiki at the premium cadence and stores
 * them as the "fast" snapshot. Every free-refresh interval the fast snapshot is
 * copied into the "slow" snapshot. Free users only ever see the slow one, so the
 * free tier really is exactly as stale as advertised and we never poll the wiki
 * twice for the same data.
 */
class MarketStore {
  constructor() {
    this.mapping = new Map(); // id -> item meta
    this.fast = { latest: {}, fiveMin: {}, oneHour: {}, updatedAt: 0, fiveMinAt: 0, oneHourAt: 0 };
    this.slow = { latest: {}, fiveMin: {}, oneHour: {}, updatedAt: 0, fiveMinAt: 0, oneHourAt: 0 };
    this.lastSlowCopy = 0;
    this.errors = [];
    this.listeners = new Set();
    this.timers = [];
    this.tsCache = new Map(); // `${id}:${step}` -> { at, data }
  }

  snapshot(tier) {
    return tier === 'premium' ? this.fast : this.slow;
  }

  onUpdate(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  recordError(where, err) {
    this.errors.unshift({ at: Date.now(), where, message: err.message });
    this.errors = this.errors.slice(0, 20);
    console.error(`[market] ${where}: ${err.message}`);
  }

  async loadMapping() {
    try {
      const list = await wiki.mapping();
      this.mapping = new Map(list.map((it) => [it.id, it]));
    } catch (err) {
      this.recordError('mapping', err);
    }
  }

  async pollLatest() {
    try {
      const res = await wiki.latest();
      this.fast = { ...this.fast, latest: res.data || {}, updatedAt: Date.now() };
      this.maybeCopySlow();
      for (const fn of this.listeners) fn(this.fast);
    } catch (err) {
      this.recordError('latest', err);
    }
  }

  async pollFiveMin() {
    try {
      const res = await wiki.fiveMin();
      this.fast = { ...this.fast, fiveMin: res.data || {}, fiveMinAt: Date.now() };
      this.maybeCopySlow();
    } catch (err) {
      this.recordError('5m', err);
    }
  }

  async pollOneHour() {
    try {
      const res = await wiki.oneHour();
      this.fast = { ...this.fast, oneHour: res.data || {}, oneHourAt: Date.now() };
      this.maybeCopySlow();
    } catch (err) {
      this.recordError('1h', err);
    }
  }

  maybeCopySlow(force = false) {
    const due = Date.now() - this.lastSlowCopy >= config.freeRefreshSeconds * 1000;
    if (force || due || !this.slow.updatedAt) {
      this.slow = { ...this.fast };
      this.lastSlowCopy = Date.now();
    }
  }

  async timeseries(id, step = '5m') {
    const key = `${id}:${step}`;
    const cached = this.tsCache.get(key);
    const ttl = step === '5m' ? 60_000 : 5 * 60_000;
    if (cached && Date.now() - cached.at < ttl) return cached.data;
    const res = await wiki.timeseries(id, step);
    const data = res.data || [];
    this.tsCache.set(key, { at: Date.now(), data });
    return data;
  }

  async start() {
    await this.loadMapping();
    await Promise.all([this.pollLatest(), this.pollFiveMin(), this.pollOneHour()]);
    this.maybeCopySlow(true);
    const every = (ms, fn) => this.timers.push(setInterval(fn, ms).unref());
    every(config.premiumRefreshSeconds * 1000, () => this.pollLatest());
    every(60_000, () => this.pollFiveMin());
    every(5 * 60_000, () => this.pollOneHour());
    every(24 * 60 * 60_000, () => this.loadMapping());
    every(config.freeRefreshSeconds * 1000, () => this.maybeCopySlow(true));
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  status() {
    return {
      items: this.mapping.size,
      fastUpdatedAt: this.fast.updatedAt,
      slowUpdatedAt: this.slow.updatedAt,
      freeRefreshSeconds: config.freeRefreshSeconds,
      premiumRefreshSeconds: config.premiumRefreshSeconds,
      offline: config.offline,
      errors: this.errors.slice(0, 5),
    };
  }
}

export const market = new MarketStore();
