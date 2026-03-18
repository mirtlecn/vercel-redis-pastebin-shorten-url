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
  resolveStoredCreated,
} from '../utils/storage.js';
import {
  TOPIC_TYPE,
  countTopicItemsBatch,
  readStoredValues,
  readTtlValues,
  resolveTopicDisplayTitle,
} from '../services/topic-store.js';
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

  const paths = keys.map((key) => key.slice(LINKS_PREFIX.length));
  const [storedValues, ttlValues] = await Promise.all([
    readStoredValues(redis, keys),
    readTtlValues(redis, keys),
  ]);
  const topicPaths = [];
  const parsedEntries = storedValues.map((storedValue, index) => {
    if (!storedValue) {
      return null;
    }

    const parsedValue = parseStoredValue(storedValue);
    if (parsedValue.type === TOPIC_TYPE) {
      topicPaths.push(paths[index]);
    }

    return parsedValue;
  });
  const topicCounts = await countTopicItemsBatch(redis, topicPaths);
  const topicCountByPath = new Map(
    topicPaths.map((topicPath, index) => [topicPath, topicCounts[index]]),
  );

  const links = parsedEntries.flatMap((parsedValue, index) => {
    if (!parsedValue) {
      return [];
    }

    const path = paths[index];
    const { type, content, title, created } = parsedValue;
    const ttl = ttlMinutesFromSeconds(ttlValues[index]);
    const responseContent = type === TOPIC_TYPE
      ? String(Math.max(0, Number(topicCountByPath.get(path) ?? 0) - 1))
      : (isExport ? content : previewContent(type, content));

    return [{
      surl: buildPublicLink(domain, path),
      path,
      type,
      title: type === TOPIC_TYPE ? resolveTopicDisplayTitle(path, { type, title }) : title,
      created: resolveStoredCreated(created).created,
      ttl,
      content: responseContent,
    }];
  });

  return jsonResponse(res, links, 200);
}
