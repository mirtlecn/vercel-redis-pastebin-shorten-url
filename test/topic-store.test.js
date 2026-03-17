import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPIC_PLACEHOLDER_MEMBER,
  countTopicItems,
  createTopic,
  deleteTopic,
  deleteTopicItem,
  getTopicItemsKey,
  rebuildTopicIndex,
  resolveTopicPath,
  writeTopicItem,
} from '../lib/services/topic-store.js';
import { buildStoredValue, parseStoredValue } from '../lib/utils/storage.js';

class FakeRedis {
  constructor() {
    this.values = new Map();
    this.ttls = new Map();
    this.sortedSets = new Map();
    this.failNextZAdd = false;
    this.failNextZRem = false;
    this.failSetKeys = new Set();
  }

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async set(key, value) {
    if (this.failSetKeys.has(key)) {
      this.failSetKeys.delete(key);
      throw new Error(`set failed for ${key}`);
    }
    this.values.set(key, value);
    this.ttls.delete(key);
  }

  async setEx(key, ttlSeconds, value) {
    if (this.failSetKeys.has(key)) {
      this.failSetKeys.delete(key);
      throw new Error(`set failed for ${key}`);
    }
    this.values.set(key, value);
    this.ttls.set(key, ttlSeconds);
  }

  async ttl(key) {
    return this.ttls.get(key) ?? -1;
  }

  async del(...keys) {
    const normalizedKeys = keys.flat();
    for (const key of normalizedKeys) {
      this.values.delete(key);
      this.ttls.delete(key);
      this.sortedSets.delete(key);
    }
  }

  async zAdd(key, entry) {
    if (this.failNextZAdd) {
      this.failNextZAdd = false;
      throw new Error('zadd failed');
    }

    const entries = Array.isArray(entry) ? entry : [entry];
    const setEntries = this.sortedSets.get(key) ?? [];

    for (const currentEntry of entries) {
      const nextValue = String(currentEntry.value ?? currentEntry.Member ?? currentEntry.member);
      const nextScore = Number(currentEntry.score ?? currentEntry.Score ?? 0);
      const existingIndex = setEntries.findIndex((item) => item.value === nextValue);
      if (existingIndex >= 0) {
        setEntries[existingIndex] = { value: nextValue, score: nextScore };
      } else {
        setEntries.push({ value: nextValue, score: nextScore });
      }
    }

    this.sortedSets.set(key, setEntries);
  }

  async zRem(key, members) {
    if (this.failNextZRem) {
      this.failNextZRem = false;
      throw new Error('zrem failed');
    }
    const memberList = Array.isArray(members) ? members : [members];
    const setEntries = this.sortedSets.get(key) ?? [];
    this.sortedSets.set(
      key,
      setEntries.filter((entry) => !memberList.includes(entry.value)),
    );
  }

  async zCard(key) {
    return (this.sortedSets.get(key) ?? []).length;
  }

  async zRangeWithScores(key, _start, _stop, options = {}) {
    const sortedEntries = [...(this.sortedSets.get(key) ?? [])]
      .sort((leftItem, rightItem) => rightItem.score - leftItem.score)
      .map((entry) => ({ value: entry.value, score: entry.score }));

    if (options.REV) {
      return sortedEntries;
    }

    return sortedEntries.reverse();
  }

