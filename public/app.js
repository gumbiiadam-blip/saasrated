/* Coffer client. No framework, no build step, no excuses. */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const api = async (path, opts) => {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await res.json().catch(() => ({}));
  setOffline(res.headers.get('X-From-Cache') === '1' || res.status === 503, body.updatedAt || body.status?.fastUpdatedAt);
  if (!res.ok) throw Object.assign(new Error(body.message || body.error || res.statusText), { status: res.status, body });
  return body;
};
const gp = (n) => {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e8 ? 0 : 2)}m`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  return n.toLocaleString();
};
const ago = (secs) => (secs === null || secs === undefined ? '—' : secs < 60 ? `${secs}s` : secs < 3600 ? `${Math.floor(secs / 60)}m` : `${(secs / 3600).toFixed(1)}h`);
const iconUrl = (icon) => `https://oldschool.runescape.wiki/images/${encodeURIComponent((icon || '').replace(/ /g, '_'))}?format=original`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const secsFmt = (s) => (s >= 60 ? `${Math.round(s / 60)} min` : `${s}s`);

function setOffline(off, at) {
  const b = document.getElementById('offline-banner');
  if (!b) return;
  b.hidden = !off;
  if (off && at) document.getElementById('offline-at').textContent = new Date(at).toLocaleTimeString();
}

const state = {
  me: null,
  tab: 'flips',
  sort: 'margin',
  dir: 'desc',
  flips: [],
  watch: JSON.parse(localStorage.getItem('coffer.watch') || '[]'),
  timers: {},
  pack: null,
  lastFetch: 0,
};

function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/* ---------- tier / me ---------- */
async function loadMe() {
  state.me = await api('/api/me');
  const prem = state.me.tier === 'premium';
  if (state.me.app) {
    document.title = `${state.me.app.name} · OSRS Market`;
    $('#brand-name').textContent = state.me.app.name;
    $('#brand-tagline').textContent = state.me.app.tagline || 'OSRS market';
    if (!$('#s-app').dataset.touched) $('#s-app').value = state.me.app.name;
    if (!$('#s-cta').dataset.touched) $('#s-cta').value = state.me.app.url;
  }
  document.body.classList.toggle('premium', prem);
  $('#tier-badge').textContent = state.me.tier;
  $('#tier-badge').classList.toggle('premium', prem);
  $('#free-banner').hidden = prem;
  $('#banner-free').textContent = secsFmt(state.me.freeRefreshSeconds);
  $('#banner-prem').textContent = secsFmt(state.me.premiumRefreshSeconds);
  $('#cmp-free').textContent = `every ${secsFmt(state.me.freeRefreshSeconds)}`;
  $('#cmp-prem').innerHTML = `<b>every ${secsFmt(state.me.premiumRefreshSeconds)}</b> (${Math.round(state.me.freeRefreshSeconds / state.me.premiumRefreshSeconds)}× faster)`;
  $('#upgrade-btn').textContent = prem ? 'Premium ✓' : 'Upgrade';
  $('#logout-btn').hidden = !prem;
  $$('.prem-only').forEach((el) => (el.style.display = prem ? '' : 'none'));
  $$('.free-only').forEach((el) => (el.style.display = prem ? 'none' : ''));
  $('#moves-locked').hidden = prem; $('#moves-cols').hidden = !prem;
  $('#alerts-locked').hidden = prem; $('#alerts-body').hidden = !prem;
  $('#shorts-locked').hidden = prem; $('#shorts-body').hidden = !prem;
  if (state.me.status.offline) toast('Running on offline fixture data. Set COFFER_OFFLINE=0 for live prices.');
  if (state.me.status.errors?.length) toast(`Data source error: ${esc(state.me.status.errors[0].message)}`, 'err');
  schedule();
  if (prem) connectStream();
}

