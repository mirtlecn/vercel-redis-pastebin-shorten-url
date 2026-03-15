import formidable from 'formidable';
import { extname } from 'path';
import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { buildStoredValue, getDomain, parseRequestBody, parseStoredValue } from '../utils/storage.js';
import { clearFileCache } from '../utils/file-cache.js';
import { convertMarkdownToHtml, convertToQrCode } from '../utils/converter.js';
import { deleteFileFromS3, isS3Configured, uploadFileToS3 } from '../utils/s3.js';
import {
  buildPublicLink,
  buildUploadedFilePath,
  generateRandomPath,
  normalizeLinkPath,
  validateLinkPath,
} from '../utils/link-path.js';
import {
  applyContentConversion,
  buildCreatedEntryPayload,
  detectContentType,
  normalizeUrlContent,
  parseTtlMinutes,
  writeStoredLink,
} from '../services/link-entry.js';
import {
  TOPIC_TYPE,
  countTopicItems,
  createTopic,
  ensureTopicHomeIsWritable,
  refreshTopic,
  resolveTopicPath,
  writeTopicItem,
} from '../services/topic-store.js';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10;
const MAX_CONTENT_SIZE_KB = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500;
const VALID_REQUEST_TYPES = ['url', 'text', 'html', 'md2html', 'qrcode', TOPIC_TYPE];

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
  if (inputType === undefined || VALID_REQUEST_TYPES.includes(inputType)) {
    return null;
  }

  return '`type` must be one of: url, text, html, md2html, qrcode, topic';
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

function normalizeRequestedType(inputType, convert) {
  if (inputType && convert && inputType !== convert) {
    throw new Error('`type` and `convert` must match when both are provided');
  }

  return inputType || convert;
}

function parseJsonTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'json' });
}

function parseFormTtlOrError(ttlValue) {
  return parseTtlMinutes(ttlValue, { source: 'form' });
}

function buildTopicResponsePayload(req, topicPath, itemCount) {
  return {
    surl: buildPublicLink(getDomain(req), topicPath),
    path: topicPath,
    type: TOPIC_TYPE,
    title: topicPath,
    content: String(itemCount),
    ttl: null,
  };
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
  allowOverwrite,
  ttlValue,
  isExport,
}) {
  const redis = await getRedisClient();
  const storedValue = buildStoredValue({ type, content, title });
  const writeResult = await writeStoredLink({
    redis,
    path,
    storedValue,
    allowOverwrite,
    ttlValue,
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
  allowOverwrite,
  ttlValue,
  isExport,
}) {
  const redis = await getRedisClient();
  const ttl = parseTtlMinutes(ttlValue);
  const storedValue = buildStoredValue({ type, content, title });
  const writeResult = await writeTopicItem({
    redis,
    topicName,
    relativePath,
    fullPath: path,
    storedValue,
    allowOverwrite,
    ttlSeconds: ttl.ttlSeconds,
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
      isExport,
      expiresIn: ttl.expiresIn,
      overwrittenStoredValue: writeResult.didOverwrite ? writeResult.existingStoredValue : null,
      ttlWarning: ttl.warning,
    }),
    statusCode: !allowOverwrite || !writeResult.didOverwrite ? 201 : 200,
  };
}

async function handleTopicMutation(req, res, { path, ttlProvided, allowOverwrite }) {
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
    await createTopic(redis, path);
  } else if (existingTopic && allowOverwrite) {
    await refreshTopic(redis, path);
  } else {
    await createTopic(redis, path);
  }

  const itemCount = await countTopicItems(redis, path);
  return jsonResponse(res, buildTopicResponsePayload(req, path, itemCount), allowOverwrite ? 200 : 201);
}

function getUploadedFile(files) {
  if (!files.file) {
    return null;
  }

  return Array.isArray(files.file) ? files.file[0] : files.file;
}

async function handleFileUpload(req, res, { allowOverwrite }) {
  const isExport = req.headers['x-export'] === 'true';
  let fields;
  let files;
  let uploadedObjectKey = '';

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
  let ttl;

  try {
    ttl = parseFormTtlOrError(fields.ttl);
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  try {
    const redis = await getRedisClient();
    if (requestedPath && await ensureTopicHomeIsWritable(redis, requestedPath)) {
      return errorResponse(
        res,
        { code: 'invalid_request', message: 'topic home must be managed with `type=topic`' },
        400,
      );
    }

    const uploadSeconds = ttl.ttlSeconds || 0;
    uploadedObjectKey = await uploadFileToS3(uploadedFile, uploadSeconds);

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
          allowOverwrite,
          ttlValue: ttl.expiresIn ?? 0,
          isExport,
        })
      : await persistEntry({
          req,
          path: requestedPath,
          type: 'file',
          content: uploadedObjectKey,
          title: fields.title || '',
          allowOverwrite,
          ttlValue: ttl.expiresIn ?? 0,
          isExport,
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
  let body;

  try {
    body = await parseRequestBody(req);
  } catch {
    return errorResponse(res, { code: 'invalid_request', message: 'Invalid JSON body' }, 400);
  }

  let { url: inputContent, ttl, title = '', type: inputType, convert, path, topic = '' } = body;
  path = normalizeLinkPath(path);
  topic = normalizeLinkPath(topic);

  try {
    inputType = normalizeRequestedType(inputType, convert);
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

  if (inputType === TOPIC_TYPE) {
    return handleTopicMutation(req, res, { path, ttlProvided, allowOverwrite });
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

  try {
    if (inputType === 'md2html') {
      inputContent = convertMarkdownToHtml(inputContent, {
        pageTitle: title,
        topicBackLink: resolvedTopicPath.isTopicItem ? `/${resolvedTopicPath.topicName}` : '',
        topicBackLabel: resolvedTopicPath.isTopicItem ? resolvedTopicPath.topicName : '',
      });
      inputType = 'html';
    } else if (inputType === 'qrcode') {
      const convertedEntry = await applyContentConversion({
        inputContent,
        inputType: 'text',
        convert: 'qrcode',
        convertMarkdownToHtml,
        convertToQrCode,
      });
      inputContent = convertedEntry.content;
      inputType = convertedEntry.type;
    }
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const contentType = detectContentType(inputContent, inputType);
  const contentSizeError = validateContentSize(inputContent);
  if (contentSizeError) {
    return errorResponse(res, { code: 'payload_too_large', message: contentSizeError }, 413);
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
        allowOverwrite,
        ttlValue: normalizedTtl.expiresIn ?? 0,
        isExport,
      })
    : await persistEntry({
        req,
        path,
        type: contentType,
        content: inputContent,
        title,
        allowOverwrite,
        ttlValue: normalizedTtl.expiresIn ?? 0,
        isExport,
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
  validateRequiredPathForPut,
  validateOptionalPath,
  validateOptionalTopic,
  validateInputType,
  validateContentSize,
};
