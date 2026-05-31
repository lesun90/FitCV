# FitCV System Design Spec

## Purpose

FitCV helps job seekers keep canonical source resumes and create job-specific fitted CVs without losing original source material. It combines a friendly browser-based resume editor with LaTeX templates, browser-only PDF compilation, local user-owned data, and bring-your-own AI assistance.

FitCV can run from localhost or from a hosted website. It has no login, no FitCV-owned user database, and no server-side storage of resume data. User data stays in the browser unless the user exports it, imports it, downloads a PDF, or sends selected content directly to a configured AI provider.

## Product Principles

- Users should never need to edit LaTeX for curated templates.
- Resume content must be separate from visual layout.
- Users can switch templates while editing without losing data.
- Base resumes remain canonical; fitted CVs are independent snapshots linked to the source.
- AI suggestions are review-gated and must not silently overwrite user content.
- FitCV does not invent facts for the user. Unsupported AI claims must be flagged.
- PDF compilation happens in the browser.
- Data ownership is explicit through local storage and portable backups.

## Core Objects

### Base Resume

The source resume a user maintains over time. It stores normalized resume content, selected template, editor preferences, compile state, scoring reports, and version metadata.

### Fitted CV

A job-specific resume created from a base resume. It stores a full snapshot of resume data, plus `sourceResumeId`, source version, job description metadata, accepted and rejected changes, scores, and export history.

### Template

A curated LaTeX layout bundle plus a manual schema. The schema defines editable fields, validation, default values, field visibility, layout controls, ATS-readability metadata, and render mapping into LaTeX.

### Job Description

User-provided text used to evaluate or generate a fitted CV. Job descriptions are stored locally and may be included in `.fitcv` backups.

### Uploaded CV

An existing resume file provided by the user as a starting point. The first milestone supports PDF import only. Later milestones can expand supported formats to DOCX, plain text, Markdown, image-based resumes, or scanned PDFs when browser-compatible extraction quality is acceptable. FitCV extracts structured resume data from the file, creates a base resume, opens it in the editor, and marks extracted fields as needing review until the user confirms them.

### Provider Settings

Bring-your-own AI configuration for OpenAI, Claude, DeepSeek, Gemini, and local or OpenAI-compatible endpoints. API keys may optionally be remembered in browser storage, but key persistence is off by default and keys are never exported in `.fitcv` archives.

## Main Workflows

1. Create a new base resume or upload an existing CV.
2. Edit structured resume fields in a friendly workbench UI.
3. Switch layouts freely between supported templates.
4. Compile the selected LaTeX template in the browser.
5. Preview the PDF, inspect compile status, and export.
6. Run ATS parse checks and CV quality scoring.
7. Use AI polish to improve existing fields without inventing facts.
8. Paste a job description and create a fitted CV draft.
9. Review changed fields, accept or reject suggestions, and export a fitted PDF.
10. Export or import a portable `.fitcv` backup.

## CV Upload And Extraction

Users can start by creating a blank/new resume or by uploading an existing CV. Upload extraction populates the same resume content model used by the editor; it is not a separate import-only workflow.

Supported target formats:

- Milestone 1: PDF with extractable text.
- Future: DOCX, plain text, Markdown, image-based resumes, or scanned PDFs through browser-compatible parsing, OCR, or AI-assisted extraction.

Extraction rules:

- FitCV attempts deterministic parsing first where possible. Milestone 1 starts with PDF text extraction. Future import formats can add DOCX structure, Markdown headings and lists, plain text heuristics, and OCR.
- If deterministic extraction is incomplete and AI is configured, FitCV can offer AI-assisted structuring through the user's configured provider.
- Before AI-assisted extraction, FitCV discloses what extracted text will be sent and which provider will receive it.
- Uploaded files are processed locally in the browser where possible and are not stored by FitCV servers.
- FitCV keeps the uploaded source file only if the user explicitly chooses to attach it locally.
- Extracted fields carry confidence or review metadata.
- Imported resumes remain marked as `needsReview` until the user confirms extracted fields.
- After extraction, users can switch templates without losing imported data.

