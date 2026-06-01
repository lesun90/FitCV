import { describe, expect, it } from 'vitest';
import {
  buildLatexFileTree,
  detectMainTexCandidates,
  getLatexFileKind,
  shouldIgnoreLatexPath,
  type LatexProjectFile
} from './latexProject';

describe('LaTeX project helpers', () => {
  it('ignores source-control, generated, dependency, and TeX build output paths', () => {
    expect(shouldIgnoreLatexPath('.git/config')).toBe(true);
    expect(shouldIgnoreLatexPath('resume/.svn/entries')).toBe(true);
    expect(shouldIgnoreLatexPath('node_modules/pkg/index.sty')).toBe(true);
    expect(shouldIgnoreLatexPath('dist/resume.tex')).toBe(true);
    expect(shouldIgnoreLatexPath('resume.aux')).toBe(true);
    expect(shouldIgnoreLatexPath('nested/resume.synctex.gz')).toBe(true);
    expect(shouldIgnoreLatexPath('resume/experience.tex')).toBe(false);
  });

  it('classifies supported source and asset files', () => {
    expect(getLatexFileKind('resume/main.tex')).toBe('text');
    expect(getLatexFileKind('resume/fonts/Roboto-Regular.ttf')).toBe('binary');
    expect(getLatexFileKind('resume/out/resume.log')).toBe('unsupported');
  });

  it('detects main files by explicit names before documentclass scans', () => {
    const files: LatexProjectFile[] = [
      textFile('sections/profile.tex', '\\documentclass{article}'),
      textFile('resume.tex', '% template root'),
      textFile('main.tex', '% generated later')
    ];

    expect(detectMainTexCandidates(files).map((file) => file.path)).toEqual(['main.tex', 'resume.tex', 'sections/profile.tex']);
  });

  it('builds a stable hierarchy without ignored files', () => {
    const tree = buildLatexFileTree([
      textFile('resume/experience.tex', ''),
      textFile('resume/skills.tex', ''),
      textFile('resume.aux', ''),
      {
        path: 'fonts/Roboto-Regular.ttf',
        kind: 'binary',
        data: new Uint8Array([1, 2, 3])
      }
    ]);

    expect(tree.map((node) => node.name)).toEqual(['fonts', 'resume']);
    expect(tree[0].children?.[0].path).toBe('fonts/Roboto-Regular.ttf');
    expect(tree[1].children?.map((node) => node.name)).toEqual(['experience.tex', 'skills.tex']);
  });
});

const textFile = (path: string, contents: string): LatexProjectFile => ({ path, kind: 'text', contents });
