# Milestone 3: Fit-To-JD Fitted CVs

## Goal

Add job-specific fitted CV generation from a base resume and job description. Fitted CVs are independent snapshots linked to their source resume, with JD match scoring, changed-field review, and overclaim warnings.

## Scope

- Job description input and storage.
- AI-generated fitted CV draft.
- Fitted CV data model.
- Dashboard grouping under base resumes.
- JD Match Score.
- Changed-field review.
- Compare-to-base metadata.
- Export fitted PDF.

User-uploaded templates and AI template mapping are out of scope.

## Fitted CV Data Model

A fitted CV stores:

- Full resume data snapshot.
- `sourceResumeId`.
- Source resume version.
- Job description text or metadata.
- Created and updated timestamps.
- Active template.
- Change records.
- JD match reports.
- Compile and export history.

Fitted CVs do not automatically change when the base resume changes. Future rebase or compare features can use the source link and change metadata.

## Fit-To-JD Workflow

1. User opens a base resume.
2. User pastes a job description.
3. FitCV discloses which resume fields and JD text will be sent to the configured AI provider.
4. AI proposes a fitted CV draft.
5. FitCV creates a fitted CV snapshot.
6. Changed fields are highlighted.
7. User accepts, rejects, or edits proposed changes.
8. FitCV calculates JD Match Score.
9. User compiles and exports a fitted PDF.

## JD Match Score

JD Match Score evaluates how well the fitted CV matches the job description. It checks:

- Keyword coverage.
- Required skills.
- Role alignment.
- Seniority signals.
- Missing evidence.
- Overclaim risk.
- Unused strong evidence from the base resume.

The score report includes a numeric score, explanation, prioritized suggestions, field references, and warnings where the model appears to add unsupported claims.

## Review Requirements

Every AI-created changed field must be reviewable. Review includes:

- Original base value.
- Proposed fitted value.
- Rationale.
- Link to related JD text where available.
- Risk flags.
- Accept/reject controls.
- Manual edit option.

FitCV should warn when the AI suggests adding skills, experience, metrics, or claims that are not present in the source resume.

## Dashboard Requirements

The dashboard groups fitted CVs under their source base resume. Each fitted CV card shows:

- Company or role label.
- JD Match Score.
- ATS Parse Score if available.
- Compile status.
- Last updated date.
- Actions: open, duplicate, export PDF, delete.

Base resume cards show the number of fitted CVs and the latest compile/scoring status.

## Acceptance Criteria

- A user can create a fitted CV from a base resume and JD.
- The base resume is not destructively modified.
- The fitted CV is grouped under the base resume.
- AI changes are highlighted and review-gated.
- JD Match Score is generated and stored with methodology version.
- A user can compile and export the fitted CV as a PDF.
- Overclaim risks are visible before export.
