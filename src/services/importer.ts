import { createResume } from '../domain/resume';
import type { TemplateRegistryEntry } from '../domain/templates';
import type { FlexEntry, FlexSection, FlexSubSection, Profile, ResumeContent, ResumeRecord, ReviewMarker } from '../domain/types';
import { createId } from '../domain/ids';
import { requestImportFromCv, type AiProviderSettings } from './aiProvider';
import { extractPdfText } from './pdf';

export const createResumeFromPdf = async (file: File): Promise<ResumeRecord> => {
  const text = await extractPdfText(file);
  if (!text) {
    throw new Error('This PDF did not contain extractable text. Scanned PDFs and OCR are outside milestone 1.');
  }

  const lines = text
    .split(/\n| {2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const resume = createResume(file.name.replace(/\.pdf$/i, ''), 'awesome-cv');
  const [name = '', headline = '', ...rest] = lines;

  resume.content.profile.fullName = name;
  resume.content.profile.headline = headline;
  resume.content.profile.email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  resume.content.profile.phone = text.match(/\+?[\d .()-]{8,}/)?.[0]?.trim() ?? '';
  resume.content.summary = rest.slice(0, 4).join(' ');

  const bulletText = rest.slice(4).join('\n');
  if (bulletText.trim()) {
    const entries: FlexEntry[] = bulletText
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => ({
        id: createId('entry'),
        type: 'item',
        fields: { text: line.trim() },
      }));

    const sub: FlexSubSection = {
      id: createId('sub'),
      environment: 'cvitems',
      items: entries,
    };

    const section: FlexSection = {
      id: createId('section'),
      name: 'IMPORTED CONTENT',
      items: [sub],
    };

    resume.content.flexSections = [section];
  }

  resume.importNotes = ['Imported from PDF with extractable text. Review markers were added because parsing is heuristic.'];
  resume.reviewMarkers = [
    {
      field: 'content.profile.fullName',
      sourceSnippet: name,
      note: 'Detected from the first text line.',
      needsReview: true,
    },
    {
      field: 'content.summary',
      sourceSnippet: resume.content.summary.slice(0, 160),
      note: 'Built from early PDF text lines.',
      needsReview: true,
    },
  ];

  return resume;
};

const MAX_IMPORT_CHARS = 12_000;

export const extractTextFromFile = async (file: File): Promise<{ text: string; truncated: boolean }> => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  let text: string;

  if (ext === 'pdf' || file.type === 'application/pdf') {
    const extracted = await extractPdfText(file);
    if (!extracted) throw new Error('This PDF did not contain extractable text. Scanned PDFs and OCR are not supported.');
    text = extracted;
  } else if (ext === 'txt' || ext === 'md' || file.type === 'text/plain' || file.type === 'text/markdown') {
    text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
      reader.readAsText(file);
    });
    if (!text.trim()) throw new Error('The file contains no text.');
  } else {
    throw new Error(`Unsupported file type. Please upload a PDF, TXT, or Markdown file.`);
  }

  if (text.length > MAX_IMPORT_CHARS) {
    return { text: text.slice(0, MAX_IMPORT_CHARS), truncated: true };
  }
  return { text, truncated: false };
};

export const aiImportResumeContent = async (
  file: File,
  settings: AiProviderSettings,
  template: TemplateRegistryEntry
): Promise<{ content: ResumeContent; reviewMarkers: ReviewMarker[]; importNotes: string[] }> => {
  const { text, truncated } = await extractTextFromFile(file);

  const content = await requestImportFromCv(settings, {
    text,
    sectionEnvs: template.sectionEnvs ?? [],
    entryTypes: template.entryTypes ?? [],
  });

  const reviewMarkers: ReviewMarker[] = [];

  const profileStringFields: Array<[keyof Pick<Profile, 'fullName' | 'headline' | 'email' | 'phone' | 'location' | 'linkedin'>, string]> = [
    ['fullName', 'Full name'],
    ['headline', 'Headline'],
    ['email', 'Email'],
    ['phone', 'Phone'],
    ['location', 'Location'],
    ['linkedin', 'LinkedIn'],
  ];
  for (const [field, label] of profileStringFields) {
    const val = content.profile[field];
    if (typeof val === 'string' && val.trim()) {
      reviewMarkers.push({
        field: `content.profile.${field}`,
        sourceSnippet: val.slice(0, 80),
        note: `${label} extracted by AI — verify it is correct.`,
        needsReview: true,
      });
    }
  }

  if (content.summary.trim()) {
    reviewMarkers.push({
      field: 'content.summary',
      sourceSnippet: content.summary.slice(0, 160),
      note: 'Summary extracted by AI — verify it is correct.',
      needsReview: true,
    });
  }

  for (const section of content.flexSections) {
    reviewMarkers.push({
      field: `content.flexSections.${section.id}`,
      sourceSnippet: section.name,
      note: `Section "${section.name}" extracted by AI — review entries for accuracy.`,
      needsReview: true,
    });
  }

  const importNotes = [
    `Content extracted from "${file.name}" using AI.`,
    ...(truncated ? [`File was truncated to ${MAX_IMPORT_CHARS.toLocaleString()} characters for AI processing.`] : []),
  ];

  return { content, reviewMarkers, importNotes };
};
