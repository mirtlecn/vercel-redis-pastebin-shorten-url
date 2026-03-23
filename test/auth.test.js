import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  buildAdminLogoutCookie,
  buildAdminSessionCookie,
  createAdminSession,
  deleteAdminSession,
  isAdminAuthenticated,
  isAdminRequestAuthenticated,
  isAdminSessionAuthenticated,
} from '../lib/utils/auth.js';

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.ttls = new Map();
  }

  async setEx(key, ttlSeconds, value) {
    this.values.set(key, value);
    this.ttls.set(key, ttlSeconds);
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async del(key) {
    const keys = Array.isArray(key) ? key : [key];
    let deleted = 0;
    for (const item of keys) {
      if (this.values.delete(item)) {
        deleted += 1;
      }
      this.ttls.delete(item);
    }
    return deleted;
  }
}

test('createAdminSession stores a random redis-backed session and cookie', async () => {
  const redis = new FakeRedis();
  const sessionId = await createAdminSession({
    redisClient: redis,
    currentTime: new Date('2026-03-23T10:00:00Z'),
  });
  const cookie = buildAdminSessionCookie(sessionId);
  const sessionKey = `admin:session:${sessionId}`;

  assert.match(sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(redis.ttls.get(sessionKey), ADMIN_SESSION_MAX_AGE);
  assert.match(redis.values.get(sessionKey), /"type":"admin"/);
  assert.match(cookie, new RegExp(`^${ADMIN_SESSION_COOKIE}=`));
});

test('isAdminSessionAuthenticated checks redis-backed session state', async () => {
  const redis = new FakeRedis();
  const sessionId = await createAdminSession({ redisClient: redis });

  assert.equal(
    await isAdminSessionAuthenticated({
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${sessionId}` },
    }, { redisClient: redis }),
    true,
  );
  assert.equal(
    await isAdminSessionAuthenticated({
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=missing` },
    }, { redisClient: redis }),
    false,
  );
});

test('deleteAdminSession removes the current redis session and logout cookie expires it client-side', async () => {
  const redis = new FakeRedis();
  const sessionId = await createAdminSession({ redisClient: redis });

  assert.equal(
    await deleteAdminSession({
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${sessionId}` },
    }, { redisClient: redis }),
    true,
  );
  assert.equal(await redis.get(`admin:session:${sessionId}`), null);
  assert.match(buildAdminLogoutCookie(), /Max-Age=0/);
});

test('isAdminRequestAuthenticated keeps bearer admin key compatibility', async () => {
  process.env.SECRET_KEY = 'secret-key';
  process.env.ADMIN_KEY = 'admin-key';

  assert.equal(isAdminAuthenticated({
    headers: { authorization: 'Bearer admin-key' },
  }), true);

  assert.equal(await isAdminRequestAuthenticated({
    headers: { authorization: 'Bearer admin-key' },
  }, { redisClient: new FakeRedis() }), true);
});
