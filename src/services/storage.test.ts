import { beforeEach, describe, expect, it } from 'vitest';
import { storage } from './storage';
import { createResume } from '../domain/resume';

describe('local storage service', () => {
  beforeEach(async () => {
    await indexedDB.deleteDatabase('fitcv-local-workbench');
  });

  it('persists documented local-first collections beyond base resumes', async () => {
    await storage.saveJobDescription({
      id: 'jd-1',
      schemaVersion: 1,
      title: 'Frontend Engineer',
      description: 'Build accessible browser tools.',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveScoringReport({
      id: 'score-1',
      schemaVersion: 1,
      resumeId: 'resume-1',
      resumeVersion: 1,
      kind: 'ats',
      methodologyVersion: 'deterministic-v1',
      suggestions: [],
      createdAt: '2026-06-01T00:00:00.000Z'
    });

    expect(await storage.listJobDescriptions()).toHaveLength(1);
    expect(await storage.listScoringReports()).toHaveLength(1);
  });

  it('normalizes resumes loaded from IndexedDB before returning them', async () => {
    const resume = createResume('Stored Resume', 'awesome-cv');
    delete (resume as Partial<typeof resume>).templateLayouts;

    await storage.saveResume(resume);

    expect((await storage.listResumes())[0].templateLayouts['awesome-cv']).toBeDefined();
  });
});
