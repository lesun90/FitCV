import { detectMainTexCandidates, getLatexFileKind, normalizeLatexPath, shouldIgnoreLatexPath, type LatexProjectFile } from '../domain/latexProject';

type RawModuleMap = Record<string, string>;
type UrlModuleMap = Record<string, string>;

export type BundledLatexProject = {
  id: string;
  displayName: string;
  rootPath: string;
  readOnly: true;
  files: LatexProjectFile[];
  mainFileCandidates: string[];
};

export type BundledLatexProjectSummary = {
  id: string;
  displayName: string;
  rootPath: string;
  textFileCount: number;
  assetFileCount: number;
};

const textModules = import.meta.glob('../latex-templates/**/*.{tex,cls,sty,bib,bst,cfg,def,md,txt,yaml,yml}', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as RawModuleMap;

const assetModules = import.meta.glob('../latex-templates/**/*.{png,jpg,jpeg,pdf,svg,eps,ttf,otf,woff,woff2}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as UrlModuleMap;

export const listBundledLatexProjects = (): BundledLatexProjectSummary[] => {
  const grouped = new Map<string, { textFileCount: number; assetFileCount: number }>();

  for (const modulePath of Object.keys(textModules)) {
    const parsed = parseTemplateModulePath(modulePath);
    if (!parsed || shouldIgnoreLatexPath(parsed.path) || getLatexFileKind(parsed.path) !== 'text') continue;
    const current = grouped.get(parsed.id) ?? { textFileCount: 0, assetFileCount: 0 };
    grouped.set(parsed.id, { ...current, textFileCount: current.textFileCount + 1 });
  }

  for (const modulePath of Object.keys(assetModules)) {
    const parsed = parseTemplateModulePath(modulePath);
    if (!parsed || shouldIgnoreLatexPath(parsed.path) || getLatexFileKind(parsed.path) !== 'binary') continue;
    const current = grouped.get(parsed.id) ?? { textFileCount: 0, assetFileCount: 0 };
    grouped.set(parsed.id, { ...current, assetFileCount: current.assetFileCount + 1 });
  }

  return [...grouped.entries()]
    .map(([id, counts]) => ({
      id,
      displayName: displayNameForTemplate(id),
      rootPath: `src/latex-templates/${id}`,
      ...counts
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
};

export const loadBundledLatexProject = async (id: string): Promise<BundledLatexProject> => {
  const textFiles: Extract<LatexProjectFile, { kind: 'text' }>[] = Object.entries(textModules)
    .flatMap(([modulePath, contents]) => {
      const parsed = parseTemplateModulePath(modulePath);
      return parsed?.id === id ? [{ path: parsed.path, kind: 'text' as const, contents }] : [];
    })
    .filter((file) => !shouldIgnoreLatexPath(file.path) && getLatexFileKind(file.path) === 'text');

  const binaryCandidates = await Promise.all(
    Object.entries(assetModules).map(async ([modulePath, url]): Promise<Extract<LatexProjectFile, { kind: 'binary' }>[]> => {
      const parsed = parseTemplateModulePath(modulePath);
      return parsed?.id === id
        ? [{
            path: parsed.path,
            kind: 'binary' as const,
            data: new Uint8Array(await (await fetch(url)).arrayBuffer())
          }]
        : [];
    })
  );
  const binaryFiles = binaryCandidates.flat();

  const files = [
    ...textFiles,
    ...binaryFiles.filter((file) => !shouldIgnoreLatexPath(file.path) && getLatexFileKind(file.path) === 'binary')
  ].sort((a, b) => a.path.localeCompare(b.path));

  return {
    id,
    displayName: displayNameForTemplate(id),
    rootPath: `src/latex-templates/${id}`,
    readOnly: true,
    files,
    mainFileCandidates: detectMainTexCandidates(files).map((file) => file.path)
  };
};

export const getFreshTextFiles = (id: string): Extract<LatexProjectFile, { kind: 'text' }>[] =>
  Object.entries(textModules)
    .flatMap(([modulePath, contents]) => {
      const parsed = parseTemplateModulePath(modulePath);
      return parsed?.id === id ? [{ path: parsed.path, kind: 'text' as const, contents }] : [];
    })
    .filter((file) => !shouldIgnoreLatexPath(file.path) && getLatexFileKind(file.path) === 'text');

const parseTemplateModulePath = (modulePath: string) => {
  const match = modulePath.match(/\.\.\/latex-templates\/([^/]+)\/(.+)$/);
  if (!match) return undefined;
  return { id: match[1], path: normalizeLatexPath(match[2]) };
};

const displayNameForTemplate = (id: string) =>
  id
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.dispatchEvent(new CustomEvent('latex-templates-updated'));
  });
}
