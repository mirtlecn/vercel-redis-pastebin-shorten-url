/**
 * Post — standalone HTTP server for local development
 * Run with: npm start
 * This file is NOT used by Vercel (which uses vercel.json + api/ directory instead).
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, extname, normalize } from 'path';
import { readFile } from 'fs/promises';
import { htmlResponse } from './lib/utils/response.js';

// Load .env.local first, fall back to .env
function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), file);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
    console.log(`Loaded env from: ${file}`);
    return;
  }
}

loadEnv();

const missing = ['LINKS_REDIS_URL', 'SECRET_KEY'].filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please create a .env.local file. See .env.example for reference.');
  process.exit(1);
}

// Dynamic imports so handlers read process.env AFTER loadEnv()
const [
  { default: handleRoot },
  { default: handlePublic },
  { default: handleAdmin },
  { default: handleAdminSession },
] = await Promise.all([
  import('./api/index.js'),
  import('./lib/handlers/public.js'),
  import('./api/admin.js'),
  import('./api/admin/session.js'),
]);

const PORT = process.env.PORT || 3000;
const DIST_DIR = resolve(process.cwd(), 'dist');
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

function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

// Match the small response surface shared by local handlers and Vercel functions.
function wrapRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = res.setHeader.bind(res); // already exists on ServerResponse
  res.send = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', typeof body === 'string' ? 'text/plain' : 'application/json');
    }
    res.end(body);
  };
  return res;
}

async function serveAdminShell(res, indexPath) {
  const html = await readFile(indexPath, 'utf8');
  res.setHeader('Cache-Control', 'no-store');
  htmlResponse(res, html, false);
}

async function tryServeAdmin(req, res) {
  const { pathname } = getRequestUrl(req);

  const indexPath = resolve(DIST_DIR, 'index.html');

  if (pathname === '/admin' || pathname === '/admin/') {
    if (!existsSync(indexPath)) {
      htmlResponse(res, `<!doctype html><html><body style="font-family:sans-serif;padding:32px;"><h1>Admin UI not built</h1><p>Run <code>npm run build</code> first, then restart the server.</p></body></html>`, false);
      return true;
    }
    await serveAdminShell(res, indexPath);
    return true;
  }

  if (!pathname.startsWith('/admin/')) {
    return false;
  }

  if (!pathname.startsWith('/admin/assets/')) {
    res.statusCode = 404;
    res.end('Not found');
    return true;
  }

  if (!existsSync(indexPath)) {
    htmlResponse(res, `<!doctype html><html><body style="font-family:sans-serif;padding:32px;"><h1>Admin UI not built</h1><p>Run <code>npm run build</code> first, then restart the server.</p></body></html>`, false);
    return true;
  }

  const relativePath = pathname.slice('/admin/'.length);
  const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = resolve(DIST_DIR, safePath);

  if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath)) {
    res.statusCode = 404;
    res.end('Not found');
    return true;
  }

  const ext = extname(filePath).toLowerCase();
  const buffer = await readFile(filePath);
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable');
  res.end(buffer);
  return true;
}

createServer(async (req, res) => {
  wrapRes(res);
  const { pathname } = getRequestUrl(req);

  try {
    if (await tryServeAdmin(req, res)) return;
  } catch (error) {
    console.error('Failed to serve admin UI:', error);
    res.statusCode = 500;
    res.end('Internal server error');
    return;
  }

  if (pathname === '/api/admin/session') {
    return handleAdminSession(req, res);
  }

  if (pathname === '/api/admin') {
    return handleAdmin(req, res);
  }

  // Route: /  →  api/index.js  (all methods)
  if (pathname === '/') {
    return handleRoot(req, res);
  }

  // Route: everything else  →  public content handler
  return handlePublic(req, res);
}).listen(PORT, () => {
  console.log(`\n✅  Server running at http://localhost:${PORT}`);
  console.log(`    Press Ctrl+C to stop.\n`);
});