function schedule() {
  clearInterval(state.timers.poll);
  const ms = state.me.refreshSeconds * 1000;
  // Hidden tabs don't poll. Coming back refreshes immediately if the data is due.
  state.timers.poll = setInterval(() => { if (!document.hidden) refreshActive(); }, ms);
  clearInterval(state.timers.clock);
  state.timers.clock = setInterval(updateClock, 1000);
}

function updateClock() {
  if (!state.lastUpdatedAt) return;
  const age = Math.max(0, Math.round((Date.now() - state.lastUpdatedAt) / 1000));
  const next = Math.max(0, state.me.refreshSeconds - Math.round((Date.now() - state.lastFetch) / 1000));
  $('#refresh-status').textContent = `prices ${ago(age)} old · next in ${ago(next)}`;
}

/* ---------- tabs ---------- */
function showTab(name) {
  state.tab = name;
  $$('.tab').forEach((t) => (t.hidden = t.id !== `tab-${name}`));
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  refreshActive();
}
$('#tabs').addEventListener('click', (e) => e.target.closest('button') && showTab(e.target.closest('button').dataset.tab));

async function refreshActive() {
  state.lastFetch = Date.now();
  try {
    if (state.tab === 'flips') await loadFlips();
    if (state.tab === 'moves') await loadMoves();
    if (state.tab === 'news') await loadNews();
    if (state.tab === 'watch') await loadWatch();
    if (state.tab === 'alerts') await loadAlerts();
    if (state.tab === 'shorts' && !state.pack) await generatePack();
    loadMovesCount();
  } catch (err) {
    toast(esc(err.message), 'err');
  }
  updateClock();
}

/* ---------- flips ---------- */
function flipQuery() {
  const p = new URLSearchParams({ sort: state.sort, dir: state.dir });
  const v = (id) => $(id).value.trim();
  if (v('#f-search')) p.set('search', v('#f-search'));
  if (v('#f-margin')) p.set('minMargin', v('#f-margin'));
  if (v('#f-roi')) p.set('minRoi', v('#f-roi'));
  if (v('#f-maxbuy')) p.set('maxBuy', v('#f-maxbuy'));
  if (v('#f-vol')) p.set('minVolume', v('#f-vol'));
  if ($('#f-f2p').checked) p.set('f2p', '1');
  if ($('#f-stale').checked) p.set('hideStale', '1');
  return p.toString();
}

async function loadFlips() {
  const data = await api(`/api/flips?${flipQuery()}`);
  state.flips = data.rows;
  state.lastUpdatedAt = data.updatedAt;
  const prem = data.tier === 'premium';
  $('#flips-meta').textContent = `${data.rows.length} of ${data.total} items`;
  $('#flips-foot').innerHTML = prem
    ? 'Buy = current instant-sell price (what sellers accept). Sell = current instant-buy price. Margin is after GE tax. "Per limit" = margin × what you can realistically move in one 4h buy-limit window given both sides\' volume.'
    : `Free shows the top ${state.me.freeTopN}. Volume and per-limit profit are hidden: without volume a fat margin is just a number nobody is paying. <a href="#" data-open="upgrade">Upgrade</a> to see everything, 10× faster.`;
  $$('#flips-table th').forEach((th) => { th.classList.toggle('sorted', th.dataset.sort === state.sort); th.classList.toggle('asc', state.dir === 'asc'); });
  $('#flips-table tbody').innerHTML = data.rows.map((r) => `
    <tr data-id="${r.id}">
      <td class="item"><span class="star ${state.watch.includes(r.id) ? 'on' : ''}" data-star="${r.id}">${state.watch.includes(r.id) ? '★' : '☆'}</span><img src="${iconUrl(r.icon)}" alt="" loading="lazy"><span data-open-item="${r.id}">${esc(r.name)}</span>
        ${r.news ? `<span class="badge news" title="${esc(r.news.title)}">📰</span>` : ''}${r.stale ? '<span class="badge stale" title="One side of this price is over an hour old">stale</span>' : ''}${r.members ? '' : '<span class="badge members">F2P</span>'}</td>
      <td class="num">${gp(r.buy)}</td><td class="num">${gp(r.sell)}</td><td class="num muted">${gp(r.tax)}</td>
      <td class="num ${r.margin > 0 ? 'pos' : 'neg'}">${gp(r.margin)}</td>
      <td class="num">${(r.roi * 100).toFixed(2)}%</td>
      <td class="num muted">${r.limit || '—'}</td>
      <td class="num ${prem ? '' : 'locked'}">${prem ? gp(r.hourlyVolume) : '12,345'}</td>
      <td class="num ${prem ? 'pos' : 'locked'}">${prem ? gp(r.potential) : '1.2m'}</td>
      <td class="num muted" title="Sell side ${ago(r.highAge)} / buy side ${ago(r.lowAge)}">${ago(Math.max(r.highAge ?? 0, r.lowAge ?? 0))}</td>
    </tr>`).join('');
}
$('#flips-table thead').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-sort]');
  if (!th) return;
  if (state.sort === th.dataset.sort) state.dir = state.dir === 'desc' ? 'asc' : 'desc'; else { state.sort = th.dataset.sort; state.dir = th.dataset.sort === 'name' ? 'asc' : 'desc'; }
  loadFlips();
});
let debounce;
$$('#tab-flips .toolbar input').forEach((el) => el.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(loadFlips, 250); }));

