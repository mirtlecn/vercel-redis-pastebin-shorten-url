import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  parseRequestBody,
  getDomain,
  previewContent,
} from '../utils/storage.js';
import { TOPIC_TYPE, countTopicItems } from '../services/topic-store.js';
import { buildPublicLink, normalizeLinkPath } from '../utils/link-path.js';

function normalizeLookupType(inputType, convert) {
  if (inputType && convert && inputType !== convert) {
    throw new Error('`type` and `convert` must match when both are provided');
  }

  return inputType || convert || '';
}

function ttlMinutesFromSeconds(ttlSeconds) {
  return ttlSeconds > 0 ? Math.max(1, Math.ceil(ttlSeconds / 60)) : null;
}

function buildItemResponse(req, { path, type, title, content, ttl }, isExport) {
  return {
    surl: buildPublicLink(getDomain(req), path),
    path,
    type,
    title,
    ttl,
    content: isExport ? content : previewContent(type, content),
  };
}

async function handleTopicLookup(req, res, redis, topicPath) {
  const stored = await redis.get(LINKS_PREFIX + topicPath);
  if (!stored) {
    errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);
    return true;
  }

  const parsedValue = parseStoredValue(stored);
  if (parsedValue.type !== TOPIC_TYPE) {
    errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);
    return true;
  }

  const itemCount = await countTopicItems(redis, topicPath);
  jsonResponse(
    res,
    {
      surl: buildPublicLink(getDomain(req), topicPath),
      path: topicPath,
      type: TOPIC_TYPE,
      title: parsedValue.title,
      ttl: null,
      content: String(itemCount),
    },
    200,
  );
  return true;
}

async function handleTopicList(req, res, redis) {
  const topicKeys = [];
  let cursor = '0';

  do {
    const result = await redis.scan(cursor, { MATCH: 'topic:*:items', COUNT: 100 });
    cursor = result.cursor;
    topicKeys.push(...result.keys);
  } while (cursor !== '0');

  topicKeys.sort();

  const topics = [];
  for (const key of topicKeys) {
    const topicPath = key.slice('topic:'.length, -':items'.length);
    if (!topicPath) {
      continue;
    }

    const stored = await redis.get(LINKS_PREFIX + topicPath);
    if (!stored) {
      continue;
    }

    const parsedValue = parseStoredValue(stored);
    if (parsedValue.type !== TOPIC_TYPE) {
      continue;
    }

    const itemCount = await countTopicItems(redis, topicPath);
    topics.push({
      surl: buildPublicLink(getDomain(req), topicPath),
      path: topicPath,
      type: TOPIC_TYPE,
      title: parsedValue.title,
      ttl: null,
      content: String(itemCount),
    });
  }

  jsonResponse(res, topics, 200);
  return true;
}

export async function handleAuthenticatedLookup(req, res) {
  let body;
  try {
    body = await parseRequestBody(req);
  } catch {
    errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
    return true;
  }

  let requestedType;
  try {
    requestedType = normalizeLookupType(body.type, body.convert);
  } catch (error) {
    errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    return true;
  }

  const hasPath = Object.prototype.hasOwnProperty.call(body, 'path');
  if (requestedType === TOPIC_TYPE && !hasPath) {
    return handleTopicList(req, res, await getRedisClient());
  }

  if (!hasPath) {
    return false;
  }

  const path = normalizeLinkPath(body.path);
  if (!path) {
    errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
    return true;
  }

  const redis = await getRedisClient();
  if (requestedType === TOPIC_TYPE) {
    return handleTopicLookup(req, res, redis, path);
  }

  const stored = await redis.get(LINKS_PREFIX + path);
  if (!stored) {
    errorResponse(res, { code: 'not_found', message: 'URL not found' }, 404);
    return true;
  }

  const { type, content, title } = parseStoredValue(stored);
  const ttlSeconds = await redis.ttl(LINKS_PREFIX + path);
  const isExport = req.headers['x-export'] === 'true';

  jsonResponse(res, buildItemResponse(req, {
    path,
    type,
    title,
    ttl: ttlMinutesFromSeconds(ttlSeconds),
    content,
  }, isExport), 200);
  return true;
}
