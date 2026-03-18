import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { handlePublicGet } from '../lib/handlers/public-get.js';
import { handleCreate } from '../lib/handlers/create.js';
import { handleDelete } from '../lib/handlers/remove.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

function createJsonRequest(method, body) {
  const request = new EventEmitter();
  request.method = method;
  request.url = '/';
  request.headers = { 'content-type': 'application/json', host: 'example.com' };

  queueMicrotask(() => {
    request.emit('data', Buffer.from(JSON.stringify(body)));
    request.emit('end');
  });

  return request;
}

test('handlePublicGet rejects direct embedded asset access', async () => {
  const response = createMockResponse();

  await handlePublicGet(
    createMockRequest({
      method: 'GET',
      url: '/asset/md-base-7f7c1c5a.css',
      headers: { host: 'example.com' },
    }),
    response,
  );

  assert.equal(response.statusCode, 403);
  assert.match(response.body, /"code":"forbidden"/);
});

test('handlePublicGet serves embedded asset for same-origin referer', async () => {
  const response = createMockResponse();

  await handlePublicGet(
    createMockRequest({
      method: 'GET',
      url: '/asset/md-base-7f7c1c5a.css',
      headers: { host: 'example.com', referer: 'http://example.com/note' },
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.getHeader('content-type'), /text\/css/);
  assert.equal(response.getHeader('cache-control'), 'public, max-age=31536000, immutable');
  assert.match(String(response.body), /\.markdown-body/);
});

test('handlePublicGet responds to head requests without a body for embedded assets', async () => {
  const response = createMockResponse();

  await handlePublicGet(
    createMockRequest({
      method: 'HEAD',
      url: '/asset/md-base-7f7c1c5a.css',
      headers: { host: 'example.com', referer: 'http://example.com/note' },
    }),
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.match(response.getHeader('content-type'), /text\/css/);
});

test('handleCreate rejects reserved embedded asset path', async () => {
  const response = createMockResponse();

  await handleCreate(
    createJsonRequest('POST', { url: 'hello', path: 'asset/md-base-7f7c1c5a.css', type: 'text' }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /reserved for built-in assets/);
});

test('handleDelete rejects reserved embedded asset path', async () => {
  const response = createMockResponse();

  await handleDelete(
    createJsonRequest('DELETE', { path: 'asset/md-base-7f7c1c5a.css', type: 'text' }),
    response,
  );

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /reserved for built-in assets/);
});
