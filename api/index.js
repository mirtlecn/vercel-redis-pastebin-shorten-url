import { errorResponse } from '../lib/utils/response.js';
import { isAuthenticated } from '../lib/utils/auth.js';
import { handleCreate, handleReplace } from '../lib/handlers/create.js';
import { handleDelete } from '../lib/handlers/remove.js';
import { handleList } from '../lib/handlers/list.js';
import { handleAuthenticatedLookup } from '../lib/handlers/authenticated-lookup.js';
import { handlePublicGet } from '../lib/handlers/public-get.js';

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

function requireWriteAuthentication(req, res) {
  if (isAuthenticated(req)) {
    return true;
  }

  unauthorized(res);
  return false;
}

export function createApiHandler({
  authenticate = isAuthenticated,
  onCreate = handleCreate,
  onReplace = handleReplace,
  onDelete = handleDelete,
  onList = handleList,
  onLookup = handleAuthenticatedLookup,
  onPublicGet = handlePublicGet,
} = {}) {
  return async function handler(req, res) {
    try {
      switch (req.method) {
        case 'POST':
          if (!authenticate(req)) {
            return unauthorized(res);
          }
          return onCreate(req, res);
        case 'PUT':
          if (!authenticate(req)) {
            return unauthorized(res);
          }
          return onReplace(req, res);
        case 'DELETE':
          if (!authenticate(req)) {
            return unauthorized(res);
          }
          return onDelete(req, res);
        case 'GET':
          if (authenticate(req)) {
            if (await onLookup(req, res)) {
              return;
            }
            return onList(req, res);
          }
          return onPublicGet(req, res);
        case 'HEAD':
          return onPublicGet(req, res);
        default:
          return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
      }
    } catch (error) {
      console.error('Error:', error);
      return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
    }
  };
}

export default createApiHandler();
