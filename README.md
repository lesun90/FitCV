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

## Verification

```bash
npm test
npm run build
```
