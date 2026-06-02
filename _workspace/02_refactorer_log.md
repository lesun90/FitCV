# Refactorer Log

## Changes Applied

### src/ui/App.tsx
- **Priority 1 — importArchive robustness:** wrapped the `importArchive` body in try/catch/finally so a malformed `.fitcv` no longer leaves `busy` stuck on "Importing archive". Errors now surface via `setError` and `busy` is cleared in `finally`, matching the existing `importPdf`/`compile` pattern.
- **Priority 1 — dead props:** removed unused `checks` and `warningCount` from `EditorWorkspace` (prop destructuring, prop type, and the call site). They were only read by the dashboard/MiniPaper, never inside `EditorWorkspace`.
- **Priority 1 — unused param:** dropped the `active` parameter from `renderLayoutControlEditor` (never read) and updated its single call site.
- **Priority 2 — dead function:** deleted the unused `patch` helper.
- **Priority 2 — non-functional Settings button:** removed the `<button className="chrome-icon" aria-label="Editor settings"><Settings /></button>` (no onClick) and the now-unused `Settings` lucide import.
- **Priority 3 — magic constants / duplication:** imported `clampSpaceValue`, `defaultSpaceValue`, `MIN_SPACE_VALUE`, `MAX_SPACE_VALUE` from templateAdapters and replaced the hard-coded `12`/`0`/`96` literals and the inline re-implementation of the clamp in `renderLayoutControlEditor` and `addLayoutControlModule`.

### src/ui/LatexEditorRoute.tsx
- **Priority 2 — unused import:** removed `type ReactNode` (TS6133).

### src/domain/templateAdapters.ts
- **Priority 2 — unused import:** removed `TemplateId` from the type import (kept `TemplateKey` etc.).
- **Priority 3 — duplicate helper:** deleted the local `visibleProfileHighlights` and imported the now-shared version from `./latex`.
- **Priority 3 — exported constants/clamp:** promoted `defaultSpaceValue` to `export`, added `export const MIN_SPACE_VALUE = 0` / `MAX_SPACE_VALUE = 96`, and exported `clampSpaceValue` (now expressed in terms of the named bounds). Behavior identical (same 0/96 bounds, same rounding).

### src/domain/latex.ts
- **Priority 3 — shared helper:** changed `visibleProfileHighlights` to `export const`. Placed here (not resume.ts) because latex.ts sits below templateAdapters.ts in the import graph (templateAdapters → latex, and resume → templateAdapters), so exporting from latex.ts avoids the circular import that resume.ts would have created.

### src/ui/styles.css
- **Priority 2 — orphaned classes (verified individually as zero-reference in src/*.tsx):** removed the paper/preview-preview-panel cluster (`.preview-head`, `.preview-toolbar`, `.resume-paper`, `.paper-header`, `.paper-contact`, `.paper-content-section`, `.selectable` combinators, `.paper-list`, `.compact-list`, `.paper-role-block`, `.paper-role-head`, `.paper-role-sub`) including their responsive `@media` overrides; the removed style-controls cluster (`.template-switcher`, `.swatches`, `.design-card-head`, `.control-row`, `.stepper`, `.stepper-unit`, `.unit`); `.log-block-compiling`; `.compile-action`; and all `.chrome-icon` rules (orphaned after the Settings button removal). Also removed the bare `.module-name` and `.module-row.hidden .module-name` rules (only `.module-name-input` is referenced). `.chrome-icon`/`.paper-contact svg` entries were stripped from shared grouped selectors while preserving the surviving members.
- Kept `.preview-pane`, `.paper-role`, `.design-card`, `.module-card`, `.module-name-input` — all confirmed still referenced.

## Skipped
- Priority 3 — `<ItemCardHead>` / `<ListSection>` extraction and `ProfileTextField`/`ProfileNestedTextField` unification — component restructuring with real behavioral surface; beyond "clearly non-behavioral" cleanup.
- Priority 4 — all file-splitting (Dashboard.tsx, sectionEditors.tsx, StylePanel.tsx, PreviewPanel.tsx, layoutModules.ts) — per the working order, skipped for now.
- `latexCompiler.ts:168` `texmflog` cast — analyst said "worth a comment, not a fix"; no behavioral change requested, left as-is.
- Entire analyst skip list untouched (`renderLatexSource`, structured-PDF fallback, StylePanel non-adapter branch, `validateTemplateRegistry`, `busyTexLicenseReview`, `ReviewMarker.sourceSnippet`, the necessary `as` casts, etc.).

## TypeScript check result
PASS — `npx tsc --noEmit` exits 0 after every file change and at the end.

## Test result
PASS — `npx vitest run`: 12 files, 50 tests passed.
