import formidable from 'formidable';
import { extname } from 'path';
import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { resolveUploadedFileContentType } from '../utils/file-mime.js';
import {
  buildCurrentCreatedValue,
  buildStoredValue,
  getDomain,
  normalizeCreatedInput,
  parseRequestBodyWithLimit,
  parseStoredValue,
  resolveStoredCreated,
} from '../utils/storage.js';
import { clearFileCache } from '../utils/file-cache.js';
import { convertToQrCode } from '../utils/converter.js';
import { deleteFileFromS3, isS3Configured, uploadFileToS3 } from '../utils/s3.js';
import { isReservedAssetPath, reservedAssetPathError } from '../assets/http.js';
import {
  buildPublicLink,
  buildUploadedFilePath,
  generateRandomPath,
  normalizeLinkPath,
  validateLinkPath,
} from '../utils/link-path.js';
import {
  buildCreatedEntryPayload,
  detectContentType,
  normalizeUrlContent,
  normalizeWriteType,
  parseTtlMinutes,
  writeStoredLink,
} from '../services/link-entry.js';
import {
  TOPIC_TYPE,
  countTopicItems,
  createTopic,
  ensureTopicHomeIsWritable,
  getTopicDisplayTitle,
  refreshTopic,
  resolveTopicPath,
  writeTopicItem,
} from '../services/topic-store.js';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10;
const MAX_CONTENT_SIZE_KB = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500;
const JSON_BODY_MARGIN_BYTES = 12 * 1024;
const JSON_CREATE_MAX_BYTES = Math.min(
  (MAX_CONTENT_SIZE_KB * 1024) + JSON_BODY_MARGIN_BYTES,
  512 * 1024,
);
const VALID_REQUEST_TYPES = ['url', 'text', 'html', 'md', 'md2html', 'qrcode', TOPIC_TYPE];

