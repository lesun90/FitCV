import { describe, expect, it } from 'vitest';
import { exportFitcvArchive, importFitcvArchive } from './archive';
import { createResume } from './resume';

describe('.fitcv archive', () => {
  it('round trips local data collections without API keys', async () => {
    const resume = createResume('Local Only Resume', 'classic-ats');
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
});
