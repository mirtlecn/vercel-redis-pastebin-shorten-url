import { randomUUID, timingSafeEqual } from 'crypto';
import { getRedisClient } from '../redis.js';

/**
 * Authentication helpers.
 * Bearer tokens are kept for CLI and API requests.
 * The admin UI uses an HttpOnly cookie session.
 */

export const ADMIN_SESSION_COOKIE = 'post_admin_session';
export const ADMIN_SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const ADMIN_SESSION_PATH = '/api/admin';
export const ADMIN_SESSION_PREFIX = 'admin:session:';

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

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function getAdminSessionKey(sessionId) {
  return `${ADMIN_SESSION_PREFIX}${sessionId}`;
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

export function buildAdminSessionCookie(sessionId) {
  return buildSetCookie(ADMIN_SESSION_COOKIE, sessionId, {
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

export async function createAdminSession({ redisClient = null, currentTime = new Date() } = {}) {
  const redis = redisClient || await getRedisClient();
  const sessionId = randomUUID();
  await redis.setEx(
    getAdminSessionKey(sessionId),
    ADMIN_SESSION_MAX_AGE,
    JSON.stringify({
      createdAt: currentTime.toISOString(),
      type: 'admin',
    }),
  );
  return sessionId;
}

export async function deleteAdminSession(req, { redisClient = null } = {}) {
  const sessionId = getCookie(req, ADMIN_SESSION_COOKIE);
  if (!sessionId) {
    return false;
  }

  const redis = redisClient || await getRedisClient();
  const deletedCount = await redis.del(getAdminSessionKey(sessionId));
  return deletedCount > 0;
}

export async function isAdminSessionAuthenticated(req, { redisClient = null } = {}) {
  const sessionId = getCookie(req, ADMIN_SESSION_COOKIE);
  if (!sessionId) {
    return false;
  }

  const redis = redisClient || await getRedisClient();
  const storedSession = await redis.get(getAdminSessionKey(sessionId));
  return Boolean(storedSession);
}

export function isAuthenticated(req) {
  return getToken(req) === process.env.SECRET_KEY;
}

export function isAdminAuthenticated(req) {
  const adminKey = getAdminKey();
  if (!adminKey) return false;
  const token = getToken(req);
  if (!token) {
    return false;
  }

  return safeEqual(token, adminKey);
}

export async function isAdminRequestAuthenticated(req, { redisClient = null } = {}) {
  if (await isAdminSessionAuthenticated(req, { redisClient })) {
    return true;
  }

  return isAdminAuthenticated(req);
}
