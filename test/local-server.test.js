import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalRequestHandler } from '../lib/server/create-local-handler.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

test('local request handler serves admin shell when built assets exist', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'post-admin-built-'));
  await writeFile(join(tempDirectory, 'index.html'), '<!doctype html><html>Admin</html>');

  const handler = createLocalRequestHandler({
    adminDirectory: tempDirectory,
    handleRoot: async () => {
      throw new Error('root should not run');
    },
    handleAdmin: async () => {},
    handleAdminSession: async () => {},
  });
  const response = createMockResponse();

  await handler(createMockRequest({ url: '/admin' }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
  assert.match(response.body, /Admin/);
});

test('local request handler keeps unknown admin subpaths away from shell fallback', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'post-admin-strict-'));
  await writeFile(join(tempDirectory, 'index.html'), '<!doctype html><html>Admin</html>');

  let rootCalls = 0;
  const handler = createLocalRequestHandler({
    adminDirectory: tempDirectory,
    handleRoot: async () => {
      rootCalls += 1;
    },
    handleAdmin: async () => {},
    handleAdminSession: async () => {},
  });

  await handler(createMockRequest({ url: '/admin/not-a-route' }), createMockResponse());
  assert.equal(rootCalls, 1);
});

test('local request handler returns not built message when admin shell is missing', async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'post-admin-missing-'));
  await mkdir(join(tempDirectory, 'assets'));

  const handler = createLocalRequestHandler({
    adminDirectory: tempDirectory,
    handleRoot: async () => {},
    handleAdmin: async () => {},
    handleAdminSession: async () => {},
  });
  const response = createMockResponse();

  await handler(createMockRequest({ url: '/admin' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Admin UI not built/);
});
