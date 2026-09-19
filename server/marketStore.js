import { wiki } from './wikiClient.js';
import { config } from './config.js';

const MIN = 60_000;

/**
 * One poller, two snapshots, and it only runs while someone is looking.
 *
 * Fresh prices land in the "fast" snapshot; every free-refresh interval that is
 * copied into the "slow" snapshot. Premium reads fast, free reads slow.
 *
 * Load control:
 * - nothing is polled unless a client touched the API in the last `idleAfterMs`
 * - if only free clients are active, `latest` is polled at the free cadence
 * - boot loads the last cached copies from disk before asking the wiki
 * - the wiki's 5m/1h endpoints only change on a 5-minute grid; we poll them on it
 */
class MarketStore {
  constructor() {
    this.mapping = new Map();
    this.fast = this.emptySnap();
    this.slow = this.emptySnap();
    this.lastSlowCopy = 0;
    this.lastLatestPoll = 0;
    this.errors = [];
    this.listeners = new Set();
    this.timers = [];
    this.activity = { free: 0, premium: 0 };
    this.idleAfterMs = config.idleAfterSeconds * 1000;
    this.polling = false;
  }

  emptySnap() {
    return { latest: {}, fiveMin: {}, oneHour: {}, updatedAt: 0, fiveMinAt: 0, oneHourAt: 0, fromCache: false };
  }

  snapshot(tier) {
    return tier === 'premium' ? this.fast : this.slow;
  }

  /** Called on every API request so the poller knows someone is watching. */
  touch(tier) {
    this.activity[tier === 'premium' ? 'premium' : 'free'] = Date.now();
  }

  activeTier() {
    const now = Date.now();
    if (now - this.activity.premium < this.idleAfterMs) return 'premium';
    if (now - this.activity.free < this.idleAfterMs) return 'free';
    return null;
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
      const { data } = await wiki.mapping();
      this.mapping = new Map(data.map((it) => [it.id, it]));
    } catch (err) {
      this.recordError('mapping', err);
    }
  }

  async pollLatest() {
    try {
      const { data, at, fromCache } = await wiki.latest();
      this.lastLatestPoll = Date.now();
      this.fast = { ...this.fast, latest: data || {}, updatedAt: at, fromCache };
      this.maybeCopySlow();
      for (const fn of this.listeners) fn(this.fast);
    } catch (err) {
      this.recordError('latest', err);
    }
  }

  async pollFiveMin() {
    try {
      const { data, at } = await wiki.fiveMin();
      this.fast = { ...this.fast, fiveMin: data || {}, fiveMinAt: at };
      this.maybeCopySlow();
    } catch (err) {
      this.recordError('5m', err);
    }
  }

  async pollOneHour() {
    try {
      const { data, at } = await wiki.oneHour();
      this.fast = { ...this.fast, oneHour: data || {}, oneHourAt: at };
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
    const { data } = await wiki.timeseries(id, step);
    return data || [];
  }

  /** Runs on the premium cadence; decides whether anything actually needs fetching. */
  async tick() {
    if (this.polling) return;
    const tier = this.activeTier();
    if (!tier) return; // nobody's watching, let the wiki breathe
    const since = Date.now() - this.lastLatestPoll;
    const wanted = (tier === 'premium' ? config.premiumRefreshSeconds : config.freeRefreshSeconds) * 1000;
    if (since < wanted - 500) return;
    this.polling = true;
    try {
      await this.pollLatest();
      // 5m and 1h buckets close on a 5-minute grid. Refetch once per grid step, not on every tick.
      const bucket = Math.floor(Date.now() / (5 * MIN));
      if (bucket !== this.lastBucket) {
        this.lastBucket = bucket;
        await this.pollFiveMin();
        if (bucket % 3 === 0 || !this.fast.oneHourAt) await this.pollOneHour();
      }
    } finally {
      this.polling = false;
    }
  }

  /** Make sure a first request after a quiet spell gets fresh numbers instead of hour-old ones. */
  async ensureFresh(tier) {
    this.touch(tier);
    const wanted = (tier === 'premium' ? config.premiumRefreshSeconds : config.freeRefreshSeconds) * 1000;
    if (Date.now() - this.lastLatestPoll >= wanted) await this.tick();
  }

  async start() {
    await this.loadMapping();
    // Warm from whatever we have so the first page load is instant, then refresh in the background.
    this.touch('premium');
    await Promise.all([this.pollLatest(), this.pollFiveMin(), this.pollOneHour()]);
    this.lastBucket = Math.floor(Date.now() / (5 * MIN));
    this.maybeCopySlow(true);
    const every = (ms, fn) => this.timers.push(setInterval(fn, ms).unref());
    every(config.premiumRefreshSeconds * 1000, () => this.tick());
    every(config.freeRefreshSeconds * 1000, () => this.maybeCopySlow(true));
    every(24 * 60 * MIN, () => this.loadMapping());
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
      fromCache: this.fast.fromCache,
      activeTier: this.activeTier(),
      freeRefreshSeconds: config.freeRefreshSeconds,
      premiumRefreshSeconds: config.premiumRefreshSeconds,
      offline: config.offline,
      errors: this.errors.slice(0, 5),
    };
  }
}

export const market = new MarketStore();
