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
  experience: [/\b(work|professional|relevant)?\s*experience\b/i, /\bemployment\b/i],
  skills: [/\b(skills|technical skills|core skills|technologies)\b/i],
  education: [/\beducation\b/i],
  projects: [/\bprojects?\b/i],
  research: [/\bresearch\b/i],
  publications: [/\bpublications?\b/i],
};

const NONSTANDARD_SECTION_PATTERN = /\b(my journey|career story|the toolkit|where i've been|about me|what i do)\b/i;
const PLACEHOLDER_PATTERN = /\b(lorem ipsum|your email|yourusername|company name|senior job title|mid-level job title|junior job title|month year|tool a|language a|first last)\b/i;
const CLEAR_DATE_PATTERN = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}\b|\b\d{1,2}\/\d{4}\b|\b\d{4}\b|\bpresent\b)/i;
const UNCLEAR_DATE_PATTERN = /['’]\d{2}\b|\bsummer\b|\bspring\b|\bfall\b|\bwinter\b/i;

export const buildAtsReadinessReport = (
  resume: ResumeRecord,
  options: AtsReadinessOptions = {}
): ScoringReportRecord => {
  const reasons: AtsReason[] = [];
  const profile = resume.content.profile;
  const sectionNames = resume.content.flexSections.map((section) => section.name);
  const visibleSections = resume.content.flexSections.filter((section) => !section.hidden);
  const flattenedText = flattenResumeText(resume);
  const experienceSections = visibleSections.filter((section) => matchesSection(section.name, 'experience'));
  const skillSections = visibleSections.filter((section) => matchesSection(section.name, 'skills'));

  if (!profile.fullName.trim()) {
    reasons.push(reason('missing-name', 'high', 'Name is required for every template.', -30, 'content.profile.fullName'));
  }
  if (!profile.email.trim()) {
    reasons.push(reason('missing-email', 'medium', 'Email is missing from the contact block.', -15, 'content.profile.email'));
  }
  if (!profile.phone.trim() && !profile.location.trim()) {
    reasons.push(reason('missing-phone-or-location', 'medium', 'No phone number or location is available for parser contact extraction.', -6, 'content.profile'));
  }
  if (resume.content.summary.length > 700) {
    reasons.push(reason('long-summary', 'medium', 'Summary is unusually long for ATS scanning.', -10, 'content.summary'));
  }
  if (profile.links.some((link) => !/^https?:\/\//i.test(link) && !/^[\w.-]+\.[a-z]{2,}/i.test(link))) {
    reasons.push(reason('unclear-link', 'medium', 'One or more links may not be readable when exported.', -8, 'content.profile.links'));
  }
  if (resume.content.profile.hiddenFields?.some((field) => ['email', 'phone', 'location', 'links'].includes(field))) {
    reasons.push(reason('hidden-contact-field', 'medium', 'One or more contact fields are hidden from the rendered resume.', -8, 'content.profile.hiddenFields'));
  }

  if (!experienceSections.length) {
    reasons.push(reason('missing-experience-section', 'high', 'ATS parsers rely on a standard Experience section anchor.', -18, 'content.flexSections'));
  }
  if (!skillSections.length) {
    reasons.push(reason('missing-skills-section', 'medium', 'A standard Skills section helps parsers extract searchable keywords.', -12, 'content.flexSections'));
  }
  if (!hasAnySection(sectionNames, ['education', 'projects', 'research', 'publications'])) {
    reasons.push(reason('missing-supporting-section', 'medium', 'No Education, Projects, Research, or Publications section is available as a standard parser anchor.', -8, 'content.flexSections'));
  }

  for (const section of visibleSections) {
    if (NONSTANDARD_SECTION_PATTERN.test(section.name) || !matchesAnyStandardSection(section.name)) {
      reasons.push(reason('nonstandard-section-heading', 'medium', `Section heading "${section.name}" is not a standard ATS anchor.`, -6, `content.flexSections.${section.id}.name`));
    }
    if (sectionText(section).trim().length < 12) {
      reasons.push(reason('empty-section', 'medium', `Section "${section.name}" has little or no parseable text.`, -8, `content.flexSections.${section.id}`));
    }
  }

  if (PLACEHOLDER_PATTERN.test(flattenedText)) {
    reasons.push(reason('placeholder-text', 'high', 'Template placeholder text is still present in the resume.', -18, 'resume'));
  }

  const experienceBullets = experienceSections.flatMap((section) => extractHighlightLines(section));
  if (experienceSections.length && experienceBullets.filter((line) => wordCount(line) >= 4).length < 2) {
    reasons.push(reason('thin-bullet-structure', 'medium', 'Experience has too few substantial bullet lines for reliable parser extraction.', -10, 'content.flexSections'));
  }

  const dateValues = visibleSections.flatMap(extractDateValues).filter(Boolean);
  if (dateValues.some((value) => UNCLEAR_DATE_PATTERN.test(value) || !CLEAR_DATE_PATTERN.test(value))) {
    reasons.push(reason('unclear-date-format', 'medium', 'One or more dates use a format that ATS parsers may not normalize reliably.', -8, 'content.flexSections'));
  }

  if (!options.generatedText?.trim()) {
    reasons.push(reason('pdf-text-not-tested', 'medium', 'PDF text extraction has not been verified for this resume version.', -8, 'artifact.generatedText'));
  } else if (pdfTextContainsKeyContent(options.generatedText, resume)) {
    reasons.push(reason('pdf-text-present', 'info', 'PDF text extraction is available for review.', 0));
  } else {
    reasons.push(reason('pdf-text-missing-key-content', 'high', 'Extracted PDF text is missing key resume content, which suggests parser risk.', -16, 'artifact.generatedText'));
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
    methodologyVersion: 'ats-deterministic-v2',
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
    item.impact && item.impact < 0 ? 'Review this field to improve ATS readiness.' : 'No action required.'
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
  field?: string
): AtsReason => ({ id, field, severity, message, impact });

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

const flattenResumeText = (resume: ResumeRecord): string => [
  resume.title,
  resume.content.profile.fullName,
  resume.content.profile.headline,
  resume.content.profile.email,
  resume.content.profile.phone,
  resume.content.profile.location,
  (resume.content.profile.links ?? []).join(', '),
  resume.content.summary,
  ...(resume.content.profileHighlights ?? []).map((item) => item.text),
  ...resume.content.flexSections.flatMap((section) => [section.name, sectionText(section)])
].filter(Boolean).join('\n');

const extractHighlightLines = (section: FlexSection): string[] =>
  section.items.flatMap((item) => {
    if (isHeading(item)) return [];
    if (isSubSection(item)) {
      return item.items.flatMap((subItem) => isHeading(subItem) ? [] : isSubSection(subItem) ? [] : highlightLinesFromEntry(subItem));
    }
    return highlightLinesFromEntry(item);
  });

const highlightLinesFromEntry = (entry: FlexEntry): string[] => {
  const highlights = entry.fields.highlights;
  const raw = Array.isArray(highlights) ? highlights.join('\n') : String(highlights ?? '');
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
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

const wordCount = (value: string) => value.split(/\s+/).filter(Boolean).length;

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
