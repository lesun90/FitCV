# Milestone 1: Local Resume Workbench And Browser PDF

## Goal

Build the usable FitCV foundation without requiring AI. Users can create base resumes, edit structured fields in a polished workbench, switch LaTeX layouts without data loss, compile PDFs in the browser, export PDFs, and back up local data.

## Scope

- Local-first dashboard for resume library actions.
- Base resume creation, duplicate, delete, rename, and open.
- Upload existing CV from PDF files with extractable text.
- Deterministic PDF text extraction into structured editor fields.
- IndexedDB persistence for resumes, editor preferences, compile state, and local artifacts.
- Portable `.fitcv` archive import and export.
- Magic-Resume-inspired editor workbench with FitCV's own design language.
- Manual template schemas for at least two curated LaTeX templates.
- Layout switching without data loss.
- Browser-only LaTeX compilation.
- PDF preview, compile logs, stale-state handling, and PDF export.
- Deterministic ATS and template compatibility checks.

## Non-Goals

- Login, cloud sync, accounts, or a FitCV-hosted user database.
- AI polish, AI extraction cleanup, AI scoring, or fit-to-job-description workflows.
- DOCX, Markdown, plain text, OCR, scanned PDF, or image-based resume import.
- Template authoring tools or marker-assisted schema generation.
- Server-side resume parsing or server-side PDF compilation.
- Collaborative editing or multi-device conflict resolution.

## User Workflows

1. User opens FitCV from localhost or hosted website.
2. User creates a base resume from a curated template or uploads an existing CV.
3. If a CV is uploaded, FitCV extracts structured fields and marks them as needing review.
4. User edits structured fields in the workbench.
5. User reorders sections, hides sections, and adds custom fields.
6. User switches templates and sees which fields are not shown.
7. User compiles the PDF in the browser.
8. User views compile logs if compilation fails.
9. User exports the PDF or a `.fitcv` backup.
10. User imports a `.fitcv` backup later and resumes editing.

## Delivery Sequence

1. Establish the application shell, routes, responsive layout, and local-first privacy copy.
2. Implement the IndexedDB data layer, schema versioning, and migration entry point.
3. Build the resume library dashboard with create, duplicate, delete, import, export, and open flows.
4. Define the normalized resume model and seed sample resumes for development.
5. Add manual template registry support with two browser-compatible curated templates.
6. Build the desktop and mobile workbench around the active resume and template schema.
7. Implement template switching, unsupported-field preservation, and visibility controls.
8. Add deterministic PDF text extraction and needs-review metadata.
9. Wire browser LaTeX rendering, preview, logs, stale state, and export.
10. Add deterministic ATS and template checks.
11. Cover the main flows with fixtures and browser-level smoke tests.

## UX Requirements

Desktop workbench:

- Top header with editable resume title, local save state, backup/export action, and PDF export.
- Left layout/style panel for section order, visibility, template settings, color, typography, spacing, and page padding.
- Center edit panel for the active section.
- Right PDF preview panel with compile state and logs.
- Floating dock for template switching, compile/export, ATS/readability checks, and panel visibility.

Mobile workbench:

- Bottom tabs: **Content**, **Style**, **Preview**.
- Content tab includes horizontal section navigation.
- Preview tab shows compile status and PDF preview.

Editor interactions:

- Repeatable items appear as compact cards that expand for editing.
- Drag handles reorder sections and repeatable items.
- Visibility toggles hide content without deleting it.
- Imported fields show needs-review markers until confirmed or edited.
- Delete actions require confirmation for destructive data.
- Rich text fields support bullet lists, links, bold, italic, and undo/redo where template-safe.

Dashboard:

- Resume cards show title, active template, last updated time, compile status, and review status.
- Primary actions include create, upload PDF, import `.fitcv`, duplicate, delete, and open.
- Empty state offers template-based creation and PDF upload without implying that cloud storage exists.
- Delete, overwrite, and failed import flows use confirmation or recovery paths.

## Data Requirements

- Resume data is stored separately from template layout and template-specific settings.
- Common fields use a normalized schema.
- Template-specific fields are stored under template namespaces.
- Unsupported fields remain preserved when switching templates.
- Data records include schema version and timestamps.
- `.fitcv` archives include resume data, fitted CV data if present, template references, scoring metadata if present, and optional PDFs.
- Uploaded source files are not retained unless the user explicitly attaches them locally.
- `.fitcv` archives do not include API keys.

Core records:

- `resume`: normalized content, active template ID, section order, visibility settings, custom sections, review metadata, and timestamps.
- `template`: registry entry, schema, render mapping, validation rules, compatibility metadata, and sample fixture reference.
- `compileArtifact`: resume ID, template ID, resume version, status, logs, PDF blob reference, generated text metadata, and timestamps.
- `appPreference`: panel state, theme, recent template choices, and non-secret local settings.
- `importReport`: source type, extraction notes, unsupported content notes, and field-level review markers.

Schema rules:

