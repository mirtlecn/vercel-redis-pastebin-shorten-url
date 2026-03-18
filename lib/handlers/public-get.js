import { getRedisClient } from '../redis.js';
import { errorResponse } from '../utils/response.js';
import { LINKS_PREFIX, parseStoredValue } from '../utils/storage.js';
import { respondByType } from '../utils/serve.js';
import { normalizeLinkPath } from '../utils/link-path.js';
import { handleEmbeddedAssetRequest } from '../assets/http.js';

export function getPublicPath(requestUrl) {
  if (requestUrl.pathname === '/') {
    return '/';
  }

  return normalizeLinkPath(decodeURIComponent(requestUrl.pathname));
}

export async function handlePublicGet(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (handleEmbeddedAssetRequest(req, res, requestUrl)) {
    return true;
  }
  const path = getPublicPath(requestUrl);
  const redis = await getRedisClient();
  const stored = await redis.get(LINKS_PREFIX + path);

  if (!stored) {
    return errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);
  }

  const { type, content } = parseStoredValue(stored);
  await respondByType(req, res, { type, content, path, redis });
  return true;
}
