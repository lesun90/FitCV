import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiImportResumeContent, createResumeFromPdf, extractTextFromFile } from './importer';

vi.mock('./pdf', () => ({
  extractPdfText: vi.fn()
}));

vi.mock('./aiProvider', () => ({
  requestImportFromCv: vi.fn()
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

describe('extractTextFromFile', () => {
  let extractPdfText: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import('./pdf');
    extractPdfText = vi.mocked(mod.extractPdfText);
    vi.clearAllMocks();
  });

  it('routes PDF files to extractPdfText', async () => {
    extractPdfText.mockResolvedValue('Ada Lovelace\nEngineer');
    const file = new File([''], 'cv.pdf', { type: 'application/pdf' });

    const result = await extractTextFromFile(file);

    expect(extractPdfText).toHaveBeenCalledWith(file);
    expect(result.text).toBe('Ada Lovelace\nEngineer');
    expect(result.truncated).toBe(false);
  });

  it('reads TXT files as plain text without calling extractPdfText', async () => {
    const file = new File(['Ada Lovelace\nSoftware Engineer'], 'cv.txt', { type: 'text/plain' });

    const result = await extractTextFromFile(file);

    expect(extractPdfText).not.toHaveBeenCalled();
    expect(result.text).toBe('Ada Lovelace\nSoftware Engineer');
    expect(result.truncated).toBe(false);
  });

  it('reads Markdown files as plain text', async () => {
    const file = new File(['# Ada Lovelace\n\nPioneer in computing.'], 'cv.md', { type: 'text/markdown' });

    const result = await extractTextFromFile(file);

    expect(result.text).toContain('Ada Lovelace');
    expect(result.truncated).toBe(false);
  });

  it('truncates files exceeding the character limit and sets the truncated flag', async () => {
    const longText = 'A'.repeat(15_000);
    const file = new File([longText], 'long.txt', { type: 'text/plain' });

    const result = await extractTextFromFile(file);

    expect(result.text.length).toBe(12_000);
    expect(result.truncated).toBe(true);
  });

  it('throws when a text file is empty', async () => {
    const file = new File(['   '], 'empty.txt', { type: 'text/plain' });

    await expect(extractTextFromFile(file)).rejects.toThrow('contains no text');
  });

  it('throws for unsupported file types', async () => {
    const file = new File(['content'], 'cv.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    await expect(extractTextFromFile(file)).rejects.toThrow('Unsupported file type');
  });
});

describe('aiImportResumeContent', () => {
  let extractPdfText: ReturnType<typeof vi.fn>;
  let requestImportFromCv: ReturnType<typeof vi.fn>;

  const minimalContent = {
    profile: { fullName: 'Ada Lovelace', headline: 'Engineer', email: 'ada@example.com', phone: '', location: '', links: [], linkedin: '', extraInfo: '', gitlab: '', stackoverflow: { id: '', name: '' }, twitter: '', x: '', skype: '', reddit: '', medium: '', kaggle: '', hackerrank: '', telegram: '', googleScholar: { id: '', name: '' }, quote: '', hiddenFields: [] },
    summary: 'Computing pioneer.',
    profileHighlights: [],
    flexSections: [{ id: 'section-1', name: 'SKILLS', items: [] }],
  };

  const testTemplate = {
    id: 'awesome-cv' as const,
    name: 'Awesome CV',
    description: 'Test template',
    browserCompatibility: { engine: 'xelatex' as const, notes: [] },
    fixture: { sampleResumeId: '', expectedText: [] },
    sectionEnvs: [{ id: 'cvskills', label: 'Skills', allowedEntryTypeIds: ['cvskill'] }],
    entryTypes: [{ id: 'cvskill', label: 'Skill Group', fields: [{ id: 'type', label: 'Category' }, { id: 'skills', label: 'Skills' }] }],
  };

  beforeEach(async () => {
    const pdfMod = await import('./pdf');
    extractPdfText = vi.mocked(pdfMod.extractPdfText);
    const aiMod = await import('./aiProvider');
    requestImportFromCv = vi.mocked(aiMod.requestImportFromCv);
    vi.clearAllMocks();
  });

  it('orchestrates file extraction and AI call, returning content, markers, and importNotes', async () => {
    extractPdfText.mockResolvedValue('Ada Lovelace\nEngineer');
    requestImportFromCv.mockResolvedValue(minimalContent);
    const file = new File([''], 'ada-cv.pdf', { type: 'application/pdf' });
    const settings = { id: 'default', schemaVersion: 1 as const, endpointUrl: 'https://ai.test', model: 'gpt-4o', rememberApiKey: false, createdAt: '', updatedAt: '' };

    const result = await aiImportResumeContent(file, settings, testTemplate);

    expect(result.content.profile.fullName).toBe('Ada Lovelace');
    expect(result.reviewMarkers.length).toBeGreaterThan(0);
    expect(result.reviewMarkers.every((m) => m.needsReview)).toBe(true);
    expect(result.importNotes[0]).toContain('ada-cv.pdf');
  });

  it('creates review markers for populated profile fields, summary, and flex sections', async () => {
    extractPdfText.mockResolvedValue('Ada Lovelace\nEngineer');
    requestImportFromCv.mockResolvedValue(minimalContent);
    const file = new File([''], 'cv.pdf', { type: 'application/pdf' });
    const settings = { id: 'default', schemaVersion: 1 as const, endpointUrl: 'https://ai.test', model: 'gpt-4o', rememberApiKey: false, createdAt: '', updatedAt: '' };

    const { reviewMarkers } = await aiImportResumeContent(file, settings, testTemplate);

    expect(reviewMarkers.some((m) => m.field === 'content.profile.fullName')).toBe(true);
    expect(reviewMarkers.some((m) => m.field === 'content.profile.email')).toBe(true);
    expect(reviewMarkers.some((m) => m.field === 'content.summary')).toBe(true);
    expect(reviewMarkers.some((m) => m.field.startsWith('content.flexSections.'))).toBe(true);
  });

  it('includes a truncation note in importNotes when the file text was cut', async () => {
    const longText = 'A'.repeat(15_000);
    const file = new File([longText], 'long-cv.txt', { type: 'text/plain' });
    requestImportFromCv.mockResolvedValue(minimalContent);
    const settings = { id: 'default', schemaVersion: 1 as const, endpointUrl: 'https://ai.test', model: 'gpt-4o', rememberApiKey: false, createdAt: '', updatedAt: '' };

    const { importNotes } = await aiImportResumeContent(file, settings, testTemplate);

    expect(importNotes.some((n) => n.includes('truncated'))).toBe(true);
  });
});
