import type { LatexProjectFile } from '../domain/latexProject';
import { BusyTexRunner, LuaLatex, PdfLatex, XeLatex, type CompileResult, type FileInput } from 'texlyre-busytex';

export type LatexCompilerEngine = 'xelatex' | 'pdflatex' | 'lualatex';
export type LatexCompilerCacheState = 'not-ready' | 'downloading' | 'cached' | 'offline-ready' | 'download-failed';
export type LatexCompileStatus = 'running' | 'success' | 'failed';

export type LatexCompileRequest = {
  files: LatexProjectFile[];
  mainFile: string;
  engine: LatexCompilerEngine;
};

export type LatexCompileResult = {
  status: LatexCompileStatus;
  pdfBlob?: Blob;
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
  decision: 'accepted' as const,
  notes:
    'AGPL obligations are accepted for the browser-side BusyTeX wrapper. Runtime assets are loaded from the configured BusyTeX asset base path.'
};

export const getLatexCompilerCacheState = (): LatexCompilerCacheState => 'not-ready';

export const compileLatexProject = async (request: LatexCompileRequest): Promise<LatexCompileResult> => {
  const started = performance.now();
  const mainFile = request.files.find((file): file is Extract<LatexProjectFile, { kind: 'text' }> => file.kind === 'text' && file.path === request.mainFile);

  if (!mainFile) {
    return {
      status: 'failed',
      cacheState: getLatexCompilerCacheState(),
      diagnostics: [`Main file "${request.mainFile}" was not found in the project.`],
      logs: [`Compile failed before BusyTeX startup: main file "${request.mainFile}" was missing.`],
      elapsedMs: Math.round(performance.now() - started)
    };
  }

  try {
    const result = await createCompiler(request.engine).compile({
      input: mainFile.contents,
      mainTexPath: request.mainFile,
      additionalFiles: request.files.filter((file) => file.path !== request.mainFile).map(toBusyTexFile),
      rerun: true,
      verbose: 'info'
    });

    return {
      status: result.success ? 'success' : 'failed',
      pdfBlob: result.pdf ? toPdfBlob(result.pdf) : undefined,
      cacheState: 'cached',
      diagnostics: result.success ? [] : [`BusyTeX exited with code ${result.exitCode}.`],
      logs: flattenBusyTexLogs(result),
      elapsedMs: Math.round(performance.now() - started)
    };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'BusyTeX compile failed.';
    return {
      status: 'failed',
      cacheState: message.toLowerCase().includes('download') || message.toLowerCase().includes('fetch') ? 'download-failed' : getLatexCompilerCacheState(),
      diagnostics: [message],
      logs: [
        `Compile requested for ${request.mainFile} with ${request.engine}.`,
        `${busyTexLicenseReview.packageName}@${busyTexLicenseReview.version} is enabled under ${busyTexLicenseReview.license}.`,
        message
      ],
      elapsedMs: Math.round(performance.now() - started)
    };
  }
};

const createCompiler = (engine: LatexCompilerEngine) => {
  const busytexBasePath = import.meta.env.VITE_BUSYTEX_BASE_PATH ?? '/core/busytex';
  const runner = new BusyTexRunner({
    busytexBasePath,
    ...getBusyTexDataPackageConfig(busytexBasePath),
    verbose: true
  });

  if (engine === 'pdflatex') return new PdfLatex(runner, true);
  if (engine === 'lualatex') return new LuaLatex(runner, true);
  return new XeLatex(runner, true);
};

const getBusyTexDataPackageConfig = (busytexBasePath: string) => {
  const basePath = busytexBasePath.replace(/\/$/, '');

  return {
    preloadDataPackages: [`${basePath}/texlive-basic.js`],
    catalogDataPackages: [`${basePath}/texlive-basic.js`, `${basePath}/texlive-recommended.js`, `${basePath}/texlive-extra.js`]
  };
};

const toBusyTexFile = (file: LatexProjectFile): FileInput => {
  if (file.kind === 'text') return { path: file.path, content: file.contents };
  return { path: file.path, content: file.data };
};

const flattenBusyTexLogs = (result: CompileResult) => {
  const logs = [
    `BusyTeX exit code: ${result.exitCode}`,
    result.log,
    ...(result.logs ?? []).flatMap((entry) =>
      [entry.cmd, entry.stdout, entry.stderr, entry.log, entry.texmflog, entry.missfontlog, entry.aux].filter(Boolean)
    )
  ].filter(Boolean);

  return logs.length ? logs : ['BusyTeX finished without logs.'];
};

const toPdfBlob = (bytes: Uint8Array) => {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy], { type: 'application/pdf' });
};