  async scan(cursor, { MATCH: matchPattern }) {
    const regex = new RegExp(`^${matchPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    const keys = [...this.values.keys()].filter((key) => regex.test(key));
    return { cursor: '0', keys };
  }
}

test('createTopic writes topic home and placeholder member', async () => {
  const redis = new FakeRedis();

  await createTopic(redis, 'anime');

  const storedTopic = parseStoredValue(await redis.get('surl:anime'));
  assert.equal(storedTopic.type, 'topic');
  assert.equal(storedTopic.title, 'anime');
  assert.deepEqual(redis.sortedSets.get(getTopicItemsKey('anime')), [
    { value: TOPIC_PLACEHOLDER_MEMBER, score: 0 },
  ]);
});

test('resolveTopicPath prefers the longest topic prefix', async () => {
  const redis = new FakeRedis();
  await redis.set('surl:blog', buildStoredValue({ type: 'topic', content: '<html></html>', title: 'blog' }));
  await redis.set(
    'surl:blog/2026',
    buildStoredValue({ type: 'topic', content: '<html></html>', title: 'blog/2026' }),
  );

  const resolved = await resolveTopicPath(redis, { path: 'blog/2026/post-1' });

  assert.deepEqual(resolved, {
    isTopicItem: true,
    topicName: 'blog/2026',
    relativePath: 'post-1',
    fullPath: 'blog/2026/post-1',
    existingTopic: true,
  });
});

test('resolveTopicPath rejects root path when topic is provided', async () => {
  const redis = new FakeRedis();
  await redis.set('surl:anime', buildStoredValue({ type: 'topic', content: '<html></html>', title: 'anime' }));

  await assert.rejects(
    resolveTopicPath(redis, { topicName: 'anime', path: '/' }),
    /`path` cannot be "\/" when `topic` is provided/,
  );
});

test('writeTopicItem stores content, indexes member, and rebuilds topic home', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');

  const storedValue = buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' });
  const result = await writeTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    storedValue,
    allowOverwrite: false,
    ttlSeconds: null,
    clearPathCache: async () => {},
  });

  assert.equal(result.didOverwrite, false);
  assert.equal(await redis.get('surl:anime/castle'), storedValue);
  assert.equal(await countTopicItems(redis, 'anime'), 1);
  const storedTopic = parseStoredValue(await redis.get('surl:anime'));
  assert.equal(storedTopic.type, 'topic');
  assert.match(storedTopic.content, /href="\/anime\/castle"/);
});

test('writeTopicItem rolls back content when zadd fails', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  redis.failNextZAdd = true;

  await assert.rejects(
    writeTopicItem({
      redis,
      topicName: 'anime',
      relativePath: 'castle',
      fullPath: 'anime/castle',
      storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
      allowOverwrite: false,
      ttlSeconds: null,
      clearPathCache: async () => {},
    }),
    /zadd failed/,
  );

  assert.equal(await redis.get('surl:anime/castle'), null);
  assert.equal(await countTopicItems(redis, 'anime'), 0);
});

test('writeTopicItem rolls back content when topic rebuild fails', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  redis.failSetKeys.add('surl:anime');

  await assert.rejects(
    writeTopicItem({
      redis,
      topicName: 'anime',
      relativePath: 'castle',
      fullPath: 'anime/castle',
      storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
      allowOverwrite: false,
      ttlSeconds: null,
      clearPathCache: async () => {},
    }),
    /set failed for surl:anime/,
  );

  assert.equal(await redis.get('surl:anime/castle'), null);
  assert.equal(await countTopicItems(redis, 'anime'), 0);
  const members = redis.sortedSets.get(getTopicItemsKey('anime')).map((entry) => entry.value);
  assert.deepEqual(members, [TOPIC_PLACEHOLDER_MEMBER]);
});

test('rebuildTopicIndex removes stale members', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  await redis.zAdd(getTopicItemsKey('anime'), [
    { score: 10, value: 'alive' },
    { score: 5, value: 'gone' },
  ]);
  await redis.set('surl:anime/alive', buildStoredValue({ type: 'text', content: 'hello', title: 'Alive' }));

  await rebuildTopicIndex(redis, 'anime');

  assert.equal(await countTopicItems(redis, 'anime'), 1);
  const members = redis.sortedSets.get(getTopicItemsKey('anime')).map((entry) => entry.value).sort();
  assert.deepEqual(members, [TOPIC_PLACEHOLDER_MEMBER, 'alive']);
});

test('deleteTopicItem removes content and updates the topic index', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  await writeTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
    allowOverwrite: false,
    ttlSeconds: null,
    clearPathCache: async () => {},
  });

  const deletedEntry = await deleteTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    clearPathCache: async () => {},
  });

  assert.equal(deletedEntry.type, 'text');
  assert.equal(await redis.get('surl:anime/castle'), null);
  assert.equal(await countTopicItems(redis, 'anime'), 0);
});

test('deleteTopicItem rolls back when zrem fails', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  await writeTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
    allowOverwrite: false,
    ttlSeconds: null,
    clearPathCache: async () => {},
  });
  redis.failNextZRem = true;

  await assert.rejects(
    deleteTopicItem({
      redis,
      topicName: 'anime',
      relativePath: 'castle',
      fullPath: 'anime/castle',
      clearPathCache: async () => {},
    }),
    /zrem failed/,
  );

  assert.notEqual(await redis.get('surl:anime/castle'), null);
  assert.equal(await countTopicItems(redis, 'anime'), 1);
});

test('deleteTopicItem rolls back when topic rebuild fails', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  await writeTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
    allowOverwrite: false,
    ttlSeconds: null,
    clearPathCache: async () => {},
  });
  redis.failSetKeys.add('surl:anime');

  await assert.rejects(
    deleteTopicItem({
      redis,
      topicName: 'anime',
      relativePath: 'castle',
      fullPath: 'anime/castle',
      clearPathCache: async () => {},
    }),
    /set failed for surl:anime/,
  );

  assert.notEqual(await redis.get('surl:anime/castle'), null);
  assert.equal(await countTopicItems(redis, 'anime'), 1);
  const topicHome = parseStoredValue(await redis.get('surl:anime'));
  assert.match(topicHome.content, /href="\/anime\/castle"/);
});

test('deleteTopic removes only topic home and topic index', async () => {
  const redis = new FakeRedis();
  await createTopic(redis, 'anime');
  await writeTopicItem({
    redis,
    topicName: 'anime',
    relativePath: 'castle',
    fullPath: 'anime/castle',
    storedValue: buildStoredValue({ type: 'text', content: 'hello', title: 'Castle' }),
    allowOverwrite: false,
    ttlSeconds: null,
    clearPathCache: async () => {},
  });

  const deletedTopic = await deleteTopic(redis, 'anime');

  assert.deepEqual(deletedTopic, {
    type: 'topic',
    title: 'anime',
    content: '1',
  });
  assert.equal(await redis.get('surl:anime'), null);
  assert.equal(redis.sortedSets.has(getTopicItemsKey('anime')), false);
  assert.notEqual(await redis.get('surl:anime/castle'), null);
});
