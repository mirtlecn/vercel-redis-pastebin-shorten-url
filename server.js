/**
 * Standalone HTTP server (zero dependencies, uses Node.js built-in `http`)
 * Run with: npm start
 * This file is NOT used by Vercel (which uses vercel.json + api/ directory instead).
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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
      const value = trimmed.slice(eqIdx + 1).trim();
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

// Dynamic imports so api modules read process.env AFTER loadEnv()
const [{ default: handleApiRoot }, { default: handleApiPath }] = await Promise.all([
  import('./api/index.js'),
  import('./api/[path].js'),
]);

const PORT = process.env.PORT || 3000;

// Wrap Node.js IncomingMessage/ServerResponse to match the minimal interface
// that api/index.js and api/[path].js expect (same as Vercel's req/res).
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

createServer((req, res) => {
  wrapRes(res);

  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    res.status(400).send('Bad Request\n');
    return;
  }
  const pathname = url.pathname;

  // Inject query params (for /:path handler which reads req.query.path)
  req.query = Object.fromEntries(url.searchParams);

  // Route: /  →  api/index.js  (all methods)
  if (pathname === '/') {
    return handleApiRoot(req, res);
  }

  // Route: /:path  →  api/[path].js  (GET only)
  const match = pathname.match(/^\/([^/]+)$/);
  if (match) {
    req.query.path = match[1];
    return handleApiPath(req, res);
  }

  // 404 fallback
  res.status(404).send('Not found\n');
}).listen(PORT, () => {
  console.log(`\n✅  Server running at http://localhost:${PORT}`);
  console.log(`    Press Ctrl+C to stop.\n`);
});
