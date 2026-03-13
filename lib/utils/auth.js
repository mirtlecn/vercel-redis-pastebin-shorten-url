import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Authentication helpers.
 * Bearer tokens are kept for CLI and API requests.
 * The admin UI uses an HttpOnly cookie session.
 */

export const ADMIN_SESSION_COOKIE = 'post_admin_session';
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const ADMIN_SESSION_PATH = '/api/admin';

function isSecureCookie() {
  return process.env.NODE_ENV === 'production';
}

export function getToken(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export function getAdminKey() {
  return process.env.ADMIN_KEY || process.env.SECRET_KEY;
}

function getAdminSessionToken() {
  const adminKey = getAdminKey();
  const secretKey = process.env.SECRET_KEY;
  if (!adminKey || !secretKey) return '';
  // Derive the session value from server-side secrets instead of storing a raw password.
  return createHmac('sha256', `${secretKey}:${adminKey}`)
    .update('post-admin-session:v1')
    .digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key !== name) continue;
    return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function buildSetCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildAdminSessionCookie() {
  return buildSetCookie(ADMIN_SESSION_COOKIE, getAdminSessionToken(), {
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: ADMIN_SESSION_PATH,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookie(),
  });
}

export function buildAdminLogoutCookie() {
  return buildSetCookie(ADMIN_SESSION_COOKIE, '', {
    maxAge: 0,
    path: ADMIN_SESSION_PATH,
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureCookie(),
  });
}

export function isAdminSessionAuthenticated(req) {
  const token = getCookie(req, ADMIN_SESSION_COOKIE);
  const expected = getAdminSessionToken();
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}

export function isAuthenticated(req) {
  return getToken(req) === process.env.SECRET_KEY;
}

export function isAdminAuthenticated(req) {
  const adminKey = getAdminKey();
  if (!adminKey) return false;
  return getToken(req) === adminKey;
}

export function isAdminRequestAuthenticated(req) {
  return isAdminSessionAuthenticated(req) || isAdminAuthenticated(req);
}
