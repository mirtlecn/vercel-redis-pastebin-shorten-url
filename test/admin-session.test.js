import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSessionHandler } from '../api/admin/session.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

test('admin session handler creates a redis-backed session cookie on login', async () => {
  const calls = [];
  const handler = createAdminSessionHandler({
    parseBody: async () => ({ password: 'demo-admin' }),
    getAdminKeyValue: () => 'demo-admin',
    createSession: async () => 'session-123',
    removeSession: async () => false,
    isSessionAuthenticated: async () => false,
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /"authenticated":true/);
  assert.match(response.getHeader('set-cookie'), /^post_admin_session=session-123/);
  calls.push('done');
  assert.deepEqual(calls, ['done']);
});

test('admin session handler rejects oversized login bodies with 413', async () => {
  const handler = createAdminSessionHandler({
    parseBody: async () => {
      const error = new Error('too large');
      error.status = 413;
      throw error;
    },
    createSession: async () => 'unused',
    getAdminKeyValue: () => 'demo-admin',
    removeSession: async () => false,
    isSessionAuthenticated: async () => false,
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST' }), response);

  assert.equal(response.statusCode, 413);
  assert.match(response.body, /Request body too large/);
});

test('admin session handler removes the current session on logout', async () => {
  let removedRequest = null;
  const handler = createAdminSessionHandler({
    parseBody: async () => ({}),
    createSession: async () => 'unused',
    getAdminKeyValue: () => 'demo-admin',
    removeSession: async (req) => {
      removedRequest = req;
      return true;
    },
    isSessionAuthenticated: async () => true,
  });
  const request = createMockRequest({
    method: 'DELETE',
    headers: { cookie: 'post_admin_session=session-123' },
  });
  const response = createMockResponse();

  await handler(request, response);

  assert.equal(removedRequest, request);
  assert.equal(response.statusCode, 200);
  assert.match(response.getHeader('set-cookie'), /Max-Age=0/);
});
