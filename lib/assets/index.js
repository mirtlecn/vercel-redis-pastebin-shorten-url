import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetDirectory = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(assetDirectory, 'manifest.json');
const filesDirectory = join(assetDirectory, 'files');

let assetMapByKey = new Map();
let assetMapByRoute = new Map();

initializeAssets();

function initializeAssets() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assetMapByKey = new Map();
  assetMapByRoute = new Map();

  for (const asset of manifest) {
    if (!asset.key || !asset.route_path || !asset.file_name || !asset.content_type) {
      throw new Error(`Asset manifest entry is incomplete: ${JSON.stringify(asset)}`);
    }
    const filePath = join(filesDirectory, asset.file_name);
    if (!existsSync(filePath)) {
      throw new Error(`Embedded asset file not found: ${asset.file_name}`);
    }
    const content = readFileSync(filePath);
    const record = { ...asset, content };
    assetMapByKey.set(asset.key, record);
    assetMapByRoute.set(asset.route_path, record);
  }
}

export function getEmbeddedAssetUrl(key) {
  const asset = assetMapByKey.get(key);
  if (!asset) {
    throw new Error(`Embedded asset key not found: ${key}`);
  }
  return asset.route_path;
}

export function lookupEmbeddedAsset(routePath) {
  return assetMapByRoute.get(routePath) || null;
}

export function isReservedEmbeddedAssetPath(routePath) {
  return assetMapByRoute.has(routePath);
}
