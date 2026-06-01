import { describe, expect, it } from 'vitest';
import { exportFitcvArchive, importFitcvArchive } from './archive';
import { createResume } from './resume';

describe('.fitcv archive', () => {
  it('round trips resume data without API keys', async () => {
    const resume = createResume('Local Only Resume', 'classic-ats');
    const file = await exportFitcvArchive({ resumes: [resume], artifacts: [] });
    const imported = await importFitcvArchive(file);

    expect(file.name).toMatch(/\.fitcv$/);
    expect(imported.resumes).toHaveLength(1);
    expect(imported.resumes[0].title).toBe('Local Only Resume');
    expect(JSON.stringify(imported)).not.toMatch(/apiKey|secret/i);
  });
});
