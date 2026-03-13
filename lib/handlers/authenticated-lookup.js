import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  parseRequestBody,
  getDomain,
  previewContent,
} from '../utils/storage.js';

export async function handleAuthenticatedLookup(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
    return true;
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'path')) {
    return false;
  }

  const { path } = body;
  if (!path) {
    errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
    return true;
  }

  const redis = await getRedisClient();
  const stored = await redis.get(LINKS_PREFIX + path);
  if (!stored) {
    errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);
    return true;
  }

  const { type, content } = parseStoredValue(stored);
  const isExport = req.headers['x-export'] === 'true';
  jsonResponse(
    res,
    {
      surl: `${getDomain(req)}/${path}`,
      path,
      type,
      content: isExport ? content : previewContent(type, content),
    },
    200,
  );
  return true;
}
