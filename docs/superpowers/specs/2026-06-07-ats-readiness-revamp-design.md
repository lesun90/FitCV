# ATS Readiness Revamp

## Problem

The ATS Readiness checker (`buildAtsReadinessReport` in [src/domain/checks.ts](../../../src/domain/checks.ts)) reports issues that don't help users improve. Example: `Section heading "HONORS & AWARDS" is not a standard ATS anchor.` — this names the problem but gives no actionable fix, and in this case is also a **false positive**: real ATS parsers do recognize "Awards"/"Honors" as standard section anchors. The underlying `STANDARD_SECTION_PATTERNS` dictionary only covers `experience, skills, education, projects, research, publications`, so common, legitimate headings (Awards, Certifications, Volunteer Experience, Summary, Languages) get incorrectly flagged.

FitCV already has an AI-powered evaluator (CV Quality / JD Match) for contextual judgment calls (keyword relevance, achievement framing, tone). ATS Readiness should stay deterministic and rule-based, but its rules and messages need to actually mirror how real ATS systems parse resumes.

## Research summary

Surveyed current guidance on how ATS parsing works (see Sources). Key mechanics that are checkable deterministically:

- **Section header recognition**: parsers match section headings against dictionaries of known labels (Experience/Work Experience/Employment History; Awards/Honors & Awards; Certifications/Licenses; Volunteer Experience; Summary/Professional Summary; etc.) — closer to literal/exact matching than fuzzy matching. Creative headings ("My Journey", "The Toolkit", "About Me") get mis-categorized or ignored.
- **Contact-block extraction**: parsers extract name/email/phone/location via pattern matching from the top of the document; fields hidden from the rendered output, or tucked into headers/footers/text boxes, are frequently missed (one study found ~25% miss rate for header/footer-placed contact info).
- **Date normalization**: "Mon YYYY" (e.g. "Mar 2022") and "MM/YYYY" (e.g. "03/2022") are the most reliably parsed formats; vague/relative formats ("Summer '21", "Spring 2020") often fail to normalize, and **mixing formats across entries** compounds the risk for a parser's range/gap calculations.
- **Capitalization**: plain-text, standard-capitalization headings parse most reliably; ALL CAPS headings are sometimes tokenized as acronyms or skipped.
- **Text-layer extractability**: the single most direct test — if the exported PDF's text layer doesn't contain the resume's actual content (e.g. it renders as an image, or uses a font/encoding that doesn't extract cleanly), an ATS parser extracts nothing useful. FitCV's `pdf-text-*` checks already approximate this by diffing extracted PDF text against the resume's structured content — this remains the anchor check of the whole report.

