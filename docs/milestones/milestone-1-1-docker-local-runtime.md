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

## User Workflows

1. User clones the repository.
2. User runs `docker compose up`.
3. User opens the documented localhost URL.
4. User creates or imports resumes with data stored locally in the browser.
5. Developer edits code and sees the running app update through live reload.

## Runtime Requirements

- The app must run without login or cloud setup.
- The local runtime must not require a FitCV backend database.
- Browser-local storage remains the working user data store.
- API keys remain opt-in browser-local settings and are not stored in Docker volumes by FitCV.
- Browser-only LaTeX compilation is used; Docker serves/builds the app but does not compile private resumes on a server.
- The setup must work for a private self-hosted workflow as well as development.

## Developer Experience Requirements

- One command starts the app: `docker compose up`.
- Logs show the local URL.
- File watching works for app source files.
- Dependency installation is handled inside the container or documented clearly.
- Port conflicts have a documented override path.
- The README explains how to stop containers and clear local browser data.

## Acceptance Criteria

- A fresh checkout can start FitCV locally with `docker compose up`.
- The app is reachable at a documented localhost URL.
- Editing source code triggers live reload.
- User resume data remains in browser storage.
- No login, backend account, or server-side user data storage is introduced.
