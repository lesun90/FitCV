const CACHE_PREFIX = 'fitcv-busytex-assets';
const LARGE_ASSET_RE = /\/core\/busytex\/(busytex\.wasm|texlive-basic\.data|texlive-recommended\.data|texlive-extra\.data)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(LARGE_ASSET_RE);
  if (!match) return;

  event.respondWith(serveVirtualBusyTexAsset(event.request, match[1]));
});

async function serveVirtualBusyTexAsset(request, assetName) {
  const manifest = await fetchManifest(request.url);
  if (!manifest) return missing(assetName, 503);

  const asset = manifest.assets?.[assetName];
  if (!asset) return missing(assetName, 404);

  const cache = await caches.open(`${CACHE_PREFIX}-${manifest.version}`);
  const cached = await cache.match(request.url);
  if (cached) return withContentType(cached, contentType(assetName));

  return missing(assetName, 428);
}

async function fetchManifest(requestUrl) {
  try {
    const url = new URL(requestUrl);
    url.pathname = url.pathname.replace(/\/core\/busytex\/[^/]+$/, '/core/busytex-chunks/manifest.json');
    const response = await fetch(url.toString(), { cache: 'no-cache' });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function missing(assetName, status) {
  return new Response(`BusyTeX virtual asset is not installed: ${assetName}`, {
    status,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store'
    }
  });
}

function withContentType(response, type) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', type);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function contentType(assetName) {
  if (assetName.endsWith('.wasm')) return 'application/wasm';
  return 'application/octet-stream';
}
