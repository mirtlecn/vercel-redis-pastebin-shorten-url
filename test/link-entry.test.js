import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadedFilePath,
  validateLinkPath,
} from '../lib/utils/link-path.js';
import {
  parseTtlMinutes,
  detectContentType,
  applyContentConversion,
  writeStoredLink,
} from '../lib/services/link-entry.js';

test('validateLinkPath accepts valid values and rejects reserved prefix', () => {
  assert.deepEqual(validateLinkPath('docs/path-1'), { valid: true });
  assert.deepEqual(validateLinkPath('admin/tools'), {
    valid: false,
    error: 'path prefix "admin" is reserved',
  });
});

test('buildUploadedFilePath appends file extension only when needed', () => {
  assert.equal(buildUploadedFilePath('image', '.png'), 'image.png');
  assert.equal(buildUploadedFilePath('image.png', '.png'), 'image.png');
});

test('parseTtlMinutes handles empty, valid, and invalid values', () => {
  assert.deepEqual(parseTtlMinutes(undefined), {
    expiresIn: null,
    ttlSeconds: null,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes('5'), {
    expiresIn: 5,
    ttlSeconds: 300,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes('0'), {
    expiresIn: 1,
    ttlSeconds: 60,
    warning: 'invalid ttl, fallback to 1 minute',
  });
});

test('detectContentType infers url and text', () => {
  assert.equal(detectContentType('https://example.com', undefined), 'url');
  assert.equal(detectContentType('hello', undefined), 'text');
  assert.equal(detectContentType('hello', 'html'), 'html');
});

test('applyContentConversion supports convert branches and failure path', async () => {
  const convertedMarkdown = await applyContentConversion({
    inputContent: '# Title',
    inputType: 'text',
    convert: 'md2html',
    convertMarkdownToHtml: (markdown) => `<html>${markdown}</html>`,
    convertToQrCode: async () => 'unused',
  });
  assert.deepEqual(convertedMarkdown, {
    content: '<html># Title</html>',
    type: 'html',
  });

  const convertedQr = await applyContentConversion({
    inputContent: 'hello',
    inputType: 'text',
    convert: 'qrcode',
    convertMarkdownToHtml: (markdown) => markdown,
    convertToQrCode: async (content) => `qr:${content}`,
  });
  assert.deepEqual(convertedQr, {
    content: 'qr:hello',
    type: 'text',
  });

  await assert.rejects(
    applyContentConversion({
      inputContent: 'hello',
      inputType: 'text',
      convert: 'bad',
      convertMarkdownToHtml: (markdown) => markdown,
      convertToQrCode: async (content) => content,
    }),
    /Invalid convert value: bad/,
  );
});

test('writeStoredLink covers create, overwrite, and ttl fallback', async () => {
  const operations = [];
  const storedValues = new Map([['surl:path', 'text:old']]);
  const redis = {
    async get(key) {
      return storedValues.get(key) || null;
    },
    async set(key, value) {
      operations.push(['set', key, value]);
      storedValues.set(key, value);
    },
    async setEx(key, ttlSeconds, value) {
      operations.push(['setEx', key, ttlSeconds, value]);
      storedValues.set(key, value);
    },
  };

  const conflictResult = await writeStoredLink({
    redis,
    path: 'path',
    storedValue: 'text:new',
    allowOverwrite: false,
    ttlValue: undefined,
    clearPathCache: async () => {
      operations.push(['clear']);
    },
  });
  assert.equal(conflictResult.existingStoredValue, 'text:old');
  assert.deepEqual(operations, []);

  const overwriteResult = await writeStoredLink({
    redis,
    path: 'path',
    storedValue: 'text:new',
    allowOverwrite: true,
    ttlValue: '0',
    clearPathCache: async (path) => {
      operations.push(['clear', path]);
    },
  });
  assert.equal(overwriteResult.didOverwrite, true);
  assert.equal(overwriteResult.ttlWarning, 'invalid ttl, fallback to 1 minute');
  assert.deepEqual(operations, [
    ['clear', 'path'],
    ['setEx', 'surl:path', 60, 'text:new'],
  ]);
});
