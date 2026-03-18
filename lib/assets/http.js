import { errorResponse } from '../utils/response.js';
import { isReservedEmbeddedAssetPath, lookupEmbeddedAsset } from './index.js';

export function handleEmbeddedAssetRequest(req, res, requestUrl) {
  if (!isReservedEmbeddedAssetPath(requestUrl.pathname)) {
    return false;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    errorResponse(res, { code: 'method_not_allowed', message: 'Method not allowed' }, 405);
    return true;
  }

  if (!isInternalAssetRequest(req)) {
    errorResponse(res, { code: 'forbidden', message: 'This path is reserved for internal use' }, 403);
    return true;
  }

  const asset = lookupEmbeddedAsset(requestUrl.pathname);
  if (!asset) {
    return false;
  }

  res.setHeader('Content-Type', asset.content_type);
  res.setHeader('Content-Length', asset.content.length);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.statusCode = 200;
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  res.end(asset.content);
  return true;
}

export function isReservedAssetPath(path) {
  return isReservedEmbeddedAssetPath(`/${path}`);
}

export function reservedAssetPathError(path) {
  return `path "${path}" is reserved for built-in assets`;
}

function isInternalAssetRequest(req) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite === 'same-origin' || fetchSite === 'same-site') {
    return true;
  }

  return hasSameOriginHeader(req, 'referer') || hasSameOriginHeader(req, 'origin');
}

function hasSameOriginHeader(req, headerName) {
  const value = req.headers[headerName];
  if (!value || !req.headers.host) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.host === req.headers.host;
  } catch {
    return false;
  }
}
