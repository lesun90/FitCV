# Milestone 4: Template Expansion And Customization

## Goal

Expand FitCV beyond curated manual templates by adding marker-assisted schemas, user-uploaded templates, AI-assisted template mapping, and safe customization fields.

## Scope

- Marker-assisted template schemas.
- User template upload.
- Advanced uploaded-CV support for DOCX, Markdown, and plain text import.
- Exploratory browser-compatible OCR or image-based/scanned PDF import.
- AI-assisted mapping from LaTeX to editable fields.
- Template validation fixtures.
- AI-created customization fields.
- Advanced layout and style controls.
- Template compatibility reports.

This milestone must preserve the safety and data ownership rules from earlier milestones.

## Advanced CV Import

Milestone 4 adds DOCX, Markdown, and plain text import. OCR or image-based/scanned PDF import remains exploratory until browser libraries and extraction quality are acceptable. OCR or AI-assisted image extraction must remain user-approved, local-first where possible, and explicit about any content sent to the configured provider.

## Marker-Assisted Schemas

Manual schemas remain canonical, but template authors can add markers to `.tex` files to reduce mapping work. Markers can identify:

- Field insertion points.
- Repeatable sections.
- Optional blocks.
- Style variables.
- Template-specific controls.

FitCV generates or validates a schema from markers, but the final schema remains explicit and inspectable.

## User-Uploaded Templates

Users can upload a LaTeX template bundle. FitCV analyzes browser compile compatibility, required packages, editable fields, and potential ATS issues.

Uploaded templates are local user data. FitCV does not upload them to a FitCV server.

## AI-Assisted Template Mapping

When configured, AI can help identify editable fields and produce a proposed schema. The proposal must be reviewable before the template is enabled.

The user can approve, edit, or reject:

- Field names.
- Field types.
- Repeatable groups.
- LaTeX render mappings.
- Style controls.
- Unsupported features.

## Customization Fields

Users can ask AI to help create safe customization controls such as:

- Text color.
- Section spacing.
- Header style.
- Font size.
- Accent color.
- Page padding.

FitCV stores these controls as schema-backed fields, not arbitrary hidden prompts. Each customization field must map to a specific LaTeX variable or partial and pass template validation.

## Template Validation

Before a user template can be exported, FitCV validates:

- Browser LaTeX compile success.
- Required fields.
- Field coverage.
- Unsupported packages.
- PDF text extraction.
- ATS readability warnings.
- Example fixture output.
- Security-sensitive LaTeX commands where detectable.

Failed validation blocks PDF export for that template but does not delete user data.

## Acceptance Criteria

- A user can import a template bundle locally.
- A user can import DOCX, Markdown, and plain text resumes locally.
- OCR or image-based/scanned PDF import has a documented feasibility report, prototype, or explicit deferral.
- FitCV can produce or validate an explicit schema from markers.
- AI-assisted mapping is review-gated.
- Customization fields are schema-backed and validated.
- Invalid templates cannot be exported.
- Template switching still preserves resume data.
- No uploaded templates or resume data are stored by FitCV servers.
