import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { handleCreate } from '../lib/handlers/create.js';

function createJsonRequest(body) {
  const request = new EventEmitter();
  request.method = 'POST';
  request.headers = { 'content-type': 'application/json', host: 'example.com' };

  queueMicrotask(() => {
    request.emit('data', Buffer.from(JSON.stringify(body)));
    request.emit('end');
  });

  return request;
}

function createResponse() {
  const headers = new Map();
  return {
    statusCode: 200,
    body: '',
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(body) {
      this.body = String(body);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
  };
}

test('handleCreate rejects invalid explicit url content', async () => {
  const response = createResponse();

  await handleCreate(createJsonRequest({ url: ' example.com ', type: 'url' }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /valid absolute URL with a scheme/);
});

test('handleCreate rejects decimal ttl before touching redis', async () => {
  const response = createResponse();

  await handleCreate(createJsonRequest({ url: 'hello', type: 'text', ttl: 1.5 }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /`ttl` must be a natural number/);
});

test('handleCreate rejects string ttl before touching redis', async () => {
  const response = createResponse();

  await handleCreate(createJsonRequest({ url: 'hello', type: 'text', ttl: '10' }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /`ttl` must be a natural number/);
});

test('handleCreate rejects ttl larger than 365 days before touching redis', async () => {
  const response = createResponse();

  await handleCreate(createJsonRequest({ url: 'hello', type: 'text', ttl: 525601 }), response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body, /`ttl` must be between 0 and 525600 minutes/);
});
