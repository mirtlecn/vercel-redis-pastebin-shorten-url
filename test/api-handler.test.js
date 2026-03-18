import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../api/index.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

test('createApiHandler rejects unauthenticated write requests', async () => {
  const handler = createApiHandler({
    authenticate: () => false,
  });
  const response = createMockResponse();

  await handler(createMockRequest({ method: 'POST' }), response);

  assert.equal(response.statusCode, 401);
  assert.match(response.body, /Unauthorized/);
});

test('createApiHandler routes authenticated lookup before list', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onLookup: async () => {
      calls.push('lookup');
      return true;
    },
    onList: async () => {
      calls.push('list');
    },
  });

  await handler(createMockRequest({ method: 'GET' }), createMockResponse());
  assert.deepEqual(calls, ['lookup']);
});

test('createApiHandler falls back to list when authenticated lookup does not handle', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => true,
    onLookup: async () => {
      calls.push('lookup');
      return false;
    },
    onList: async () => {
      calls.push('list');
    },
  });

  await handler(createMockRequest({ method: 'GET' }), createMockResponse());
  assert.deepEqual(calls, ['lookup', 'list']);
});

test('createApiHandler routes unauthenticated get to public handler', async () => {
  const calls = [];
  const handler = createApiHandler({
    authenticate: () => false,
    onPublicGet: async () => {
      calls.push('public');
    },
  });

  await handler(createMockRequest({ method: 'GET' }), createMockResponse());
  assert.deepEqual(calls, ['public']);
});

test('createApiHandler routes head requests to public handler', async () => {
  const calls = [];
  const handler = createApiHandler({
    onPublicGet: async () => {
      calls.push('public');
    },
  });

  await handler(createMockRequest({ method: 'HEAD' }), createMockResponse());
  assert.deepEqual(calls, ['public']);
});
