import {
  LINKS_PREFIX,
  buildCurrentCreatedValue,
  buildStoredValue,
  parseStoredValue,
  resolveStoredCreated,
} from '../utils/storage.js';
import { renderTopicIndexHtml } from './topic-render.js';

export const TOPIC_TYPE = 'topic';
export const TOPIC_PLACEHOLDER_MEMBER = '__topic_placeholder__';

export function getTopicItemsKey(topicName) {
  return `topic:${topicName}:items`;
}

function normalizeTtlSeconds(ttlSeconds) {
  return typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : null;
}

function normalizeMultiExecResults(results) {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((result) => {
    if (Array.isArray(result) && result.length === 2) {
      return result[1];
    }

    return result;
  });
}

async function executeMulti(redis, commands) {
  if (commands.length === 0) {
    return [];
  }

  const multi = redis.multi();
  for (const { method, args } of commands) {
    multi[method](...args);
  }

  return normalizeMultiExecResults(await multi.exec());
}

export async function readStoredValues(redis, keys) {
  if (keys.length === 0) {
    return [];
  }

  return redis.mGet(keys);
}

export async function readTopicEntries(redis, topicNames) {
  return readStoredValues(redis, topicNames.map((topicName) => `${LINKS_PREFIX}${topicName}`));
}

export async function countTopicItemsBatch(redis, topicNames) {
  return executeMulti(
    redis,
    topicNames.map((topicName) => ({
      method: 'zCard',
      args: [getTopicItemsKey(topicName)],
    })),
  );
}