/* ---------- moves ---------- */
async function loadMovesCount() {
  try {
    const s = await api('/api/moves/summary');
    const n = s.dumps + s.spikes;
    $('#moves-count').textContent = n ? String(n) : '';
    $('#moves-teaser').innerHTML = `Right now: <b>${s.dumps}</b> dump${s.dumps === 1 ? '' : 's'} and <b>${s.spikes}</b> spike${s.spikes === 1 ? '' : 's'} detected${state.me.tier === 'free' ? ' (as of ' + secsFmt(state.me.freeRefreshSeconds) + ' ago, obviously)' : ''}.`;
  } catch { /* fine */ }
}

function moveCard(m) {
  return `<div class="card" data-open-item="${m.id}">
    <img src="${iconUrl(m.icon)}" alt="">
    <div><div class="name">${esc(m.name)} ${m.news ? '<span class="badge news">📰 news</span>' : ''}</div>
      <div class="sub">${gp(m.reference)} → <b>${gp(m.price)}</b> · ${gp(m.fiveMinVolume)} in 5m (${m.volumeMultiple}× normal) · limit ${m.limit || '—'}</div></div>
    <div class="big ${m.kind === 'dump' ? 'neg' : 'pos'}">${m.kind === 'dump' ? '−' : '+'}${m.movePct}%</div>
    ${m.news ? `<div class="cause">Possible cause: <a href="${esc(m.news.link)}" target="_blank" rel="noopener">${esc(m.news.title)}</a></div>` : ''}
  </div>`;
}

async function loadMoves() {
  if (state.me.tier !== 'premium') return;
  const p = new URLSearchParams({ pct: $('#m-pct').value, vol: $('#m-vol').value, minPrice: $('#m-minprice').value });
  const data = await api(`/api/moves?${p}`);
  state.lastUpdatedAt = data.updatedAt;
  const dumps = data.moves.filter((m) => m.kind === 'dump');
  const spikes = data.moves.filter((m) => m.kind === 'spike');
  $('#moves-meta').textContent = `${dumps.length} dumps · ${spikes.length} spikes`;
  $('#dumps-list').innerHTML = dumps.map(moveCard).join('') || '<p class="muted">Nothing dumping. Suspiciously calm.</p>';
  $('#spikes-list').innerHTML = spikes.map(moveCard).join('') || '<p class="muted">Nothing spiking.</p>';
}
$$('#tab-moves .toolbar input').forEach((el) => el.addEventListener('change', loadMoves));

