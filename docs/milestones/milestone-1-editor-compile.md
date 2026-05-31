# Milestone 1: Local Resume Workbench And Browser PDF

## Goal

Build the usable FitCV foundation without requiring AI. Users can create base resumes, edit structured fields in a polished workbench, switch LaTeX layouts without data loss, compile PDFs in the browser, export PDFs, and back up local data.

## Scope

- Local-first dashboard.
- Base resume creation, duplicate, delete, and open.
- Upload existing CV from PDF, Markdown, or plain text.
- Deterministic extraction into structured editor fields.
- IndexedDB storage.
- Portable `.fitcv` import/export.
- Magic-Resume-inspired editor workbench.
- Manual template schemas.
- Layout switching without data loss.
- Browser-only LaTeX compile.
- PDF preview, logs, and export.
- Deterministic ATS/template checks.

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

## UX Requirements

Desktop workbench:

- Top header with editable resume title, local save state, backup/export action, and PDF export.
- Left layout/style panel for section order, visibility, template settings, color, typography, spacing, and page padding.
- Center edit panel for the active section.
- Right PDF preview panel with compile state and logs.
- Floating dock for template switching, compile/export, score checks, and panel visibility.

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

## Data Requirements

- Resume data is stored separately from template layout.
- Common fields use a normalized schema.
- Template-specific fields are stored under template namespaces.
- Unsupported fields remain preserved when switching templates.
- Data records include schema version and timestamps.
- `.fitcv` archives include resume data, fitted CV data if present, template references, scoring metadata if present, and optional PDFs.
- Uploaded source files are not retained unless the user explicitly attaches them locally.
- `.fitcv` archives do not include API keys.

## CV Upload And Extraction

Milestone 1 supports deterministic import for:

- PDF with extractable text.
- Markdown.
- Plain text.

Extraction maps detected content into the normalized resume model: profile, summary, experience, education, projects, skills, links, awards, and custom sections. Extraction output includes review metadata and unsupported content notes.

DOCX, OCR, and AI-assisted cleanup are out of scope for milestone 1.

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

## Browser LaTeX Compile Requirements

- Compile happens in the browser.
- Compile status is explicit: clean, compiling, stale, or failed.
- Failed compile shows readable logs and likely causes.
- Export is disabled for failed or incompatible templates.
- The preview indicates when data has changed since the last compile.
- Curated templates must use packages supported by the chosen browser LaTeX engine.

## ATS Checks

Milestone 1 includes deterministic checks only:

- Standard section labels.
- Template ATS-readability metadata.
- Excessive formatting warnings.
- Missing required contact fields.
- PDF text extraction check when available.
- Link readability.

AI-based CV quality scoring is out of scope for this milestone.

## Acceptance Criteria

- A user can create, edit, save, reload, and delete a base resume locally.
- A user can upload a text-readable CV and populate the editor with extracted fields.
- Extracted fields are marked as needing review.
- A user can switch between at least two curated templates without losing data.
- Unsupported fields are preserved and surfaced.
- A user can compile and preview a PDF in the browser.
- A user can export a PDF.
- A user can export and import a `.fitcv` backup.
- No login or server-side user data storage exists.
- API key storage is not introduced in this milestone.
