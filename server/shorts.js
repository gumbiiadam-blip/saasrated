/**
 * Turns live market data into a YouTube Shorts "pack": a hook, a beat-by-beat
 * script, on-screen captions, title, description and hashtags. The browser
 * renders the scenes to a 1080x1920 canvas and records the video; the CTA in
 * the last beat converts viewers into Coffer users.
 */
const gp = (n) => {
  if (n === null || n === undefined) return '?';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}m`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(n);
};

const HOOKS = {
  flips: [
    'Stop flipping {top} for pennies. These 5 are printing right now.',
    '{count} items making {total} gp per limit while you were at Vorkath.',
    'The GE is leaking gp. Here is where.',
    'Nobody is flipping this and it pays {topMargin} gp a pop.',
  ],
  dumps: [
    'Someone just dumped {top} into the GE. Buy the panic.',
    '{count} items crashed in the last hour. Here is the shopping list.',
    'This is what a {topPct}% dump looks like in real time.',
  ],
  spikes: [
    '{top} is up {topPct}% in an hour. Sell into it before it turns.',
    '{count} items spiking right now. Do not be the last buyer.',
  ],
};

function pick(list, seed) {
  return list[seed % list.length];
}

function fill(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function buildShortsPack({ kind = 'flips', rows = [], count = 5, appName = 'Coffer', cta = 'coffer.gg', seed = Date.now() }) {
  const picks = rows.slice(0, count);
  const vars = {
    count: picks.length,
    top: picks[0]?.name ?? 'an item',
    topMargin: gp(picks[0]?.margin),
    topPct: picks[0]?.movePct ?? '',
    total: gp(picks.reduce((s, r) => s + (r.potential || 0), 0)),
  };
  const hook = fill(pick(HOOKS[kind] || HOOKS.flips, Math.floor(seed / 1000)), vars);
  const scenes = [
    { type: 'hook', duration: 2.5, headline: hook, sub: `${appName} live GE scan` },
  ];
  [...picks].reverse().forEach((r, i) => {
    if (kind === 'flips') {
      scenes.push({
        type: 'item',
        duration: 4,
        rank: picks.length - i,
        name: r.name,
        icon: r.icon,
        lines: [
          `Buy ${gp(r.buy)}  ->  Sell ${gp(r.sell)}`,
          `Margin ${gp(r.margin)} gp  (${(r.roi * 100).toFixed(1)}% ROI)`,
          `Limit ${r.limit || 'none'}  ·  ${gp(r.hourlyVolume)}/hr traded`,
        ],
        big: `+${gp(r.potential)} gp / limit`,
        vo: `Number ${picks.length - i}: ${r.name}. Buy at ${gp(r.buy)}, sell at ${gp(r.sell)}, ${gp(r.margin)} margin after tax. That's ${gp(r.potential)} per buy limit.`,
      });
    } else {
      scenes.push({
        type: 'item',
        duration: 4,
        rank: picks.length - i,
        name: r.name,
        icon: r.icon,
        lines: [
          `${kind === 'dump' || r.kind === 'dump' ? 'Down' : 'Up'} ${r.movePct}% vs 1h avg`,
          `Now ${gp(r.price)}  (was ${gp(r.reference)})`,
          `${gp(r.fiveMinVolume)} traded in 5 min  ·  ${r.volumeMultiple}x normal`,
        ],
        big: `${r.kind === 'dump' ? '-' : '+'}${r.movePct}%`,
        vo: `${r.name} ${r.kind === 'dump' ? 'dumped' : 'spiked'} ${r.movePct} percent with ${r.volumeMultiple} times normal volume.`,
      });
    }
  });
  scenes.push({
    type: 'cta',
    duration: 3,
    headline: `Free users see this 5 minutes late.`,
    sub: `${appName} Premium refreshes every 30 seconds. ${cta}`,
    vo: `Free users see this five minutes late. ${appName} Premium refreshes every thirty seconds. Link in bio.`,
  });
  const totalDuration = scenes.reduce((s, x) => s + x.duration, 0);
  const names = picks.map((r) => r.name);
  const title = kind === 'flips'
    ? `${picks.length} OSRS flips printing gp right now (${gp(picks[0]?.margin)} margin) #osrs`
    : `${picks[0]?.name} just ${kind === 'dumps' ? 'dumped' : 'spiked'} ${picks[0]?.movePct}% on the GE #osrs`;
  const description = [
    hook,
    '',
    ...picks.map((r, i) => `${i + 1}. ${r.name}${r.margin !== undefined ? ` – ${gp(r.margin)} gp margin` : ` – ${r.movePct}%`}`),
    '',
    `Prices from the live Grand Exchange at time of recording. Scanned with ${appName}: ${cta}`,
  ].join('\n');
  const hashtags = ['#osrs', '#oldschoolrunescape', '#runescape', '#osrsflipping', '#grandexchange', '#osrsmoneymaking', '#shorts'];
  return {
    kind,
    generatedAt: Date.now(),
    hook,
    scenes,
    totalDuration,
    title,
    description,
    hashtags,
    voiceover: scenes.map((s) => s.vo || s.headline).join(' '),
    items: names,
  };
}
