# Chunked BusyTeX Assets Design

## Goal

FitCV must compile PDFs in the browser with BusyTeX while avoiding large-file deployment limits and surprise object-storage bills. The app should remain deployable to static hosts such as Cloudflare Pages and GitHub Pages, should not commit generated BusyTeX assets to the main source tree, and should let users prepare the PDF compiler for offline use.

## Constraints

- BusyTeX runtime assets are about 649 MB after `npm run busytex:assets`.
- `busytex.wasm`, `texlive-basic.data`, `texlive-recommended.data`, and `texlive-extra.data` exceed common static-host single-file limits.
- The generated BusyTeX assets should be produced during CI/deploy, not committed to the main branch.
- Users should not download the compiler on normal app load.
- Users need clear download progress, compile progress, and recovery actions.
- GitHub Pages subpath deployments must be supported by using Vite/base-aware URLs instead of root-only paths.

## Recommended Approach

Use CI-generated chunked BusyTeX assets plus a Service Worker that makes the chunked files appear as normal BusyTeX runtime files.

FitCV keeps using BusyTeX's existing URL contract:

```txt
<base>/core/busytex/busytex.wasm
<base>/core/busytex/texlive-basic.data
<base>/core/busytex/texlive-recommended.data
<base>/core/busytex/texlive-extra.data
```

The deployed site does not contain those large files directly. Instead it contains small BusyTeX files normally and stores each large asset as 16 MB chunks:

```txt
<base>/core/busytex/
  busytex.js
  busytex_worker.js
  busytex_pipeline.js
  texlive-basic.js
  texlive-recommended.js
  texlive-extra.js
  versions.txt

<base>/core/busytex-chunks/
  manifest.json
  busytex.wasm.part-000
  busytex.wasm.part-001
  texlive-basic.data.part-000
  texlive-recommended.data.part-000
  texlive-extra.data.part-000
  ...
```

Each chunk remains below Cloudflare Pages' 25 MB limit and GitHub's 100 MB git file block.

## Deployment Flow

Add deployment scripts that run in CI:

```txt
npm ci
npm run busytex:assets
npm run busytex:chunk
npm run build
```

`busytex:chunk` will:

- Split oversized runtime assets into fixed-size chunks.
- Copy small BusyTeX files into the deployable runtime directory.
- Write a manifest with the BusyTeX package version, `versions.txt` hash, full asset sizes, full asset hashes, chunk sizes, and chunk hashes.
- Fail if any emitted file exceeds the configured chunk size or known host limit.

Generated files remain deploy artifacts. They should not be checked into the main branch.

## Runtime Architecture

Add a BusyTeX asset service with these responsibilities:

- Register the Service Worker.
- Read the chunk manifest using a base-aware URL.
- Report compiler asset status.
- Download required chunks with byte-level progress.
- Validate chunk hashes and full asset hashes.
- Trigger repair and clear-cache operations.

The Service Worker will:

- Intercept requests for virtual large BusyTeX assets.
- Return cached reconstructed assets when available.
- Reconstruct assets from cached chunks when needed.
- Let normal small BusyTeX files pass through as static assets.
- Use versioned cache names so BusyTeX upgrades do not mix old and new assets.

The existing `latexCompiler.ts` should keep BusyTeX compilation ownership. Its required changes are limited to deriving the BusyTeX base path from a base-aware helper and calling the new asset service before compilation when virtual assets are not installed.

## User Flow

Normal app load does not download compiler assets.

When the user clicks Compile:

1. FitCV checks whether required compiler assets are installed.
2. If missing, FitCV starts the download/install flow and shows progress.
3. After assets are ready, BusyTeX compiles the PDF in the browser.

Add a secondary action near the PDF/compiler status:

```txt
Prepare offline PDF compiler
```

This action downloads all BusyTeX runtime assets needed for offline compilation.

## UI States

Compiler asset status:

```txt
Not installed
Downloading assets
Ready offline
Update available
Repair needed
Clearing cache
```

Download progress should be based on bytes downloaded over total required bytes.

Compile progress should be phase-based because BusyTeX does not expose exact percentage progress:

```txt
Initializing compiler
Loading TeX packages
Running XeLaTeX
Finalizing PDF
```

The UI may show an estimated progress bar for these phases, but it must not imply exact mathematical progress.

## Recovery UX

Add two recovery actions:

```txt
Repair
Clear cache
```

Repair:

- Reads the manifest.
- Validates cached chunks and reconstructed assets.
- Redownloads only missing or corrupt pieces.
- Leaves valid cached assets intact.

Clear cache:

- Asks for confirmation.
- Deletes FitCV chunk caches.
- Deletes reconstructed BusyTeX asset caches.
- Deletes BusyTeX's Emscripten package cache database (`EM_PRELOAD_CACHE`).
- Returns the compiler asset state to `Not installed`.

After Clear cache, the next Compile or Prepare offline PDF compiler action downloads assets again.

## BusyTeX Update Method

BusyTeX updates are driven by the `texlyre-busytex` dependency version.

Manual update flow:

```txt
npm update texlyre-busytex
npm run busytex:assets
npm run busytex:chunk
npm run test
```

CI/deploy flow regenerates chunks from the installed dependency. The manifest version and hashes change when BusyTeX changes. If the browser has an old cached version, FitCV reports `Update available` and lets the user install the new compiler assets.

## Error Handling

Handle these cases explicitly:

- Manifest missing or invalid: show `Repair needed` and include the manifest URL in logs.
- Chunk fetch fails: preserve completed chunks and allow retry.
- Hash mismatch: discard the corrupt chunk or reconstructed asset and redownload.
- Storage quota exceeded: show a clear error explaining that the offline compiler requires at least 700 MB of browser storage.
- Service Worker unavailable: PDF compiler installation is unavailable, but the resume editor remains usable.
- Old Service Worker serving an old manifest: compare manifest version and cache version, then prompt for repair/update.

## Testing

Automated tests:

- Manifest parser validates required fields.
- Asset status derives correct states from manifest/cache records.
- Chunk planning rejects files over the host limit.
- Repair chooses only missing or corrupt chunks.
- Clear cache invokes all expected cache deletion paths.
- Base-aware URL helpers support root and subpath deployments.

Browser verification:

- Build chunked assets.
- Serve the app locally.
- Compile a sample resume from an empty browser cache.
- Refresh and compile again using cached assets.
- Simulate offline mode after Prepare offline PDF compiler.
- Clear cache and confirm the next compile redownloads assets.
- Verify at least one GitHub Pages-style subpath URL.

## Non-Goals

- Do not build a server-side PDF compiler.
- Do not use R2, S3, or another object store for the default chunked path.
- Do not auto-download 649 MB on page load.
- Do not patch BusyTeX generated package loaders unless Service Worker interception proves unworkable.
- Do not make the whole FitCV app offline-first as part of this change; this design focuses on offline-capable PDF compilation assets.

## Open Risk

The main technical risk is whether the Service Worker reliably intercepts BusyTeX worker requests for virtual `.wasm` and `.data` files across supported browsers. The implementation should prove this early with a small browser test before polishing UI. If this fails, the fallback is to route BusyTeX through a controlled virtual base path or patch generated loader URLs during `busytex:chunk`.
