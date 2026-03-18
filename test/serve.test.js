import test from 'node:test';
import assert from 'node:assert/strict';
import { respondByType } from '../lib/utils/serve.js';
import { createMockRequest, createMockResponse } from './helpers/http.js';

test('respondByType omits body for head text responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'text',
    content: 'hello',
    path: 'note',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/plain; charset=utf-8');
  assert.equal(response.getHeader('content-length'), 6);
});

test('respondByType omits body for head html responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'html',
    content: '<p>Hello</p>',
    path: 'note',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
  assert.equal(response.getHeader('content-length'), Buffer.byteLength('<p>Hello</p>'));
});

test('respondByType omits body for head topic responses', async () => {
  const response = createMockResponse();

  await respondByType(createMockRequest({ method: 'HEAD' }), response, {
    type: 'topic',
    content: '<article>Topic</article>',
    path: 'topic',
    redis: null,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '');
  assert.equal(response.getHeader('cache-control'), 'no-store');
  assert.equal(response.getHeader('content-type'), 'text/html; charset=utf-8');
});

test('respondByType omits body for head cached file responses', async () => {
  const response = createMockResponse();
  const previousEnvironment = {
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET_NAME,
  };
  process.env.S3_ENDPOINT = 'http://s3.local';
  process.env.S3_ACCESS_KEY_ID = 'test-key';
  process.env.S3_SECRET_ACCESS_KEY = 'test-secret';
  process.env.S3_BUCKET_NAME = 'test-bucket';
  try {
    const redis = {
      async mGet(keys) {
        const values = {
          'cache:file:docs/file.bin': Buffer.from('cached').toString('base64'),
          'cache:filemeta:docs/file.bin': JSON.stringify({
            contentType: 'application/octet-stream',
            contentLength: 6,
            encoding: 'base64',
          }),
        };
        return keys.map((key) => values[key] ?? null);
      },
    };

    await respondByType(createMockRequest({ method: 'HEAD' }), response, {
      type: 'file',
      content: 'object-key',
      path: 'docs/file.bin',
      redis,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '');
    assert.equal(response.getHeader('content-type'), 'application/octet-stream');
    assert.equal(response.getHeader('content-length'), 6);
  } finally {
    process.env.S3_ENDPOINT = previousEnvironment.endpoint;
    process.env.S3_ACCESS_KEY_ID = previousEnvironment.accessKeyId;
    process.env.S3_SECRET_ACCESS_KEY = previousEnvironment.secretAccessKey;
    process.env.S3_BUCKET_NAME = previousEnvironment.bucket;
  }
});
