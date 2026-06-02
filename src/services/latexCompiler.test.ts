import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusyTexRunner } from 'texlyre-busytex';
import { compileLatexProject, busyTexLicenseReview } from './latexCompiler';
import type { LatexProjectFile } from '../domain/latexProject';

const compileMock = vi.fn();
const initializeMock = vi.fn();
const isInitializedMock = vi.fn();
const terminateMock = vi.fn();

vi.mock('texlyre-busytex', () => ({
  BusyTexRunner: vi.fn().mockImplementation(() => ({
    initialize: initializeMock,
    isInitialized: isInitializedMock,
    terminate: terminateMock,
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
    expect(BusyTexRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        busytexBasePath: '/core/busytex',
        preloadDataPackages: ['/core/busytex/texlive-basic.js'],
        catalogDataPackages: ['/core/busytex/texlive-basic.js', '/core/busytex/texlive-recommended.js', '/core/busytex/texlive-extra.js']
      })
    );
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

  it('includes TeX engine logs when BusyTeX reports a package or font failure', async () => {
    compileMock.mockResolvedValue({
      success: false,
      log: '',
      exitCode: 1,
      logs: [
        {
          cmd: 'xelatex',
          stdout: '',
          stderr: '',
          log: '',
          texmflog: 'LaTeX Error: File `unicode-math.sty` not found.',
          missfontlog: 'mktextfm FontAwesome',
          aux: 'resume.aux unavailable',
          exit_code: 1
        }
      ]
    });

    const result = await compileLatexProject({
      engine: 'xelatex',
      mainFile: 'resume.tex',
      files: [textFile('resume.tex', '\\documentclass{article}')]
    });

    expect(result.status).toBe('failed');
    expect(result.logs.join('\n')).toContain('unicode-math.sty');
    expect(result.logs.join('\n')).toContain('mktextfm FontAwesome');
    expect(result.logs.join('\n')).toContain('resume.aux unavailable');
  });

  it('tears down the BusyTeX runner after each compile to avoid descriptor exhaustion', async () => {
    compileMock.mockResolvedValue({
      success: true,
      pdf: new Uint8Array([1, 2, 3]),
      log: 'ok',
      exitCode: 0,
      logs: []
    });

    await compileLatexProject({
      engine: 'xelatex',
      mainFile: 'resume.tex',
      files: [textFile('resume.tex', '\\documentclass{article}')]
    });
    await compileLatexProject({
      engine: 'xelatex',
      mainFile: 'resume.tex',
      files: [textFile('resume.tex', '\\documentclass{article}')]
    });

    expect(terminateMock).toHaveBeenCalledTimes(2);
    expect(BusyTexRunner).toHaveBeenCalledTimes(2);
  });
});

const textFile = (path: string, contents: string): LatexProjectFile => ({ path, kind: 'text', contents });
