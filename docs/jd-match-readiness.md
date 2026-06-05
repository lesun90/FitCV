# JD Match Readiness

JD Match Readiness evaluates how well a fitted CV matches a specific job description. It is AI-assisted because FitCV needs semantic judgment for role alignment, required skills, seniority signals, missing evidence, and overclaim risk.

FitCV keeps JD Match Readiness separate from ATS Readiness and CV Quality Readiness. It does not replace parser checks or general writing quality checks.

## Methodology

Current methodology version: `jd-match-ai-v1`

The AI provider returns:

- `readinessPercent`: integer from `0` to `100`.
- `reasons`: field-level findings using FitCV's scoring report reason shape.

Each saved report stores:

```ts
{
  kind: 'jd-match',
  methodologyVersion: 'jd-match-ai-v1',
  targetType: 'fitted-cv',
  targetId: string,
  resumeVersion: number,
  jobDescriptionId: string,
  readinessPercent: number,
  reasons: {
    id: string;
    field?: string;
    severity: 'info' | 'medium' | 'high';
    message: string;
    impact?: number;
  }[];
}
```

FitCV keeps only the latest JD Match report for the same fitted CV and job description pair. Rerunning JD Match replaces the previous report for that fitted CV/JD pair.

## AI Boundaries

JD Match scoring may use AI, but fitted content changes remain review-gated.

FitCV uses separate AI requests for:

- Fit-to-JD proposed edits.
- JD Match Readiness scoring.

Rerunning JD Match does not regenerate proposed edits and does not mutate fitted CV content.

The AI prompt instructs the provider not to invent facts, claims, metrics, titles, employers, dates, tools, outcomes, or qualifications. Findings should flag weak or unsupported evidence instead of treating it as safe.

## What It Checks

JD Match Readiness evaluates:

- Keyword coverage.
- Required skills.
- Role alignment.
- Seniority signals.
- Missing evidence.
- Overclaim risk.
- Unused strong evidence from the base resume or fitted CV.

## Review And Export Gate

Every AI-created fitted CV change starts as a pending proposed change. A fitted CV cannot be exported while pending AI changes remain.

Each proposed change includes:

- Target field.
- Original value.
- Proposed value.
- Rationale.
- Related JD evidence when available.
- Risk flags.
- Review status.

Export is enabled only after every AI-created change is accepted, rejected, or manually reviewed.

## Maintenance Notes

When changing JD Match behavior:

- Update `jd-match-ai-v1` only when the report semantics change.
- Add or update tests in `src/services/aiProvider.test.ts`, `src/domain/fittedCv.test.ts`, and `src/services/storage.test.ts`.
- Keep proposed edit generation separate from JD Match reruns.
- Preserve latest-only report replacement for the same fitted CV and job description pair.