/* ---------- news ---------- */
async function loadNews() {
  const data = await api('/api/news');
  $('#news-list').innerHTML = data.posts.map((p) => `
    <div class="post">
      <h4><a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.title)}</a></h4>
      <div class="meta">${p.publishedAt ? new Date(p.publishedAt).toLocaleString() : ''} ${p.category ? '· ' + esc(p.category) : ''}</div>
      <p>${esc(p.description).slice(0, 320)}${p.description.length > 320 ? '…' : ''}</p>
      <div class="chips">${p.items.map((it) => `<span class="chip" data-open-item="${it.id}"><img src="${iconUrl(it.icon)}" alt="">${esc(it.name)} <b class="${it.changePct1h > 0 ? 'pos' : it.changePct1h < 0 ? 'neg' : 'muted'}">${it.changePct1h === null ? '' : (it.changePct1h > 0 ? '+' : '') + it.changePct1h + '%'}</b></span>`).join('') || '<span class="muted">No tradeable items mentioned.</span>'}</div>
    </div>`).join('') || '<p class="muted">No news loaded yet.</p>';
}

/* ---------- watchlist ---------- */
function toggleWatch(id) {
  id = Number(id);
  const limit = state.me.tier === 'premium' ? Infinity : 5;
  if (state.watch.includes(id)) state.watch = state.watch.filter((x) => x !== id);
  else if (state.watch.length >= limit) return toast(`Free watchlist is capped at ${limit}. Premium is unlimited.`, 'err');
  else state.watch.push(id);
  localStorage.setItem('coffer.watch', JSON.stringify(state.watch));
  if (state.tab === 'flips') loadFlips(); else loadWatch();
}
async function loadWatch() {
  const rows = [];
  for (const id of state.watch) {
    try { rows.push(await api(`/api/item/${id}`)); } catch { /* skip */ }
  }
  const prem = state.me.tier === 'premium';
  $('#watch-table tbody').innerHTML = rows.map((r) => `<tr>
    <td class="item"><img src="${iconUrl(r.icon)}" alt=""><span data-open-item="${r.id}">${esc(r.name)}</span></td>
    <td class="num">${gp(r.buy)}</td><td class="num">${gp(r.sell)}</td><td class="num ${r.margin > 0 ? 'pos' : 'neg'}">${gp(r.margin)}</td>
    <td class="num">${r.buy ? ((r.margin / r.buy) * 100).toFixed(2) : '—'}%</td>
    <td class="num ${prem ? '' : 'locked'}">${prem ? gp((r.oneHour?.highPriceVolume || 0) + (r.oneHour?.lowPriceVolume || 0)) : '9,999'}</td>
    <td><span class="star on" data-star="${r.id}">★</span></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nothing watched. Click ☆ on any item.</td></tr>';
}

/* ---------- item drawer ---------- */
async function openItem(id, step = '5m') {
  const d = await api(`/api/item/${id}?step=${step}`);
  const prem = state.me.tier === 'premium';
  const h1 = d.oneHour;
  $('#drawer-body').innerHTML = `
    <h2><img src="${iconUrl(d.icon)}" alt="">${esc(d.name)} <span class="star ${state.watch.includes(d.id) ? 'on' : ''}" data-star="${d.id}">${state.watch.includes(d.id) ? '★' : '☆'}</span></h2>
    <div class="muted">${d.members ? 'Members' : 'F2P'} · limit ${d.limit || '—'} · high alch ${gp(d.highalch)} · <a href="https://prices.runescape.wiki/osrs/item/${d.id}" target="_blank" rel="noopener">wiki</a></div>
    <div class="kv">
      <div><b>${gp(d.buy)}</b><span>buy (instant-sell) · ${ago(d.lowTime ? Math.round(Date.now() / 1000 - d.lowTime) : null)} ago</span></div>
      <div><b>${gp(d.sell)}</b><span>sell (instant-buy) · ${ago(d.highTime ? Math.round(Date.now() / 1000 - d.highTime) : null)} ago</span></div>
      <div><b>${gp(d.tax)}</b><span>GE tax</span></div>
      <div><b class="${d.margin > 0 ? 'pos' : 'neg'}">${gp(d.margin)}</b><span>margin after tax · ${d.buy ? ((d.margin / d.buy) * 100).toFixed(2) : 0}% ROI</span></div>
      ${prem && h1 ? `<div><b>${gp(h1.avgLowPrice)} / ${gp(h1.avgHighPrice)}</b><span>1h avg low / high</span></div>
      <div><b>${gp((h1.highPriceVolume || 0) + (h1.lowPriceVolume || 0))}</b><span>traded last hour</span></div>
      <div><b>${gp((d.fiveMin?.highPriceVolume || 0) + (d.fiveMin?.lowPriceVolume || 0))}</b><span>traded last 5 min</span></div>
      <div><b>${gp(d.margin * (d.limit || 1))}</b><span>margin × buy limit</span></div>` : '<div><b>🔒</b><span>volume &amp; 1h context are premium</span></div>'}
    </div>
    ${prem ? `<div class="steps">${['5m', '1h', '6h', '24h'].map((s) => `<button class="btn tiny ${s === d.timestep ? 'primary' : ''}" data-step="${s}">${s}</button>`).join('')}</div><canvas class="chart" id="chart"></canvas>${d.timeseriesError ? `<p class="muted">Chart unavailable: ${esc(d.timeseriesError)}</p>` : ''}` : '<div class="locked"><b>Price chart is premium.</b><br><button class="btn small" data-open="upgrade">Unlock charts</button></div>'}
    ${d.news.length ? `<h3>In the news</h3><ul>${d.news.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a> <span class="muted">${n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : ''}</span></li>`).join('')}</ul>` : ''}
  `;
  $('#drawer').hidden = false;
  if (prem && d.timeseries?.length) drawChart($('#chart'), d.timeseries);
  $$('#drawer [data-step]').forEach((b) => b.addEventListener('click', () => openItem(id, b.dataset.step)));
}
$('#drawer-close').addEventListener('click', () => ($('#drawer').hidden = true));

