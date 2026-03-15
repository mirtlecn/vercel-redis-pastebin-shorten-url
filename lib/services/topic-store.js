import { LINKS_PREFIX, buildStoredValue, parseStoredValue } from '../utils/storage.js';
import { renderTopicIndexHtml } from './topic-render.js';

export const TOPIC_TYPE = 'topic';
export const TOPIC_PLACEHOLDER_MEMBER = '__topic_placeholder__';

export function getTopicItemsKey(topicName) {
  return `topic:${topicName}:items`;
}

function normalizeTtlSeconds(ttlSeconds) {
  return typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : null;
}

async function setStoredValue(redis, key, storedValue, ttlSeconds) {
  if (ttlSeconds && ttlSeconds > 0) {
    await redis.setEx(key, ttlSeconds, storedValue);
    return;
  }
  await redis.set(key, storedValue);
}

async function restoreStoredValue(redis, key, storedValue, ttlSeconds) {
  if (!storedValue) {
    await redis.del(key);
    return;
  }
  await setStoredValue(redis, key, storedValue, normalizeTtlSeconds(ttlSeconds));
}

async function readStoredTopic(redis, topicName) {
  const storedValue = await redis.get(`${LINKS_PREFIX}${topicName}`);
  return storedValue ? parseStoredValue(storedValue) : null;
}

export async function topicExists(redis, topicName) {
  if (!topicName) {
    return false;
  }
  const storedTopic = await readStoredTopic(redis, topicName);
  return storedTopic?.type === TOPIC_TYPE;
}

export async function ensureTopicHomeIsWritable(redis, path) {
  const storedTopic = await readStoredTopic(redis, path);
  return storedTopic?.type === TOPIC_TYPE;
}

export async function resolveTopicPath(redis, { topicName = '', path }) {
  const resolved = {
    isTopicItem: false,
    topicName: '',
    relativePath: '',
    fullPath: path,
    existingTopic: false,
  };

  if (!path) {
    return resolved;
  }

  if (topicName) {
    if (path === '/') {
      throw new Error('`path` cannot be "/" when `topic` is provided');
    }

    const hasTopic = await topicExists(redis, topicName);
    if (!hasTopic) {
      throw new Error('topic does not exist');
    }

    const expectedPrefix = `${topicName}/`;
    let relativePath = path;
    if (path.includes('/')) {
      if (!path.startsWith(expectedPrefix)) {
        throw new Error('`topic` and `path` must match');
      }
      relativePath = path.slice(expectedPrefix.length);
    }

    return {
      isTopicItem: true,
      topicName,
      relativePath,
      fullPath: `${topicName}/${relativePath}`,
      existingTopic: true,
    };
  }

  const pathParts = path.split('/');
  for (let prefixLength = pathParts.length - 1; prefixLength >= 1; prefixLength -= 1) {
    const candidateTopic = pathParts.slice(0, prefixLength).join('/');
    const hasTopic = await topicExists(redis, candidateTopic);
    if (!hasTopic) {
      continue;
    }

    return {
      isTopicItem: true,
      topicName: candidateTopic,
      relativePath: pathParts.slice(prefixLength).join('/'),
      fullPath: path,
      existingTopic: true,
    };
  }

  return resolved;
}

export async function ensureTopicItemsKey(redis, topicName) {
  await redis.zAdd(getTopicItemsKey(topicName), {
    score: 0,
    value: TOPIC_PLACEHOLDER_MEMBER,
  });
}

export async function countTopicItems(redis, topicName) {
  const memberCount = await redis.zCard(getTopicItemsKey(topicName));
  return memberCount > 0 ? memberCount - 1 : 0;
}

