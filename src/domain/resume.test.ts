import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReviewMarkersForField, createResume, duplicateResume, ensureTemplateLayouts, renameResume, switchTemplate } from './resume';

describe('resume model', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a normalized resume with template settings kept separate from content', () => {
    const resume = createResume('Base Resume', 'classic-ats');

    expect(resume.title).toBe('Base Resume');
    expect(resume.activeTemplateId).toBe('classic-ats');
    expect(resume.content.profile.fullName).toBe('');
    expect(resume.templateSettings['classic-ats']).toBeDefined();
    expect(resume.schemaVersion).toBe(1);
  });

  it('creates IDs when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.fill(7);
        return array;
      }
    });

    const resume = createResume('Base Resume', 'classic-ats');

    expect(resume.id).toMatch(/^resume-[0-9a-f-]{36}$/);
  });

  it('duplicates resumes without sharing identity or timestamps', () => {
    const original = createResume('Base Resume', 'classic-ats');
    const copy = duplicateResume(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.title).toBe('Base Resume copy');
    expect(copy.createdAt).not.toBe(original.createdAt);
    expect(copy.content).toEqual(original.content);
    expect(copy.templateLayouts).toEqual(original.templateLayouts);
  });

  it('normalizes adapter layouts without changing resume content', () => {
    const resume = createResume('Awesome Resume', 'awesome-cv');
    resume.hiddenSections = ['projects'];
    delete (resume as Partial<typeof resume>).templateLayouts;

    const normalized = ensureTemplateLayouts(resume);

    expect(normalized.content).toEqual(resume.content);
    expect(normalized.templateLayouts['awesome-cv'].map((module) => module.kind === 'section' ? module.section : module.kind)).toEqual([
      'summary',
      'education',
      'experience',
      'space',
      'new-page',
      'projects',
      'skills',
      'awards'
    ]);
    expect(normalized.templateLayouts['awesome-cv'].find((module) => module.kind === 'section' && module.section === 'projects')).toMatchObject({ enabled: false });
  });

  it('keeps independent layouts when switching templates', () => {
    const resume = createResume('Switchable Resume', 'awesome-cv');
    const awesomeLayout = resume.templateLayouts['awesome-cv'];
    const withSpace = {
      ...resume,
      templateLayouts: {
        ...resume.templateLayouts,
        'awesome-cv': [
          ...awesomeLayout.slice(0, 1),
          { id: 'space-test', kind: 'space' as const, enabled: true, size: 'medium' as const },
          ...awesomeLayout.slice(1)
        ]
      }
    };

    const classic = switchTemplate(withSpace, 'classic-ats');
    const restored = switchTemplate(classic, 'awesome-cv');

    expect(classic.content).toEqual(resume.content);
    expect(classic.templateLayouts['classic-ats']).toBeDefined();
    expect(restored.templateLayouts['awesome-cv'].some((module) => module.id === 'space-test')).toBe(true);
  });

  it('renames a resume while preserving content and updating metadata', () => {
    const original = createResume('Base Resume', 'modern-compact');
    const renamed = renameResume(original, 'Staff Engineer CV');

    expect(renamed.title).toBe('Staff Engineer CV');
    expect(renamed.content).toEqual(original.content);
    expect(renamed.updatedAt).not.toBe(original.updatedAt);
  });

  it('clears review markers for an edited field without discarding review history', () => {
    const resume = createResume('Imported Resume', 'classic-ats');
    resume.reviewMarkers = [
      {
        field: 'content.profile.fullName',
        sourceSnippet: 'Ada Lovelace',
        note: 'Detected from the first text line.',
        needsReview: true
      },
      {
        field: 'content.summary',
        sourceSnippet: 'Computing pioneer',
        note: 'Built from early PDF text lines.',
        needsReview: true
      }
    ];

    const reviewed = clearReviewMarkersForField(resume, 'content.profile.fullName');

    expect(reviewed.reviewMarkers).toEqual([
      {
        field: 'content.profile.fullName',
        sourceSnippet: 'Ada Lovelace',
        note: 'Detected from the first text line.',
        needsReview: false
      },
      {
        field: 'content.summary',
        sourceSnippet: 'Computing pioneer',
        note: 'Built from early PDF text lines.',
        needsReview: true
      }
    ]);
    expect(reviewed.version).toBe(resume.version + 1);
  });
});
