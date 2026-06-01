import { createResume } from '../domain/resume';
import type { ResumeRecord } from '../domain/types';
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
  const resume = createResume(file.name.replace(/\.pdf$/i, ''), 'classic-ats');
  const [name = '', headline = '', ...rest] = lines;
  resume.content.profile.fullName = name;
  resume.content.profile.headline = headline;
  resume.content.profile.email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '';
  resume.content.profile.phone = text.match(/\+?[\d .()-]{8,}/)?.[0]?.trim() ?? '';
  resume.content.summary = rest.slice(0, 4).join(' ');
  resume.importNotes = ['Imported from a PDF with extractable text. Review markers were added because parsing is deterministic.'];
  resume.reviewMarkers = [
    {
      field: 'content.profile.fullName',
      sourceSnippet: name,
      note: 'Detected from the first text line.',
      needsReview: true
    },
    {
      field: 'content.summary',
      sourceSnippet: resume.content.summary.slice(0, 160),
      note: 'Built from early PDF text lines.',
      needsReview: true
    }
  ];
  return resume;
};
