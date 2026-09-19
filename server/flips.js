import { margin, geTax } from './tax.js';

const HOUR = 3600;

/**
 * Build the flip table from a snapshot.
 * Each row is one tradeable item with buy (instant-sell / low), sell (instant-buy / high),
 * tax, margin, ROI, estimated volume and a score that favours money you can actually make.
 */
export function buildFlips(mapping, snap, opts = {}) {
  const now = Math.floor(Date.now() / 1000);
  const minVolume = opts.minVolume ?? 0;
  const rows = [];
  for (const [idStr, p] of Object.entries(snap.latest || {})) {
    const id = Number(idStr);
    const meta = mapping.get(id);
    if (!meta || !p || !p.high || !p.low) continue;
    const buy = p.low;
    const sell = p.high;
    const tax = geTax(sell, meta.name);
    const m = margin(buy, sell, meta.name);
    const h1 = snap.oneHour?.[idStr] || {};
    const m5 = snap.fiveMin?.[idStr] || {};
    const hourlyVolume = (h1.highPriceVolume || 0) + (h1.lowPriceVolume || 0);
    const fiveMinVolume = (m5.highPriceVolume || 0) + (m5.lowPriceVolume || 0);
    if (hourlyVolume < minVolume) continue;
    const limit = meta.limit || 0;
    // How many you can realistically shift in a 4h buy-limit window: bounded by the limit
    // and by a quarter of the side with the least traffic (you need both a buyer and a seller).
    const sideVolume = Math.min(h1.highPriceVolume || 0, h1.lowPriceVolume || 0) * 4;
    const tradeable = limit ? Math.min(limit, sideVolume || limit) : sideVolume;
    const potential = Math.max(0, Math.floor(m * tradeable));
    const roi = buy ? m / buy : 0;
    const highAge = p.highTime ? now - p.highTime : null;
    const lowAge = p.lowTime ? now - p.lowTime : null;
    const staleness = Math.max(highAge ?? 0, lowAge ?? 0);
    const stale = staleness > HOUR;
    rows.push({
      id,
      name: meta.name,
      icon: meta.icon,
      members: !!meta.members,
      limit,
      buy,
      sell,
      tax,
      margin: m,
      roi,
      hourlyVolume,
      fiveMinVolume,
      avgHigh1h: h1.avgHighPrice ?? null,
      avgLow1h: h1.avgLowPrice ?? null,
      potential,
      highAge,
      lowAge,
      stale,
      score: stale ? potential * 0.25 : potential,
    });
  }
  return rows;
}

export function sortFlips(rows, sort = 'score', dir = 'desc') {
  const key = ['score', 'margin', 'roi', 'potential', 'hourlyVolume', 'buy', 'sell', 'name'].includes(sort) ? sort : 'score';
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'name') return sign * a.name.localeCompare(b.name);
    return sign * ((a[key] ?? 0) - (b[key] ?? 0));
  });
}

export function filterFlips(rows, q = {}) {
  let out = rows;
  if (q.search) {
    const s = q.search.toLowerCase();
    out = out.filter((r) => r.name.toLowerCase().includes(s));
  }
  if (q.minMargin) out = out.filter((r) => r.margin >= Number(q.minMargin));
  if (q.minRoi) out = out.filter((r) => r.roi >= Number(q.minRoi) / 100);
  if (q.maxBuy) out = out.filter((r) => r.buy <= Number(q.maxBuy));
  if (q.minVolume) out = out.filter((r) => r.hourlyVolume >= Number(q.minVolume));
  if (q.f2p === '1') out = out.filter((r) => !r.members);
  if (q.hideStale === '1') out = out.filter((r) => !r.stale);
  return out;
}
