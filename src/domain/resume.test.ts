import { describe, expect, it } from 'vitest';
import { createResume, duplicateResume, renameResume } from './resume';

describe('resume model', () => {
  it('creates a normalized resume with template settings kept separate from content', () => {
    const resume = createResume('Base Resume', 'classic-ats');

    expect(resume.title).toBe('Base Resume');
    expect(resume.activeTemplateId).toBe('classic-ats');
    expect(resume.content.profile.fullName).toBe('');
    expect(resume.templateSettings['classic-ats']).toBeDefined();
    expect(resume.schemaVersion).toBe(1);
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
});
