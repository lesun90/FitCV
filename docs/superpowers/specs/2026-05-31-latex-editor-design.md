# Standalone LaTeX Editor Design

## Summary

FitCV will add a standalone LaTeX workbench at `/latexeditor`. It is not linked from the main FitCV navigation in the first release. The tool lets a user open a bundled template project or a user-owned local LaTeX folder, edit source files, compile locally in the browser, preview the generated PDF, and inspect compile logs.

The compiler decision is shared infrastructure for FitCV and the standalone editor: use TeXlyre BusyTeX as a browser-side WebAssembly compiler. User project files never leave the browser. Compiler runtime and TeX package assets may be downloaded from configured static asset URLs and cached locally for later compiles.

## Goals

- Provide an Overleaf-like local editor for LaTeX resume projects.
- Compile real multi-file LaTeX projects in the user's browser.
- Establish the same compiler path FitCV will use for bundled and custom LaTeX templates.
- Ship an app-owned template project at `src/latex-templates/awesome-resume/`.
- Keep the experience private, local-first, and visually consistent with FitCV's editor.

## Non-Goals

- No server-side compile service.
- No collaborative editing.
- No account system.
- No cloud project storage.
- No mutation of bundled template source files at runtime.
- No full offline asset bundle in the first version.

## Compiler Model

FitCV will wrap TeXlyre BusyTeX behind a shared compiler service. The service runs in a Web Worker so large WASM initialization and compile work do not block the UI thread.

The first implementation should default to XeTeX because resume templates commonly need UTF-8 and font support. The compiler boundary should keep room for pdfTeX and LuaTeX as future selectable engines.

Before implementation, the exact TeXlyre BusyTeX package, release, or vendored asset set must pass a license review. The implementation plan must record the selected package, version or commit, license, transitive license notes, and any attribution or source distribution obligations. If the chosen TeXlyre BusyTeX wrapper creates unacceptable license obligations for FitCV, implementation must stop and choose a compatible BusyTeX distribution strategy before shipping compiler code.

The compiler service accepts:

- Project file map.
- Main `.tex` file path.
- Engine.
- Compile options.

It returns:

- Compile status.
- PDF blob when successful.
- Raw logs.
- Parsed diagnostics when available.
- Timing and cache metadata.

## Privacy And Offline Policy

The first release uses private local compile with package download and cache:

- User LaTeX source files, images, class files, style files, and bibliography files stay in the browser.
- The app may download BusyTeX runtime assets and TeX package bundles from configured static URLs.
- Asset requests must not include project source content.
- On-demand package fetching may reveal requested runtime or package names to the static asset host. The UI privacy copy must state this plainly.
- Downloaded compiler/package assets are cached with browser storage for faster future compiles.
- The UI must distinguish `not ready`, `downloading`, `cached`, `offline-ready`, and `download failed` compiler states.

A strict self-hosted/offline asset bundle is out of scope for the first version.

## Project Ownership

There are two project sources.

Bundled templates are app-owned, read-only, and versioned with FitCV. The first bundled template lives at:

```text
src/latex-templates/awesome-resume/
```

User projects are user-owned local folders opened through the browser File System Access API when available. The app stores only permission handles and metadata in IndexedDB by default.

Opening the bundled `awesome-resume` project in `/latexeditor` is read-only. To edit it, the user duplicates it into a local project folder. This avoids app updates overwriting user edits and keeps the bundled template canonical.

FitCV will use the same project model in follow-up work:

- Compile directly from bundled templates and generated resume data.
- Link a user-owned local LaTeX project as a custom template.
- Imported IndexedDB snapshots are out of scope for the first version.

## Bundled Template Loading

Bundled templates live under `src/latex-templates/`, but the browser must not depend on runtime directory enumeration. Vite should load bundled template files through an explicit manifest or an `import.meta.glob`-based loader.

The bundled-template loader must expose:

- Template ID.
- Display name.
- Root path.
- Main file candidate.
- Text files as strings.
- Binary assets as `Uint8Array` or `ArrayBuffer`.
- Read-only project flag.

The first template manifest entry is `awesome-resume`, rooted at `src/latex-templates/awesome-resume/`. The loader must include `.tex`, `.cls`, `.sty`, `.bib`, images, fonts, and other template assets needed to compile the fixture. It must exclude source-control metadata and generated build outputs.

## Route And App Shell

The route is:

```text
/latexeditor
```

It is standalone and not reachable from main FitCV navigation in the first version.

The launcher state offers:

- Open local folder.
- Open Awesome Resume template.
- Recent projects when permission handles are still valid.
- Compiler cache status.

## User Experience

The workbench follows the screenshot's familiar editor shape: file tree, code editor, PDF preview, compile controls, and logs. It should feel like FitCV's more technical sibling rather than a separate product.

Use the FitCV editor design language:

- Warm off-white workspace for document surfaces and empty states.
- Charcoal text and restrained neutral borders.
- Thin dividers, quiet shadows, exact spacing.
- PDF preview as the visual hero.
- Compact controls and icon-first buttons.
- No bright SaaS gradients, neon, glassmorphism, or decorative blobs.


## Core Components

Top bar:

- Project/template name.
- Main file selector.
- Engine selector.
- Compile status.
- Compile button.
- Download PDF button.

File tree:

- Folder/file hierarchy.
- Read-only indicator for bundled templates.
- Dirty markers for editable files.
- Active file state.

Editor pane:

- CodeMirror-based LaTeX editing.
- Tabs for open files.
- Dirty state.
- Save status.
- Basic search.

Preview pane:

- PDF preview.
- Empty, loading, success, and failed states.
- Previous successful PDF remains visible after failed compiles.
- Logs drawer or panel.