function drawChart(canvas, series) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const pts = series.filter((p) => p.avgHighPrice || p.avgLowPrice);
  if (!pts.length) return;
  const vals = pts.flatMap((p) => [p.avgHighPrice, p.avgLowPrice].filter(Boolean));
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = 30;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - 24 - ((v - min) / (max - min || 1)) * (h - 48);
  const line = (key, color) => {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    let started = false;
    pts.forEach((p, i) => { if (!p[key]) return; if (!started) { ctx.moveTo(x(i), y(p[key])); started = true; } else ctx.lineTo(x(i), y(p[key])); });
    ctx.stroke();
  };
  ctx.fillStyle = '#9a917f'; ctx.font = '11px system-ui';
  ctx.fillText(gp(max), 2, 14); ctx.fillText(gp(min), 2, h - 26);
  const first = new Date(pts[0].timestamp * 1000), last = new Date(pts[pts.length - 1].timestamp * 1000);
  ctx.fillText(first.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), pad, h - 8);
  ctx.textAlign = 'right'; ctx.fillText(last.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), w - pad, h - 8); ctx.textAlign = 'left';
  line('avgHighPrice', '#5fd38a'); line('avgLowPrice', '#ff6b6b');
  // volume bars along the bottom
  const maxVol = Math.max(...pts.map((p) => (p.highPriceVolume || 0) + (p.lowPriceVolume || 0)), 1);
  ctx.fillStyle = 'rgba(227,179,65,0.25)';
  pts.forEach((p, i) => { const v = ((p.highPriceVolume || 0) + (p.lowPriceVolume || 0)) / maxVol; ctx.fillRect(x(i) - 1, h - 24 - v * 40, 2, v * 40); });
}

