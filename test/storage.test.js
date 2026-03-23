import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  DEFAULT_JSON_BODY_MAX_BYTES,
  RequestBodyTooLargeError,
  buildCurrentCreatedValue,
  buildStoredValue,
  normalizeCreatedInput,
  parseStoredValue,
  previewContent,
  parseRequestBody,
  parseRequestBodyWithLimit,
  resolveStoredCreated,
} from '../lib/utils/storage.js';

test('buildStoredValue stores typed values', () => {
  assert.equal(
    buildStoredValue({
      type: 'url',
      content: 'https://example.com',
      title: 'Greeting',
      created: '2026-03-18T16:00:00Z',
    }),
    '{"type":"url","content":"https://example.com","title":"Greeting","created":"2026-03-18T16:00:00Z"}',
  );
});

test('parseStoredValue reads stored JSON values', () => {
  assert.deepEqual(parseStoredValue('{"type":"html","content":"<h1>Hello</h1>","title":"Hello","created":"2026-03-18T16:00:00Z"}'), {
    type: 'html',
    content: '<h1>Hello</h1>',
    title: 'Hello',
    created: '2026-03-18T16:00:00Z',
  });
});

test('parseStoredValue keeps old records compatible when created is missing', () => {
  assert.deepEqual(parseStoredValue('{"type":"html","content":"<h1>Hello</h1>","title":"Hello"}'), {
    type: 'html',
    content: '<h1>Hello</h1>',
    title: 'Hello',
    created: '',
  });
});

test('parseStoredValue rejects non-JSON stored values', () => {
  assert.throws(() => parseStoredValue('plain text'));
});

test('previewContent keeps url intact and truncates text', () => {
  assert.equal(previewContent('url', 'https://example.com/path'), 'https://example.com/path');
  assert.equal(previewContent('text', '1234567890123456'), '123456789012345...');
  assert.equal(previewContent('md', '# 1234567890123456'), '# 1234567890123...');
  assert.equal(previewContent('qrcode', '1234567890123456'), '123456789012345...');
});

test('parseRequestBody rejects invalid json', async () => {
  const request = new EventEmitter();
  const bodyPromise = parseRequestBody(request);
  request.emit('data', Buffer.from('{bad json'));
  request.emit('end');
  await assert.rejects(bodyPromise);
});

test('parseRequestBodyWithLimit parses valid json within the configured size', async () => {
  const request = new EventEmitter();
  const bodyPromise = parseRequestBodyWithLimit(request, { maxBytes: 32 });
  request.emit('data', Buffer.from('{"ok":'));
  request.emit('data', Buffer.from('true}'));
  request.emit('end');

  assert.deepEqual(await bodyPromise, { ok: true });
});

test('parseRequestBodyWithLimit rejects oversized requests before parsing', async () => {
  const request = new EventEmitter();
  const bodyPromise = parseRequestBodyWithLimit(request, { maxBytes: 8 });
  request.emit('data', Buffer.from('{"hello":"world"}'));

  await assert.rejects(bodyPromise, (error) => {
    assert.equal(error instanceof RequestBodyTooLargeError, true);
    assert.equal(error.status, 413);
    assert.equal(error.maxBytes, 8);
    return true;
  });
});

test('parseRequestBody keeps the default 512KB limit for callers that do not override it', () => {
  assert.equal(DEFAULT_JSON_BODY_MAX_BYTES, 512 * 1024);
});

test('normalizeCreatedInput accepts supported formats and stores UTC RFC3339', () => {
  assert.equal(normalizeCreatedInput('2026-03-19T10:00:01Z'), '2026-03-19T10:00:01Z');
  assert.equal(normalizeCreatedInput('2026-03-19T18:00:01+08:00'), '2026-03-19T10:00:01Z');
  assert.equal(normalizeCreatedInput('2026-03-19T18:00:01.123456789+08:00'), '2026-03-19T10:00:01Z');
  assert.equal(normalizeCreatedInput('2026-03-19 18:00:01'), '2026-03-19T10:00:01Z');
  assert.equal(normalizeCreatedInput('2026-03-19'), '2026-03-18T16:00:00Z');
  assert.equal(normalizeCreatedInput('2026.03.19'), '2026-03-18T16:00:00Z');
  assert.equal(normalizeCreatedInput('2026/03/19'), '2026-03-18T16:00:00Z');
});

test('normalizeCreatedInput rejects unsupported created values', () => {
  assert.throws(() => normalizeCreatedInput(''), /`created` must be a valid/);
  assert.throws(() => normalizeCreatedInput('2026-02-30'), /`created` must be a valid/);
  assert.throws(() => normalizeCreatedInput('2026-03-19 25:00:00'), /`created` must be a valid/);
});

test('resolveStoredCreated returns illegal marker for missing or invalid stored values', () => {
  assert.deepEqual(resolveStoredCreated(''), {
    created: 'illegal',
    isValid: false,
    sortTimestamp: null,
  });
  assert.deepEqual(resolveStoredCreated('bad-value'), {
    created: 'illegal',
    isValid: false,
    sortTimestamp: null,
  });
  assert.deepEqual(resolveStoredCreated('2026-03-19 18:00:01'), {
    created: '2026-03-19T10:00:01Z',
    isValid: true,
    sortTimestamp: 1773914401,
  });
});

test('buildCurrentCreatedValue formats the current time as UTC RFC3339', () => {
  assert.equal(
    buildCurrentCreatedValue(new Date('2026-03-19T10:00:01.999Z')),
    '2026-03-19T10:00:01Z',
  );
});
