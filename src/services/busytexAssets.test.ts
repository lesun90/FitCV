import { describe, expect, it } from 'vitest';
import {
  buildBusyTexUrls,
  deriveBusyTexAssetStatus,
  virtualAssetContentType,
  type BusyTexChunkManifest
} from './busytexAssets';

const manifest: BusyTexChunkManifest = {
  version: 'texlyre-busytex-1.1.1',
  generatedAt: '2026-06-07T00:00:00.000Z',
  chunkSize: 4,
  versionsHash: 'sha256-versions',
  assets: {
    'busytex.wasm': {
      virtualPath: 'core/busytex/busytex.wasm',
      size: 6,
      sha256: 'sha256-wasm',
      chunks: [
        { index: 0, path: 'core/busytex-chunks/busytex.wasm.part-000', size: 4, sha256: 'sha256-a' },
        { index: 1, path: 'core/busytex-chunks/busytex.wasm.part-001', size: 2, sha256: 'sha256-b' }
      ]
    }
  },
  smallAssets: {}
};

describe('BusyTeX asset helpers', () => {
  it('builds base-aware BusyTeX URLs for root and subpath deployments', () => {
    expect(buildBusyTexUrls('/', undefined)).toMatchObject({
      busytexBasePath: '/core/busytex',
      manifestUrl: '/core/busytex-chunks/manifest.json'
    });
    expect(buildBusyTexUrls('/FitCV/', undefined)).toMatchObject({
      busytexBasePath: '/FitCV/core/busytex',
      manifestUrl: '/FitCV/core/busytex-chunks/manifest.json'
    });
    expect(buildBusyTexUrls('/FitCV/', 'https://assets.example/busytex').busytexBasePath).toBe('https://assets.example/busytex');
  });

  it('derives installed, update, and repair states from manifest/cache versions', () => {
    expect(deriveBusyTexAssetStatus({ manifest, installedVersion: undefined, missingAssetNames: ['busytex.wasm'] }).state).toBe('not-installed');
    expect(deriveBusyTexAssetStatus({ manifest, installedVersion: 'old', missingAssetNames: [] }).state).toBe('update-available');
    expect(deriveBusyTexAssetStatus({ manifest, installedVersion: manifest.version, missingAssetNames: ['busytex.wasm'] }).state).toBe('repair-needed');
    expect(deriveBusyTexAssetStatus({ manifest, installedVersion: manifest.version, missingAssetNames: [] }).state).toBe('ready-offline');
  });

  it('sets virtual asset response content types for BusyTeX loaders', () => {
    expect(virtualAssetContentType('busytex.wasm')).toBe('application/wasm');
    expect(virtualAssetContentType('texlive-extra.data')).toBe('application/octet-stream');
    expect(virtualAssetContentType('texlive-basic.js')).toBe('application/javascript');
  });
});