/* ---------- alerts ---------- */
async function loadAlerts() {
  if (state.me.tier !== 'premium') return;
  const data = await api('/api/alerts');
  $('#alerts-list').innerHTML = data.alerts.map((a) => `<div class="card"><div></div><div><div class="name">${esc(a.name)}</div><div class="sub">${a.metric} ${a.op} ${gp(a.value)} ${a.firedAt ? '· <b class="pos">fired</b>' : '· armed'}</div></div><button class="btn tiny del" data-del-alert="${a.id}">remove</button></div>`).join('') || '<p class="muted">No alerts yet.</p>';
  $('#alerts-fired').innerHTML = data.recent.map((a) => `<div class="card"><div></div><div><div class="name">${esc(a.name)}</div><div class="sub">${a.metric} hit ${gp(a.current)} (${a.op} ${gp(a.value)}) · ${new Date(a.firedAt).toLocaleTimeString()}</div></div></div>`).join('') || '<p class="muted">Nothing fired yet.</p>';
}
$('#alert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#a-item').value.trim();
  const { items } = await api(`/api/items?q=${encodeURIComponent(name)}`);
  const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase()) || items[0];
  if (!item) return toast('No such item.', 'err');
  try {
    await api('/api/alerts', { method: 'POST', body: JSON.stringify({ itemId: item.id, metric: $('#a-metric').value, op: $('#a-op').value, value: $('#a-value').value }) });
    toast(`Alert set on ${esc(item.name)}.`); $('#alert-form').reset(); loadAlerts();
  } catch (err) { toast(esc(err.message), 'err'); }
});
$('#a-item').addEventListener('input', async (e) => {
  const q = e.target.value.trim(); if (q.length < 2) return;
  const { items } = await api(`/api/items?q=${encodeURIComponent(q)}`);
  $('#item-list').innerHTML = items.map((i) => `<option value="${esc(i.name)}">`).join('');
});
$('#notif-btn').addEventListener('click', () => Notification.requestPermission().then((p) => toast(`Notifications: ${p}`)));

function connectStream() {
  if (state.es) return;
  const es = new EventSource('/api/stream');
  es.addEventListener('alert', (e) => {
    const a = JSON.parse(e.data);
    const msg = `<b>${esc(a.name)}</b> ${a.metric} is ${gp(a.current)} (${a.op} ${gp(a.value)})`;
    toast(`🔔 ${msg}`);
    if (Notification.permission === 'granted') new Notification(`${state.me.app?.name || 'GE'}: ${a.name}`, { body: `${a.metric} ${a.op} ${gp(a.value)} → now ${gp(a.current)}` });
    if (state.tab === 'alerts') loadAlerts();
  });
  es.addEventListener('tick', (e) => { state.lastUpdatedAt = JSON.parse(e.data).updatedAt; });
  es.onerror = () => { es.close(); state.es = null; setTimeout(connectStream, 5000); };
  state.es = es;
}

