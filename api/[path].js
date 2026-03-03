import { getRedisClient } from './redis.js';

const LINKS_PREFIX = 'surl:';

function jsonResponse(res, data, status = 200) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(data) + '\n');
}

function textResponse(res, text) {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(text);
}

function getToken(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/**
 * Main handler for path-based requests
 */
export default async function handler(req, res) {
  try {
    const path = req.query.path;
    
    if (!path) {
      return jsonResponse(res, { error: 'URL not found' }, 404);
    }

    const redis = await getRedisClient();
    const key = LINKS_PREFIX + path;
    const storedValue = await redis.get(key);
    
    if (!storedValue) {
      return jsonResponse(res, { error: 'URL not found' }, 404);
    }

    const isURL = storedValue.startsWith('url:');
    const content = storedValue.substring(isURL ? 4 : 5);

    // If authenticated, return JSON info instead of redirecting/displaying
    const token = getToken(req);
    if (token === process.env.SECRET_KEY) {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers['host'];
      const domain = `${protocol}://${host}`;
      
      const result = {
        surl: `${domain}/${path}`, 
        path,
      };
      
      if (isURL) {
        result.url = content;
      } else {
        result.text = content.length > 15 ? content.substring(0, 15) + '...' : content;
      }
      
      return jsonResponse(res, result, 200);
    }

    // Not authenticated
    if (isURL) {
      // Redirect to target URL
      res.writeHead(302, { Location: content });
      res.end();
    } else {
      // Display plain text
      textResponse(res, content);
    }
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse(res, { error: 'Internal server error' }, 500);
  }
}
