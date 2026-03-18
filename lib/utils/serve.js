import {
  textResponse,
  htmlResponse,
  redirectResponse,
  errorResponse,
  binaryResponse,
  proxyStreamWithCache,
} from './response.js';
import { isS3Configured, getS3Object } from './s3.js';
import { getFileCache, setFileCache, getCacheMaxBytes } from './file-cache.js';

export async function respondByType(req, res, { type, content, path, redis }) {
  const isHeadRequest = req.method === 'HEAD';

  if (type === 'url') {
    redirectResponse(res, content);
    return;
  }
  if (type === 'topic') {
    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: 'text/html; charset=utf-8',
        contentLength: Buffer.byteLength(content),
        cacheControl: 'no-store',
      });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    htmlResponse(res, content, false);
    return;
  }
  if (type === 'html') {
    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: 'text/html; charset=utf-8',
        contentLength: Buffer.byteLength(content),
        cacheControl: 'public, max-age=86400, s-maxage=86400',
      });
      return;
    }
    htmlResponse(res, content);
    return;
  }
  if (type !== 'file') {
    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: 'text/plain; charset=utf-8',
        contentLength: Buffer.byteLength(`${content}\n`),
        cacheControl: 'public, max-age=86400, s-maxage=86400',
      });
      return;
    }
    textResponse(res, content);
    return;
  }

  if (!isS3Configured()) {
    errorResponse(res, { code: 's3_not_configured', message: 'S3 service is not configured' }, 501);
    return;
  }

  try {
    const cached = await getFileCache(redis, path);
    if (cached) {
      if (isHeadRequest) {
        sendHeadResponse(res, {
          contentType: cached.contentType,
          contentLength: cached.contentLength,
          cacheControl: 'public, max-age=86400, s-maxage=86400',
        });
        return;
      }
      binaryResponse(res, cached);
      return;
    }
  } catch (error) {
    console.warn('Cache read failed:', error);
  }

  try {
    const s3Object = await getS3Object(content);
    if (isHeadRequest) {
      sendHeadResponse(res, {
        contentType: s3Object.contentType,
        contentLength: s3Object.contentLength,
        cacheControl: 'public, max-age=86400, s-maxage=86400',
      });
      return;
    }
    await proxyStreamWithCache(res, s3Object, {
      maxBytes: getCacheMaxBytes(),
      writeCache: async (buffer, meta) => {
        await setFileCache(redis, path, {
          buffer,
          contentType: meta.contentType,
          contentLength: meta.contentLength,
        });
      },
    });
  } catch (error) {
    console.error('Failed to serve file', error);
    errorResponse(res, { code: 'internal', message: 'Failed to retrieve file' }, 500);
  }
}

function sendHeadResponse(res, { contentType, contentLength, cacheControl }) {
  res.statusCode = 200;
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (contentLength !== undefined && contentLength !== null) {
    res.setHeader('Content-Length', contentLength);
  }
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  res.end();
}
