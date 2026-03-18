import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(rootDirectory, 'lib', 'assets', 'manifest.json');
const filesDirectory = join(rootDirectory, 'lib', 'assets', 'files');

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(`Manifest ${manifestPath} is empty`);
  }

  await mkdir(filesDirectory, { recursive: true });

  const expectedFileNames = new Set();

  for (const asset of manifest) {
    if (!asset.key || !asset.file_name || !asset.source_link) {
      throw new Error(`Manifest entry must include key, file_name and source_link: ${JSON.stringify(asset)}`);
    }

    const response = await fetch(asset.source_link);
    if (!response.ok) {
      throw new Error(`Download ${asset.key} failed with status ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const destination = join(filesDirectory, asset.file_name);
    expectedFileNames.add(asset.file_name);
    await writeFile(destination, buffer);
    console.log(`updated ${asset.key} -> ${destination}`);
  }

  const existingFileNames = await readdir(filesDirectory);
  for (const fileName of existingFileNames) {
    if (fileName === '.gitkeep' || expectedFileNames.has(fileName)) {
      continue;
    }

    await rm(join(filesDirectory, fileName), { force: true });
    console.log(`removed stale asset -> ${join(filesDirectory, fileName)}`);
  }
}

main().catch((error) => {
  console.error(`update embedded assets: ${error.message}`);
  process.exit(1);
});
