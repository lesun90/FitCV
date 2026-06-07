# FitCV

FitCV is a local-first resume workbench. Milestone 1 ships a browser app for creating, importing, editing, checking, compiling, previewing, and exporting resumes without login or server-side resume storage.

## Quick Start

FitCV currently uses Node.js with npm and a committed `package-lock.json` as its project runtime standard.

```bash
npm install
npm run dev
```

Open `http://localhost:1512`.

The dev server binds to `0.0.0.0` by default, so other machines on your network can reach it at `http://<your-lan-ip>:1512`. If a connection from another machine times out, allow the port through your firewall, e.g. on Ubuntu:

```bash
sudo ufw allow 1512/tcp
```

Set `FITCV_HOST=127.0.0.1` to restrict the server to localhost only.

## Local Docker Runtime

FitCV can run as a single Docker Compose service for local development:

```bash
docker compose up
```

Default URL: `http://localhost:1512`

Default variables:

- `FITCV_HOST=0.0.0.0` inside Docker so Vite is reachable from the host.
- `FITCV_PORT=1512` for the container and host port.
- `FITCV_USE_POLLING=true` so file watching works through mounted volumes.

Use another port when `1512` is busy:

```bash
FITCV_PORT=5174 docker compose up
```

Useful commands:

```bash
docker compose up --build      # rebuild image and start
docker compose build           # rebuild without starting
docker compose logs -f app     # follow app logs
docker compose down            # stop containers
docker compose down -v         # also remove dependency cache volumes
```

Dependency refresh:

```bash
docker compose down -v
docker compose build --no-cache
docker compose up
```

Live reload uses the source mount plus Vite file watching. On macOS, Windows, and WSL, keep `FITCV_USE_POLLING=true` if host file changes are not detected. On Linux you can try `FITCV_USE_POLLING=false docker compose up`.

Clearing Docker volumes does not clear resume data because FitCV stores working resumes in browser IndexedDB. To clear local FitCV data, use your browser site settings for `localhost:1512` and clear site data/storage. In Chrome and Edge this is under DevTools Application > Storage; in Firefox use Settings > Privacy & Security > Cookies and Site Data or DevTools Storage.

## Privacy Boundaries

- No login, hosted account, backend database, or object store is created.
- Docker only serves the browser app and caches dependencies.
- Resume records, imported PDF text, generated artifacts, and `.fitcv` backups stay in browser storage or user-downloaded files.
- API keys are not requested, stored, imported, or exported in milestone 1.
- Browser PDF generation and preview run client-side; Docker does not receive private resume contents beyond serving app files.

## Milestone 1 Features

- Resume library with create, duplicate, delete, rename, open, PDF import, `.fitcv` import, and `.fitcv` export.
- IndexedDB persistence with schema-versioned records.
- Two curated templates with compatibility checks and unsupported-field preservation.
- Structured editor for profile, summary, skills, and repeatable experience entries.
- Browser-only PDF generation, preview, compile logs, stale state, and PDF export.
- Deterministic ATS/readability checks with field references.

## ATS Readiness

ATS Readiness estimates whether a resume can be parsed cleanly by Applicant Tracking Systems. The check is deterministic and runs locally. No AI is involved.

Current methodology: `ats-deterministic-v2`

**Scoring model.** FitCV starts at 100 and subtracts weighted penalties for parser risks. The result clamps to 0-100. A missing name blocks PDF compilation entirely.

Each issue reports an ID, affected field, severity (`info` / `medium` / `high`), and penalty.

### Contact Extraction

ATS parsers need obvious contact fields near the top of the resume.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `missing-name` | -30 | high | `content.profile.fullName` is empty |
| `missing-email` | -15 | medium | `content.profile.email` is empty |
| `missing-phone-or-location` | -6 | medium | Phone and location are both empty |
| `unclear-link` | -8 | medium | A profile link is neither a URL nor a recognizable domain |
| `hidden-contact-field` | -8 | medium | Email, phone, location, or links are hidden from the rendered resume |

### Section Anchors

ATS parsers depend on familiar section headings. FitCV recognizes standard anchors for Experience, Skills, Education, Projects, Research, and Publications.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `missing-experience-section` | -18 | high | No visible section matches Experience or Employment |
| `missing-skills-section` | -12 | medium | No visible section matches Skills, Technical Skills, Core Skills, or Technologies |
| `missing-supporting-section` | -8 | medium | No Education, Projects, Research, or Publications section exists |
| `nonstandard-section-heading` | -6 each | medium | A visible section uses a non-standard anchor or a risky label such as `MY JOURNEY`, `THE TOOLKIT`, `ABOUT ME`, or `WHAT I DO` |
| `empty-section` | -8 each | medium | A visible section has fewer than 12 characters of parseable text |

### Content Structure

