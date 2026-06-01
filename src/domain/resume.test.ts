import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearReviewMarkersForField, createResume, duplicateResume, renameResume } from './resume';

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
