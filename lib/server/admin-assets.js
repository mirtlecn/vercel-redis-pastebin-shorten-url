import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { extname, normalize, resolve } from 'path';
import { htmlResponse } from '../utils/response.js';

const ADMIN_NOT_BUILT_HTML = '<!doctype html><html><body style="font-family:sans-serif;padding:32px;"><h1>Admin UI not built</h1><p>Run <code>npm run build</code> first, then restart the server.</p></body></html>';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

async function serveAdminShell(response, indexFilePath) {
  const html = await readFile(indexFilePath, 'utf8');
  response.setHeader('Cache-Control', 'no-store');
  htmlResponse(response, html, false);
}

export async function tryServeAdminAsset(req, response, adminDirectory) {
  const { pathname } = getRequestUrl(req);
  const indexFilePath = resolve(adminDirectory, 'index.html');

  if (pathname === '/admin' || pathname === '/admin/') {
    if (!existsSync(indexFilePath)) {
      htmlResponse(response, ADMIN_NOT_BUILT_HTML, false);
      return true;
    }

    await serveAdminShell(response, indexFilePath);
    return true;
  }

  if (!pathname.startsWith('/admin/assets/')) {
    return false;
  }

  if (!existsSync(indexFilePath)) {
    htmlResponse(response, ADMIN_NOT_BUILT_HTML, false);
    return true;
  }

  const relativePath = pathname.slice('/admin/'.length);
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = resolve(adminDirectory, safePath);

  if (!filePath.startsWith(adminDirectory) || !existsSync(filePath)) {
    response.statusCode = 404;
    response.end('Not found');
    return true;
  }

  const fileExtension = extname(filePath).toLowerCase();
  const fileBuffer = await readFile(filePath);
  response.statusCode = 200;
  response.setHeader('Content-Type', MIME_TYPES[fileExtension] || 'application/octet-stream');
  response.setHeader(
    'Cache-Control',
    fileExtension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  );
  response.end(fileBuffer);
  return true;
}