## Layout Switching

Resume data is stored independently from the active template. Switching templates changes the visible schema, editor controls, and PDF output, but does not erase underlying data.

Field categories:

- **Common fields** are part of FitCV's normalized resume model and should carry across templates automatically.
- **Template-supported fields** are fields exposed by the active template schema.
- **Preserved hidden fields** are fields not shown by the active template but retained in resume data.

When a template cannot display some fields, FitCV warns the user and surfaces them in a "not shown in this template" area. Template-specific fields are namespaced so returning to a previous template restores those values.

## AI Features

FitCV is bring-your-own AI only. It supports popular cloud providers and local models through provider adapters:

- OpenAI
- Claude
- DeepSeek
- Gemini
- Local/OpenAI-compatible endpoints such as Ollama, LM Studio, and vLLM

AI features:

- **Polish mode** improves existing resume content in place. It suggests clearer, stronger, more concise wording for summaries, experience bullets, project descriptions, and skills. It does not add new experience.
- **Fit-to-JD mode** creates a job-specific fitted CV draft from a base resume and a job description.
- **Scoring suggestions** propose field-level improvements based on ATS, CV quality, or JD match findings.

Before any AI request, FitCV must disclose what content will be sent and which provider will receive it. AI output is represented as proposed edits with rationale, risk flags, and accept/reject state.

## Scoring

FitCV provides three separate scores. It must not collapse them into one universal truth score.

### ATS Parse Score

Estimates how easy the exported CV is for Applicant Tracking Systems to parse. It checks standard section labels, simple formatting, readable ordering, keyword visibility, link clarity, template metadata, and generated PDF text extraction where possible.

### CV Quality Score

Evaluates the resume without a job description. It looks at clarity, impact, measurable results, action verbs, concision, completeness, consistency, and weak or vague bullets.

### JD Match Score

Evaluates a fitted CV against a job description. It checks keyword coverage, role alignment, required skills, seniority signals, missing evidence, and overclaim risk.

Each score stores methodology version, resume version, explanation, prioritized suggestions, and field-level proposed edits when available.

## Architecture

### Local Data Store

IndexedDB is the working database for resumes, fitted CVs, job descriptions, uploaded-file attachments when explicitly retained, provider settings, scoring reports, compile artifacts, and preferences. FitCV servers never store user resume data.

### Import And Export

FitCV exports a portable `.fitcv` archive containing local resume data, fitted CVs, job descriptions, scoring metadata, template references, and optionally generated PDFs. API keys are never included in `.fitcv` archives.

### Resume Content Model

The resume model includes normalized sections such as profile, summary, experience, education, projects, skills, awards, links, and custom sections. Sections and items can carry `customFields` so unusual templates do not force data loss.

### Template Registry

The registry contains curated browser-compatible LaTeX templates. Each template includes:

- LaTeX source bundle.
- Manual schema.
- Supported sections and fields.
- Render mapping.
- Validation rules.
- Default settings.
- ATS-readability metadata.
- Browser LaTeX compatibility metadata.
- Sample fixtures for validation.

Manual schemas are canonical for the early product. Marker-assisted schema generation is a future upgrade path.

### Template Validation Layer

Every template must pass validation before export is enabled. Validation checks required fields, schema-to-LaTeX coverage, fixture compile success, unsupported field behavior, and browser LaTeX engine compatibility.

### Editor Engine

The editor renders a consistent Magic-Resume-inspired workbench from the active template schema. It stores values in template-independent resume data where possible and preserves template-specific values under namespaces. Imported fields can display confidence and needs-review states until the user confirms or edits them.

### CV Extraction Pipeline

The extraction pipeline converts uploaded CV files into FitCV's structured resume content model. It has deterministic parsers for browser-readable formats and an optional AI-assisted structuring step when the user has configured a provider. Extraction output includes normalized fields, source snippets where available, confidence metadata, unsupported content notes, and review status.

### Browser LaTeX Pipeline

