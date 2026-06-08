export type BusyTexAssetState =
  | 'unavailable'
  | 'not-installed'
  | 'downloading'
  | 'ready-offline'
  | 'update-available'
  | 'repair-needed'
  | 'clearing-cache';

export type BusyTexChunkRecord = {
  index: number;
  path: string;
  size: number;
  sha256: string;
};

export type BusyTexLargeAsset = {
  virtualPath: string;
  size: number;
  sha256: string;
  chunks: BusyTexChunkRecord[];
};

export type BusyTexChunkManifest = {
  version: string;
  generatedAt: string;
  chunkSize: number;
  versionsHash: string;
  assets: Record<string, BusyTexLargeAsset>;
  smallAssets: Record<string, { path: string; size: number; sha256: string }>;
};

export type BusyTexAssetProgress = {
  phase: 'service-worker' | 'downloading' | 'validating' | 'ready' | 'clearing';
  assetName?: string;
  bytesLoaded: number;
  bytesTotal: number;
};

export type BusyTexAssetStatus = {
  state: BusyTexAssetState;
  manifest?: BusyTexChunkManifest;
  message?: string;
  missingAssetNames: string[];
};

const CACHE_PREFIX = 'fitcv-busytex-assets';
const META_CACHE = 'fitcv-busytex-meta';
const INSTALLED_VERSION_URL = '/__fitcv_busytex_installed_version__';
const EM_CACHE_DB = 'EM_PRELOAD_CACHE';

export const buildBusyTexUrls = (baseUrl = '/', overrideBasePath?: string) => {
  const appBase = normalizeBasePath(baseUrl);
  const busytexBasePath = overrideBasePath?.replace(/\/$/, '') ?? `${appBase}core/busytex`;
  return {
    appBase,
    busytexBasePath,
    manifestUrl: `${appBase}core/busytex-chunks/manifest.json`,
    serviceWorkerUrl: `${appBase}busytex-asset-sw.js`,
    serviceWorkerScope: appBase
  };
};

export const getConfiguredBusyTexUrls = () =>
  buildBusyTexUrls(import.meta.env.BASE_URL, import.meta.env.VITE_BUSYTEX_BASE_PATH);

export const virtualAssetContentType = (assetName: string): string => {
  if (assetName.endsWith('.wasm')) return 'application/wasm';
  if (assetName.endsWith('.data')) return 'application/octet-stream';
  if (assetName.endsWith('.js')) return 'application/javascript';
  return 'application/octet-stream';
};

export const deriveBusyTexAssetStatus = ({
  manifest,
  installedVersion,
  missingAssetNames
}: {
  manifest?: BusyTexChunkManifest;
  installedVersion?: string;
  missingAssetNames: string[];
}): BusyTexAssetStatus => {
  if (!manifest) return { state: 'unavailable', missingAssetNames, message: 'BusyTeX chunk manifest is unavailable.' };
  if (!installedVersion) return { state: 'not-installed', manifest, missingAssetNames };
  if (installedVersion !== manifest.version) return { state: 'update-available', manifest, missingAssetNames };
  if (missingAssetNames.length) return { state: 'repair-needed', manifest, missingAssetNames };
  return { state: 'ready-offline', manifest, missingAssetNames };
};

export const getBusyTexAssetStatus = async (): Promise<BusyTexAssetStatus> => {
  if (!isBrowserAssetRuntimeAvailable()) {
    return { state: 'unavailable', missingAssetNames: [], message: 'Service Worker and Cache Storage are required for offline PDF compiler assets.' };
  }

  try {
    const manifest = await fetchBusyTexManifest();
    const installedVersion = await readInstalledVersion();
    const missingAssetNames = await findMissingVirtualAssets(manifest);
    return deriveBusyTexAssetStatus({ manifest, installedVersion, missingAssetNames });
  } catch (caught) {
    return {
      state: 'repair-needed',
      missingAssetNames: [],
      message: caught instanceof Error ? caught.message : 'Unable to inspect BusyTeX assets.'
    };
  }
};

