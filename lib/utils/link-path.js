const RANDOM_PATH_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const LINK_PATH_PATTERN = /^[a-zA-Z0-9_.\-()/]+$/;
const RESERVED_ADMIN_PATH = 'admin';
const MAX_LINK_PATH_LENGTH = 99;

export function generateRandomPath() {
  return Array.from({ length: 5 }, () => {
    const randomIndex = Math.floor(Math.random() * RANDOM_PATH_ALPHABET.length);
    return RANDOM_PATH_ALPHABET[randomIndex];
  }).join('');
}

export function validateLinkPath(linkPath) {
  if (linkPath.length < 1 || linkPath.length > MAX_LINK_PATH_LENGTH) {
    return { valid: false, error: 'path must be 1-99 characters' };
  }

  if (!LINK_PATH_PATTERN.test(linkPath)) {
    return { valid: false, error: 'path can only contain: a-z A-Z 0-9 - _ . / ( )' };
  }

  const normalizedPath = linkPath.replace(/^\/+/, '').toLowerCase();
  if (normalizedPath === RESERVED_ADMIN_PATH || normalizedPath.startsWith(`${RESERVED_ADMIN_PATH}/`)) {
    return { valid: false, error: 'path prefix "admin" is reserved' };
  }

  return { valid: true };
}

export function buildUploadedFilePath(inputPath, fileExtension) {
  if (!inputPath) {
    return `${generateRandomPath()}${fileExtension}`;
  }

  if (fileExtension && inputPath.toLowerCase().endsWith(fileExtension.toLowerCase())) {
    return inputPath;
  }

  return `${inputPath}${fileExtension}`;
}
