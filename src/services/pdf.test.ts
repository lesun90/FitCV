import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResume } from '../domain/resume';
import { compileResumeToPdf } from './pdf';

describe('resume PDF compile service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the adapter-backed BusyTeX path for Awesome CV', async () => {
    const resume = createResume('Adapter Resume', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';

    const result = await compileResumeToPdf(resume, {
      compileLatexProject: async () => ({
        status: 'success',
        pdfBlob: new Blob(['pdf'], { type: 'application/pdf' }),
        logs: ['BusyTeX ok'],
        diagnostics: [],
        elapsedMs: 1,
        cacheState: 'cached'
      })
    });

    expect(result.status).toBe('clean');
    expect(result.logs).toContain('Rendered adapter-backed LaTeX project for Awesome CV.');
    expect(result.logs).toContain('BusyTeX ok');
    expect(result.latexSource).toContain('\\documentclass');
  });

  it('creates artifact IDs when randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => {
        array.fill(9);
        return array;
      }
    });
    const resume = createResume('Fallback ID Resume', 'classic-ats');

    const result = await compileResumeToPdf(resume);

    expect(result.id).toMatch(/^artifact-[0-9a-f-]{36}$/);
    expect(result.status).toBe('failed');
  });
});