- Every persisted record includes a `schemaVersion`.
- Migrations are explicit functions with fixture coverage.
- Unknown fields are preserved during import/export and surfaced when they affect the editor or template output.
- API keys are not created, persisted, imported, or exported in milestone 1.

## CV Upload And Extraction

Milestone 1 supports deterministic import for:

- PDF with extractable text.

Extraction maps detected content into the normalized resume model: profile, summary, experience, education, projects, skills, links, awards, and custom sections. Extraction output includes review metadata and unsupported content notes.

DOCX, Markdown, plain text, OCR, scanned PDFs, image-based resumes, and AI-assisted cleanup are out of scope for milestone 1.

Extraction behavior:

- PDF parsing runs in the browser.
- The importer creates a new base resume rather than mutating an existing one.
- Each extracted field stores source snippets when available, confidence or parser notes, and `needsReview`.
- The editor clears `needsReview` when the user confirms or edits a field.
- Unsupported text is kept in import notes so users can copy it manually.
- Import failures explain whether the file lacked extractable text, exceeded a browser limit, or hit an unsupported PDF feature.

## Template Requirements

Each curated template includes:

- LaTeX source bundle.
- Manual editable-field schema.
- Render mapping.
- Supported sections and unsupported field behavior.
- Browser LaTeX compatibility metadata.
- ATS-readability metadata.
- Sample fixture for compile validation.

Milestone 1 uses manual schemas only. Marker-assisted schemas are out of scope.

Minimum template set:

- Ship at least two curated templates with different visual structure.
- Each template compiles from the same normalized sample resume.
- Each template documents fields it supports and fields it intentionally hides.
- Each template has a fixture that validates schema coverage, browser compile compatibility, and PDF text extractability when available.

Template switching behavior:

- Switching templates changes layout controls and render output only.
- Common resume fields remain unchanged.
- Template-specific settings are namespaced by template ID.
- Unsupported fields appear in a "not shown in this template" area with enough context for the user to decide whether to switch templates or leave the data preserved.

## Browser LaTeX Compile Requirements

- Compile happens in the browser.
- Compile status is explicit: clean, compiling, stale, or failed.
- Failed compile shows readable logs and likely causes.
- Export is disabled for failed or incompatible templates.
- The preview indicates when data has changed since the last compile.
- Curated templates must use packages supported by the chosen browser LaTeX engine.

Compile pipeline:

1. Validate resume data against the active template schema.
2. Convert structured fields into escaped LaTeX variables and partials.
3. Run the browser LaTeX engine.
4. Store compile status, logs, generated PDF artifact, and generated text metadata when available.
5. Mark the compile artifact stale when the user changes resume data, template choice, or relevant layout settings.

Failure handling:

- Syntax and unsupported-package errors name the likely template cause.
- Missing required fields name the exact editor field.
- Browser resource failures suggest retrying, closing other tabs, or using a simpler template.
- Export remains disabled until the latest compile for the current resume version succeeds.

## ATS Checks

Milestone 1 includes deterministic checks only:

- Standard section labels.
- Template ATS-readability metadata.
- Excessive formatting warnings.
- Missing required contact fields.
- PDF text extraction check when available.
- Link readability.

AI-based CV quality scoring is out of scope for this milestone.

Check output:

- Each warning includes severity, affected field or template, explanation, and suggested manual fix.
- Checks run against structured data before compile and against generated PDF text when extraction is available.
- Checks do not invent qualitative scores in milestone 1; they report pass, warning, or blocked states.

## Implementation Notes

- Prefer a small browser app with clear module boundaries: storage, import/export, templates, editor state, compile, and checks.
- Keep all private resume data in browser-managed storage or user-exported files.
- Treat `.fitcv` as a versioned archive format, not a raw database dump.
- Use fixtures for sample resumes, sample PDFs with extractable text, template schemas, and compile outputs.
- Keep browser-only limitations visible in UI copy and docs.

## Verification Plan

- Unit tests cover schema validation, migration, template mapping, import/export round trips, unsupported-field preservation, ATS checks, and LaTeX escaping.
- Fixture tests compile each curated template with the sample resume.
- Browser smoke tests cover create, edit, reload, duplicate, delete, upload PDF, import/export `.fitcv`, switch template, compile, preview, and export PDF.
- Privacy checks confirm that no login path, backend account call, API key storage, or server-side resume persistence appears in milestone 1.

## Acceptance Criteria

- A user can create, edit, save, reload, and delete a base resume locally.
- A user can upload a PDF with extractable text and populate the editor with extracted fields.
- Extracted fields are marked as needing review.
- A user can switch between at least two curated templates without losing data.
- Unsupported fields are preserved and surfaced.
- A user can compile and preview a PDF in the browser.
- A user can export a PDF.
- A user can run deterministic ATS/readability checks and see field or template references for warnings.
- A user can export and import a `.fitcv` backup.
- No login or server-side user data storage exists.
- API key storage is not introduced in this milestone.
