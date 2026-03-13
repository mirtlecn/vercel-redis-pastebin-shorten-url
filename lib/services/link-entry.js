import { LINKS_PREFIX, parseStoredValue, previewContent, getDomain } from '../utils/storage.js';

export function buildResponseContent(type, content, isExport) {
  return isExport ? content : previewContent(type, content);
}

export function parseTtlMinutes(ttlValue) {
  if (ttlValue === undefined || ttlValue === null || ttlValue === '') {
    return { expiresIn: null, ttlSeconds: null, warning: null };
  }

  const parsedMinutes = parseInt(ttlValue, 10);
  if (Number.isNaN(parsedMinutes) || parsedMinutes < 1) {
    return { expiresIn: 1, ttlSeconds: 60, warning: 'invalid ttl, fallback to 1 minute' };
  }

  return {
    expiresIn: parsedMinutes,
    ttlSeconds: parsedMinutes * 60,
    warning: null,
  };
}

export async function writeStoredLink({
  redis,
  path,
  storedValue,
  allowOverwrite,
  ttlValue,
  clearPathCache,
}) {
  const storageKey = `${LINKS_PREFIX}${path}`;
  const existingStoredValue = await redis.get(storageKey);

  if (existingStoredValue && !allowOverwrite) {
    return {
      didOverwrite: false,
      existingStoredValue,
      expiresIn: null,
      storageKey,
      ttlWarning: null,
    };
  }

  if (existingStoredValue && allowOverwrite) {
    await clearPathCache(path);
  }

  const ttl = parseTtlMinutes(ttlValue);
  if (ttl.ttlSeconds) {
    await redis.setEx(storageKey, ttl.ttlSeconds, storedValue);
  } else {
    await redis.set(storageKey, storedValue);
  }

  return {
    didOverwrite: Boolean(existingStoredValue),
    existingStoredValue,
    expiresIn: ttl.expiresIn,
    storageKey,
    ttlWarning: ttl.warning,
  };
}

export function buildCreatedEntryPayload({
  req,
  path,
  type,
  content,
  isExport,
  expiresIn,
  overwrittenStoredValue,
  ttlWarning,
}) {
  const responsePayload = {
    surl: `${getDomain(req)}/${path}`,
    path,
    type,
    content: buildResponseContent(type, content, isExport),
    expires_in: expiresIn,
  };

  if (overwrittenStoredValue) {
    const overwrittenEntry = parseStoredValue(overwrittenStoredValue);
    responsePayload.overwritten = buildResponseContent(
      overwrittenEntry.type,
      overwrittenEntry.content,
      isExport,
    );
  }

  if (ttlWarning) {
    responsePayload.warning = ttlWarning;
  }

  return responsePayload;
}

export function detectContentType(inputContent, inputType) {
  if (inputType) {
    return inputType;
  }

  try {
    new URL(inputContent);
    return 'url';
  } catch {
    return 'text';
  }
}

export async function applyContentConversion({
  inputContent,
  inputType,
  convert,
  convertMarkdownToHtml,
  convertToQrCode,
}) {
  if (!convert) {
    return { content: inputContent, type: inputType };
  }

  switch (convert) {
    case 'md2html':
      return {
        content: convertMarkdownToHtml(inputContent),
        type: 'html',
      };
    case 'qrcode':
      return {
        content: await convertToQrCode(inputContent),
        type: inputType,
      };
    case 'html':
    case 'url':
    case 'text':
      return {
        content: inputContent,
        type: convert,
      };
    default:
      throw new Error(
        `Invalid convert value: ${convert}. Must be one of: md2html, qrcode, html, url, text`,
      );
  }
}
