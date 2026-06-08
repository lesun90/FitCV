import type { CvSubsectionHeading, FlexEntry, FlexSection, FlexSubSection, ResumeRecord, ScoringReportRecord } from './types';
import { createId } from './ids';

export interface CheckResult {
  id: string;
  status: 'pass' | 'warning' | 'blocked';
  severity: 'info' | 'medium' | 'high';
  field: string;
  message: string;
  suggestion: string;
}

type AtsReadinessOptions = {
  generatedText?: string;
  createdAt?: string;
};

type AtsReason = ScoringReportRecord['reasons'][number];

const STANDARD_SECTION_PATTERNS: Record<string, RegExp[]> = {
  experience: [/\b(work|professional|relevant)?\s*experience\b/i, /\bemployment(\s*history)?\b/i],
  education: [/\beducation\b/i, /\bacademic (background|history)\b/i],
  skills: [/\b(technical|core|key)?\s*skills?\b/i, /\bcompetencies\b/i, /\btechnologies\b/i],
  summary: [/\b(professional|career)?\s*summary\b/i, /\bprofile\b/i, /\bobjective\b/i],
  projects: [/\bprojects?\b/i],
  certifications: [/\b(certifications?|licenses?)\b/i],
  awards: [/\b(awards?|honou?rs?)\b/i],
  volunteer: [/\bvolunteer(ing|\s*(experience|work))?\b/i, /\bcommunity\s*(service|involvement)\b/i],
  publications: [/\bpublications?\b/i],
  research: [/\bresearch\b/i],
  languages: [/\blanguages?\b/i],
};

const STANDARD_SECTION_LABELS = ['Experience', 'Skills', 'Education', 'Projects', 'Awards', 'Certifications', 'Volunteer Experience', 'Publications', 'Summary', 'Languages'];

