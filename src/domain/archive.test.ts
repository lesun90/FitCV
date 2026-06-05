import { describe, expect, it } from 'vitest';
import { exportFitcvArchive, importFitcvArchive } from './archive';
import { createResume } from './resume';

describe('.fitcv archive', () => {
  it('round trips local data collections without API keys', async () => {
    const resume = createResume('Local Only Resume', 'awesome-cv');
    const file = await exportFitcvArchive({
      resumes: [resume],
      artifacts: [],
      fittedCvs: [],
      jobDescriptions: [],
      scoringReports: []
    });
    const imported = await importFitcvArchive(file);

    expect(file.name).toMatch(/\.fitcv$/);
    expect(imported.resumes).toHaveLength(1);
    expect(imported.resumes[0].title).toBe('Local Only Resume');
    expect(imported.fittedCvs).toEqual([]);
    expect(imported.jobDescriptions).toEqual([]);
    expect(imported.scoringReports).toEqual([]);
    expect(JSON.stringify(imported)).not.toMatch(/apiKey|secret/i);
  });

  it('normalizes imported older resumes that do not have template layouts', async () => {
    const resume = createResume('Older Resume', 'awesome-cv');
    delete (resume as Partial<typeof resume>).templateLayouts;
    const file = await exportFitcvArchive({
      resumes: [resume],
      artifacts: [],
      fittedCvs: [],
      jobDescriptions: [],
      scoringReports: []
    });

    const imported = await importFitcvArchive(file);

    expect(imported.resumes[0].templateLayouts['awesome-cv']).toBeDefined();
  });

  it('strips provider API keys when provider metadata is exported', async () => {
    const file = await exportFitcvArchive({
      resumes: [],
      artifacts: [],
      fittedCvs: [],
      jobDescriptions: [],
      scoringReports: [],
      providerSettings: [{
        id: 'default',
        schemaVersion: 1,
        endpointUrl: 'https://ai.example.test/v1/chat/completions',
        model: 'cv-model',
        rememberApiKey: true,
        apiKey: 'remembered-secret',
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z'
      }]
    });

    const payload = await file.text();

    expect(payload).toContain('https://ai.example.test');
    expect(payload).not.toContain('remembered-secret');
    expect(payload).not.toContain('apiKey');
  });

  it('round trips readiness reports as latest local scoring metadata', async () => {
    const resume = createResume('Readiness Resume', 'awesome-cv');
    const file = await exportFitcvArchive({
      resumes: [resume],
      artifacts: [],
      fittedCvs: [],
      jobDescriptions: [],
      scoringReports: [{
        id: 'score-ats',
        schemaVersion: 1,
        resumeId: resume.id,
        resumeVersion: resume.version,
        kind: 'ats',
        methodologyVersion: 'ats-deterministic-v1',
        readinessPercent: 94,
        reasons: [{
          id: 'baseline-pass',
          severity: 'info',
          message: 'No deterministic ATS blockers found.',
          impact: 0
        }],
        createdAt: '2026-06-01T00:00:00.000Z'
      }]
    });

    const imported = await importFitcvArchive(file);

    expect(imported.scoringReports).toEqual([
      expect.objectContaining({
        kind: 'ats',
        readinessPercent: 94,
        reasons: [expect.objectContaining({ id: 'baseline-pass' })]
      })
    ]);
  });
});