export async function rebuildTopicIndex(redis, topicName) {
  const topicMembers = await redis.zRangeWithScores(getTopicItemsKey(topicName), 0, -1, {
    REV: true,
  });
  const indexItems = [];
  const staleMembers = [];

  for (const item of topicMembers) {
    const member = String(item.value ?? item.member ?? '');
    if (!member || member === TOPIC_PLACEHOLDER_MEMBER) {
      continue;
    }

    const storedValue = await redis.get(`${LINKS_PREFIX}${topicName}/${member}`);
    if (!storedValue) {
      staleMembers.push(member);
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    indexItems.push({
      path: member,
      fullPath: `${topicName}/${member}`,
      type: parsedValue.type,
      title: parsedValue.title,
      updatedAt: Number(item.score ?? 0),
    });
  }

  if (staleMembers.length > 0) {
    await redis.zRem(getTopicItemsKey(topicName), staleMembers);
  }

  const html = renderTopicIndexHtml(topicName, topicName, indexItems);
  await redis.set(
    `${LINKS_PREFIX}${topicName}`,
    buildStoredValue({
      type: TOPIC_TYPE,
      content: html,
      title: topicName,
    }),
  );
}

export async function adoptTopicItems(redis, topicName) {
  let cursor = '0';
  const updatedAt = Math.floor(Date.now() / 1000);
  const matchPattern = `${LINKS_PREFIX}${topicName}/*`;

  do {
    const result = await redis.scan(cursor, { MATCH: matchPattern, COUNT: 100 });
    cursor = result.cursor;

    for (const key of result.keys) {
      const fullPath = key.slice(LINKS_PREFIX.length);
      const relativePath = fullPath.slice(topicName.length + 1);
      if (!relativePath) {
        continue;
      }

      const storedValue = await redis.get(key);
      if (!storedValue) {
        continue;
      }

      const parsedValue = parseStoredValue(storedValue);
      if (parsedValue.type === TOPIC_TYPE) {
        continue;
      }

      await redis.zAdd(getTopicItemsKey(topicName), {
        score: updatedAt,
        value: relativePath,
      });
    }
  } while (cursor !== '0');
}

export async function createTopic(redis, topicName) {
  await ensureTopicItemsKey(redis, topicName);
  await adoptTopicItems(redis, topicName);
  await rebuildTopicIndex(redis, topicName);
}

export async function refreshTopic(redis, topicName) {
  await ensureTopicItemsKey(redis, topicName);
  await rebuildTopicIndex(redis, topicName);
}

export async function deleteTopic(redis, topicName) {
  const topicKey = `${LINKS_PREFIX}${topicName}`;
  const storedValue = await redis.get(topicKey);
  if (!storedValue) {
    return null;
  }

  const parsedValue = parseStoredValue(storedValue);
  if (parsedValue.type !== TOPIC_TYPE) {
    return null;
  }

  const count = await countTopicItems(redis, topicName);
  await redis.del([topicKey, getTopicItemsKey(topicName)]);
  return {
    type: TOPIC_TYPE,
    title: parsedValue.title,
    content: String(count),
  };
}

export async function writeTopicItem({
  redis,
  topicName,
  relativePath,
  fullPath,
  storedValue,
  allowOverwrite,
  ttlSeconds,
  clearPathCache,
}) {
  const itemKey = `${LINKS_PREFIX}${fullPath}`;
  const existingStoredValue = await redis.get(itemKey);

  if (existingStoredValue && !allowOverwrite) {
    return {
      didOverwrite: false,
      existingStoredValue,
      existingTtlSeconds: normalizeTtlSeconds(await redis.ttl(itemKey)),
    };
  }

  const existingTtlSeconds = existingStoredValue
    ? normalizeTtlSeconds(await redis.ttl(itemKey))
    : null;

  if (existingStoredValue && allowOverwrite) {
    await clearPathCache(fullPath);
  }

  await setStoredValue(redis, itemKey, storedValue, ttlSeconds);

  try {
    await redis.zAdd(getTopicItemsKey(topicName), {
      score: Math.floor(Date.now() / 1000),
      value: relativePath,
    });
  } catch (error) {
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  try {
    await rebuildTopicIndex(redis, topicName);
  } catch (error) {
    await redis.zRem(getTopicItemsKey(topicName), relativePath);
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  return {
    didOverwrite: Boolean(existingStoredValue),
    existingStoredValue,
    existingTtlSeconds,
  };
}

export async function deleteTopicItem({
  redis,
  topicName,
  relativePath,
  fullPath,
  clearPathCache,
}) {
  const itemKey = `${LINKS_PREFIX}${fullPath}`;
  const existingStoredValue = await redis.get(itemKey);
  if (!existingStoredValue) {
    return null;
  }

  const existingTtlSeconds = normalizeTtlSeconds(await redis.ttl(itemKey));
  const parsedValue = parseStoredValue(existingStoredValue);

  await redis.del(itemKey);
  await clearPathCache(fullPath);

  try {
    await redis.zRem(getTopicItemsKey(topicName), relativePath);
  } catch (error) {
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  try {
    await rebuildTopicIndex(redis, topicName);
  } catch (error) {
    await redis.zAdd(getTopicItemsKey(topicName), {
      score: Math.floor(Date.now() / 1000),
      value: relativePath,
    });
    await restoreStoredValue(redis, itemKey, existingStoredValue, existingTtlSeconds);
    throw error;
  }

  return parsedValue;
}
