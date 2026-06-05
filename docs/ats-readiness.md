# ATS Readiness

ATS Readiness estimates whether a resume can be parsed cleanly by Applicant Tracking Systems. It is a local, deterministic check. It does not judge writing quality, role fit, seniority, or hiring strength.

FitCV keeps ATS Readiness separate from CV Quality Readiness and JD Match Readiness. ATS Readiness is deterministic and parser-focused; CV Quality Readiness is AI-assisted writing-quality analysis; [JD Match Readiness](./jd-match-readiness.md) is AI-assisted fit analysis for a fitted CV and a specific job description.

## Methodology

Current methodology version: `ats-deterministic-v2`

FitCV starts at `100%` readiness and subtracts weighted penalties for parser risks. The final value is clamped to `0-100`.

```text
ATS Readiness = clamp(100 + sum(negative reason impacts), 0, 100)
```

Each report stores:

- `kind: 'ats'`
- `methodologyVersion`
- `resumeVersion`
- `readinessPercent`
- `reasons`
- `createdAt`

Reasons use this shape:

```ts
{
  id: string;
  field?: string;
  severity: 'info' | 'medium' | 'high';
  message: string;
  impact?: number;
}
```

## Rule Set

### Contact Extraction

ATS parsers need obvious contact fields near the top of the resume.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `missing-name` | `-30` | `high` | `content.profile.fullName` is empty. |
| `missing-email` | `-15` | `medium` | `content.profile.email` is empty. |
| `missing-phone-or-location` | `-6` | `medium` | Phone and location are both empty. |
| `unclear-link` | `-8` | `medium` | A profile link is neither a URL nor a recognizable domain. |
| `hidden-contact-field` | `-8` | `medium` | Email, phone, location, or links are hidden from the rendered resume. |

`missing-name` also remains a compile blocker through `runAtsChecks`.

### Section Anchors

ATS parsers depend on familiar section headings. FitCV recognizes common anchors for:

- Experience
- Skills
- Education
- Projects
- Research
- Publications

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `missing-experience-section` | `-18` | `high` | No visible section matches Experience or Employment. |
| `missing-skills-section` | `-12` | `medium` | No visible section matches Skills, Technical Skills, Core Skills, or Technologies. |
| `missing-supporting-section` | `-8` | `medium` | No Education, Projects, Research, or Publications section exists. |
| `nonstandard-section-heading` | `-6` each | `medium` | A visible section heading is not a standard anchor, or uses risky labels such as `MY JOURNEY`, `THE TOOLKIT`, `ABOUT ME`, or `WHAT I DO`. |
| `empty-section` | `-8` each | `medium` | A visible section has less than 12 characters of parseable text. |

### Content Structure

These checks catch resumes that look present but still parse poorly.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `placeholder-text` | `-18` | `high` | Template placeholders remain, such as `Lorem ipsum`, `Company Name`, `Tool A`, `Month Year`, or `First Last`. |
| `thin-bullet-structure` | `-10` | `medium` | Experience exists but has fewer than two substantial bullet lines. A substantial bullet has at least four words. |
| `unclear-date-format` | `-8` | `medium` | A date field uses vague or hard-to-normalize text such as `Summer '23`, or lacks a recognizable year/month/year/present value. |
| `long-summary` | `-10` | `medium` | Summary is longer than 700 characters. |

### PDF Text Smoke Test

ATS products parse document text. FitCV checks generated PDF text when available.

| Reason ID | Impact | Severity | Trigger |
| --- | ---: | --- | --- |
| `pdf-text-not-tested` | `-8` | `medium` | The current resume version has no generated text extraction result. |
| `pdf-text-present` | `0` | `info` | Generated text exists and includes enough key resume content. |
| `pdf-text-missing-key-content` | `-16` | `high` | Generated text exists but misses key content such as name, email, section labels, or early section text. |

FitCV treats PDF text extraction as a smoke test, not a complete ATS parser. It checks whether key structured fields appear in extracted text.

## What ATS Readiness Does Not Score

ATS Readiness does not score:

- Whether the resume is persuasive.
- Whether bullets show impact or measurable outcomes.
- Whether keywords match a specific job description.
- Whether a candidate is qualified.
- Whether a particular ATS vendor will rank the resume highly.

Use CV Quality Readiness for writing quality. Use [JD Match Readiness](./jd-match-readiness.md) when a job description is available.

## Research Basis

The rule set follows common ATS formatting guidance:

- MIT CAPD recommends simple formatting, readable fonts, clear margins, and avoiding fragile template behavior: https://capd.mit.edu/resources/resume-checklist/
- MIT CAPD advises avoiding text boxes, templates, tables, colors, images, and graphics for ATS-friendly undergraduate resumes: https://capd.mit.edu/blog/2023/09/01/enhance-your-resume-a-guide-for-first-year-undergraduates/
- Indeed recommends standard headings and avoiding tables, columns, headers, footers, and graphics: https://www.indeed.com/career-advice/resumes-cover-letters/ats-resume
- Jobscan highlights standard headings, standard dates, web-safe fonts, and avoiding headers, footers, text boxes, and unusual formatting: https://www.jobscan.co/blog/ats-formatting-mistakes/
- Harvard Career Services emphasizes complete contact info, skimmability, consistent formatting, reverse chronological ordering, and checking PDF translation: https://careerservices.fas.harvard.edu/resources/hes-create-an-impactful-resume/

## Maintenance Notes

When changing ATS Readiness rules:

- Update `methodologyVersion` in `src/domain/checks.ts`.
- Add or update tests in `src/domain/checks.test.ts`.
- Keep reason IDs stable where possible so existing reports remain understandable.
- Document any new reason ID, impact, severity, and trigger in this file.
- Keep ATS Readiness deterministic and local. AI can suggest ATS improvements, but it should not decide the ATS readiness percent.
