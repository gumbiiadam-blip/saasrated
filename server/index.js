import express from 'express';
import path from 'node:path';
import os from 'node:os';
import { config } from './config.js';
import { market } from './marketStore.js';
import { buildFlips, sortFlips, filterFlips } from './flips.js';
import { detectMoves } from './dumps.js';
import { NewsStore } from './news.js';
import { AlertStore } from './alerts.js';
import { buildShortsPack } from './shorts.js';
import { tierMiddleware, requirePremium, isPremiumKey, setKeyCookie, clearKeyCookie } from './auth.js';
import { geTax, margin } from './tax.js';

export function createApp() {
  const app = express();
  const news = new NewsStore(market);
  const alerts = new AlertStore(market);

  app.disable('x-powered-by');
  app.use(express.json());
  app.use(tierMiddleware);
  app.use('/api', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Wake the poller for whoever is asking; a first hit after idle refreshes before answering.
    try { await market.ensureFresh(req.tier); } catch { /* served from whatever we have */ }
    next();
  });
  app.use(express.static(path.join(config.root, 'public'), { extensions: ['html'] }));

  const refreshFor = (tier) => (tier === 'premium' ? config.premiumRefreshSeconds : config.freeRefreshSeconds);

  app.get('/api/me', (req, res) => {
    res.json({
      app: { name: config.appName, tagline: config.appTagline, url: config.appUrl },
      tier: req.tier,
      refreshSeconds: refreshFor(req.tier),
      freeRefreshSeconds: config.freeRefreshSeconds,
      premiumRefreshSeconds: config.premiumRefreshSeconds,
      freeTopN: config.freeTopN,
      status: market.status(),
    });
  });

  app.post('/api/upgrade', (req, res) => {
    const key = (req.body?.key || '').trim();
    if (!isPremiumKey(key)) return res.status(401).json({ error: 'bad_key', message: 'That key does not unlock anything. Nice try.' });
    setKeyCookie(res, key);
    res.json({ ok: true, tier: 'premium', refreshSeconds: config.premiumRefreshSeconds });
  });

  app.post('/api/logout', (_req, res) => {
    clearKeyCookie(res);
    res.json({ ok: true, tier: 'free' });
  });

  app.get('/api/items', (req, res) => {
    const q = (req.query.q || '').toString().toLowerCase();
    const out = [];
    for (const it of market.mapping.values()) {
      if (!q || it.name.toLowerCase().includes(q)) out.push({ id: it.id, name: it.name, icon: it.icon, limit: it.limit, members: it.members });
      if (out.length >= 50) break;
    }
    res.json({ items: out });
  });

  app.get('/api/flips', (req, res) => {
    const snap = market.snapshot(req.tier);
    let rows = buildFlips(market.mapping, snap);
    rows = filterFlips(rows, req.query);
    rows = sortFlips(rows, req.query.sort, req.query.dir);
    const newsIndex = news.itemIndex();
    const total = rows.length;
    if (req.tier !== 'premium') {
      rows = rows.slice(0, config.freeTopN).map((r) => ({
        ...r,
        // Free tier gets the headline numbers only. Volume and 1h context are the edge.
        hourlyVolume: null, fiveMinVolume: null, avgHigh1h: null, avgLow1h: null, potential: null, score: null,
      }));
    } else {
      rows = rows.slice(0, Number(req.query.limit) || 200);
    }
    rows = rows.map((r) => ({ ...r, news: newsIndex[r.id] || null }));
    res.json({ tier: req.tier, updatedAt: snap.updatedAt, refreshSeconds: refreshFor(req.tier), total, rows });
  });

  app.get('/api/moves', requirePremium, (req, res) => {
    const snap = market.snapshot('premium');
    const moves = detectMoves(market.mapping, snap, {
      dropPct: Number(req.query.pct) || undefined,
      volumeX: Number(req.query.vol) || undefined,
      minPrice: Number(req.query.minPrice) || undefined,
    });
    const newsIndex = news.itemIndex();
    res.json({ updatedAt: snap.updatedAt, moves: moves.map((m) => ({ ...m, news: newsIndex[m.id] || null })) });
  });

  // Free users get a teaser: how many dumps are happening, not which.
  app.get('/api/moves/summary', (req, res) => {
    const snap = market.snapshot(req.tier);
    const moves = detectMoves(market.mapping, snap);
    res.json({
      updatedAt: snap.updatedAt,
      dumps: moves.filter((m) => m.kind === 'dump').length,
      spikes: moves.filter((m) => m.kind === 'spike').length,
    });
  });

  app.get('/api/item/:id', async (req, res) => {
    const id = Number(req.params.id);
    const meta = market.mapping.get(id);
    if (!meta) return res.status(404).json({ error: 'not_found' });
    const snap = market.snapshot(req.tier);
    const p = snap.latest?.[id] || {};
    const h1 = snap.oneHour?.[id] || null;
    const m5 = snap.fiveMin?.[id] || null;
    const out = {
      id, name: meta.name, icon: meta.icon, limit: meta.limit || 0, members: !!meta.members,
      examine: meta.examine, highalch: meta.highalch, value: meta.value,
      buy: p.low ?? null, sell: p.high ?? null, lowTime: p.lowTime ?? null, highTime: p.highTime ?? null,
      tax: geTax(p.high, meta.name), margin: margin(p.low, p.high, meta.name),
      updatedAt: snap.updatedAt,
      news: news.posts.filter((n) => n.items.includes(id)).slice(0, 5).map((n) => ({ title: n.title, link: n.link, publishedAt: n.publishedAt })),
    };
    if (req.tier === 'premium') {
      out.oneHour = h1;
      out.fiveMin = m5;
      try {
        const step = ['5m', '1h', '6h', '24h'].includes(req.query.step) ? req.query.step : '5m';
        out.timeseries = await market.timeseries(id, step);
        out.timestep = step;
      } catch (err) {
        out.timeseries = [];
        out.timeseriesError = err.message;
      }
    }
    res.json(out);
  });

  app.get('/api/news', (req, res) => {
    res.json({ updatedAt: news.updatedAt, posts: news.enriched(req.tier) });
  });

  app.get('/api/alerts', requirePremium, (_req, res) => res.json({ alerts: alerts.list(), recent: alerts.fired }));
  app.post('/api/alerts', requirePremium, (req, res) => {
    try {
      res.json({ alert: alerts.add(req.body || {}) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.delete('/api/alerts/:id', requirePremium, (req, res) => {
    alerts.remove(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/stream', requirePremium, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const off = alerts.subscribe(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000).unref();
    req.on('close', () => { off(); clearInterval(ping); });
  });

  app.get('/api/shorts/pack', requirePremium, (req, res) => {
    const kind = ['flips', 'dumps', 'spikes'].includes(req.query.kind) ? req.query.kind : 'flips';
    const count = Math.min(8, Math.max(3, Number(req.query.count) || 5));
    const snap = market.snapshot('premium');
    let rows;
    if (kind === 'flips') {
      rows = sortFlips(filterFlips(buildFlips(market.mapping, snap), { hideStale: '1', minVolume: req.query.minVolume || 50 }), 'score');
    } else {
      rows = detectMoves(market.mapping, snap).filter((m) => m.kind === (kind === 'dumps' ? 'dump' : 'spike'));
    }
    if (req.query.ids) {
      const ids = String(req.query.ids).split(',').map(Number);
      rows = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
    }
    res.json(buildShortsPack({ kind, rows, count, appName: req.query.app || config.appName, cta: req.query.cta || config.appUrl }));
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  return { app, news, alerts };
}

export async function start() {
  await market.start();
  const { app, news } = createApp();
  news.start();
  const server = app.listen(config.port, () => {
    console.log(`${config.appName} listening on http://localhost:${config.port} (${config.offline ? 'OFFLINE fixtures' : 'live wiki data'})`);
    console.log(`Free refresh ${config.freeRefreshSeconds}s · Premium refresh ${config.premiumRefreshSeconds}s · ${config.premiumKeys.length} premium key(s) loaded`);
    const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    if (lan.length) console.log(`On your phone (same Wi-Fi): ${lan.map((ip) => `http://${ip}:${config.port}`).join('  or  ')}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  start();
}