/* ---------- shorts studio ---------- */
async function generatePack() {
  if (state.me.tier !== 'premium') return;
  const p = new URLSearchParams({ kind: $('#s-kind').value, count: $('#s-count').value, app: $('#s-app').value, cta: $('#s-cta').value });
  const pack = await api(`/api/shorts/pack?${p}`);
  state.pack = pack;
  $('#s-title').value = pack.title;
  $('#s-desc').value = pack.description;
  $('#s-tags').value = pack.hashtags.join(' ');
  $('#s-vo').value = pack.voiceover;
  $('#s-status').textContent = `${pack.scenes.length} scenes · ${pack.totalDuration}s · ${pack.items.join(', ')}`;
  $('#s-download').hidden = true;
  CofferShorts.drawStill($('#s-canvas'), pack, $('#s-app').value);
  if (pack.items.length < 3) toast('Fewer than 3 items matched. Loosen the filters or wait for the market to do something.', 'err');
}
$('#s-generate').addEventListener('click', () => generatePack().catch((e) => toast(esc(e.message), 'err')));
$('#s-play').addEventListener('click', async () => { if (!state.pack) await generatePack(); await CofferShorts.play($('#s-canvas'), state.pack, $('#s-app').value, (t, total) => ($('#s-status').textContent = `preview ${t.toFixed(1)}s / ${total}s`)); $('#s-status').textContent = 'preview done'; });
$('#s-record').addEventListener('click', async () => {
  if (!state.pack) await generatePack();
  if (!window.MediaRecorder) return toast('This browser cannot record canvas video. Use Chrome.', 'err');
  try {
    const blob = await CofferShorts.record($('#s-canvas'), state.pack, $('#s-app').value, (t, total) => ($('#s-status').textContent = `● recording ${t.toFixed(1)}s / ${total}s`));
    const url = URL.createObjectURL(blob);
    const a = $('#s-download'); a.href = url; a.hidden = false;
    a.download = `${($('#s-app').value || 'short').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.pack.kind}-${new Date().toISOString().slice(0, 10)}.webm`;
    $('#s-status').textContent = `done · ${(blob.size / 1e6).toFixed(1)} MB`;
    toast('Short recorded. Download it below.');
  } catch (err) { toast(`Recording failed: ${esc(err.message)}`, 'err'); }
});
$$('.copy').forEach((b) => b.addEventListener('click', () => navigator.clipboard.writeText($(`#${b.dataset.copy}`).value).then(() => toast('Copied.'))));

/* ---------- upgrade ---------- */
function openUpgrade() { $('#upgrade-modal').hidden = false; $('#upgrade-key').focus(); }
$('#upgrade-btn').addEventListener('click', openUpgrade);
$('#upgrade-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/upgrade', { method: 'POST', body: JSON.stringify({ key: $('#upgrade-key').value.trim() }) });
    $('#upgrade-modal').hidden = true; $('#upgrade-key').value = '';
    toast('Premium activated. Welcome to the fast lane.'); state.pack = null;
    await loadMe(); refreshActive();
  } catch (err) { $('#upgrade-msg').textContent = err.message; }
});
$('#logout-btn').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); $('#upgrade-modal').hidden = true; if (state.es) { state.es.close(); state.es = null; } await loadMe(); refreshActive(); });

/* ---------- global delegated clicks ---------- */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open-item], [data-star], [data-open], [data-close], [data-del-alert]');
  if (!t) return;
  if (t.dataset.openItem) { e.preventDefault(); openItem(t.dataset.openItem).catch((err) => toast(esc(err.message), 'err')); }
  else if (t.dataset.star) { e.stopPropagation(); toggleWatch(t.dataset.star); }
  else if (t.dataset.open === 'upgrade') { e.preventDefault(); openUpgrade(); }
  else if (t.dataset.close === 'upgrade') $('#upgrade-modal').hidden = true;
  else if (t.dataset.delAlert) api(`/api/alerts/${t.dataset.delAlert}`, { method: 'DELETE' }).then(loadAlerts);
});
$('#upgrade-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#drawer').hidden = true; $('#upgrade-modal').hidden = true; } });

// Hide item icons the wiki refuses to serve (offline, blocked, renamed) instead of showing a broken image.
document.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.me && Date.now() - state.lastFetch > state.me.refreshSeconds * 1000) refreshActive();
});
window.addEventListener('online', () => { setOffline(false); refreshActive(); });
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // First visit: the worker takes over after the page has loaded, so refetch once so it has data to keep.
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (state.me) { refreshActive(); loadMe(); } });
}
$$('#s-app, #s-cta').forEach((el) => el.addEventListener('input', () => (el.dataset.touched = '1')));

/* ---------- boot ---------- */
loadMe().then(() => showTab('flips')).catch((err) => toast(`Cannot reach the API: ${esc(err.message)}`, 'err'));
