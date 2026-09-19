import crypto from 'node:crypto';
import { config } from './config.js';

const COOKIE = 'coffer_key';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function isPremiumKey(key) {
  if (!key) return false;
  return config.premiumKeys.some((k) => safeEqual(k, key));
}

/** Attaches req.tier = 'free' | 'premium' based on the key cookie or Authorization header. */
export function tierMiddleware(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const key = cookies[COOKIE] || bearer || req.query.key;
  req.tier = isPremiumKey(key) ? 'premium' : 'free';
  next();
}

export function requirePremium(req, res, next) {
  if (req.tier !== 'premium') {
    return res.status(402).json({ error: 'premium_required', message: 'This is a premium feature. Upgrade to get the edge.' });
  }
  next();
}

export function setKeyCookie(res, key) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(key)}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax; HttpOnly`);
}

export function clearKeyCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`);
}