The pipeline maps structured resume data into sanitized LaTeX variables and partials, compiles in the browser, and returns PDF preview, compile logs, PDF text extraction metadata, and compile status.

Compile states:

- `clean`: PDF matches current data and template.
- `compiling`: browser engine is running.
- `stale`: data changed since last successful compile.
- `failed`: compile failed and logs are available.

### AI Provider Adapter

Provider adapters normalize requests and responses across supported AI providers. The provider registry tracks browser-call support, required headers, endpoint shape, streaming support, CORS limitations, model configuration, and local endpoint guidance.

### AI Suggestion And Change Review

Polish, scoring, and fit-to-JD suggestions use one change review model:

- `sourceMode`
- `targetField`
- `before`
- `after`
- `rationale`
- `riskFlags`
- `requiresUserFactCheck`
- `status`

Accepted changes update the resume or fitted CV. Rejected changes remain in history for auditability.

### Schema Versioning And Migration

Resume data, template schemas, scoring reports, provider settings, and `.fitcv` archives must include version metadata. Migrations should be explicit and testable.

## UX Direction

FitCV adapts the editor workbench interaction model from Magic Resume while creating its own design language and implementation.

Desktop editor layout:

- **Top header**: brand/back navigation, editable resume title, local backup status, AI/scoring status, theme toggle, and export controls.
- **Left style/layout panel**: section order, section visibility, template controls, theme color, typography, spacing, page padding, and template-specific options.
- **Center edit panel**: active section editor with card-like groups, repeatable items, collapsible entries, drag handles, visibility toggles, delete controls, custom fields, and AI polish buttons.
- **Right preview panel**: browser-compiled PDF preview, page boundaries, compile state, logs, ATS/readability warnings, and section-to-editor navigation where possible.
- **Floating action dock**: template switch, AI polish, CV score, ATS score, fit-to-JD, duplicate, export PDF, backup/export archive, and panel collapse controls.

Mobile editor layout:

- Bottom tabs: **Content**, **Style**, **Preview**.
- Content tab shows section pills and the active edit panel.
- Style tab shows layout/template controls.
- Preview tab shows compiled PDF state and export actions.

FitCV-specific UX rules:

- Layout switching is safe and reversible.
- Hidden unsupported fields are preserved and visible in a dedicated area.
- AI suggestions are shown as original vs suggested text with rationale and accept/reject controls.
- Scoring suggestions open the exact field they reference.
- Fit-to-JD creates a fitted CV and does not destructively edit the base resume.
- Uploaded CV extraction creates a base resume and opens the editor with extracted fields marked for review.
- AI requests disclose the provider and content sent.
- Compile failures show readable logs and likely field/template causes.

## Privacy Boundary Rules

- FitCV has no login.
- FitCV has no server-side user data storage.
- Browser-local storage is allowed and is considered user-device storage.
- `.fitcv` backups are user-controlled exports.
- API keys are opt-in local browser storage only.
- API keys are not included in `.fitcv` backups.
- AI requests go directly from the browser to the configured provider when provider capabilities allow it.
- If a provider cannot be called directly from the browser, FitCV must explain the limitation and point to local endpoint options rather than routing through a FitCV backend.

## Local Runtime

After milestone 1, FitCV must support a simple local runtime for users and contributors:

```bash
docker compose up
```

The local runtime serves the FitCV browser app on localhost, requires no login, and does not introduce server-side user data storage. Browser-local data, API key behavior, AI provider disclosure, and browser-only LaTeX compilation work the same way as the hosted app.

The Docker Compose setup must support live reload for development. Code changes should rebuild or reload the running app without manually restarting the container. The setup must document default ports, mounted source paths, environment variables, and how to clear local browser data.

## Milestones

- **Milestone 1: Local Resume Workbench And Browser PDF**
- **Milestone 1.1: Docker Compose Local Runtime**
- **Milestone 2: AI Polish And CV Scoring**
- **Milestone 3: Fit-To-JD Fitted CVs**
- **Milestone 4: Template Expansion And Customization**

See the separate milestone documents in `docs/milestones/`.
