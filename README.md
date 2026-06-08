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

## Deploying Static Hosting

FitCV is a static, client-only SPA. PDF compilation runs in the browser through BusyTeX, whose raw runtime assets are too large for common static-host single-file limits. The deploy path therefore chunks the large BusyTeX files during CI and serves them as ordinary static files.

### GitHub Pages

Use GitHub Pages with a GitHub Actions build so BusyTeX assets are generated and chunked during deployment instead of being committed to the repository.

1. Open the GitHub repository settings.
2. Go to **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Create this workflow file:

```
.github/workflows/deploy-pages.yml
```

5. Set `VITE_BASE_PATH` to the repository path for project pages. For this repo:

```
VITE_BASE_PATH=/FitCV/
```

6. Put this workflow in `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build:chunked
        env:
          VITE_BASE_PATH: /FitCV/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

7. Commit and push the workflow and README changes:

```bash
git add .github/workflows/deploy-pages.yml README.md
git commit -m "docs: add GitHub Pages deploy instructions"
git push
```

8. Open **Actions** in GitHub and wait for **Deploy GitHub Pages** to finish.
9. Open the deployed URL:

```
https://<your-username>.github.io/FitCV/
```

10. In FitCV, click **Prepare** to download the chunked BusyTeX compiler assets into the browser cache.
11. Click **Compile** and confirm PDF generation works.
12. Optional offline check: reload the page, switch the browser offline, and compile again.

If the browser compiler cache gets wedged, click **Clear cache**, then click **Prepare** again.

The generated `dist/core/busytex-chunks/` files are about 16MB each, staying under both GitHub's 100MB git file block and Cloudflare Pages' 25MB file limit. The raw generated folders under `public/core/busytex/` and `public/core/busytex-chunks/` are gitignored.

### Cloudflare Pages

#### 1. Connect the Pages project (dashboard)

In the Cloudflare dashboard, create a Pages project from this Git repository and set:

- **Framework preset**: Vite
- **Build command**: `npm run build:chunked`
- **Build output directory**: `dist`
- **Node version**: 22 (matches the Dockerfile's `node:22-bookworm-slim`; set via the `NODE_VERSION` build environment variable if Pages doesn't detect it)

### Why the BusyTeX assets need chunking

PDF compilation runs entirely in the browser via [BusyTeX](https://www.npmjs.com/package/texlyre-busytex), a WASM LaTeX engine. `npm run busytex:assets` downloads its compiler binary and TeX Live package data into `public/core/busytex/` (~649MB total).

Cloudflare Pages rejects any deployed file larger than 25MB. Several BusyTeX assets exceed that by a wide margin:

| File | Size |
| --- | ---: |
| `texlive-extra.data` | ~324MB |
| `texlive-recommended.data` | ~191MB |
| `texlive-basic.data` | ~87MB |
| `busytex.wasm` | ~31MB |

`npm run busytex:chunk` splits only those large virtual assets into 16MB chunks under `public/core/busytex-chunks/`, removes the raw oversized files from `public/core/busytex/`, and writes a manifest. The generated asset folders are gitignored.

### Runtime install flow

The deployed app includes a Service Worker (`busytex-asset-sw.js`) that serves installed chunked assets back to BusyTeX as if the normal files existed:

```
/core/busytex/busytex.wasm
/core/busytex/texlive-basic.data
/core/busytex/texlive-recommended.data
/core/busytex/texlive-extra.data
```

The browser downloads the chunks only when the user clicks **Compile**, **Prepare**, or **Repair**. **Prepare** installs the full compiler for offline PDF compilation. **Repair** forces a redownload/revalidation. **Clear cache** removes FitCV's compiler asset cache and BusyTeX's Emscripten package cache so the next compile starts fresh.

### Updating BusyTeX

When `texlyre-busytex` changes, regenerate the runtime assets from scratch:

```
npm update texlyre-busytex
npm run busytex:refresh
npm test
```

`busytex:refresh` deletes generated BusyTeX assets, downloads the current package assets, and chunks them again so the manifest version and hashes match the installed dependency.

### Verify the deployed app

After the first deploy:

- Confirm the deployed files under `dist/core/busytex-chunks/` are all below 25MB.
- Open the deployed URL, click **Prepare**, and confirm the compiler assets progress reaches `ready offline`.
- Compile a sample resume to PDF end-to-end and confirm the exported PDF renders correctly.
- Reload, switch the browser offline, and compile again to confirm the offline compiler cache is usable.

## Verification

```bash
npm test
npm run build
```
