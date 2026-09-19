/* Coffer Shorts renderer: draws a pack's scenes on a 1080x1920 canvas and records it to WebM. */
(function () {
  const W = 1080, H = 1920;
  const iconCache = new Map();

  function loadIcon(icon) {
    if (!icon) return Promise.resolve(null);
    if (iconCache.has(icon)) return iconCache.get(icon);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `https://oldschool.runescape.wiki/images/${encodeURIComponent(icon.replace(/ /g, '_'))}?format=original`;
    });
    iconCache.set(icon, p);
    return p;
  }

  function wrap(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Sets ctx.font to the largest size (<= max) at which text fits maxWidth. */
  function fitFont(ctx, text, weight, max, maxWidth, family = 'system-ui, sans-serif') {
    let size = max;
    do { ctx.font = `${weight} ${size}px ${family}`; size -= 4; } while (ctx.measureText(text).width > maxWidth && size > 24);
  }

  function bg(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#15110c'); g.addColorStop(1, '#0b0906');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // slow-drifting gold glow so the frame is never static
    const r = ctx.createRadialGradient(W / 2 + Math.sin(t / 2) * 200, 500, 50, W / 2, 600, 900);
    r.addColorStop(0, 'rgba(227,179,65,0.18)'); r.addColorStop(1, 'rgba(227,179,65,0)');
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }

  function brand(ctx, app) {
    ctx.fillStyle = '#e3b341'; ctx.font = '700 44px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(app.toUpperCase(), 70, 120);
    ctx.fillStyle = '#9a917f'; ctx.font = '400 30px system-ui, sans-serif';
    ctx.fillText('LIVE GRAND EXCHANGE', 70, 165);
  }

  function ease(x) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); }

  function drawScene(ctx, scene, local, app, icons) {
    bg(ctx, local);
    brand(ctx, app);
    ctx.textAlign = 'center';
    if (scene.type === 'hook' || scene.type === 'cta') {
      const k = ease(local / 0.5);
      ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 40);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 92px system-ui, sans-serif';
      const lines = wrap(ctx, scene.headline, W - 160);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, 700 + i * 110));
      ctx.fillStyle = '#e3b341'; ctx.font = '600 48px system-ui, sans-serif';
      wrap(ctx, scene.sub, W - 200).forEach((l, i) => ctx.fillText(l, W / 2, 740 + lines.length * 110 + i * 60));
      ctx.restore();
      if (scene.type === 'cta') {
        ctx.fillStyle = '#e3b341'; ctx.fillRect(140, 1500, W - 280, 130);
        ctx.fillStyle = '#1a1610'; ctx.font = '800 56px system-ui, sans-serif';
        ctx.fillText('LINK IN BIO', W / 2, 1585);
      }
    } else {
      const k = ease(local / 0.35);
      // rank badge
      ctx.fillStyle = '#e3b341'; ctx.beginPath(); ctx.arc(W / 2, 420, 125 * k, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.globalAlpha = k; ctx.fillStyle = '#1a1610'; ctx.font = '900 120px system-ui, sans-serif';
      ctx.fillText(`#${scene.rank}`, W / 2, 462); ctx.restore();
      const icon = icons.get(scene.icon);
      if (icon) {
        ctx.save(); ctx.imageSmoothingEnabled = false;
        const s = 220 * k; ctx.drawImage(icon, W / 2 - s / 2, 600 - s / 2 + 40, s, s); ctx.restore();
      }
      ctx.fillStyle = '#ffffff'; ctx.font = '800 84px system-ui, sans-serif';
      wrap(ctx, scene.name, W - 140).forEach((l, i) => ctx.fillText(l, W / 2, 830 + i * 95));
      ctx.fillStyle = '#e9e2d3';
      scene.lines.forEach((l, i) => {
        const a = ease((local - 0.4 - i * 0.25) / 0.3);
        fitFont(ctx, l, 500, 52, W - 100, 'ui-monospace, Menlo, monospace');
        ctx.globalAlpha = a; ctx.fillText(l, W / 2, 1050 + i * 80);
      });
      ctx.globalAlpha = 1;
      const a = ease((local - 1.3) / 0.3);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 30);
      ctx.fillStyle = scene.big.startsWith('-') ? '#ff6b6b' : '#5fd38a';
      fitFont(ctx, scene.big, 900, 120, W - 120);
      ctx.fillText(scene.big, W / 2, 1450);
      ctx.restore();
    }
    // progress bar
    ctx.fillStyle = '#2e2921'; ctx.fillRect(0, H - 14, W, 14);
  }

  function totalDuration(pack) { return pack.scenes.reduce((s, x) => s + x.duration, 0); }

  function sceneAt(pack, t) {
    let acc = 0;
    for (const s of pack.scenes) { if (t < acc + s.duration) return { scene: s, local: t - acc }; acc += s.duration; }
    const last = pack.scenes[pack.scenes.length - 1];
    return { scene: last, local: last.duration };
  }

  async function prepare(pack) {
    const icons = new Map();
    await Promise.all(pack.scenes.filter((s) => s.icon).map(async (s) => icons.set(s.icon, await loadIcon(s.icon))));
    return icons;
  }

  /** Plays the pack on the canvas. Returns a promise that resolves when finished. */
  async function play(canvas, pack, app, onProgress) {
    const ctx = canvas.getContext('2d');
    const icons = await prepare(pack);
    const total = totalDuration(pack);
    const start = performance.now();
    return new Promise((resolve) => {
      function frame() {
        const t = (performance.now() - start) / 1000;
        const { scene, local } = sceneAt(pack, t);
        drawScene(ctx, scene, local, app, icons);
        ctx.fillStyle = '#e3b341'; ctx.fillRect(0, H - 14, W * Math.min(1, t / total), 14);
        onProgress && onProgress(t, total);
        if (t < total) requestAnimationFrame(frame); else resolve();
      }
      frame();
    });
  }

  /** Records a full play-through to a WebM blob using MediaRecorder. */
  async function record(canvas, pack, app, onProgress) {
    // VP8 first: VP9 with an explicit bitrate produces an empty file on some Chromium builds.
    const mime = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm';
    const attempt = async (opts) => {
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, opts);
      const chunks = [];
      rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
      const done = new Promise((resolve) => (rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }))));
      rec.start(250);
      await play(canvas, pack, app, onProgress);
      // give the encoder a beat to flush the last frames before stopping
      await new Promise((r) => setTimeout(r, 300));
      if (rec.state !== 'inactive') { rec.requestData(); rec.stop(); }
      const blob = await done;
      stream.getTracks().forEach((t) => t.stop());
      return blob;
    };
    let blob = await attempt({ mimeType: mime, videoBitsPerSecond: 6_000_000 });
    if (!blob.size) blob = await attempt({ mimeType: 'video/webm' });
    if (!blob.size) throw new Error('the browser produced an empty recording; try Chrome or Edge');
    return blob;
  }

  function drawStill(canvas, pack, app) {
    prepare(pack).then((icons) => drawScene(canvas.getContext('2d'), pack.scenes[0], 1, app, icons));
  }

  window.CofferShorts = { play, record, drawStill, totalDuration };
})();
