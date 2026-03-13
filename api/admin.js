/**
 * Admin API entry for the /admin frontend.
 *
 * Authentication rules:
 * - Entry authentication uses ADMIN_KEY and falls back to SECRET_KEY.
 * - Downstream API calls always use SECRET_KEY.
 */

import handleApiRoot from './index.js';
import { errorResponse } from '../lib/utils/response.js';
import { isAdminRequestAuthenticated } from '../lib/utils/auth.js';

function withSecretAuthorization(req) {
  const headers = { ...req.headers, authorization: `Bearer ${process.env.SECRET_KEY}` };
  const wrapped = Object.create(req);
  wrapped.headers = headers;
  return wrapped;
}

export default async function handler(req, res) {
  if (!isAdminRequestAuthenticated(req)) {
    return errorResponse(res, { code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  return handleApiRoot(withSecretAuthorization(req), res);
}
