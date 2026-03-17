import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicLink,
  buildUploadedFilePath,
  normalizeLinkPath,
  validateLinkPath,
} from '../lib/utils/link-path.js';
import {
  MAX_TTL_MINUTES,
  MAX_TTL_SECONDS,
  parseTtlMinutes,
  detectContentType,
  normalizeUrlContent,
  applyContentConversion,
  buildCreatedEntryPayload,
  writeStoredLink,
} from '../lib/services/link-entry.js';

test('validateLinkPath accepts valid values and rejects reserved prefix', () => {
  assert.deepEqual(validateLinkPath('/'), { valid: true });
  assert.deepEqual(validateLinkPath('docs/path-1'), { valid: true });
  assert.deepEqual(validateLinkPath('admin/tools'), {
    valid: false,
    error: 'path prefix "admin" is reserved',
  });
});

test('normalizeLinkPath trims edge slashes and preserves root', () => {
  assert.equal(normalizeLinkPath('topic/'), 'topic');
  assert.equal(normalizeLinkPath('/topic/topic/'), 'topic/topic');
  assert.equal(normalizeLinkPath('/'), '/');
  assert.equal(normalizeLinkPath('////'), '/');
  assert.equal(normalizeLinkPath(''), '');
});

test('buildUploadedFilePath appends file extension only when needed', () => {
  assert.equal(buildUploadedFilePath('/', '.png'), '/');
  assert.equal(buildUploadedFilePath('image', '.png'), 'image.png');
  assert.equal(buildUploadedFilePath('image.png', '.png'), 'image.png');
});

test('buildPublicLink keeps root without a double slash', () => {
  assert.equal(buildPublicLink('http://example.com', '/'), 'http://example.com/');
  assert.equal(buildPublicLink('http://example.com', 'docs'), 'http://example.com/docs');
});

test('parseTtlMinutes handles empty, valid, and invalid values', () => {
  assert.deepEqual(parseTtlMinutes(undefined), {
    expiresIn: null,
    ttlSeconds: null,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes(5), {
    expiresIn: 5,
    ttlSeconds: 300,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes(MAX_TTL_MINUTES), {
    expiresIn: MAX_TTL_MINUTES,
    ttlSeconds: MAX_TTL_SECONDS,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes(0), {
    expiresIn: null,
    ttlSeconds: null,
    warning: null,
  });
  assert.throws(() => parseTtlMinutes(1.5), /`ttl` must be a natural number/);
  assert.throws(() => parseTtlMinutes('5'), /`ttl` must be a natural number/);
  assert.throws(
    () => parseTtlMinutes(MAX_TTL_MINUTES + 1),
    new RegExp(`\\\`ttl\\\` must be between 0 and ${MAX_TTL_MINUTES} minutes`),
  );
  assert.deepEqual(parseTtlMinutes('5', { source: 'form' }), {
    expiresIn: 5,
    ttlSeconds: 300,
    warning: null,
  });
  assert.deepEqual(parseTtlMinutes('0', { source: 'form' }), {
    expiresIn: null,
    ttlSeconds: null,
    warning: null,
  });
  assert.throws(() => parseTtlMinutes('1.5', { source: 'form' }), /`ttl` must be a natural number/);
  assert.throws(
    () => parseTtlMinutes(String(MAX_TTL_MINUTES + 1), { source: 'form' }),
    new RegExp(`\\\`ttl\\\` must be between 0 and ${MAX_TTL_MINUTES} minutes`),
  );
});

test('detectContentType infers url and text', () => {
  assert.equal(detectContentType('https://example.com', undefined), 'url');
  assert.equal(detectContentType('  mailto:user@example.com  ', undefined), 'url');
  assert.equal(detectContentType('hello', undefined), 'text');
  assert.equal(detectContentType('hello', 'html'), 'html');
});

test('normalizeUrlContent trims valid scheme urls and rejects invalid ones', () => {
  assert.equal(normalizeUrlContent('  https://example.com/path?q=1  '), 'https://example.com/path?q=1');
  assert.equal(normalizeUrlContent('file:///Users/mirtle/test.txt'), 'file:///Users/mirtle/test.txt');
  assert.equal(normalizeUrlContent('mailto:user@example.com'), 'mailto:user@example.com');
  assert.equal(normalizeUrlContent('ftp://example.com/file.txt'), 'ftp://example.com/file.txt');
  assert.equal(normalizeUrlContent('vscode://file/Users/mirtle/Repo/www/Post'), 'vscode://file/Users/mirtle/Repo/www/Post');
  assert.equal(normalizeUrlContent('javascript:alert(1)'), 'javascript:alert(1)');

  assert.throws(
    () => normalizeUrlContent('example.com'),
    /valid absolute URL with a scheme/,
  );
  assert.throws(
    () => normalizeUrlContent('/tmp/test.txt'),
    /valid absolute URL with a scheme/,
  );
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
  const storedValues = new Map([['surl:path', '{"type":"text","content":"old"}']]);
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
    storedValue: '{"type":"text","content":"new"}',
    allowOverwrite: false,
    ttlValue: undefined,
    clearPathCache: async () => {
      operations.push(['clear']);
    },
  });
  assert.equal(conflictResult.existingStoredValue, '{"type":"text","content":"old"}');
  assert.deepEqual(operations, []);

  const overwriteResult = await writeStoredLink({
    redis,
    path: 'path',
    storedValue: '{"type":"text","content":"new"}',
    allowOverwrite: true,
    ttlValue: 0,
    clearPathCache: async (path) => {
      operations.push(['clear', path]);
    },
  });
  assert.equal(overwriteResult.didOverwrite, true);
  assert.equal(overwriteResult.ttlWarning, null);
  assert.deepEqual(operations, [
    ['clear', 'path'],
    ['set', 'surl:path', '{"type":"text","content":"new"}'],
  ]);
});

test('buildCreatedEntryPayload uses ttl field and includes overwritten preview', () => {
  const payload = buildCreatedEntryPayload({
    req: { headers: { host: 'example.com' } },
    path: 'note',
    type: 'text',
    content: 'hello world',
    title: 'Greeting',
    isExport: false,
    expiresIn: 5,
    overwrittenStoredValue: '{"type":"text","content":"old value","title":"Old"}',
    ttlWarning: 'unused',
  });

  assert.deepEqual(payload, {
    surl: 'http://example.com/note',
    path: 'note',
    type: 'text',
    title: 'Greeting',
    content: 'hello world',
    ttl: 5,
    overwritten: 'old value',
  });
});
