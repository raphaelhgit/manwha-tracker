import crypto from 'crypto';

const COOKIE_NAME = 'manwha_admin';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

/** @type {Map<string, { count: number, resetAt: number }>} */
const loginAttempts = new Map();

function sessionSecret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET requis en production (min 16 caractères)');
  }
  return 'dev-session-secret-change-me';
}

function adminPassword() {
  const p = process.env.ADMIN_PASSWORD || '';
  if (p) return p;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD requis en production');
  }
  return 'admin';
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // compare against self to keep constant-ish time
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  if (!timingSafeEqualStr(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || payload.exp < Date.now()) return null;
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === '1') return true;
  if (process.env.COOKIE_SECURE === '0') return false;
  const xf = req?.headers?.['x-forwarded-proto'];
  if (typeof xf === 'string' && xf.split(',')[0].trim() === 'https') return true;
  return Boolean(req?.secure);
}

function cookieOptions(maxAgeSec, req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts;
}

export function setSessionCookie(res, req) {
  const token = sign({ role: 'admin', exp: Date.now() + MAX_AGE_MS });
  const parts = cookieOptions(Math.floor(MAX_AGE_MS / 1000), req);
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res, req) {
  const parts = cookieOptions(0, req);
  parts[0] = `${COOKIE_NAME}=`;
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function getSession(req) {
  const cookies = parseCookies(req);
  return verify(cookies[COOKIE_NAME]);
}

export function isAdmin(req) {
  return Boolean(getSession(req));
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Authentification requise' });
  }
  return next();
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function checkLoginRateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(ip, entry);
  }
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    return { ok: false, retryAfterMs: entry.resetAt - now };
  }
  return { ok: true };
}

export function recordLoginAttempt(req, success) {
  const ip = clientIp(req);
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const now = Date.now();
  let entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
}

export function verifyPassword(password) {
  return timingSafeEqualStr(String(password || ''), adminPassword());
}

export { COOKIE_NAME };
