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
  if (type === 'url') {
    redirectResponse(res, content);
    return;
  }
  if (type === 'topic') {
    res.setHeader('Cache-Control', 'no-store');
    htmlResponse(res, content, false);
    return;
  }
  if (type === 'html') {
    htmlResponse(res, content);
    return;
  }
  if (type !== 'file') {
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
      binaryResponse(res, cached);
      return;
    }
  } catch (error) {
    console.warn('Cache read failed:', error);
  }

  try {
    const s3Object = await getS3Object(content);
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