These checks catch resumes that appear complete but still parse poorly.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `placeholder-text` | -18 | high | Template placeholders remain, such as `Lorem ipsum`, `Company Name`, `Tool A`, `Month Year`, or `First Last` |
| `thin-bullet-structure` | -10 | medium | Experience exists but has fewer than two substantial bullet lines (a substantial bullet has at least four words) |
| `unclear-date-format` | -8 | medium | A date field uses vague text such as `Summer '23`, or lacks a recognizable year, month/year, or present value |
| `long-summary` | -10 | medium | Summary exceeds 700 characters |

### PDF Text Smoke Test

FitCV checks generated PDF text when available to confirm key content survives export.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `pdf-text-not-tested` | -8 | medium | The current resume version has no generated text extraction result |
| `pdf-text-present` | 0 | info | Generated text exists and includes enough key resume content |
| `pdf-text-missing-key-content` | -16 | high | Generated text exists but is missing key content such as name, email, section labels, or early section text |

### Scope

ATS Readiness does not score writing quality, keyword match, candidate fit, or how any specific ATS vendor ranks the resume. Use CV Quality Readiness for writing quality. Use JD Match Readiness when a job description is available.

## Deploying to Cloudflare Pages

FitCV is a static, client-only SPA (`npm run build` emits a self-contained `dist/`), so it deploys to Cloudflare Pages without any server-side configuration. There is one wrinkle: the in-browser LaTeX engine's assets are too large to ship as part of a Pages deployment and must be hosted separately.

### 1. Connect the Pages project (dashboard)

In the Cloudflare dashboard, create a Pages project from this Git repository and set:

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 22 (matches the Dockerfile's `node:22-bookworm-slim`; set via the `NODE_VERSION` build environment variable if Pages doesn't detect it)

Do **not** add `npm run busytex:assets` to the build command (see below) — the Pages build should remain just `npm run build`.

### 2. Why the BusyTeX assets can't ship with the Pages deploy

PDF compilation runs entirely in the browser via [BusyTeX](https://www.npmjs.com/package/texlyre-busytex), a WASM LaTeX engine. `npm run busytex:assets` downloads its compiler binary and TeX Live package data into `public/core/busytex/` (~649MB total), and `src/services/latexCompiler.ts` fetches them at runtime from a configurable base path (`VITE_BUSYTEX_BASE_PATH`, default `/core/busytex`).

Cloudflare Pages rejects any deployed file larger than 25MB. Several BusyTeX assets exceed that by a wide margin:

| File | Size |
| --- | ---: |
| `texlive-extra.data` | ~324MB |
| `texlive-recommended.data` | ~191MB |
| `texlive-basic.data` | ~87MB |
| `busytex.wasm` | ~31MB |

These files cannot be bundled with the static site. The good news: `public/core/busytex/` is already gitignored and is only generated by explicitly running `npm run busytex:assets`, so a fresh Pages checkout followed by `npm run build` produces a small `dist/` automatically — as long as the asset-download step is never added to the Pages build pipeline.

### 3. Host the BusyTeX assets on Cloudflare R2

Host the assets yourself and point the app at them via `VITE_BUSYTEX_BASE_PATH`:

1. Generate the assets locally: `npm run busytex:assets` (writes to `public/core/busytex/`).
2. Create an R2 bucket (e.g. `fitcv-busytex`) and upload everything in `public/core/busytex/` to it, preserving the directory layout.
3. Enable public access on the bucket — either the R2.dev public bucket URL or, preferably, a custom domain/route so the assets are served from your own domain.
4. Add CORS rules to the bucket allowing `GET` requests (and the `Range` header) from your Pages domain, so the browser can fetch the `.wasm`, `.data`, and `.js` files cross-origin.
5. Set generous `Cache-Control` headers (e.g. `public, max-age=31536000, immutable`) — these files are large, versioned, and effectively static per `texlyre-busytex` release.

**Keeping R2 in sync with `texlyre-busytex` upgrades:** the runner code and the downloaded data packages must match. When bumping the `texlyre-busytex` dependency, re-run `npm run busytex:assets`, diff the new `public/core/busytex/versions.txt` against what's already in R2, and re-upload any changed files *before* deploying the new build — otherwise the deployed runner may request package data the hosted bucket doesn't have (or has in a stale format), breaking PDF compilation silently in production.

### 4. Point the build at the hosted assets

In the Pages project's build environment variables, set:

```
VITE_BUSYTEX_BASE_PATH=https://<your-r2-public-domain>/busytex
```

Vite inlines this at build time, so `src/services/latexCompiler.ts` will fetch the compiler and TeX Live packages from R2 instead of `/core/busytex` on the deployed site.

### 5. Verify the deployed app

After the first deploy:

- Open the deployed URL, start a compile, and confirm `checkLatexCompilerCacheState()` reports `cached` or `offline-ready` rather than `not-ready`/`download-failed` (visible in the compiler status UI).
- Compile a sample resume to PDF end-to-end and confirm the exported PDF renders correctly.
- Check the browser network tab to confirm `busytex.wasm` and the `texlive-*.data`/`.js` files load from your R2 domain, not a 404 against the Pages domain.

## Verification

```bash
npm test
npm run build
```
