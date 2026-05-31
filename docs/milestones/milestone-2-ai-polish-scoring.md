# Milestone 2: AI Polish And CV Scoring

## Goal

Add bring-your-own AI provider support, AI polish, CV quality scoring, richer ATS suggestions, and review-gated field edits while preserving FitCV's local-first privacy model.

## Scope

- AI provider settings.
- OpenAI, Claude, DeepSeek, Gemini, and local/OpenAI-compatible endpoint support.
- Optional local browser storage for API keys.
- AI polish for selected fields.
- AI-assisted cleanup for uploaded CV extraction.
- CV quality score.
- AI-assisted ATS suggestions.
- Shared change review UI.
- Provider capability registry.

Fit-to-JD fitted CV generation is out of scope for this milestone.

## Provider Settings

Provider settings include:

- Provider name.
- Endpoint URL when applicable.
- Model ID.
- API key.
- Whether to remember the key on this device.
- Browser-call capability and known limitations.

API key persistence is opt-in. Keys are stored only in browser storage and are never exported in `.fitcv` backups.

If a provider cannot be called directly from the browser because of CORS or provider policy, FitCV should explain the limitation and recommend a local OpenAI-compatible endpoint. FitCV must not silently proxy requests through a FitCV backend.

## AI Disclosure

Before each AI action, FitCV shows:

- Which provider will receive the request.
- Which fields/content will be sent.
- Whether the API key is stored for this session or remembered locally.
- A reminder that AI suggestions require user review.

## Polish Mode

Polish mode improves existing content without adding unsupported facts.

Supported targets:

- Summary.
- Experience bullets.
- Project descriptions.
- Skills wording.
- Custom rich text fields.

The user can provide optional instructions such as "make this more concise" or "make this stronger for product engineering roles."

## AI-Assisted CV Extraction Cleanup

When a user uploads a CV and deterministic extraction is incomplete, FitCV can use the configured AI provider to structure extracted text into the resume model. This is review-gated and requires disclosure before sending content.

AI-assisted extraction returns:

- Proposed structured fields.
- Source snippets where available.
- Confidence or uncertainty notes.
- Unsupported content notes.
- Risk flags for inferred or unsupported claims.

The user must review extracted fields in the editor before treating the resume as confirmed.

## CV Quality Score

CV quality score evaluates the resume without a job description. It checks:

- Clarity.
- Impact.
- Measurable results.
- Action verbs.
- Concision.
- Completeness.
- Consistency.
- Weak or vague bullets.

The report includes a numeric score, explanation, prioritized suggestions, field references, and proposed edits where appropriate.

## ATS Suggestions

Milestone 2 builds on deterministic ATS checks from milestone 1 with AI-assisted suggestions. ATS Parse Score remains separate from CV Quality Score.

AI can suggest clearer section labels, keyword phrasing, simpler bullet wording, and missing standard fields. It must flag when an improvement would require facts the user has not provided.

## Change Review UI

Polish and scoring suggestions use one review model:

- Original content.
- Suggested content.
- Rationale.
- Source mode.
- Target field.
- Risk flags.
- Requires user fact check.
- Accept, reject, or edit before applying.

Accepted suggestions update the local resume. Rejected suggestions are retained in report history.

## Acceptance Criteria

- A user can configure at least one cloud provider and one local/OpenAI-compatible endpoint shape.
- Remembering API keys is optional and clearly labeled.
- API keys are not exported in `.fitcv` backups.
- A user can polish a field and review the suggestion before applying.
- A user can use AI to clean up extracted CV data after an upload.
- AI-assisted extraction output is marked as needing review.
- A user can generate a CV quality score.
- A user can see ATS suggestions with field-level references.
- AI output cannot silently overwrite resume content.
- AI requests disclose provider and content before sending.