async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
      keepExtensions: true,
    });

    form.parse(req, (error, fields, files) => {
      if (error) {
        if (error.code === 1009 || error.message?.includes('maxFileSize')) {
          reject(Object.assign(new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB)`), { status: 413 }));
          return;
        }

        reject(error);
        return;
      }

      const normalizedFields = Object.fromEntries(
        Object.entries(fields).map(([fieldName, fieldValue]) => [
          fieldName,
          Array.isArray(fieldValue) ? fieldValue[0] : fieldValue,
        ]),
      );
      resolve({ fields: normalizedFields, files });
    });
  });
}

function validateRequiredPathForPut(req, inputPath) {
  if (req.method === 'PUT' && !inputPath) {
    return '`path` is required for PUT requests';
  }

  return null;
}

function validateOptionalPath(inputPath) {
  if (!inputPath) {
    return null;
  }

  const validation = validateLinkPath(inputPath);
  return validation.valid ? null : validation.error;
}

function validateOptionalTopic(inputTopic) {
  if (!inputTopic) {
    return null;
  }

  if (inputTopic === '/') {
    return '`topic` cannot be "/"';
  }

  const validation = validateLinkPath(inputTopic);
  return validation.valid ? null : validation.error;
}

function validateInputType(inputType) {
  if (inputType === undefined || inputType === '' || VALID_REQUEST_TYPES.includes(inputType)) {
    return null;
  }

  return '`type` must be one of: url, text, html, md, md2html, qrcode, topic';
}

function validateContentSize(inputContent) {
  const maxBytes = MAX_CONTENT_SIZE_KB * 1024;
  if (Buffer.byteLength(inputContent, 'utf8') <= maxBytes) {
    return null;
  }

  return `Content too large (max ${maxBytes / 1024}KB)`;
}

async function clearStoredFileCache(redis, path) {
  try {
    await clearFileCache(redis, path);
  } catch (error) {
    console.warn('Failed to clear file cache:', error);
  }
}

function parseJsonTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'json' });
}

function parseFormTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'form' });
}

function buildTopicResponsePayload(req, topicPath, itemCount, title) {
  return {
    surl: buildPublicLink(getDomain(req), topicPath),
    path: topicPath,
    type: TOPIC_TYPE,
    title,
    created: 'illegal',
    content: String(itemCount),
    ttl: null,
  };
}

function resolveCreatedForWrite({ existingStoredValue, created, createdProvided, requestReceivedAt }) {
  if (createdProvided) {
    return created;
  }

  if (existingStoredValue) {
    return parseStoredValue(existingStoredValue).created;
  }

  return buildCurrentCreatedValue(requestReceivedAt);
}

async function deleteUploadedObject(objectKey) {
  if (!objectKey || !isS3Configured()) {
    return;
  }

  try {
    await deleteFileFromS3(objectKey);
  } catch (error) {
    console.error(`Failed to delete uploaded object ${objectKey}`, error);
  }
}

async function persistEntry({
  req,
  path,
  type,
  content,
  title,
  created,
  createdProvided,
  allowOverwrite,
  ttlValue,
  isExport,
  requestReceivedAt,
}) {
  const redis = await getRedisClient();
  const storageKey = `surl:${path}`;
  const existingStoredValue = await redis.get(storageKey);
  const storedCreated = resolveCreatedForWrite({
    existingStoredValue,
    created,
    createdProvided,
    requestReceivedAt,
  });
  const storedValue = buildStoredValue({ type, content, title, created: storedCreated });
  const writeResult = await writeStoredLink({
    redis,
    path,
    storedValue,
    allowOverwrite,
    ttlValue,
    existingStoredValue,
    clearPathCache: (targetPath) => clearStoredFileCache(redis, targetPath),
  });

  if (writeResult.existingStoredValue && !allowOverwrite) {
    const existingEntry = parseStoredValue(writeResult.existingStoredValue);
    return {
      conflictPayload: {
        code: 'conflict',
        message: `path "${path}" already exists`,
        hint: 'Use PUT to overwrite',
        details: {
          existing: {
            ...buildCreatedEntryPayload({
              req,
              path,
              type: existingEntry.type,
              content: existingEntry.content,
              title: existingEntry.title,
              created: existingEntry.created,
              isExport,
              expiresIn: null,
              overwrittenStoredValue: null,
              ttlWarning: null,
            }),
          },
        },
      },
    };
  }

  return {
    responsePayload: buildCreatedEntryPayload({
      req,
      path,
      type,
      content,
      title,
      created: storedCreated,
      isExport,
      expiresIn: writeResult.expiresIn,
      overwrittenStoredValue: writeResult.didOverwrite ? writeResult.existingStoredValue : null,
      ttlWarning: writeResult.ttlWarning,
    }),
    statusCode: !allowOverwrite || !writeResult.didOverwrite ? 201 : 200,
  };
}

async function persistTopicEntry({
  req,
  path,
  topicName,
  relativePath,
  type,
  content,
  title,
  created,
  createdProvided,
  allowOverwrite,
  ttlValue,
  isExport,
  requestReceivedAt,
}) {
  const redis = await getRedisClient();
  const ttl = parseTtlMinutes(ttlValue);
  const itemKey = `surl:${path}`;
  const existingStoredValue = await redis.get(itemKey);
  const storedCreated = resolveCreatedForWrite({
    existingStoredValue,
    created,
    createdProvided,
    requestReceivedAt,
  });
  const storedValue = buildStoredValue({ type, content, title, created: storedCreated });
  const writeResult = await writeTopicItem({
    redis,
    topicName,
    relativePath,
    fullPath: path,
    storedValue,
    allowOverwrite,
    ttlSeconds: ttl.ttlSeconds,
    existingStoredValue,
    clearPathCache: (targetPath) => clearStoredFileCache(redis, targetPath),
  });

  if (writeResult.existingStoredValue && !allowOverwrite) {
    const existingEntry = parseStoredValue(writeResult.existingStoredValue);
    return {
      conflictPayload: {
        code: 'conflict',
        message: `path "${path}" already exists`,
        hint: 'Use PUT to overwrite',
        details: {
          existing: buildCreatedEntryPayload({
            req,
            path,
            type: existingEntry.type,
            content: existingEntry.content,
            title: existingEntry.title,
            created: existingEntry.created,
            isExport,
            expiresIn: writeResult.existingTtlSeconds
              ? Math.max(1, Math.ceil(writeResult.existingTtlSeconds / 60))
              : null,
            overwrittenStoredValue: null,
            ttlWarning: null,
          }),
        },
      },
    };
  }

  return {
    responsePayload: buildCreatedEntryPayload({
      req,
      path,
      type,
      content,
      title,
      created: storedCreated,
      isExport,
      expiresIn: ttl.expiresIn,
      overwrittenStoredValue: writeResult.didOverwrite ? writeResult.existingStoredValue : null,
      ttlWarning: ttl.warning,
    }),
    statusCode: !allowOverwrite || !writeResult.didOverwrite ? 201 : 200,
  };
}

async function handleTopicMutation(req, res, {
  path,
  title,
  titleProvided,
  created,
  createdProvided,
  ttlProvided,
  allowOverwrite,
  requestReceivedAt,
}) {
  if (!path) {
    return errorResponse(res, { code: 'invalid_request', message: '`path` is required' }, 400);
  }

  if (ttlProvided) {
    return errorResponse(res, { code: 'invalid_request', message: 'topic does not support ttl' }, 400);
  }

  const redis = await getRedisClient();
  const existingTopic = await ensureTopicHomeIsWritable(redis, path);
  const existingStoredValue = await redis.get(`surl:${path}`);

  if (existingStoredValue && !existingTopic) {
    return errorResponse(
      res,
      { code: 'conflict', message: `path "${path}" already exists`, hint: allowOverwrite ? undefined : 'Use PUT to overwrite' },
      409,
    );
  }

  if (existingTopic && !allowOverwrite) {
    return errorResponse(
      res,
      { code: 'conflict', message: `path "${path}" already exists`, hint: 'Use PUT to overwrite' },
      409,
    );
  }

  if (!existingTopic && allowOverwrite) {
    await createTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  } else if (existingTopic && allowOverwrite) {
    await refreshTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  } else {
    await createTopic(redis, path, { title, titleProvided, created, createdProvided, requestReceivedAt });
  }

  const itemCount = await countTopicItems(redis, path);
  const storedTopic = parseStoredValue(await redis.get(`surl:${path}`));
  const topicTitle = await getTopicDisplayTitle(redis, path);
  return jsonResponse(
    res,
    {
      ...buildTopicResponsePayload(req, path, itemCount, topicTitle),
      created: resolveStoredCreated(storedTopic.created).created,
    },
    allowOverwrite ? 200 : 201,
  );
}

function getUploadedFile(files) {
  if (!files.file) {
    return null;
  }

  return Array.isArray(files.file) ? files.file[0] : files.file;
}

async function handleFileUpload(req, res, { allowOverwrite }) {
  const isExport = req.headers['x-export'] === 'true';
  const requestReceivedAt = new Date();
  let fields;
  let files;
  let uploadedObjectKey = '';
  let resolvedFileContentType = 'application/octet-stream';

  try {
    ({ fields, files } = await parseMultipartForm(req));
  } catch (error) {
    return errorResponse(
      res,
      { code: error.code || 'invalid_request', message: error.message },
      error.status || 400,
    );
  }

  const uploadedFile = getUploadedFile(files);
  if (!uploadedFile) {
    return errorResponse(
      res,
      { code: 'invalid_request', message: '`file` field is required for multipart/form-data' },
      400,
    );
  }

  const pathRequiredError = validateRequiredPathForPut(req, fields.path);
  if (pathRequiredError) {
    return errorResponse(res, { code: 'invalid_request', message: pathRequiredError }, 400);
  }

  fields.path = normalizeLinkPath(fields.path);
  fields.topic = normalizeLinkPath(fields.topic);

  const pathValidationError = validateOptionalPath(fields.path);
  if (pathValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: pathValidationError }, 400);
  }

  const topicValidationError = validateOptionalTopic(fields.topic);
  if (topicValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: topicValidationError }, 400);
  }

  const fileExtension = extname(uploadedFile.originalFilename || '').toLowerCase();
  const requestedPath = buildUploadedFilePath(fields.path, fileExtension);
  if (requestedPath && isReservedAssetPath(requestedPath)) {
    return errorResponse(res, { code: 'invalid_request', message: reservedAssetPathError(requestedPath) }, 400);
  }
  let ttl;
  const createdProvided = Object.prototype.hasOwnProperty.call(fields, 'created');
  let normalizedCreated = null;

  try {
    ttl = parseFormTtlOrError(fields.ttl);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  if (createdProvided) {
    try {
      normalizedCreated = normalizeCreatedInput(fields.created);
    } catch (error) {
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }
  }

  try {
    resolvedFileContentType = await resolveUploadedFileContentType({
      clientContentType: uploadedFile.mimetype,
      originalFilename: uploadedFile.originalFilename,
      filepath: uploadedFile.filepath,
    });

    const redis = await getRedisClient();
    if (requestedPath && await ensureTopicHomeIsWritable(redis, requestedPath)) {
      return errorResponse(
        res,
        { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
        400,
      );
    }

    const uploadSeconds = ttl.ttlSeconds || 0;
    uploadedObjectKey = await uploadFileToS3(uploadedFile, uploadSeconds, resolvedFileContentType);

    let resolvedTopicPath;
    try {
      resolvedTopicPath = await resolveTopicPath(redis, {
        topicName: fields.topic || '',
        path: requestedPath,
      });
    } catch (error) {
      await deleteUploadedObject(uploadedObjectKey);
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }

    const persistResult = resolvedTopicPath.isTopicItem
      ? await persistTopicEntry({
          req,
          path: resolvedTopicPath.fullPath,
          topicName: resolvedTopicPath.topicName,
          relativePath: resolvedTopicPath.relativePath,
          type: 'file',
          content: uploadedObjectKey,
          title: fields.title || '',
          created: normalizedCreated,
          createdProvided,
          allowOverwrite,
          ttlValue: ttl.expiresIn ?? 0,
          isExport,
          requestReceivedAt,
        })
      : await persistEntry({
          req,
          path: requestedPath,
          type: 'file',
          content: uploadedObjectKey,
          title: fields.title || '',
          created: normalizedCreated,
          createdProvided,
          allowOverwrite,
          ttlValue: ttl.expiresIn ?? 0,
          isExport,
          requestReceivedAt,
        });

    if (persistResult.conflictPayload) {
      await deleteUploadedObject(uploadedObjectKey);
      return errorResponse(res, persistResult.conflictPayload, 409);
    }

    return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
  } catch (error) {
    console.error('File upload error:', error);
    await deleteUploadedObject(uploadedObjectKey);
    return errorResponse(res, { code: 'internal', message: 'Failed to upload file' }, 500);
  }
}

async function handleJsonRequest(req, res, { allowOverwrite }) {
  const isExport = req.headers['x-export'] === 'true';
  const requestReceivedAt = new Date();
  let body;

  try {
    body = await parseRequestBodyWithLimit(req, { maxBytes: JSON_CREATE_MAX_BYTES });
  } catch (error) {
    if (error?.status === 413) {
      return errorResponse(res, { code: 'payload_too_large', message: 'Request body too large' }, 413);
    }

    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  let { url: inputContent, ttl, title = '', type: inputType, convert, path, topic = '', created } = body;
  const titleProvided = Object.prototype.hasOwnProperty.call(body, 'title');
  const createdProvided = Object.prototype.hasOwnProperty.call(body, 'created');
  path = normalizeLinkPath(path);
  topic = normalizeLinkPath(topic);

  try {
    inputType = normalizeWriteType(inputType, convert);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const ttlProvided = ttl !== undefined && ttl !== null && ttl !== '';
  let normalizedTtl;
  try {
    normalizedTtl = parseJsonTtlOrError(ttl);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  if (createdProvided) {
    try {
      created = normalizeCreatedInput(created);
    } catch (error) {
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }
  } else {
    created = null;
  }

  if (inputType === TOPIC_TYPE) {
    return handleTopicMutation(req, res, {
      path,
      title,
      titleProvided,
      created,
      createdProvided,
      ttlProvided,
      allowOverwrite,
      requestReceivedAt,
    });
  }

  if (!inputContent) {
    return errorResponse(res, { code: 'invalid_request', message: '`url` is required' }, 400);
  }

  const pathValidationError = validateOptionalPath(path);
  if (pathValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: pathValidationError }, 400);
  }

  const topicValidationError = validateOptionalTopic(topic);
  if (topicValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: topicValidationError }, 400);
  }

  const inputTypeValidationError = validateInputType(inputType);
  if (inputTypeValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: inputTypeValidationError }, 400);
  }

  path = path || generateRandomPath();
  if (isReservedAssetPath(path)) {
    return errorResponse(res, { code: 'invalid_request', message: reservedAssetPathError(path) }, 400);
  }

  if (inputType === 'url') {
    try {
      inputContent = normalizeUrlContent(inputContent);
    } catch (error) {
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }
  }

  const redis = await getRedisClient();
  if (await ensureTopicHomeIsWritable(redis, path)) {
    return errorResponse(
      res,
      { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
      400,
    );
  }

  let resolvedTopicPath;
  try {
    resolvedTopicPath = await resolveTopicPath(redis, { topicName: topic, path });
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const contentType = detectContentType(inputContent, inputType);
  const contentSizeError = validateContentSize(inputContent);
  if (contentSizeError) {
    return errorResponse(res, { code: 'payload_too_large', message: contentSizeError }, 413);
  }

  if (contentType === 'qrcode') {
    try {
      await convertToQrCode(inputContent);
    } catch (error) {
      return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
    }
  }

  const persistResult = resolvedTopicPath.isTopicItem
    ? await persistTopicEntry({
        req,
        path: resolvedTopicPath.fullPath,
        topicName: resolvedTopicPath.topicName,
        relativePath: resolvedTopicPath.relativePath,
        type: contentType,
        content: inputContent,
        title,
        created,
        createdProvided,
        allowOverwrite,
        ttlValue: normalizedTtl.expiresIn ?? 0,
        isExport,
        requestReceivedAt,
      })
    : await persistEntry({
        req,
        path,
        type: contentType,
        content: inputContent,
        title,
        created,
        createdProvided,
        allowOverwrite,
        ttlValue: normalizedTtl.expiresIn ?? 0,
        isExport,
        requestReceivedAt,
      });

  if (persistResult.conflictPayload) {
    return errorResponse(res, persistResult.conflictPayload, 409);
  }

  return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
}

async function writeEntry(req, res, { allowOverwrite }) {
  const contentTypeHeader = req.headers['content-type'] || '';
  if (contentTypeHeader.startsWith('multipart/form-data')) {
    if (!isS3Configured()) {
      return errorResponse(
        res,
        { code: 's3_not_configured', message: 'S3 service is not configured' },
        501,
      );
    }

    return handleFileUpload(req, res, { allowOverwrite });
  }

  return handleJsonRequest(req, res, { allowOverwrite });
}

export async function handleCreate(req, res) {
  return writeEntry(req, res, { allowOverwrite: false });
}

export async function handleReplace(req, res) {
  return writeEntry(req, res, { allowOverwrite: true });
}

export {
  normalizeWriteType,
  validateRequiredPathForPut,
  validateOptionalPath,
  validateOptionalTopic,
  validateInputType,
  validateContentSize,
};