const SECTION_RENAME_HINTS: { pattern: RegExp; looksLike: string; labels: string[] }[] = [
  { pattern: /\b(my journey|career story|where i'?ve been|career path)\b/i, looksLike: 'Experience', labels: ['Experience', 'Work Experience'] },
  { pattern: /\b(toolkit|tool ?box|tech stack|arsenal|what i (?:bring|use))\b/i, looksLike: 'Skills', labels: ['Skills', 'Technical Skills'] },
  { pattern: /\b(about me|who i am|\bbio\b|my story)\b/i, looksLike: 'Summary', labels: ['Professional Summary'] },
  { pattern: /\b(kudos|accolades|\bwins\b|proof of work|recognition)\b/i, looksLike: 'Awards', labels: ['Awards', 'Honors & Awards'] },
  { pattern: /\b(badges|credentials)\b/i, looksLike: 'Certifications', labels: ['Certifications'] },
  { pattern: /\b(community|giving back)\b/i, looksLike: 'Volunteer', labels: ['Volunteer Experience'] },
];

const CLEAR_DATE_PATTERN = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b\d{1,2}\/\d{4}\b|\b\d{4}\b|\bpresent\b)/i;
const UNCLEAR_DATE_PATTERN = /['’]\d{2}\b|\bsummer\b|\bspring\b|\bfall\b|\bwinter\b/i;

const DATE_STYLE_BUCKETS: { id: string; pattern: RegExp }[] = [
  { id: 'slash-numeric', pattern: /\b\d{1,2}\/\d{4}\b/ },
  { id: 'dash-numeric', pattern: /\b\d{1,2}-\d{4}\b/ },
  { id: 'textual-month', pattern: /\b[a-z]{3,9}\.?\s+\d{4}\b/i },
  { id: 'bare-year', pattern: /\b\d{4}\b/ },
];

export const buildAtsReadinessReport = (
  resume: ResumeRecord,
  options: AtsReadinessOptions = {}
): ScoringReportRecord => {
  const reasons: AtsReason[] = [];
  const profile = resume.content.profile;
  const sectionNames = resume.content.flexSections.map((section) => section.name);
  const visibleSections = resume.content.flexSections.filter((section) => !section.hidden);
  const experienceSections = visibleSections.filter((section) => matchesSection(section.name, 'experience'));
  const skillSections = visibleSections.filter((section) => matchesSection(section.name, 'skills'));

  if (!profile.fullName.trim()) {
    reasons.push(reason(
      'missing-name', 'high',
      'Your name is missing. ATS parsers extract the applicant name from the top of the contact block to file and identify the application.',
      -30, 'content.profile.fullName',
      'Add your full name to the profile.'
    ));
  }
  if (!profile.email.trim()) {
    reasons.push(reason(
      'missing-email', 'medium',
      'Your email address is missing. Parsers extract email via pattern matching from the contact block, and recruiters rely on it to follow up.',
      -15, 'content.profile.email',
      'Add a valid email address to your profile.'
    ));
  }
  if (!profile.phone.trim() && !profile.location.trim()) {
    reasons.push(reason(
      'missing-phone-or-location', 'medium',
      'Neither a phone number nor a location is set. Parsers look for at least one of these alongside your email to build a complete contact record.',
      -6, 'content.profile',
      'Add a phone number or a city/region to your profile.'
    ));
  }
  const unclearLink = profile.links.find((link) => !/^https?:\/\//i.test(link) && !/^[\w.-]+\.[a-z]{2,}/i.test(link));
  if (unclearLink) {
    reasons.push(reason(
      'unclear-link', 'medium',
      `The link "${unclearLink}" doesn't look like a standard URL or domain. Parsers extract links via pattern matching and may render this as plain, unclickable text.`,
      -8, 'content.profile.links',
      'Use a full URL (e.g. https://linkedin.com/in/yourname) or a bare domain (yourname.dev).'
    ));
  }
  const hiddenContactField = resume.content.profile.hiddenFields?.find((field) => ['email', 'phone', 'location', 'links'].includes(field));
  if (hiddenContactField) {
    reasons.push(reason(
      'hidden-contact-field', 'medium',
      `Your ${hiddenContactField} is hidden from the rendered resume. Parsers can only read what's in the exported document — a hidden field is invisible to them.`,
      -8, 'content.profile.hiddenFields',
      "Unhide this field, or remove it if you don't want it included."
    ));
  }

  if (!experienceSections.length) {
    reasons.push(reason(
      'missing-experience-section', 'high',
      'No section is titled "Experience," "Work Experience," or similar. Parsers locate your job history by matching this label, then extract titles, companies, and dates from underneath it.',
      -18, 'content.flexSections',
      'Add or rename a section to "Experience" or "Work Experience".'
    ));
  }
  if (!skillSections.length) {
    reasons.push(reason(
      'missing-skills-section', 'medium',
      'No section is titled "Skills" or similar. Parsers use this label to locate the keyword list they match against job requirements.',
      -12, 'content.flexSections',
      'Add or rename a section to "Skills" or "Technical Skills".'
    ));
  }
  if (!hasAnySection(sectionNames, ['education', 'projects', 'certifications', 'awards', 'volunteer', 'research', 'publications'])) {
    reasons.push(reason(
      'missing-supporting-section', 'medium',
      'No Education, Projects, Certifications, Awards, Volunteer, Research, or Publications section is present. These give parsers extra anchors to file additional context under.',
      -8, 'content.flexSections',
      'Add at least one supporting section using a standard label, e.g. "Education".'
    ));
  }

  for (const section of visibleSections) {
    if (!matchesAnyStandardSection(section.name)) {
      reasons.push(reason(
        'nonstandard-section-heading', 'medium',
        `Heading "${section.name}" doesn't match any section label ATS parsers recognize, so its content may be skipped or filed under the wrong category.`,
        -6, `content.flexSections.${section.id}.name`,
        sectionRenameSuggestion(section.name)
      ));
    } else if (isAllCapsHeading(section.name)) {
      reasons.push(reason(
        'all-caps-section-heading', 'medium',
        `Heading "${section.name}" is in ALL CAPS. Some parsers tokenize all-caps text as acronyms or skip it when scanning for section labels.`,
        -4, `content.flexSections.${section.id}.name`,
        `Use standard capitalization, e.g. "${toTitleCase(section.name)}".`
      ));
    }
    const charCount = sectionText(section).trim().length;
    if (charCount < 12) {
      reasons.push(reason(
        'empty-section', 'medium',
        `Section "${section.name}" has almost no text (${charCount} characters). Parsers extract nothing useful from a section this short.`,
        -8, `content.flexSections.${section.id}`,
        'Add real content to this section, or remove/hide it.'
      ));
    }
  }

  const datedEntries = visibleSections.flatMap((section) =>
    extractDateValues(section).filter(Boolean).map((value) => ({ sectionId: section.id, sectionName: section.name, value }))
  );

  const unclearDated = datedEntries.find(({ value }) => UNCLEAR_DATE_PATTERN.test(value) || !CLEAR_DATE_PATTERN.test(value));
  if (unclearDated) {
    reasons.push(reason(
      'unclear-date-format', 'medium',
      `The date "${unclearDated.value}" in ${unclearDated.sectionName} doesn't match a format parsers normalize reliably (e.g. "Mar 2022" or "03/2022").`,
      -8, `content.flexSections.${unclearDated.sectionId}`,
      'Rewrite it as "Mon YYYY" or "MM/YYYY" — e.g. "Jun 2021" or "06/2021".'
    ));
  }

  const clearDated = datedEntries.filter(({ value }) => CLEAR_DATE_PATTERN.test(value) && !UNCLEAR_DATE_PATTERN.test(value));
  const distinctStyles = clearDated
    .flatMap((entry) => {
      const bucket = dateStyleBucket(entry.value);
      return bucket ? [{ ...entry, ...bucket }] : [];
    })
    .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index);
  if (distinctStyles.length >= 2) {
    const [first, second] = distinctStyles;
    reasons.push(reason(
      'inconsistent-date-format', 'medium',
      `Your dates mix formats — e.g. "${first.example}" in ${first.sectionName} vs "${second.example}" in ${second.sectionName}. Parsers normalize a single consistent format more reliably than mixed styles.`,
      -6, `content.flexSections.${first.sectionId}`,
      'Pick one format ("Mon YYYY" or "MM/YYYY") and use it for every date on the resume.'
    ));
  }

  if (!options.generatedText?.trim()) {
    reasons.push(reason(
      'pdf-text-not-tested', 'medium',
      "PDF text extraction hasn't been verified for this version. This is the most direct test of whether an ATS can actually read your exported file.",
      -8, 'artifact.generatedText',
      "Compile the resume, then run ATS Readiness again — it checks the generated PDF's text layer."
    ));
  } else if (pdfTextContainsKeyContent(options.generatedText, resume)) {
    reasons.push(reason(
      'pdf-text-present', 'info',
      "Your exported PDF's text layer includes your key resume content — the same content an ATS parser would extract.",
      0, 'artifact.generatedText'
    ));
  } else {
    reasons.push(reason(
      'pdf-text-missing-key-content', 'high',
      "Key content (your name, section headings, top lines) is missing from the exported PDF's text layer. This usually means the PDF renders as an image or uses a font/encoding a parser can't read — an ATS would extract little or nothing from your resume.",
      -16, 'artifact.generatedText',
      'Try a different template or font, then re-export and re-run this check.'
    ));
  }

  if (reasons.every((item) => (item.impact ?? 0) >= 0)) {
    reasons.unshift(reason('baseline-pass', 'info', 'No deterministic ATS blockers found.', 0, 'resume'));
  }

  const penalty = reasons.reduce((total, item) => total + Math.min(item.impact ?? 0, 0), 0);
  const readinessPercent = clampPercent(100 + penalty);
  const createdAt = options.createdAt ?? new Date().toISOString();

  return {
    id: createId('score'),
    schemaVersion: 1,
    resumeId: resume.id,
    resumeVersion: resume.version,
    kind: 'ats',
    methodologyVersion: 'ats-deterministic-v3',
    readinessPercent,
    reasons,
    createdAt
  };
};

export const runAtsChecks = (resume: ResumeRecord): CheckResult[] => {
  const report = buildAtsReadinessReport(resume);
  return report.reasons.map((item) => result(
    item.id,
    item.id === 'missing-name' ? 'blocked' : (item.impact ?? 0) < 0 ? 'warning' : 'pass',
    item.severity,
    item.field ?? 'resume',
    item.message,
    item.suggestion ?? ((item.impact ?? 0) < 0 ? 'Review this field to improve ATS readiness.' : 'No action required.')
  ));
};

const result = (
  id: string,
  status: CheckResult['status'],
  severity: CheckResult['severity'],
  field: string,
  message: string,
  suggestion: string
): CheckResult => ({ id, status, severity, field, message, suggestion });

const reason = (
  id: string,
  severity: AtsReason['severity'],
  message: string,
  impact: number,
  field?: string,
  suggestion?: string
): AtsReason => ({ id, field, severity, message, impact, suggestion });

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const matchesSection = (name: string, kind: keyof typeof STANDARD_SECTION_PATTERNS) =>
  STANDARD_SECTION_PATTERNS[kind].some((pattern) => pattern.test(name));

const matchesAnyStandardSection = (name: string) =>
  Object.values(STANDARD_SECTION_PATTERNS).some((patterns) => patterns.some((pattern) => pattern.test(name)));

const hasAnySection = (names: string[], kinds: (keyof typeof STANDARD_SECTION_PATTERNS)[]) =>
  names.some((name) => kinds.some((kind) => matchesSection(name, kind)));

const isHeading = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is CvSubsectionHeading =>
  'kind' in item && item.kind === 'subsection-heading';

const isSubSection = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is FlexSubSection =>
  'environment' in item;

const entryText = (entry: FlexEntry): string =>
  Object.values(entry.fields).flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean).join('\n');

const itemText = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): string => {
  if (isHeading(item)) return item.text;
  if (isSubSection(item)) return item.items.map(itemText).join('\n');
  return entryText(item);
};

