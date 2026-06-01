export type LatexFileKind = 'text' | 'binary' | 'unsupported';

export type LatexProjectFile =
  | {
      path: string;
      kind: 'text';
      contents: string;
    }
  | {
      path: string;
      kind: 'binary';
      data: Uint8Array;
    };

export type LatexFileTreeNode = {
  name: string;
  path: string;
  type: 'folder' | 'file';
  kind?: LatexFileKind;
  children?: LatexFileTreeNode[];
};

const ignoredSegments = new Set(['.git', '.svn', '.hg', 'node_modules', 'dist', 'build', '.cache']);
const ignoredFileNames = new Set(['.DS_Store']);
const texBuildOutputExtensions = new Set(['.aux', '.log', '.out', '.toc', '.fls', '.fdb_latexmk']);
const textExtensions = new Set(['.tex', '.cls', '.sty', '.bib', '.bst', '.cfg', '.def', '.md', '.txt', '.yaml', '.yml']);
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.eps', '.ttf', '.otf', '.woff', '.woff2']);

export const shouldIgnoreLatexPath = (path: string) => {
  const normalized = normalizeLatexPath(path);
  const segments = normalized.split('/');
  if (segments.some((segment) => ignoredSegments.has(segment))) return true;
  const fileName = segments.at(-1) ?? '';
  if (ignoredFileNames.has(fileName)) return true;
  if (normalized.endsWith('.synctex.gz')) return true;
  return texBuildOutputExtensions.has(extensionOf(normalized));
};

export const getLatexFileKind = (path: string): LatexFileKind => {
  if (shouldIgnoreLatexPath(path)) return 'unsupported';
  const extension = extensionOf(path);
  if (textExtensions.has(extension)) return 'text';
  if (binaryExtensions.has(extension)) return 'binary';
  return 'unsupported';
};

export const detectMainTexCandidates = (files: LatexProjectFile[]) => {
  const texFiles = files
    .filter((file): file is Extract<LatexProjectFile, { kind: 'text' }> => file.kind === 'text' && file.path.endsWith('.tex'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const byPath = new Map(texFiles.map((file) => [file.path, file]));
  const explicit = ['main.tex', 'resume.tex'].map((path) => byPath.get(path)).filter(Boolean) as typeof texFiles;
  const explicitPaths = new Set(explicit.map((file) => file.path));
  const rootDocumentClasses = texFiles.filter(
    (file) => !file.path.includes('/') && !explicitPaths.has(file.path) && hasDocumentClass(file.contents)
  );
  const nestedDocumentClasses = texFiles.filter(
    (file) => file.path.includes('/') && !explicitPaths.has(file.path) && hasDocumentClass(file.contents)
  );

  return [...explicit, ...rootDocumentClasses, ...nestedDocumentClasses];
};

export const buildLatexFileTree = (files: LatexProjectFile[]): LatexFileTreeNode[] => {
  const root: LatexFileTreeNode[] = [];

  for (const file of files.filter((item) => !shouldIgnoreLatexPath(item.path))) {
    const segments = normalizeLatexPath(file.path).split('/');
    let siblings = root;
    let currentPath = '';

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = index === segments.length - 1;
      let node = siblings.find((item) => item.name === segment && item.type === (isFile ? 'file' : 'folder'));

      if (!node) {
        node = isFile
          ? { name: segment, path: currentPath, type: 'file', kind: file.kind }
          : { name: segment, path: currentPath, type: 'folder', children: [] };
        siblings.push(node);
        siblings.sort(sortTreeNodes);
      }

      siblings = node.children ?? [];
    });
  }

  return root;
};

export const normalizeLatexPath = (path: string) => path.replaceAll('\\', '/').replace(/^\/+/, '');

const hasDocumentClass = (contents: string) => /\\documentclass(?:\[[^\]]*\])?\{/.test(contents);

const extensionOf = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.fdb_latexmk')) return '.fdb_latexmk';
  const dot = lower.lastIndexOf('.');
  return dot === -1 ? '' : lower.slice(dot);
};

const sortTreeNodes = (a: LatexFileTreeNode, b: LatexFileTreeNode) => {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name);
};
