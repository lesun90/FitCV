# Milestone 1.1: Docker Compose Local Runtime

## Goal

After milestone 1, make FitCV easy to run locally with Docker Compose while preserving the same privacy and local-first guarantees as the hosted app.

## Scope

- `docker compose up` starts the FitCV browser app on localhost.
- Live reload works while developing.
- Source code changes trigger rebuild or browser reload without manually restarting the container.
- Default ports and environment variables are documented.
- Browser-only LaTeX compilation remains the PDF path.
- Docker does not store user resume data on a FitCV server.

## Non-Goals

- Adding a backend database.
- Adding login, hosted user accounts, or server-side resume storage.
- Moving PDF compilation, PDF parsing, or AI calls into a FitCV server container.
- Persisting browser resume data in Docker volumes.
- Replacing the normal hosted/static build path.

## User Workflows

1. User clones the repository.
2. User runs `docker compose up`.
3. User opens the documented localhost URL.
4. User creates or imports resumes with data stored locally in the browser.
5. Developer edits code and sees the running app update through live reload.

## Delivery Sequence

1. Add a `Dockerfile` for the FitCV web app development server.
2. Add `compose.yaml` with one app service, source mounting, dependency caching, and documented port mapping.
3. Ensure the dev server binds to `0.0.0.0` inside the container and prints the localhost URL.
4. Configure file watching so host edits reload the browser from inside Docker.
5. Add environment variable defaults and a documented port override path.
6. Document start, stop, rebuild, logs, dependency refresh, and browser data clearing commands.
7. Verify privacy boundaries against milestone 1 behavior.

## Runtime Requirements

- The app must run without login or cloud setup.
- The local runtime must not require a FitCV backend database.
- Browser-local storage remains the working user data store.
- API keys remain opt-in browser-local settings and are not stored in Docker volumes by FitCV.
- Browser-only LaTeX compilation is used; Docker serves/builds the app but does not compile private resumes on a server.
- The setup must work for a private self-hosted workflow as well as development.

Container shape:

- One web app service is enough for milestone 1.1.
- The container installs and runs frontend dependencies.
- Source code is mounted read/write for development.
- Dependency directories may use Docker-managed cache volumes, but resume data must stay in browser storage.
- The app service exposes only the web dev port unless the project later adds an explicit local-only helper service.

Environment:

- `FITCV_HOST` defaults to `0.0.0.0` inside Docker.
- `FITCV_PORT` or the framework-equivalent port variable defaults to the documented localhost port.
- Any public app configuration uses non-secret environment variables.
- API keys are not provided through Compose by default.

## Developer Experience Requirements

- One command starts the app: `docker compose up`.
- Logs show the local URL.
- File watching works for app source files.
- Dependency installation is handled inside the container or documented clearly.
- Port conflicts have a documented override path.
- The README explains how to stop containers and clear local browser data.

Documentation requirements:

- Add a "Local Docker Runtime" section to the README or equivalent getting-started doc.
- Document the default URL, default port, override command, and supported Docker Compose version.
- Explain that clearing Docker volumes does not clear browser IndexedDB data.
- Provide browser-specific guidance for clearing local FitCV data.
- Explain when to use `docker compose build`, `docker compose up --build`, and dependency reinstall commands.
- Include troubleshooting notes for file watching on Linux, macOS, Windows, and WSL where relevant.

## Privacy Requirements

- Compose does not create a database, object store, or server volume for resume content.
- Docker logs do not print resume contents, extracted PDF text, API keys, or `.fitcv` archive contents.
- Browser-only LaTeX compilation remains unchanged from milestone 1.
- Imported PDFs and generated PDFs remain browser artifacts unless the user downloads or exports them.
- If a future helper service becomes necessary, it must be documented as local-only and must not receive private resume data without a separate milestone.

## Verification Plan

- Fresh checkout: `docker compose up` starts the app and prints the documented URL.
- Browser smoke test: create a resume, reload the page, and confirm data persists through browser storage.
- Live reload test: edit a visible source file and confirm the browser updates without restarting Compose.
- Privacy check: inspect Compose services and volumes for absence of databases or resume-data mounts.
- Port override test: run the app on a non-default port and open the documented URL.
- Stop/cleanup check: verify the documented stop command works and the browser-data clearing guidance is accurate.

## Acceptance Criteria

- A fresh checkout can start FitCV locally with `docker compose up`.
- The app is reachable at a documented localhost URL.
- Editing source code triggers live reload.
- User resume data remains in browser storage.
- No login, backend account, or server-side user data storage is introduced.