const sectionText = (section: FlexSection): string => section.items.map(itemText).join('\n');

const sectionRenameSuggestion = (name: string): string => {
  const hint = SECTION_RENAME_HINTS.find((entry) => entry.pattern.test(name));
  if (hint) {
    const labelText = hint.labels.length > 1 ? `"${hint.labels[0]}" or "${hint.labels[1]}"` : `"${hint.labels[0]}"`;
    return `This looks like a ${hint.looksLike} section — rename it to ${labelText} so parsers categorize it correctly.`;
  }
  return `Use a literal label parsers recognize, such as ${STANDARD_SECTION_LABELS.join(', ')}.`;
};

const isAllCapsHeading = (name: string) => /[a-zA-Z]/.test(name) && name === name.toUpperCase();

const toTitleCase = (name: string) => name.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

const dateStyleBucket = (value: string): { id: string; example: string } | null => {
  for (const bucket of DATE_STYLE_BUCKETS) {
    const match = value.match(bucket.pattern);
    if (match) return { id: bucket.id, example: match[0].trim() };
  }
  return null;
};

const extractDateValues = (section: FlexSection): string[] =>
  section.items.flatMap((item) => {
    if (isHeading(item)) return [];
    if (isSubSection(item)) return item.items.flatMap((subItem) => isHeading(subItem) ? [] : isSubSection(subItem) ? [] : dateValuesFromEntry(subItem));
    return dateValuesFromEntry(item);
  });

const dateValuesFromEntry = (entry: FlexEntry): string[] => {
  const date = entry.fields.date;
  return Array.isArray(date) ? date : [String(date ?? '')];
};

const pdfTextContainsKeyContent = (generatedText: string, resume: ResumeRecord): boolean => {
  const normalized = normalizeText(generatedText);
  const keyValues = [
    resume.content.profile.fullName,
    resume.content.profile.email,
    ...resume.content.flexSections.map((section) => section.name),
    ...resume.content.flexSections.flatMap((section) => sectionText(section).split(/\n+/).slice(0, 2))
  ].map(normalizeText).filter((value) => value.length >= 4);
  if (keyValues.length === 0) return true;
  const matched = keyValues.filter((value) => normalized.includes(value)).length;
  return matched / keyValues.length >= 0.45;
};

const normalizeText = (value: string) => value.toLowerCase().replace(/[^a-z0-9@.+#]+/g, ' ').replace(/\s+/g, ' ').trim();
