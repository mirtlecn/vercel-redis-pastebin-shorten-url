import { parseRequestBodyWithLimit } from '../../lib/utils/storage.js';
import { errorResponse, jsonResponse } from '../../lib/utils/response.js';
import {
  buildAdminLogoutCookie,
  buildAdminSessionCookie,
  createAdminSession,
  deleteAdminSession,
  getAdminKey,
  isAdminSessionAuthenticated,
} from '../../lib/utils/auth.js';

const ADMIN_LOGIN_MAX_BYTES = 16 * 1024;

function ok(res, payload) {
  return jsonResponse(res, payload, 200);
}

function unauthorized(res) {
  return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
}

export function createAdminSessionHandler({
  parseBody = parseRequestBodyWithLimit,
  createSession = createAdminSession,
  removeSession = deleteAdminSession,
  getAdminKeyValue = getAdminKey,
  isSessionAuthenticated = isAdminSessionAuthenticated,
} = {}) {
  return async function handler(req, res) {
    try {
      switch (req.method) {
        case 'GET':
          if (!await isSessionAuthenticated(req)) return unauthorized(res);
          return ok(res, { authenticated: true });

        case 'POST':
          return await handleLogin(req, res, { parseBody, createSession, getAdminKeyValue });

        case 'DELETE':
          await removeSession(req);
          res.setHeader('Set-Cookie', buildAdminLogoutCookie());
          return ok(res, { ok: true });

        default:
          return errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
      }
    } catch (error) {
      console.error('Admin session error:', error);
      return errorResponse(res, { code: 'internal', message: 'Internal server error' }, 500);
    }
  };
}

export default createAdminSessionHandler();

async function handleLogin(req, res, { parseBody, createSession, getAdminKeyValue }) {
  try {
    const body = await parseBody(req, { maxBytes: ADMIN_LOGIN_MAX_BYTES });
    const adminKey = getAdminKeyValue();
    const password = typeof body?.password === 'string' ? body.password.trim() : '';

    if (!adminKey || !password || password !== adminKey) {
      return unauthorized(res);
    }

    const sessionId = await createSession();
    res.setHeader('Set-Cookie', buildAdminSessionCookie(sessionId));
    return ok(res, { authenticated: true });
  } catch (error) {
    if (error?.status === 413) {
      return errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
    }

    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }
}