Sources:
- [What ATS Looks for in Resumes (2025 Guide) — The Interview Guys](https://blog.theinterviewguys.com/what-ats-looks-for-in-resumes/)
- [ATS-Optimized Resume Section Headings That Parse — JobShinobi](https://www.jobshinobi.com/blog/ats-optimized-resume-section-headings-that-parse)
- [ATS Resume Date Format Fix — ResumeMakerOffer](https://www.resumemakeroffer.com/en/blog/post/95005)
- [I Tested 8 ATS Systems — QuickCV](https://quickcv.io/blog/i-tested-8-ats-systems-to-see-how-they-actually-parse-resumes)
- [5 Critical ATS Resume Formatting Mistakes — Jobscan](https://www.jobscan.co/blog/ats-formatting-mistakes/)

## Scope decision: ATS = parseability only

ATS Readiness is scoped to **one question: can a parser correctly extract and categorize this resume's content?** Anything that's a content-quality judgment (is the summary too long, is this bullet substantive, did you forget to replace placeholder text) belongs to the AI-powered evaluator, not the rule-based ATS checker — those concerns require understanding meaning, not mechanics.

This means three existing checks are **dropped from ATS** (they test content quality, not parseability):

| Check | Why it's dropped |
|---|---|
| `long-summary` | A long summary still parses correctly — "too long" is a scanability opinion |
| `placeholder-text` | "Forgot to edit the template" is a correctness issue, not a parsing-mechanism issue |
| `thin-bullet-structure` | Judging bullet substance/depth is content-quality judgment, not whether a parser can read it |

(These concerns may resurface later as AI-evaluator checks — that's out of scope for this design.)

Dropping these checks (plus the dictionary/heuristic changes below) leaves several helpers in [checks.ts](../../../src/domain/checks.ts) with no remaining caller — they must be deleted as part of this work, not left as dead code:

| Now-unused after this change | Was used only by |
|---|---|
| `flattenResumeText`, `flattenedText`, `PLACEHOLDER_PATTERN` | `placeholder-text` |
| `extractHighlightLines`, `highlightLinesFromEntry`, `wordCount`, `experienceBullets` | `thin-bullet-structure` |
| `NONSTANDARD_SECTION_PATTERN` | `nonstandard-section-heading` — already redundant before this change (every phrase it matches already fails `matchesAnyStandardSection`, so the `||` never short-circuits anything); the rename-suggestion hint table below replaces its purpose with actionable output |

## Final check inventory

| Check id | Status | Parsing concern it verifies |
|---|---|---|
| `missing-name` | Keep, rewrite | Contact-block name extraction |
| `missing-email` | Keep, rewrite | Contact-block email extraction |
| `missing-phone-or-location` | Keep, rewrite | Contact-block phone/location extraction |
| `unclear-link` | Keep, rewrite (names the link) | Link text readability after export |
| `hidden-contact-field` | Keep, rewrite (names the field) | Parsers can't read fields absent from rendered output |
| `missing-experience-section` | Keep, rewrite | Section-anchor recognition (Experience) |
| `missing-skills-section` | Keep, rewrite | Section-anchor recognition (Skills) |
| `missing-supporting-section` | Keep, rewrite | Section-anchor recognition (Education/Projects/etc.) |
| `nonstandard-section-heading` | Keep, rewrite + **dictionary fix + rename suggestion** | Section-heading-to-category matching |
| `all-caps-section-heading` | **New** | Heading capitalization affecting tokenization |
| `empty-section` | Keep, rewrite (names char count) | Whether a section has any extractable text |
| `unclear-date-format` | Keep, rewrite (names the offending value) | Date normalization for a single date |
| `inconsistent-date-format` | **New** | Date normalization across multiple entries (mixed styles) |
| `pdf-text-not-tested` | Keep, rewrite | Whether the text-layer smoke test has run |
| `pdf-text-present` | Keep, rewrite | Confirms text-layer extraction looks healthy |
| `pdf-text-missing-key-content` | Keep, rewrite | Direct text-layer extractability failure (anchor check) |
| `baseline-pass` | Keep as-is | Meta "no blockers found" marker |

`methodologyVersion` bumps from `ats-deterministic-v2` to `ats-deterministic-v3` since rule behavior changes (dictionary expansion changes which resumes get flagged; three checks removed; two added).

## Section-heading dictionary expansion

`STANDARD_SECTION_PATTERNS` expands from 6 categories to 11, reflecting what real parsers recognize as standard anchors:

| Category | Recognized synonyms (regex intent) |
|---|---|
| Experience | Experience, Work Experience, Professional Experience, Employment History |
| Education | Education, Academic Background |
| Skills | Skills, Technical Skills, Core Skills, Competencies |
| Summary | Summary, Professional Summary, Profile, Objective |
| Projects | Projects |
| Certifications | Certifications, Licenses |
| Awards | Awards, Honors |
| Volunteer | Volunteer Experience, Volunteer Work, Community Service |
| Publications | Publications |
| Research | Research |
| Languages | Languages |

This directly fixes the false positive on "HONORS & AWARDS" (now matches Awards) and equivalent false positives for Certifications, Volunteer, Summary, and Languages headings that the current dictionary incorrectly flags as nonstandard.

## Rename-suggestion heuristic

For a heading that genuinely matches no category, `nonstandard-section-heading` suggests a specific rename using a small "creative-phrase → likely category" hint table, e.g.:

| If the heading contains... | Suggest renaming to |
|---|---|
| journey, story, where i've been, career path | Experience / Work Experience |
| toolkit, stack, arsenal, what i bring | Skills / Technical Skills |
| about me, who i am, bio, my story | Professional Summary |
| kudos, accolades, wins, proof, recognition | Awards / Honors & Awards |
| badges, credentials | Certifications |
| community, giving back | Volunteer Experience |

If no hint matches, the message falls back to a general reference list of recognized labels (Experience, Skills, Education, Projects, Awards, Certifications, Volunteer Experience, Publications, Summary, Languages) rather than guessing incorrectly.

## Message rewrite pattern

Every `message` + `suggestion` pair follows **what was found → why it matters mechanically → how to fix it**, naming actual resume values where useful. Representative examples (full set of ~16 lives in the implementation, following this same pattern):

**`nonstandard-section-heading`** (with dictionary fix, "HONORS & AWARDS" no longer fires; for a genuinely nonstandard heading like "THE TOOLKIT"):
- message: `Heading "THE TOOLKIT" doesn't match any section label ATS parsers recognize, so its content may be skipped or filed under the wrong category.`
- suggestion: `This looks like a Skills section — rename it to "Skills" or "Technical Skills" so parsers categorize it correctly.`

**`unclear-date-format`**:
- message: `The date "Summer '21" in Experience doesn't match a format parsers normalize reliably (e.g. "Mar 2022" or "03/2022").`
- suggestion: `Rewrite it as "Mon YYYY" or "MM/YYYY" — e.g. "Jun 2021" or "06/2021".`

**`inconsistent-date-format`**:
- message: `Your dates mix formats — e.g. "Mar 2022" in Experience vs "03/2022" in Projects. Parsers normalize a single consistent format more reliably than mixed styles.`
- suggestion: `Pick one format ("Mon YYYY" or "MM/YYYY") and use it for every date on the resume.`
- **Scope note — avoiding overlap with `unclear-date-format`**: this check only compares dates that *individually* pass the existing clear-date check (i.e., already match `CLEAR_DATE_PATTERN` and not `UNCLEAR_DATE_PATTERN`). A vague date like "Summer '21" is `unclear-date-format`'s problem, not an "inconsistency" — pairing a vague date against a valid one in this message would conflate the two issues and confuse the fix. Style buckets are determined structurally, e.g. `Mon YYYY` ("Mar 2022"), `Month YYYY` ("March 2022"), `MM/YYYY` ("03/2022"), `MM-YYYY`, bare `YYYY`. The check fires when two-or-more distinct buckets appear among the resume's clear dates, and the message cites one example from each of two differing buckets.

**`hidden-contact-field`**:
- message: `Your phone number is hidden from the rendered resume. Parsers can only read what's in the exported document — a hidden field is invisible to them.`
- suggestion: `Unhide this field, or remove it if you don't want it included.`

**`pdf-text-missing-key-content`** (the anchor check):
- message: `Key content (your name, section headings, top lines) is missing from the exported PDF's text layer. This usually means the PDF renders as an image or uses a font/encoding a parser can't read — an ATS would extract little or nothing from your resume.`
- suggestion: `Try a different template or font, then re-export and re-run this check.`

**`all-caps-section-heading`** *(new)*:
- message: `Heading "HONORS & AWARDS" is in ALL CAPS. Some parsers tokenize all-caps text as acronyms or skip it when scanning for section labels.`
- suggestion: `Use standard capitalization, e.g. "Honors & Awards".`

**`empty-section`**:
- message: `Section "Languages" has almost no text (4 characters). Parsers extract nothing useful from a section this short.`
- suggestion: `Add real content to this section, or remove/hide it.`

## Data model

No changes to `ScoringReportRecord` or `CheckResult` shapes ([src/domain/types.ts:267-287](../../../src/domain/types.ts#L267-L287)) — only the `message`/`suggestion`/`field` text content of individual reasons changes, plus new `id` values for the two new checks (`all-caps-section-heading`, `inconsistent-date-format`) and removal of the three dropped ids (`long-summary`, `placeholder-text`, `thin-bullet-structure`). The UI ([ReadinessDrawer](../../../src/ui/App.tsx#L1163)) requires no changes — it already renders `message`, `suggestion`, `impact`, and `field` generically.

**Navigability fix**: `isNavigableField` ([App.tsx:1033-1038](../../../src/ui/App.tsx#L1033-L1038)) makes a reason clickable (jumps the user to the relevant editor location) only when `field` matches `content.flexSections.<sectionId>...`. Today `unclear-date-format` sets `field: 'content.flexSections'` — the bare collection path, which is **not** navigable, even though the rewritten message now names a specific section. This change should set `field` to the actual offending section's path (`content.flexSections.<sectionId>`), matching the pattern `nonstandard-section-heading` and `empty-section` already use, so the click-to-navigate affordance works here too. `inconsistent-date-format` and `all-caps-section-heading` should do the same — point at the specific section the example/heading came from.

## Scoring

Existing point weights for kept checks remain unchanged. The two new checks use `severity: 'medium'` (the existing convention reserves `'info'` for zero-impact informational reasons like `baseline-pass` and `pdf-text-present` — anything with a negative `impact` is `'medium'` or `'high'`) with small penalties at the low end of the existing medium range, consistent with their "minor risk factor" nature: `-4` for `all-caps-section-heading`, `-6` for `inconsistent-date-format` (next to `nonstandard-section-heading`'s `-6` and below `empty-section`'s `-8`). Net scoring shifts are an expected consequence of fixing false positives and narrowing scope — `methodologyVersion` bumps to `ats-deterministic-v3` to reflect this.

## Testing

Update [src/domain/checks.test.ts](../../../src/domain/checks.test.ts):
- Remove/replace assertions referencing the three dropped check ids
- Add cases proving the dictionary fix (e.g. a resume with an "Honors & Awards" section no longer triggers `nonstandard-section-heading`)
- Add cases for `all-caps-section-heading` and `inconsistent-date-format`
- Add cases verifying the rename-suggestion heuristic picks a sensible category for a hint-matching nonstandard heading, and falls back to the general list otherwise
- Add a case proving `inconsistent-date-format` does *not* fire when the only "different" date is one that `unclear-date-format` already flags as vague (i.e. the two checks don't double-count the same root cause)
- Verify rewritten messages include the actual offending values (link text, field name, date string, char count) where the design specifies it
- Verify `unclear-date-format`, `inconsistent-date-format`, and `all-caps-section-heading` set a navigable `field` (`content.flexSections.<sectionId>`), not the bare `'content.flexSections'` collection path
- Confirm `flattenResumeText`, `flattenedText`, `PLACEHOLDER_PATTERN`, `extractHighlightLines`, `highlightLinesFromEntry`, `wordCount`, `experienceBullets`, and `NONSTANDARD_SECTION_PATTERN` are fully removed (no orphaned helpers/constants left in `checks.ts`)

No UI test changes expected since `ReadinessDrawer` renders reason fields generically; existing `App.test.tsx` ATS-related assertions should be checked for any hardcoded message-text expectations and updated to match new copy.
