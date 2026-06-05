import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResumeFromPdf } from './importer';

vi.mock('./pdf', () => ({
  extractPdfText: vi.fn()
}));

describe('PDF importer', () => {
  let extractPdfText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('./pdf');
    extractPdfText = vi.mocked(mod.extractPdfText);
    vi.clearAllMocks();
  });

  it('parses name, email, phone, and summary from extracted PDF text', async () => {
    extractPdfText.mockResolvedValue(
      'Ada Lovelace\nComputing pioneer\nada@example.com +1 555 0142\nBuilt analytical engines.\nDocumented reusable methods.'
    );
    const file = new File([''], 'ada-resume.pdf', { type: 'application/pdf' });

    const resume = await createResumeFromPdf(file);

    expect(resume.title).toBe('ada-resume');
    expect(resume.content.profile.fullName).toBe('Ada Lovelace');
    expect(resume.content.profile.email).toBe('ada@example.com');
    expect(resume.content.profile.phone).toMatch(/\+1 555 0142/);
    expect(resume.content.summary).toBeTruthy();
  });

  it('creates review markers for name and summary fields', async () => {
    extractPdfText.mockResolvedValue('Ada Lovelace\nHeadline\nada@example.com\nSummary text here.');
    const file = new File([''], 'resume.pdf', { type: 'application/pdf' });

    const resume = await createResumeFromPdf(file);

    const nameMarker = resume.reviewMarkers.find((m) => m.field === 'content.profile.fullName');
    const summaryMarker = resume.reviewMarkers.find((m) => m.field === 'content.summary');
    expect(nameMarker?.needsReview).toBe(true);
    expect(summaryMarker?.needsReview).toBe(true);
  });

  it('imports remaining lines as a flex section with cvitems entries', async () => {
    extractPdfText.mockResolvedValue(
      'Ada Lovelace\nHeadline\nada@example.com\nSum 1\nSum 2\nSum 3\nSum 4\nBullet one\nBullet two'
    );
    const file = new File([''], 'resume.pdf', { type: 'application/pdf' });

    const resume = await createResumeFromPdf(file);

    expect(resume.content.flexSections).toHaveLength(1);
    expect(resume.content.flexSections[0].name).toBe('IMPORTED CONTENT');
    const sub = resume.content.flexSections[0].items[0];
    expect('environment' in sub && sub.environment).toBe('cvitems');
  });

  it('throws when the PDF contains no extractable text', async () => {
    extractPdfText.mockResolvedValue('');
    const file = new File([''], 'scanned.pdf', { type: 'application/pdf' });

    await expect(createResumeFromPdf(file)).rejects.toThrow('did not contain extractable text');
  });
});
