import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBusyTexChunkManifest, getBusyTexChunkPlan } from './busytexChunker.mjs';

describe('BusyTeX chunk planning', () => {
  it('splits only large virtual assets and keeps chunk sizes under the limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fitcv-busytex-'));
    try {
      const sourceDir = join(root, 'source');
      const outputDir = join(root, 'output');
      await writeFixture(sourceDir, 'busytex.wasm', 10);
      await writeFixture(sourceDir, 'busytex.js', 5);
      await writeFixture(sourceDir, 'texlive-basic.data', 9);

      const plan = await getBusyTexChunkPlan({ sourceDir, outputDir, chunkSize: 4 });

      expect(plan.largeAssets.map((asset) => asset.name)).toEqual(['busytex.wasm', 'texlive-basic.data']);
      expect(plan.largeAssets[0].chunks.map((chunk) => chunk.size)).toEqual([4, 4, 2]);
      expect(plan.smallAssets.map((asset) => asset.name)).toEqual(['busytex.js']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('writes chunk files and a manifest with full-file hashes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fitcv-busytex-'));
    try {
      const sourceDir = join(root, 'source');
      const outputDir = join(root, 'output');
      await writeFixture(sourceDir, 'busytex.wasm', 6);
      await writeFixture(sourceDir, 'busytex.js', 3);
      await writeFixture(sourceDir, 'versions.txt', 8);

      const manifest = await createBusyTexChunkManifest({ sourceDir, outputDir, chunkSize: 4, packageVersion: '1.2.3' });

      expect(manifest.version).toBe('texlyre-busytex-1.2.3');
      expect(manifest.assets['busytex.wasm']).toMatchObject({
        virtualPath: 'core/busytex/busytex.wasm',
        size: 6,
        chunks: [
          { path: 'core/busytex-chunks/busytex.wasm.part-000', size: 4 },
          { path: 'core/busytex-chunks/busytex.wasm.part-001', size: 2 }
        ]
      });
      expect(manifest.smallAssets['busytex.js']).toMatchObject({ path: 'core/busytex/busytex.js', size: 3 });
      expect(manifest.versionsHash).toMatch(/^sha256-/);
      await expect(stat(join(outputDir, 'core/busytex-chunks/busytex.wasm.part-000'))).resolves.toMatchObject({ size: 4 });
      await expect(readFile(join(outputDir, 'core/busytex/busytex.js'))).resolves.toHaveLength(3);
      await expect(stat(join(outputDir, 'core/busytex/busytex.wasm'))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns the existing manifest when assets were already chunked', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fitcv-busytex-'));
    try {
      const sourceDir = join(root, 'public/core/busytex');
      const outputDir = join(root, 'public');
      await writeFixture(sourceDir, 'busytex.wasm', 6);
      await writeFixture(sourceDir, 'busytex.js', 3);
      const first = await createBusyTexChunkManifest({ sourceDir, outputDir, chunkSize: 4, packageVersion: '1.2.3' });

      const second = await createBusyTexChunkManifest({ sourceDir, outputDir, chunkSize: 4, packageVersion: '1.2.3' });

      expect(second).toEqual(first);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

const writeFixture = async (dir, name, size) => {
  await import('node:fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
  await writeFile(join(dir, name), Buffer.alloc(size, name.charCodeAt(0)));
};
