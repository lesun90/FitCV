import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileLatexProject, busyTexLicenseReview } from './latexCompiler';
import type { LatexProjectFile } from '../domain/latexProject';

const compileMock = vi.fn();
const initializeMock = vi.fn();
const isInitializedMock = vi.fn();

vi.mock('texlyre-busytex', () => ({
  BusyTexRunner: vi.fn().mockImplementation(() => ({
    initialize: initializeMock,
    isInitialized: isInitializedMock,
    getConfig: () => ({ engineMode: 'combined' })
  })),
  XeLatex: vi.fn().mockImplementation(() => ({ compile: compileMock })),
  PdfLatex: vi.fn().mockImplementation(() => ({ compile: compileMock })),
  LuaLatex: vi.fn().mockImplementation(() => ({ compile: compileMock }))
}));

describe('LaTeX compiler service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isInitializedMock.mockReturnValue(false);
    initializeMock.mockResolvedValue(undefined);
  });

  it('records accepted AGPL obligations for the selected BusyTeX package', () => {
    expect(busyTexLicenseReview.decision).toBe('accepted');
  });

  it('compiles a project through BusyTeX using the selected main file', async () => {
    compileMock.mockResolvedValue({
      success: true,
      pdf: new Uint8Array([1, 2, 3]),
      log: 'ok',
      exitCode: 0,
      logs: [{ cmd: 'xelatex', stdout: 'compiled', stderr: '', log: 'ok', texmflog: '', missfontlog: '', aux: '', exit_code: 0 }]
    });

    const result = await compileLatexProject({
      engine: 'xelatex',
      mainFile: 'resume.tex',
      files: [
        textFile('resume.tex', '\\documentclass{article}\\begin{document}Hi\\end{document}'),
        textFile('resume/skills.tex', 'TypeScript'),
        { path: 'fonts/Roboto-Regular.ttf', kind: 'binary', data: new Uint8Array([7, 8]) }
      ]
    });

    expect(result.status).toBe('success');
    expect(result.pdfBlob).toBeInstanceOf(Blob);
    expect(compileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('\\documentclass'),
        mainTexPath: 'resume.tex',
        additionalFiles: [
          { path: 'resume/skills.tex', content: 'TypeScript' },
          { path: 'fonts/Roboto-Regular.ttf', content: new Uint8Array([7, 8]) }
        ]
      })
    );
  });

  it('returns a failed compile result when BusyTeX reports an error', async () => {
    compileMock.mockResolvedValue({
      success: false,
      log: 'missing package',
      exitCode: 1,
      logs: [{ cmd: 'xelatex', stdout: '', stderr: 'missing package', log: 'missing package', texmflog: '', missfontlog: '', aux: '', exit_code: 1 }]
    });

    const result = await compileLatexProject({
      engine: 'xelatex',
      mainFile: 'resume.tex',
      files: [textFile('resume.tex', '\\documentclass{article}')]
    });

    expect(result.status).toBe('failed');
    expect(result.diagnostics).toContain('BusyTeX exited with code 1.');
    expect(result.logs.join('\n')).toContain('missing package');
  });
});

const textFile = (path: string, contents: string): LatexProjectFile => ({ path, kind: 'text', contents });
