# LaTeX Editor Implementation Plan

This implements the standalone `/latexeditor` workbench from `2026-05-31-latex-editor-design.md` as a browser-local template editor shell. The first release lists every bundled LaTeX project under `src/latex-templates/`, opens a selected read-only project, builds a file tree, detects main files, shows source/log/preview panes, and runs compile requests through TeXlyre BusyTeX after AGPL obligations were accepted.

## Scope

- In: `/latexeditor` route, bundled project discovery for all direct children of `src/latex-templates/`, read-only project loading, file filtering, file tree hierarchy, main-file detection, editor/preview/log shell, compiler cache/status UI, TeXlyre BusyTeX wrapper integration, AGPL attribution metadata, tests, template metadata cleanup.
- Out: CodeMirror integration, File System Access API folder editing, disk save semantics, live compile, committed BusyTeX WASM/runtime assets, full offline compiler asset bundle.

## Action Items

- [x] Add tests for LaTeX project path filtering, file classification, main-file detection, file tree building, and `/latexeditor` route rendering.
- [x] Add `src/domain/latexProject.ts` for ignored paths, supported text/binary file kinds, hierarchy building, and main-file candidate detection.
- [x] Add `src/services/latexTemplates.ts` using `import.meta.glob` to discover and load every bundled project under `src/latex-templates/`.
- [x] Add `src/services/latexCompiler.ts` as the shared compiler boundary with accepted BusyTeX AGPL metadata and real BusyTeX wrapper calls.
- [x] Add standalone `/latexeditor` UI in `src/ui/App.tsx` with template browser, top bar controls, file tree, source editor, preview placeholder, logs, and cache/compiler status.
- [x] Add responsive LaTeX workbench styling in `src/ui/styles.css` using FitCV's warm document workspace, compact controls, restrained borders, and accessible focus/contrast.
- [x] Remove nested source-control and agent metadata from the bundled Awesome Resume template.
- [x] Add `npm run busytex:assets` for downloading large BusyTeX runtime assets to ignored local static files.
- [x] Verify with `npm test` and `npm run build`.
