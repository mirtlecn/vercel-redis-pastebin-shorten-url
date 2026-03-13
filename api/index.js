/**
 * POST / PUT / DELETE / GET /
 *
 * POST   创建条目（需认证，path 已存在时返回 409）
 * PUT    创建或覆写条目（需认证，幂等）
 * DELETE 删除条目（需认证）
 * GET    已认证：列出所有条目；未认证：查找 path='/' 并响应
 */

import { getRedisClient } from '../lib/redis.js';
import { jsonResponse, errorResponse } from '../lib/utils/response.js';
import { isAuthenticated } from '../lib/utils/auth.js';
import { LINKS_PREFIX, parseStoredValue, parseRequestBody, getDomain, previewContent } from '../lib/utils/storage.js';
import { handleCreate, handleReplace } from '../lib/handlers/create.js';
import { handleDelete } from '../lib/handlers/remove.js';
import { handleList } from '../lib/handlers/list.js';
import { respondByType } from '../lib/utils/serve.js';

export default async function handler(req, res) {
  try {
    switch (req.method) {
      case 'POST':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleCreate(req, res);

      case 'PUT':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleReplace(req, res);

      case 'DELETE':
        if (!isAuthenticated(req)) return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
        return await handleDelete(req, res);

      case 'GET':
        if (isAuthenticated(req)) {
          if (await handleLookupAuthedFromBody(req, res)) return;
          return await handleList(req, res);
        }
        // 未认证：根路径和公开 path 都从这里处理
        return await handlePublicGet(req, res);

      default:
        return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    }
  } catch (error) {
    console.error('Error:', error);
    return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
  }
}

async function handleLookupAuthedFromBody(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
    return true;
  }

  const hasPath = Object.prototype.hasOwnProperty.call(body, 'path');
  if (!hasPath) return false;

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
  jsonResponse(res, {
    surl: `${getDomain(req)}/${path}`,
    path,
    type,
    content: isExport ? content : previewContent(type, content),
  }, 200);
  return true;
}

/**
 * 未认证的 GET：path 为空时查找 '/'，否则按公开短链查找。
 */
async function handlePublicGet(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = getPublicPath(requestUrl);
  console.log('Public GET request for path:', path);
  const redis = await getRedisClient();
  const stored = await redis.get(LINKS_PREFIX + path);

  if (!stored) return errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);

  const { type, content } = parseStoredValue(stored);
  return await respondByType(req, res, { type, content, path, redis });
}

function getPublicPath(requestUrl) {
  return requestUrl.pathname === '/' ? '/' : decodeURIComponent(requestUrl.pathname.slice(1));
}
