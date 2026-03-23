/**
 * Delete a stored link by path.
 */

import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import {
  LINKS_PREFIX,
  parseStoredValue,
  previewContent,
  parseRequestBodyWithLimit,
  resolveStoredCreated,
} from '../utils/storage.js';
import { isS3Configured, deleteFileFromS3 } from '../utils/s3.js';
import { clearFileCache } from '../utils/file-cache.js';
import { normalizeLinkPath } from '../utils/link-path.js';
import { isReservedAssetPath, reservedAssetPathError } from '../assets/http.js';
import {
  TOPIC_TYPE,
  deleteTopic,
  deleteTopicItem,
  ensureTopicHomeIsWritable,
  resolveTopicPath,
} from '../services/topic-store.js';

function normalizeRequestedType(inputType, convert) {
  if (inputType && convert && inputType !== convert) {
    throw new Error('`type` and `convert` must match when both are provided');
  }

  return inputType || convert || '';
}

async function clearStoredFileCache(redis, path) {
  try {
    await clearFileCache(redis, path);
  } catch (error) {
    console.warn('Failed to clear file cache:', error);
  }
}

export async function handleDelete(req, res) {
  const isExport = req.headers['x-export'] === 'true';
  let body;
  try {
    body = await parseRequestBodyWithLimit(req, { maxBytes: JSON_DELETE_MAX_BYTES });
  } catch (error) {
    if (error?.status === 413) {
      return errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
    }

    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  const normalizedPath = normalizeLinkPath(body.path);
  const { type, convert } = body;
  const path = normalizedPath;
  if (!path) {
    return errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
  }
  if (isReservedAssetPath(path)) {
    return errorResponse(res, { code: 'invalid_request', message: reservedAssetPathError(path) }, 400);
  }

  const redis = await getRedisClient();
  let requestedType;
  try {
    requestedType = normalizeRequestedType(type, convert);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }
  const isTopicDelete = requestedType === TOPIC_TYPE;

  if (isTopicDelete) {
    const deletedTopic = await deleteTopic(redis, path);
    if (!deletedTopic) {
      return errorResponse(res, { code: 'not_found', message: `path "${path}" not found` }, 404);
    }

    return jsonResponse(
      res,
      {
        deleted: path,
        type: deletedTopic.type,
        title: deletedTopic.title,
        created: resolveStoredCreated(deletedTopic.created).created,
        content: deletedTopic.content,
      },
      200,
    );
  }

  if (await ensureTopicHomeIsWritable(redis, path)) {
    return errorResponse(
      res,
      { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
      400,
    );
  }

  const resolvedTopicPath = await resolveTopicPath(redis, { path });
  if (resolvedTopicPath.isTopicItem) {
    const deletedEntry = await deleteTopicItem({
      redis,
      topicName: resolvedTopicPath.topicName,
      relativePath: resolvedTopicPath.relativePath,
      fullPath: resolvedTopicPath.fullPath,
      clearPathCache: (targetPath) => clearStoredFileCache(redis, targetPath),
    });

    if (!deletedEntry) {
      return errorResponse(res, { code: 'not_found', message: `path "${path}" not found` }, 404);
    }

    if (deletedEntry.type === 'file' && isS3Configured()) {
      try {
        await deleteFileFromS3(deletedEntry.content);
      } catch (error) {
        console.error(`Failed to delete ${deletedEntry.content} from S3`, error);
      }
    }

    return jsonResponse(
      res,
      {
        deleted: resolvedTopicPath.fullPath,
        type: deletedEntry.type,
        title: deletedEntry.title,
        created: resolveStoredCreated(deletedEntry.created).created,
        content: isExport ? deletedEntry.content : previewContent(deletedEntry.type, deletedEntry.content),
      },
      200,
    );
  }

  const key = LINKS_PREFIX + path;
  const existing = await redis.get(key);
  if (!existing) {
    return errorResponse(res, { code: 'not_found', message: `path "${path}" not found` }, 404);
  }

  const parsedValue = parseStoredValue(existing);

  await redis.del(key);
  await clearStoredFileCache(redis, path);

  if (parsedValue.type === 'file') {
    if (isS3Configured()) {
      try {
        await deleteFileFromS3(parsedValue.content);
      } catch (error) {
        console.error(`Failed to delete ${parsedValue.content} from S3`, error);
        // The Redis delete already succeeded, so keep the API response successful.
      }
    } else {
      console.warn('S3 not configured, skipping deletion of', parsedValue.content);
    }
  }

  const result = {
    deleted: path,
    type: parsedValue.type,
    title: parsedValue.title,
    created: resolveStoredCreated(parsedValue.created).created,
    content: isExport
      ? parsedValue.content
      : previewContent(parsedValue.type, parsedValue.content),
  };

  return jsonResponse(res, result, 200);
}
const JSON_DELETE_MAX_BYTES = 64 * 1024;
