import { getRedisClient } from '../redis.js';
import { errorResponse } from '../utils/response.js';
import { LINKS_PREFIX, parseStoredValue } from '../utils/storage.js';
import { respondByType } from '../utils/serve.js';

function getPublicPath(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rawPath = requestUrl.pathname.slice(1);
  return decodeURIComponent(rawPath || '');
}

export default async function handlePublicRequest(req, res) {
  try {
    const path = getPublicPath(req);

    if (!path) return errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);

    const redis = await getRedisClient();
    const stored = await redis.get(LINKS_PREFIX + path);

    if (!stored) return errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);

    const { type, content } = parseStoredValue(stored);
    return await respondByType(req, res, { type, content, path, redis });
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
  }
}