export const ensureBusyTexAssetsInstalled = async (
  onProgress?: (progress: BusyTexAssetProgress) => void,
  opts: { full?: boolean; force?: boolean } = {}
): Promise<BusyTexAssetStatus> => {
  if (!isBrowserAssetRuntimeAvailable()) {
    return { state: 'unavailable', missingAssetNames: [], message: 'Service Worker and Cache Storage are required for offline PDF compiler assets.' };
  }
  await ensureBusyTexServiceWorker(onProgress);
  const manifest = await fetchBusyTexManifest();
  const current = await getBusyTexAssetStatus();
  if (!opts.force && current.state === 'ready-offline' && !current.missingAssetNames.length) return current;

  const assetNames = opts.full ? Object.keys(manifest.assets) : Object.keys(manifest.assets);
  const bytesTotal = assetNames.reduce((total, name) => total + manifest.assets[name].size, 0);
  let bytesLoaded = 0;
  const cache = await caches.open(assetCacheName(manifest.version));

  for (const assetName of assetNames) {
    const asset = manifest.assets[assetName];
    const virtualUrl = absoluteUrl(asset.virtualPath);
    if (!opts.force && (await cache.match(virtualUrl)) && current.state !== 'update-available') {
      bytesLoaded += asset.size;
      onProgress?.({ phase: 'downloading', assetName, bytesLoaded, bytesTotal });
      continue;
    }

    const parts: Uint8Array[] = [];
    let assetBytes = 0;
    for (const chunk of asset.chunks) {
      const response = await fetch(absoluteUrl(chunk.path));
      if (!response.ok) throw new Error(`Unable to download ${chunk.path} (${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== chunk.size) throw new Error(`Downloaded ${chunk.path} with unexpected size.`);
      const hash = await sha256(bytes);
      if (hash !== chunk.sha256) throw new Error(`Downloaded ${chunk.path} failed integrity check.`);
      parts.push(bytes);
      assetBytes += bytes.byteLength;
      bytesLoaded += bytes.byteLength;
      onProgress?.({ phase: 'downloading', assetName, bytesLoaded, bytesTotal });
    }

    const assembled = concatBytes(parts, assetBytes);
    const fullHash = await sha256(assembled);
    if (fullHash !== asset.sha256) throw new Error(`${assetName} failed full asset integrity check.`);
    await cache.put(virtualUrl, new Response(new Blob([toArrayBuffer(assembled)], { type: virtualAssetContentType(assetName) })));
    onProgress?.({ phase: 'validating', assetName, bytesLoaded, bytesTotal });
  }

  await writeInstalledVersion(manifest.version);
  onProgress?.({ phase: 'ready', bytesLoaded: bytesTotal, bytesTotal });
  return getBusyTexAssetStatus();
};

export const clearBusyTexAssetCaches = async (onProgress?: (progress: BusyTexAssetProgress) => void): Promise<void> => {
  onProgress?.({ phase: 'clearing', bytesLoaded: 0, bytesTotal: 0 });
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) || key === META_CACHE).map((key) => caches.delete(key)));
  }
  await deleteIndexedDb(EM_CACHE_DB);
};

export const ensureBusyTexServiceWorker = async (onProgress?: (progress: BusyTexAssetProgress) => void): Promise<void> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('Service Worker is unavailable in this browser.');
  }
  const urls = getConfiguredBusyTexUrls();
  onProgress?.({ phase: 'service-worker', bytesLoaded: 0, bytesTotal: 0 });
  await navigator.serviceWorker.register(urls.serviceWorkerUrl, { scope: urls.serviceWorkerScope });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 1000);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
    });
  }
  if (!navigator.serviceWorker.controller) {
    throw new Error('Service Worker registered but does not control this page yet. Reload and try compiling again.');
  }
};

const fetchBusyTexManifest = async (): Promise<BusyTexChunkManifest> => {
  const response = await fetch(getConfiguredBusyTexUrls().manifestUrl);
  if (!response.ok) throw new Error(`BusyTeX chunk manifest failed to load: ${response.status}.`);
  return response.json() as Promise<BusyTexChunkManifest>;
};

const findMissingVirtualAssets = async (manifest: BusyTexChunkManifest): Promise<string[]> => {
  if (typeof caches === 'undefined') return Object.keys(manifest.assets);
  const cache = await caches.open(assetCacheName(manifest.version));
  const missing: string[] = [];
  for (const [assetName, asset] of Object.entries(manifest.assets)) {
    if (!(await cache.match(absoluteUrl(asset.virtualPath)))) missing.push(assetName);
  }
  return missing;
};

const readInstalledVersion = async (): Promise<string | undefined> => {
  if (typeof caches === 'undefined') return undefined;
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(INSTALLED_VERSION_URL);
  return response?.text();
};

const writeInstalledVersion = async (version: string): Promise<void> => {
  const cache = await caches.open(META_CACHE);
  await cache.put(INSTALLED_VERSION_URL, new Response(version, { headers: { 'Content-Type': 'text/plain' } }));
};

const normalizeBasePath = (baseUrl: string): string => {
  if (!baseUrl || baseUrl === '/') return '/';
  return `/${baseUrl.replace(/^\/|\/$/g, '')}/`;
};

const absoluteUrl = (path: string): string => new URL(path.replace(/^\//, ''), window.location.origin + getConfiguredBusyTexUrls().appBase).toString();
const assetCacheName = (version: string): string => `${CACHE_PREFIX}-${version}`;
const isBrowserAssetRuntimeAvailable = (): boolean => typeof window !== 'undefined' && typeof caches !== 'undefined' && typeof fetch !== 'undefined';

const concatBytes = (parts: Uint8Array[], size: number): Uint8Array => {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return `sha256-${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const deleteIndexedDb = async (dbName: string): Promise<void> => {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};
