import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024;
export const LARGE_BUSY_TEX_ASSETS = new Set(['busytex.wasm', 'texlive-basic.data', 'texlive-recommended.data', 'texlive-extra.data']);

export async function getBusyTexChunkPlan({ sourceDir, outputDir, chunkSize = DEFAULT_CHUNK_SIZE }) {
  const names = (await readdir(sourceDir)).sort();
  const largeAssets = [];
  const smallAssets = [];

  for (const name of names) {
    const sourcePath = join(sourceDir, name);
    const stats = await stat(sourcePath);
    if (!stats.isFile()) continue;

    if (LARGE_BUSY_TEX_ASSETS.has(name)) {
      const chunks = [];
      let remaining = stats.size;
      let index = 0;
      while (remaining > 0) {
        const size = Math.min(chunkSize, remaining);
        chunks.push({
          index,
          size,
          path: `core/busytex-chunks/${name}.part-${String(index).padStart(3, '0')}`,
          outputPath: join(outputDir, 'core/busytex-chunks', `${name}.part-${String(index).padStart(3, '0')}`)
        });
        remaining -= size;
        index += 1;
      }
      largeAssets.push({ name, sourcePath, size: stats.size, chunks });
    } else {
      smallAssets.push({
        name,
        sourcePath,
        size: stats.size,
        path: `core/busytex/${name}`,
        outputPath: join(outputDir, 'core/busytex', name)
      });
    }
  }

  return { sourceDir, outputDir, chunkSize, largeAssets, smallAssets };
}

export async function createBusyTexChunkManifest({ sourceDir, outputDir, chunkSize = DEFAULT_CHUNK_SIZE, packageVersion }) {
  const plan = await getBusyTexChunkPlan({ sourceDir, outputDir, chunkSize });
  const existingManifestPath = join(outputDir, 'core/busytex-chunks/manifest.json');
  if (plan.largeAssets.length === 0) {
    try {
      return JSON.parse(await readFile(existingManifestPath, 'utf8'));
    } catch {
      throw new Error(`No large BusyTeX assets found in ${sourceDir}, and no existing chunk manifest was available.`);
    }
  }
  const outputBusyTexDir = join(outputDir, 'core/busytex');
  const sourceIsOutputBusyTex = samePath(sourceDir, outputBusyTexDir);
  if (!sourceIsOutputBusyTex) await rm(outputBusyTexDir, { recursive: true, force: true });
  await rm(join(outputDir, 'core/busytex-chunks'), { recursive: true, force: true });
  await mkdir(outputBusyTexDir, { recursive: true });
  await mkdir(join(outputDir, 'core/busytex-chunks'), { recursive: true });

  const smallAssets = {};
  for (const asset of plan.smallAssets) {
    if (!samePath(asset.sourcePath, asset.outputPath)) await copyFile(asset.sourcePath, asset.outputPath);
    smallAssets[asset.name] = {
      path: asset.path,
      size: asset.size,
      sha256: await sha256File(asset.sourcePath)
    };
  }

  const assets = {};
  for (const asset of plan.largeAssets) {
    const chunkRecords = await writeChunks(asset, chunkSize);
    const fullHash = await sha256File(asset.sourcePath);
    await rm(join(outputBusyTexDir, asset.name), { force: true });
    assets[asset.name] = {
      virtualPath: `core/busytex/${asset.name}`,
      size: asset.size,
      sha256: fullHash,
      chunks: chunkRecords
    };
  }

  const manifest = {
    version: `texlyre-busytex-${packageVersion ?? await readPackageVersion()}`,
    generatedAt: new Date().toISOString(),
    chunkSize,
    versionsHash: await optionalSha256(join(sourceDir, 'versions.txt')),
    assets,
    smallAssets
  };

  await writeFile(join(outputDir, 'core/busytex-chunks/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function samePath(a, b) {
  return a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
}

async function writeChunks(asset, chunkSize) {
  const bytes = await readFile(asset.sourcePath);
  const chunks = [];
  for (const chunk of asset.chunks) {
    const part = bytes.subarray(chunk.index * chunkSize, chunk.index * chunkSize + chunk.size);
    await writeFile(chunk.outputPath, part);
    chunks.push({
      index: chunk.index,
      path: chunk.path,
      size: part.byteLength,
      sha256: sha256Buffer(part)
    });
  }
  return chunks;
}

async function optionalSha256(path) {
  try {
    return await sha256File(path);
  } catch {
    return '';
  }
}

async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return `sha256-${hash.digest('hex')}`;
}

function sha256Buffer(buffer) {
  return `sha256-${createHash('sha256').update(buffer).digest('hex')}`;
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(new URL('../node_modules/texlyre-busytex/package.json', import.meta.url), 'utf8'));
  return packageJson.version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const sourceDir = process.argv[2] ?? 'public/core/busytex';
  const outputDir = process.argv[3] ?? 'public';
  const manifest = await createBusyTexChunkManifest({ sourceDir, outputDir });
  const largeCount = Object.keys(manifest.assets).length;
  const chunkCount = Object.values(manifest.assets).reduce((total, asset) => total + asset.chunks.length, 0);
  console.log(`Chunked ${largeCount} BusyTeX assets into ${chunkCount} chunks under ${join(outputDir, 'core/busytex-chunks')}`);
}
