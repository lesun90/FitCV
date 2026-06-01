# FitCV

FitCV is a local-first resume workbench. Milestone 1 ships a browser app for creating, importing, editing, checking, compiling, previewing, and exporting resumes without login or server-side resume storage.

## Quick Start

FitCV currently uses Node.js with npm and a committed `package-lock.json` as its project runtime standard.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Local Docker Runtime

FitCV can run as a single Docker Compose service for local development:

```bash
docker compose up
```

Default URL: `http://localhost:5173`

Default variables:

- `FITCV_HOST=0.0.0.0` inside Docker so Vite is reachable from the host.
- `FITCV_PORT=5173` for the container and host port.
- `FITCV_USE_POLLING=true` so file watching works through mounted volumes.

Use another port when `5173` is busy:

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

Clearing Docker volumes does not clear resume data because FitCV stores working resumes in browser IndexedDB. To clear local FitCV data, use your browser site settings for `localhost:5173` and clear site data/storage. In Chrome and Edge this is under DevTools Application > Storage; in Firefox use Settings > Privacy & Security > Cookies and Site Data or DevTools Storage.

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

## Verification

```bash
npm test
npm run build
```
