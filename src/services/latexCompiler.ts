import type { LatexProjectFile } from '../domain/latexProject';

export type LatexCompilerEngine = 'xelatex' | 'pdflatex' | 'lualatex';
export type LatexCompilerCacheState = 'not-ready' | 'downloading' | 'cached' | 'offline-ready' | 'download-failed';
export type LatexCompileStatus = 'blocked' | 'running' | 'success' | 'failed';

export type LatexCompileRequest = {
  files: LatexProjectFile[];
  mainFile: string;
  engine: LatexCompilerEngine;
};

export type LatexCompileResult = {
  status: LatexCompileStatus;
  logs: string[];
  diagnostics: string[];
  elapsedMs: number;
  cacheState: LatexCompilerCacheState;
};

export const busyTexLicenseReview = {
  packageName: 'texlyre-busytex',
  version: '1.1.1',
  license: 'AGPL-3.0-or-later',
  source: 'npm view texlyre-busytex version license dist.tarball',
  decision: 'blocked' as const,
  notes:
    'Compiler integration is paused for license review before FitCV ships BusyTeX runtime code or assets.'
};

export const getLatexCompilerCacheState = (): LatexCompilerCacheState => 'not-ready';

export const compileLatexProject = async (request: LatexCompileRequest): Promise<LatexCompileResult> => {
  const started = performance.now();

  return {
    status: 'blocked',
    cacheState: getLatexCompilerCacheState(),
    diagnostics: ['BusyTeX license review is required before browser compilation can run.'],
    logs: [
      `Compile requested for ${request.mainFile} with ${request.engine}.`,
      `${busyTexLicenseReview.packageName}@${busyTexLicenseReview.version} reports license ${busyTexLicenseReview.license}.`,
      busyTexLicenseReview.notes,
      'Project source files were not uploaded or sent to a compiler service.'
    ],
    elapsedMs: Math.round(performance.now() - started)
  };
};
