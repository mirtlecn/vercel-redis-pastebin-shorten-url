/**
 * Helpers for Redis value encoding.
 *
 * Stored format: `<type>:<content>`
 *   - url:https://example.com
 *   - text:hello world
 *   - html:<h1>hi</h1>
 *   - file:post/default/abc123.png
 */

/** Redis key prefix for every shared link. */
export const LINKS_PREFIX = 'surl:';

/** Preview truncation length in characters. */
export const PREVIEW_LENGTH = 15;

export function buildStoredValue(type, content) {
  return `${type}:${content}`;
}

export function parseStoredValue(stored) {
  if (stored.startsWith('url:'))  return { type: 'url',  content: stored.slice(4) };
  if (stored.startsWith('html:')) return { type: 'html', content: stored.slice(5) };
  if (stored.startsWith('file:')) return { type: 'file', content: stored.slice(5) };
  // Fall back to plain text when no type prefix is present.
  return { type: 'text', content: stored.startsWith('text:') ? stored.slice(5) : stored };
}

export function previewContent(type, content) {
  if (type === 'url' || type === 'file') return content;
  return content.length > PREVIEW_LENGTH
    ? content.substring(0, PREVIEW_LENGTH) + '...'
    : content;
}

export function getDomain(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  return `${protocol}://${host}`;
}

export function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}
