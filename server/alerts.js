import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { margin } from './tax.js';

/**
 * Premium price alerts. Persisted to data/runtime/alerts.json, evaluated on every
 * fast snapshot, delivered to open browsers over Server-Sent Events.
 */
export class AlertStore {
  constructor(market) {
    this.market = market;
    this.file = path.join(config.runtimeDir, 'alerts.json');
    this.alerts = [];
    this.clients = new Set();
    this.fired = [];
    this.load();
    market.onUpdate((snap) => this.evaluate(snap));
  }

  load() {
    try {
      this.alerts = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.alerts = [];
    }
  }

  save() {
    fs.mkdirSync(config.runtimeDir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.alerts, null, 2));
  }

  list() {
    return this.alerts;
  }

  add({ itemId, metric, op, value }) {
    const meta = this.market.mapping.get(Number(itemId));
    if (!meta) throw new Error('unknown item');
    if (!['low', 'high', 'margin'].includes(metric)) throw new Error('bad metric');
    if (!['<=', '>='].includes(op)) throw new Error('bad op');
    const alert = { id: crypto.randomUUID(), itemId: Number(itemId), name: meta.name, metric, op, value: Number(value), createdAt: Date.now(), firedAt: null };
    this.alerts.push(alert);
    this.save();
    return alert;
  }

  remove(id) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    this.save();
  }

  evaluate(snap) {
    for (const a of this.alerts) {
      const p = snap.latest?.[a.itemId];
      if (!p) continue;
      const current = a.metric === 'margin' ? margin(p.low, p.high, a.name) : p[a.metric];
      if (current === undefined || current === null) continue;
      const hit = a.op === '<=' ? current <= a.value : current >= a.value;
      // Re-arm once the condition clears so you get one ping per crossing, not a firehose
      if (hit && !a.firedAt) {
        a.firedAt = Date.now();
        this.save();
        const event = { ...a, current };
        this.fired.unshift(event);
        this.fired = this.fired.slice(0, 50);
        this.broadcast('alert', event);
      } else if (!hit && a.firedAt) {
        a.firedAt = null;
        this.save();
      }
    }
    this.broadcast('tick', { updatedAt: snap.updatedAt });
  }

  broadcast(type, data) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) res.write(payload);
  }

  subscribe(res) {
    this.clients.add(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ alerts: this.alerts.length })}\n\n`);
    return () => this.clients.delete(res);
  }
}
