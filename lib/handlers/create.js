import formidable from 'formidable';
import { extname } from 'path';
import { getRedisClient } from '../redis.js';
import { jsonResponse, errorResponse } from '../utils/response.js';
import { buildStoredValue, parseRequestBody, parseStoredValue } from '../utils/storage.js';
import { clearFileCache } from '../utils/file-cache.js';
import { convertMarkdownToHtml, convertToQrCode } from '../utils/converter.js';
import { isS3Configured, uploadFileToS3 } from '../utils/s3.js';
import { buildUploadedFilePath, generateRandomPath, validateLinkPath } from '../utils/link-path.js';
import {
  applyContentConversion,
  buildCreatedEntryPayload,
  detectContentType,
  writeStoredLink,
} from '../services/link-entry.js';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 10;
const MAX_CONTENT_SIZE_KB = parseInt(process.env.MAX_CONTENT_SIZE_KB, 10) || 500;
const VALID_CONTENT_TYPES = ['url', 'text', 'html'];

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

function validateInputType(inputType) {
  if (inputType === undefined || VALID_CONTENT_TYPES.includes(inputType)) {
    return null;
  }

  return '`type` must be one of: url, text, html';
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

async function persistEntry({
  req,
  path,
  type,
  content,
  allowOverwrite,
  ttlValue,
  isExport,
}) {
  const redis = await getRedisClient();
  const storedValue = buildStoredValue(type, content);
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
      isExport,
      expiresIn: writeResult.expiresIn,
      overwrittenStoredValue: writeResult.didOverwrite ? writeResult.existingStoredValue : null,
      ttlWarning: writeResult.ttlWarning,
    }),
    statusCode: !allowOverwrite || !writeResult.didOverwrite ? 201 : 200,
  };
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

  const pathValidationError = validateOptionalPath(fields.path);
  if (pathValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: pathValidationError }, 400);
  }

  const fileExtension = extname(uploadedFile.originalFilename || '').toLowerCase();
  const path = buildUploadedFilePath(fields.path, fileExtension);

  try {
    const uploadSeconds = fields.ttl ? parseInt(fields.ttl, 10) * 60 : 0;
    const objectKey = await uploadFileToS3(uploadedFile, uploadSeconds);
    const persistResult = await persistEntry({
      req,
      path,
      type: 'file',
      content: objectKey,
      allowOverwrite,
      ttlValue: fields.ttl,
      isExport,
    });

    if (persistResult.conflictPayload) {
      return errorResponse(res, persistResult.conflictPayload, 409);
    }

    return jsonResponse(res, persistResult.responsePayload, persistResult.statusCode);
  } catch (error) {
    console.error('File upload error:', error);
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

  let { url: inputContent, ttl, type: inputType, convert, path } = body;
  if (!inputContent) {
    return errorResponse(res, { code: 'invalid_request', message: '`url` is required' }, 400);
  }

  const pathValidationError = validateOptionalPath(path);
  if (pathValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: pathValidationError }, 400);
  }

  const inputTypeValidationError = validateInputType(inputType);
  if (inputTypeValidationError) {
    return errorResponse(res, { code: 'invalid_request', message: inputTypeValidationError }, 400);
  }

  try {
    const convertedEntry = await applyContentConversion({
      inputContent,
      inputType,
      convert,
      convertMarkdownToHtml,
      convertToQrCode,
    });
    inputContent = convertedEntry.content;
    inputType = convertedEntry.type;
  } catch (error) {
    return errorResponse(res, { code: 'invalid_request', message: error.message }, 400);
  }

  const contentSizeError = validateContentSize(inputContent);
  if (contentSizeError) {
    return errorResponse(res, { code: 'payload_too_large', message: contentSizeError }, 413);
  }

  path = path || generateRandomPath();
  const contentType = detectContentType(inputContent, inputType);
  const persistResult = await persistEntry({
    req,
    path,
    type: contentType,
    content: inputContent,
    allowOverwrite,
    ttlValue: ttl,
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
  validateInputType,
  validateContentSize,
};
