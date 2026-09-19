/**
 * Dump and spike detection.
 *
 * A "dump" is an item whose instant-sell price has fallen sharply against its
 * 1h average while the sell-side volume in the last 5 minutes is well above its
 * hourly run-rate: someone is offloading stock. A "spike" is the mirror image.
 * Both are gold for a flipper: dumps are where you buy, spikes are where you sell.
 */
export function detectMoves(mapping, snap, opts = {}) {
  const dropPct = opts.dropPct ?? 4;      // % below the 1h average
  const volumeX = opts.volumeX ?? 2;      // 5m volume vs 1h/12 run-rate
  const minHourlyVolume = opts.minHourlyVolume ?? 20;
  const minPrice = opts.minPrice ?? 500;
  const out = [];
  for (const [idStr, p] of Object.entries(snap.latest || {})) {
    const id = Number(idStr);
    const meta = mapping.get(id);
    const h1 = snap.oneHour?.[idStr];
    const m5 = snap.fiveMin?.[idStr];
    if (!meta || !p || !h1 || !m5) continue;
    const hourly = (h1.highPriceVolume || 0) + (h1.lowPriceVolume || 0);
    if (hourly < minHourlyVolume) continue;

    // Dump: low price cratered, sellers flooding in
    if (p.low && h1.avgLowPrice && h1.avgLowPrice >= minPrice) {
      const drop = ((h1.avgLowPrice - p.low) / h1.avgLowPrice) * 100;
      const runRate = Math.max(1, (h1.lowPriceVolume || 0) / 12);
      const spike = (m5.lowPriceVolume || 0) / runRate;
      if (drop >= dropPct && spike >= volumeX) {
        out.push(makeMove('dump', id, meta, p, h1, m5, drop, spike, hourly));
      }
    }
    // Spike: high price jumped, buyers flooding in
    if (p.high && h1.avgHighPrice && h1.avgHighPrice >= minPrice) {
      const rise = ((p.high - h1.avgHighPrice) / h1.avgHighPrice) * 100;
      const runRate = Math.max(1, (h1.highPriceVolume || 0) / 12);
      const spike = (m5.highPriceVolume || 0) / runRate;
      if (rise >= dropPct && spike >= volumeX) {
        out.push(makeMove('spike', id, meta, p, h1, m5, rise, spike, hourly));
      }
    }
  }
  return out.sort((a, b) => b.severity - a.severity);
}

function makeMove(kind, id, meta, p, h1, m5, movePct, volumeMultiple, hourlyVolume) {
  const ref = kind === 'dump' ? h1.avgLowPrice : h1.avgHighPrice;
  const now = kind === 'dump' ? p.low : p.high;
  return {
    kind,
    id,
    name: meta.name,
    icon: meta.icon,
    limit: meta.limit || 0,
    price: now,
    reference: ref,
    movePct: Number(movePct.toFixed(2)),
    volumeMultiple: Number(volumeMultiple.toFixed(2)),
    fiveMinVolume: kind === 'dump' ? m5.lowPriceVolume || 0 : m5.highPriceVolume || 0,
    hourlyVolume,
    // Rough gp-at-stake: how far it moved times how much traded in the window
    severity: Math.round(Math.abs(ref - now) * ((kind === 'dump' ? m5.lowPriceVolume : m5.highPriceVolume) || 0)),
    at: (kind === 'dump' ? p.lowTime : p.highTime) || null,
  };
}
