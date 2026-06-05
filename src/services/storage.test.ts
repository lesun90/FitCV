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
      readinessPercent: 92,
      reasons: [],
      createdAt: '2026-06-01T00:00:00.000Z'
    });

    expect(await storage.listJobDescriptions()).toHaveLength(1);
    expect(await storage.listScoringReports()).toHaveLength(1);
  });

  it('keeps only the latest readiness report per resume and kind', async () => {
    await storage.saveScoringReport({
      id: 'score-old',
      schemaVersion: 1,
      resumeId: 'resume-1',
      resumeVersion: 1,
      kind: 'ats',
      methodologyVersion: 'ats-deterministic-v1',
      readinessPercent: 70,
      reasons: [],
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveScoringReport({
      id: 'score-new',
      schemaVersion: 1,
      resumeId: 'resume-1',
      resumeVersion: 2,
      kind: 'ats',
      methodologyVersion: 'ats-deterministic-v1',
      readinessPercent: 88,
      reasons: [],
      createdAt: '2026-06-02T00:00:00.000Z'
    });

    const reports = await storage.listScoringReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ id: 'score-new', readinessPercent: 88 });
  });

  it('keeps separate latest JD match readiness reports per job description', async () => {
    for (const jobDescriptionId of ['jd-1', 'jd-2']) {
      await storage.saveScoringReport({
        id: `score-${jobDescriptionId}`,
        schemaVersion: 1,
        resumeId: 'resume-1',
        resumeVersion: 1,
        kind: 'jd-match',
        jobDescriptionId,
        methodologyVersion: 'jd-ai-v1',
        readinessPercent: jobDescriptionId === 'jd-1' ? 60 : 75,
        reasons: [],
        createdAt: '2026-06-01T00:00:00.000Z'
      });
    }

    expect(await storage.listScoringReports()).toHaveLength(2);
  });

  it('keeps only the latest JD match report per fitted CV and job description', async () => {
    await storage.saveScoringReport({
      id: 'fit-score-old',
      schemaVersion: 1,
      resumeId: 'fit-1',
      targetType: 'fitted-cv',
      targetId: 'fit-1',
      resumeVersion: 1,
      kind: 'jd-match',
      jobDescriptionId: 'jd-1',
      methodologyVersion: 'jd-match-ai-v1',
      readinessPercent: 61,
      reasons: [],
      createdAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveScoringReport({
      id: 'fit-score-new',
      schemaVersion: 1,
      resumeId: 'fit-1',
      targetType: 'fitted-cv',
      targetId: 'fit-1',
      resumeVersion: 2,
      kind: 'jd-match',
      jobDescriptionId: 'jd-1',
      methodologyVersion: 'jd-match-ai-v1',
      readinessPercent: 84,
      reasons: [],
      createdAt: '2026-06-02T00:00:00.000Z'
    });

    const reports = await storage.listScoringReports();

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ id: 'fit-score-new', targetType: 'fitted-cv', readinessPercent: 84 });
  });

  it('deletes a base resume with linked fitted CVs, artifacts, scoring reports, and unshared JDs', async () => {
    const base = createResume('Base Resume', 'awesome-cv');
    await storage.saveResume(base);
    await storage.saveJobDescription({
      id: 'jd-linked',
      schemaVersion: 1,
      title: 'Linked JD',
      description: 'Build browser tools.',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveJobDescription({
      id: 'jd-shared',
      schemaVersion: 1,
      title: 'Shared JD',
      description: 'Shared.',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveFittedCv({
      id: 'fit-linked',
      schemaVersion: 1,
      title: 'Fit Linked',
      sourceResumeId: base.id,
      sourceVersion: base.version,
      activeTemplateId: base.activeTemplateId,
      templateLayouts: base.templateLayouts,
      templateSettings: base.templateSettings,
      content: base.content,
      jobDescriptionId: 'jd-linked',
      proposedChanges: [],
      acceptedChangeIds: [],
      rejectedChangeIds: [],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      version: 1
    });
    await storage.saveFittedCv({
      id: 'fit-other',
      schemaVersion: 1,
      title: 'Fit Other',
      sourceResumeId: 'other-resume',
      sourceVersion: 1,
      activeTemplateId: base.activeTemplateId,
      templateLayouts: base.templateLayouts,
      templateSettings: base.templateSettings,
      content: base.content,
      jobDescriptionId: 'jd-shared',
      proposedChanges: [],
      acceptedChangeIds: [],
      rejectedChangeIds: [],
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
      version: 1
    });
    await storage.saveArtifact({
      id: 'artifact-fit',
      schemaVersion: 1,
      resumeId: 'fit-linked',
      targetType: 'fitted-cv',
      targetId: 'fit-linked',
      templateId: 'awesome-cv',
      resumeVersion: 1,
      status: 'clean',
      logs: [],
      latexSource: '',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z'
    });
    await storage.saveScoringReport({
      id: 'score-fit',
      schemaVersion: 1,
      resumeId: 'fit-linked',
      targetType: 'fitted-cv',
      targetId: 'fit-linked',
      resumeVersion: 1,
      kind: 'jd-match',
      jobDescriptionId: 'jd-linked',
      methodologyVersion: 'jd-match-ai-v1',
      readinessPercent: 82,
      reasons: [],
      createdAt: '2026-06-01T00:00:00.000Z'
    });

    await storage.deleteResumeCascade(base.id);

    expect(await storage.listResumes()).toHaveLength(0);
    expect((await storage.listFittedCvs()).map((cv) => cv.id)).toEqual(['fit-other']);
    expect((await storage.listArtifacts()).map((item) => item.id)).toEqual([]);
    expect((await storage.listScoringReports()).map((item) => item.id)).toEqual([]);
    expect((await storage.listJobDescriptions()).map((jd) => jd.id)).toEqual(['jd-shared']);
  });

  it('deletes a resume and removes it from the list', async () => {
    const resume = createResume('Temp Resume', 'awesome-cv');
    await storage.saveResume(resume);
    expect(await storage.listResumes()).toHaveLength(1);

    await storage.deleteResume(resume.id);

    expect(await storage.listResumes()).toHaveLength(0);
  });

  it('persists artifacts and returns the latest for a resume', async () => {
    const base = {
      schemaVersion: 1 as const,
      resumeId: 'resume-artifacts',
      templateId: 'awesome-cv' as const,
      resumeVersion: 1,
      status: 'clean' as const,
      logs: [],
      latexSource: ''
    };
    await storage.saveArtifact({ ...base, id: 'artifact-old', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' });
    await storage.saveArtifact({ ...base, id: 'artifact-new', createdAt: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z' });

    expect(await storage.listArtifacts()).toHaveLength(2);
    expect((await storage.latestArtifact('resume-artifacts'))?.id).toBe('artifact-new');
  });

  it('persists and retrieves app preferences', async () => {
    await storage.savePreference({ id: 'default', schemaVersion: 1, theme: 'dark', panels: { style: true, preview: false } });

    const pref = await storage.getPreference();
    expect(pref?.theme).toBe('dark');
    expect(pref?.panels).toEqual({ style: true, preview: false });
  });

  it('normalizes resumes loaded from IndexedDB before returning them', async () => {
    const resume = createResume('Stored Resume', 'awesome-cv');
    delete (resume as Partial<typeof resume>).templateLayouts;

    await storage.saveResume(resume);

    expect((await storage.listResumes())[0].templateLayouts['awesome-cv']).toBeDefined();
  });

  it('persists provider settings and clears remembered API keys without deleting endpoint details', async () => {
    await storage.saveProviderSettings({
      id: 'default',
      schemaVersion: 1,
      endpointUrl: 'https://ai.example.test/v1/chat/completions',
      model: 'cv-model',
      rememberApiKey: true,
      apiKey: 'remembered-secret',
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:00.000Z'
    });

    expect(await storage.getProviderSettings()).toMatchObject({
      endpointUrl: 'https://ai.example.test/v1/chat/completions',
      model: 'cv-model',
      rememberApiKey: true,
      apiKey: 'remembered-secret'
    });

    await storage.clearRememberedProviderApiKey();

    const cleared = await storage.getProviderSettings();
    expect(cleared).toMatchObject({
      endpointUrl: 'https://ai.example.test/v1/chat/completions',
      model: 'cv-model',
      rememberApiKey: false
    });
    expect(cleared).not.toHaveProperty('apiKey');
  });
});
