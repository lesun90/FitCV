import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReviewMarkersForField, createResume, duplicateResume, ensureTemplateLayouts, renameResume, sampleResume, starterResume, switchTemplate } from './resume';

describe('resume model', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a normalized resume with template settings kept separate from content', () => {
    const resume = createResume('Base Resume', 'awesome-cv');

    expect(resume.title).toBe('Base Resume');
    expect(resume.activeTemplateId).toBe('awesome-cv');
    expect(resume.content.profile.fullName).toBe('');
    expect(resume.content.flexSections).toEqual([]);
    expect(resume.templateSettings['awesome-cv']).toBeDefined();
    expect(resume.schemaVersion).toBe(1);
  });

  it('creates IDs when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => { array.fill(7); return array; },
    });

    const resume = createResume('Base Resume', 'awesome-cv');

    expect(resume.id).toMatch(/^resume-[0-9a-f-]{36}$/);
  });

  it('duplicates resumes without sharing identity or timestamps', () => {
    const original = createResume('Base Resume', 'awesome-cv');
    const copy = duplicateResume(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Base Resume copy');
    expect(copy.createdAt).not.toBe(original.createdAt);
    expect(copy.content).toEqual(original.content);
    expect(copy.templateLayouts).toEqual(original.templateLayouts);
  });

  it('normalizes adapter layouts for awesome-cv', () => {
    const resume = createResume('Awesome Resume', 'awesome-cv');
    delete (resume as Partial<typeof resume>).templateLayouts;

    const normalized = ensureTemplateLayouts(resume);

    expect(normalized.content.flexSections).toEqual([]);
    const layout = normalized.templateLayouts['awesome-cv'];
    expect(layout).toBeDefined();
    expect(layout[0]).toMatchObject({ kind: 'section', section: 'summary' });
  });

  it('initializes flexSections to empty array if missing', () => {
    const resume = createResume('Test', 'awesome-cv');
    delete (resume.content as Partial<typeof resume.content>).flexSections;

    const normalized = ensureTemplateLayouts(resume);

    expect(normalized.content.flexSections).toEqual([]);
  });

  it('preserves layout when switching to the same template', () => {
    const resume = createResume('Switchable Resume', 'awesome-cv');
    const awesomeLayout = resume.templateLayouts['awesome-cv'];
    const withSpace = {
      ...resume,
      templateLayouts: {
        ...resume.templateLayouts,
        'awesome-cv': [
          ...awesomeLayout.slice(0, 1),
          { id: 'space-test', kind: 'space' as const, enabled: true, value: 12 },
          ...awesomeLayout.slice(1),
        ],
      },
    };

    const result = switchTemplate(withSpace, 'awesome-cv');

    expect(result.content).toEqual(resume.content);
    expect(result.templateLayouts['awesome-cv'].some((m) => m.id === 'space-test')).toBe(true);
  });

  it('renames a resume while preserving content and updating metadata', () => {
    const original = createResume('Base Resume', 'awesome-cv');
    const renamed = renameResume(original, 'Staff Engineer CV');

    expect(renamed.title).toBe('Staff Engineer CV');
    expect(renamed.content).toEqual(original.content);
    expect(renamed.updatedAt).not.toBe(original.updatedAt);
  });

  it('clears review markers for an edited field without discarding review history', () => {
    const resume = createResume('Imported Resume', 'awesome-cv');
    resume.reviewMarkers = [
      { field: 'content.profile.fullName', sourceSnippet: 'Ada Lovelace', note: 'Detected from the first text line.', needsReview: true },
      { field: 'content.summary', sourceSnippet: 'Computing pioneer', note: 'Built from early PDF text lines.', needsReview: true },
    ];

    const reviewed = clearReviewMarkersForField(resume, 'content.profile.fullName');

    expect(reviewed.reviewMarkers[0].needsReview).toBe(false);
    expect(reviewed.reviewMarkers[1].needsReview).toBe(true);
    expect(reviewed.version).toBe(resume.version + 1);
  });

  it('sampleResume has flex sections populated', () => {
    const resume = sampleResume();
    expect(resume.content.flexSections.length).toBeGreaterThan(0);
    expect(resume.templateLayouts['awesome-cv'].some((m) => m.kind === 'flex-section')).toBe(true);
  });

  it('starterResume has flex sections with sub-sections and entries', () => {
    const resume = starterResume();
    expect(resume.content.flexSections.length).toBeGreaterThan(0);
    const expSection = resume.content.flexSections[0];
    expect(expSection.items.length).toBeGreaterThan(0);
    const sub = expSection.items[0];
    expect('environment' in sub).toBe(true);
  });
});