export async function readTtlValues(redis, keys) {
  return executeMulti(
    redis,
    keys.map((key) => ({
      method: 'ttl',
      args: [key],
    })),
  );
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

function capitalizeTopicPath(topicName) {
  if (!topicName) {
    return '';
  }

  return topicName.charAt(0).toUpperCase() + topicName.slice(1);
}

export function resolveTopicDisplayTitle(topicName, storedTopic) {
  if (storedTopic?.type === TOPIC_TYPE && storedTopic.title) {
    return storedTopic.title;
  }

  return capitalizeTopicPath(topicName);
}

export async function getTopicDisplayTitle(redis, topicName) {
  return resolveTopicDisplayTitle(topicName, await readStoredTopic(redis, topicName));
}

function resolveTopicStoredTitle(nextTitle, titleProvided, existingTitle) {
  if (titleProvided) {
    return nextTitle;
  }

  return existingTitle;
}

function resolveTopicStoredCreated(nextCreated, createdProvided, existingCreated, fallbackCreated) {
  if (createdProvided) {
    return nextCreated;
  }

  if (existingCreated !== undefined) {
    return existingCreated;
  }

  return fallbackCreated;
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

    const [storedTopicValue] = await readTopicEntries(redis, [topicName]);
    const storedTopic = storedTopicValue ? parseStoredValue(storedTopicValue) : null;
    if (storedTopic?.type !== TOPIC_TYPE) {
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
  const candidateTopics = [];
  for (let prefixLength = pathParts.length - 1; prefixLength >= 1; prefixLength -= 1) {
    candidateTopics.push(pathParts.slice(0, prefixLength).join('/'));
  }

  const storedCandidates = await readTopicEntries(redis, candidateTopics);
  for (let index = 0; index < candidateTopics.length; index += 1) {
    const storedValue = storedCandidates[index];
    if (!storedValue) {
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    if (parsedValue.type !== TOPIC_TYPE) {
      continue;
    }

    const candidateTopic = candidateTopics[index];
    const prefixLength = candidateTopic.split('/').length;

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

export async function rebuildTopicIndex(
  redis,
  topicName,
  { title, titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  const topicMembers = await redis.zRangeWithScores(getTopicItemsKey(topicName), 0, -1, {
    REV: true,
  });
  const indexItems = [];
  const staleMembers = [];
  const storedTopic = await readStoredTopic(redis, topicName);
  const resolvedStoredTitle = resolveTopicStoredTitle(title, titleProvided, storedTopic?.title || '');
  const resolvedStoredCreated = resolveTopicStoredCreated(
    created,
    createdProvided,
    storedTopic?.created,
    buildCurrentCreatedValue(requestReceivedAt),
  );
  const topicDisplayTitle = resolveTopicDisplayTitle(topicName, {
    type: TOPIC_TYPE,
    title: resolvedStoredTitle,
  });

  const validMembers = topicMembers
    .map((item) => ({
      item,
      member: String(item.value ?? item.member ?? ''),
    }))
    .filter(({ member }) => member && member !== TOPIC_PLACEHOLDER_MEMBER);
  const storedValues = await readStoredValues(
    redis,
    validMembers.map(({ member }) => `${LINKS_PREFIX}${topicName}/${member}`),
  );

  for (let index = 0; index < validMembers.length; index += 1) {
    const { item, member } = validMembers[index];
    const storedValue = storedValues[index];
    if (!storedValue) {
      staleMembers.push(member);
      continue;
    }

    const parsedValue = parseStoredValue(storedValue);
    const resolvedCreated = resolveStoredCreated(parsedValue.created);
    indexItems.push({
      path: member,
      fullPath: `${topicName}/${member}`,
      type: parsedValue.type,
      title: parsedValue.title,
      updatedAt: resolvedCreated.sortTimestamp ?? Number(item.score ?? 0),
    });
  }

  indexItems.sort((leftItem, rightItem) => rightItem.updatedAt - leftItem.updatedAt);

  if (staleMembers.length > 0) {
    await redis.zRem(getTopicItemsKey(topicName), staleMembers);
  }

  const html = renderTopicIndexHtml(topicName, topicDisplayTitle, indexItems);
  await redis.set(
    `${LINKS_PREFIX}${topicName}`,
    buildStoredValue({
      type: TOPIC_TYPE,
      content: html,
      title: resolvedStoredTitle,
      created: resolvedStoredCreated,
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

    const storedValues = await readStoredValues(redis, result.keys);
    const entriesToAdd = [];
    for (let index = 0; index < result.keys.length; index += 1) {
      const key = result.keys[index];
      const fullPath = key.slice(LINKS_PREFIX.length);
      const relativePath = fullPath.slice(topicName.length + 1);
      if (!relativePath) {
        continue;
      }

      const storedValue = storedValues[index];
      if (!storedValue) {
        continue;
      }

      const parsedValue = parseStoredValue(storedValue);
      if (parsedValue.type === TOPIC_TYPE) {
        continue;
      }

      entriesToAdd.push({
        score: updatedAt,
        value: relativePath,
      });
    }

    if (entriesToAdd.length > 0) {
      await redis.zAdd(getTopicItemsKey(topicName), entriesToAdd);
    }
  } while (cursor !== '0');
}

export async function createTopic(
  redis,
  topicName,
  { title = '', titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  await ensureTopicItemsKey(redis, topicName);
  await adoptTopicItems(redis, topicName);
  await rebuildTopicIndex(redis, topicName, {
    title,
    titleProvided,
    created,
    createdProvided,
    requestReceivedAt,
  });
}

export async function refreshTopic(
  redis,
  topicName,
  { title = '', titleProvided = false, created, createdProvided = false, requestReceivedAt } = {},
) {
  await ensureTopicItemsKey(redis, topicName);
  await rebuildTopicIndex(redis, topicName, {
    title,
    titleProvided,
    created,
    createdProvided,
    requestReceivedAt,
  });
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
    created: parsedValue.created,
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
  existingStoredValue,
  clearPathCache,
}) {
  const itemKey = `${LINKS_PREFIX}${fullPath}`;
  const currentStoredValue = existingStoredValue ?? await redis.get(itemKey);

  if (currentStoredValue && !allowOverwrite) {
    return {
      didOverwrite: false,
      existingStoredValue: currentStoredValue,
      existingTtlSeconds: normalizeTtlSeconds(await redis.ttl(itemKey)),
    };
  }

  const existingTtlSeconds = currentStoredValue
    ? normalizeTtlSeconds(await redis.ttl(itemKey))
    : null;

  if (currentStoredValue && allowOverwrite) {
    await clearPathCache(fullPath);
  }

  await setStoredValue(redis, itemKey, storedValue, ttlSeconds);

  try {
    await redis.zAdd(getTopicItemsKey(topicName), {
      score: Math.floor(Date.now() / 1000),
      value: relativePath,
    });
  } catch (error) {
    await restoreStoredValue(redis, itemKey, currentStoredValue, existingTtlSeconds);
    throw error;
  }

  try {
    await rebuildTopicIndex(redis, topicName);
  } catch (error) {
    await redis.zRem(getTopicItemsKey(topicName), relativePath);
    await restoreStoredValue(redis, itemKey, currentStoredValue, existingTtlSeconds);
    throw error;
  }

  return {
    didOverwrite: Boolean(currentStoredValue),
    existingStoredValue: currentStoredValue,
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