Compiler/cache status:

- Shows whether BusyTeX assets are missing, downloading, cached, offline-ready, or failed.
- Provides retry when asset download fails.

## Main File Detection

When a project opens, the app should detect likely entry files in this order:

1. `main.tex`
2. `resume.tex`
3. Root-level `.tex` files that contain `\documentclass`
4. Any `.tex` file that contains `\documentclass`

If detection finds multiple candidates, the user chooses the main file before compile. If no candidate is found, compile is blocked and the UI asks the user to select a `.tex` file.

## Compile Flow

1. User opens bundled `awesome-resume` or a local folder.
2. Project loader builds a file tree and in-memory file map.
3. Main file is detected or selected.
4. On manual compile or debounced live compile, the app sends file map, main file, engine, and options to the BusyTeX worker.
5. Worker ensures required compiler/package assets are available or downloads and caches them.
6. Worker writes project files into BusyTeX's virtual filesystem.
7. Worker runs compile.
8. Worker returns PDF, logs, diagnostics, status, and timings.
9. UI updates preview, logs, compile status, and artifact metadata.

Live compile should debounce source edits by roughly 800-1200ms. Manual compile remains available at all times.

## Save Semantics

The editor keeps an in-memory working copy for every open project.

Compile always uses the current in-memory working copy, including unsaved edits. This keeps live compile responsive and avoids forcing disk writes on every keystroke.

Bundled templates are read-only:

- Editing controls are disabled until the user duplicates the template into a local project.
- Compile is allowed from the bundled in-memory file map.
- Save is unavailable.

Local folder projects are editable:

- Edits mark files and the project as dirty.
- Manual save writes dirty files back through the File System Access API.
- Save failures keep dirty state visible and show the affected path.
- Closing, refreshing, or switching projects with unsaved edits prompts the user before discarding them.
- Auto-save is out of scope for the first version.

## Project File Scope

Project loading must avoid pulling unnecessary or dangerous file sets into the browser compiler.

Default ignored paths:

- `.git/`
- `.svn/`
- `.hg/`
- `node_modules/`
- `dist/`
- `build/`
- `.cache/`
- `.DS_Store`
- Common TeX build outputs such as `.aux`, `.log`, `.out`, `.toc`, `.synctex.gz`, `.fls`, and `.fdb_latexmk`

Supported text source files include `.tex`, `.cls`, `.sty`, `.bib`, `.bst`, `.cfg`, `.def`, `.md`, `.txt`, and `.yaml`/`.yml`.

Supported binary assets include common image and font files such as `.png`, `.jpg`, `.jpeg`, `.pdf`, `.svg`, `.eps`, `.ttf`, `.otf`, and `.woff`/`.woff2`. Binary files are not opened in the text editor in the first version, but they are included in the compiler file map when they are inside the loaded project and below size limits.

Initial size limits:

- Warn before loading projects above 100 MB.
- Refuse individual files above 25 MB unless they are explicitly allowed by the user.
- Show skipped paths and reasons in a project-load report.

## Error Handling

Missing main file:

- Show the main-file selector.
- Block compile until a valid `.tex` file is selected.

Compile failure:

- Keep the previous successful PDF visible.
- Mark status as failed.
- Show logs and diagnostics.

Missing package or asset download failure:

- Explain that compiler assets could not be downloaded.
- Provide retry.
- State that source files stayed local.

Lost folder permission:

- Prompt the user to reopen the folder.
- Preserve project metadata and recent-file state where possible.

Unsupported browser file access:

- Bundled read-only templates still work.
- Local folder editing is unavailable in the first version.
- Folder upload and ZIP fallback are out of scope for the first version.

Unreadable file:

- Show the path and reason.
- Continue loading other readable files where possible.

## Data Storage

IndexedDB stores:

- Recent project metadata.
- File System Access handles where supported.
- Selected main file.
- Engine preference.
- Last opened files.
- Last compile status and logs.
- Recent generated PDF artifact metadata.

Cache Storage or IndexedDB stores:

- BusyTeX runtime assets.
- TeX package bundles.
- Compiler cache metadata.

Bundled templates stay in app source and are not rewritten by the browser.

## Testing

Unit tests:

- Bundled-template manifest or `import.meta.glob` loader.
- Main-file detection.
- File tree building.
- Read-only versus editable project state.
- Dirty state.
- Save request shape and save failure handling.
- Ignored-path and size-limit filtering.
- Compile request shape.
- Project metadata persistence.

Worker-wrapper tests:

- Mock BusyTeX adapter initialization.
- Successful compile result.
- Failed compile result.
- Asset download/cache status transitions.
- Privacy-safe package/runtime asset request construction.

UI tests:

- Open bundled `awesome-resume`.
- Verify bundled template read-only state.
- Start duplicate-to-local-project flow.
- Open local project metadata.
- Compile from unsaved in-memory edits.
- Save local edits and surface save failures.
- Compile loading, success, and failure states.
- Log visibility.
- Download button availability.

Fixture compile smoke test:

- Compile `src/latex-templates/awesome-resume/` with BusyTeX once compiler assets are wired.

## Version-One Decisions

- Runtime assets should come from a pinned TeXlyre BusyTeX package or release. If the implementation cannot consume the package directly, the release assets should be vendored under `public/vendor/busytex/` and served as static files by Vite.
- The selected BusyTeX distribution must pass license review before implementation proceeds.
- Browsers without File System Access API support can open bundled read-only templates but cannot edit local folders in the first version.
- When FitCV compiles structured resume data through a LaTeX template project, it should generate `fitcv-data.tex` at the project root. Templates include that file and treat it as the boundary between structured FitCV data and user-owned template layout.
