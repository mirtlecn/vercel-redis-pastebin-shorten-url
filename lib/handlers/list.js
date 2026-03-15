/**
 * Return all stored links for authenticated requests.
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  getDomain,
} from '../utils/storage.js';
import { TOPIC_TYPE, countTopicItems } from '../services/topic-store.js';
import { buildPublicLink } from '../utils/link-path.js';

function ttlMinutesFromSeconds(ttlSeconds) {
  return ttlSeconds > 0 ? Math.max(1, Math.ceil(ttlSeconds / 60)) : null;
}

export async function handleList(req, res) {
  const redis = await getRedisClient();
  const domain = getDomain(req);
  const isExport = req.headers['x-export'] === 'true';

  // Use SCAN to avoid blocking Redis with KEYS.
  const keys = [];
  let cursor = '0';
  do {
    const result = await redis.scan(cursor, { MATCH: LINKS_PREFIX + '*', COUNT: 100 });
    cursor = result.cursor;
    keys.push(...result.keys);
  } while (cursor !== '0');

  // Fetch values in parallel after key discovery.
  const links = await Promise.all(
    keys.map(async (key) => {
      const path = key.slice(LINKS_PREFIX.length);
      const [stored, ttlSeconds] = await Promise.all([redis.get(key), redis.ttl(key)]);
      const { type, content, title } = parseStoredValue(stored);
      const ttl = ttlMinutesFromSeconds(ttlSeconds);
      const responseContent = type === TOPIC_TYPE
        ? String(await countTopicItems(redis, path))
        : (isExport ? content : previewContent(type, content));
      return {
        surl: buildPublicLink(domain, path),
        path,
        type,
        title,
        ttl,
        content: responseContent,
      };
    })
  );

  return jsonResponse(res, links, 200);
}
