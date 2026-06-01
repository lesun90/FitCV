import { describe, expect, it } from 'vitest';
import { escapeLatex, renderLatexSource } from './latex';
import { createResume } from './resume';

describe('browser LaTeX helpers', () => {
  it('escapes LaTeX-sensitive characters deterministically', () => {
    expect(escapeLatex('R&D_100% #1')).toBe('R\\&D\\_100\\% \\#1');
  });

  it('renders a source bundle for the active template', () => {
    const resume = createResume('Compile Me', 'classic-ats');
    resume.content.profile.fullName = 'Ada Lovelace';

    const source = renderLatexSource(resume);

    expect(source).toContain('\\documentclass');
    expect(source).toContain('Ada Lovelace');
  });
});
