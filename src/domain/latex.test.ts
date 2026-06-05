import { describe, expect, it } from 'vitest';
import { escapeLatex, escapeLatexRichText, renderLatexSource, visibleProfileHighlights } from './latex';
import { createResume } from './resume';

describe('browser LaTeX helpers', () => {
  it('escapes LaTeX-sensitive characters deterministically', () => {
    expect(escapeLatex('R&D_100% #1')).toBe('R\\&D\\_100\\% \\#1');
  });

  it('escapeLatexRichText leaves backslash and braces intact while escaping other specials', () => {
    expect(escapeLatexRichText('\\textbf{R&D} 100% #1')).toBe('\\textbf{R\\&D} 100\\% \\#1');
  });

  it('renders a source bundle for the active template', () => {
    const resume = createResume('Compile Me', 'awesome-cv');
    resume.content.profile.fullName = 'Ada Lovelace';

    const source = renderLatexSource(resume);

    expect(source).toContain('\\documentclass');
    expect(source).toContain('Ada Lovelace');
  });

  it('renderLatexSource omits hidden profile fields from the contact block', () => {
    const resume = createResume('Hidden Fields', 'awesome-cv');
    resume.content.profile.fullName = 'Test User';
    resume.content.profile.email = 'test@example.com';
    resume.content.profile.phone = '+1 555 0000';
    resume.content.profile.hiddenFields = ['email'];

    const source = renderLatexSource(resume);

    expect(source).toContain('+1 555 0000');
    expect(source).not.toContain('test@example.com');
  });

  it('visibleProfileHighlights returns only non-hidden items when highlights are set', () => {
    const resume = createResume('Highlights', 'awesome-cv');
    resume.content.profileHighlights = [
      { id: 'h1', text: 'Visible line.' },
      { id: 'h2', text: 'Hidden line.', hidden: true },
    ];

    expect(visibleProfileHighlights(resume)).toEqual(['Visible line.']);
  });

  it('visibleProfileHighlights falls back to non-blank summary lines when highlights are empty', () => {
    const resume = createResume('Summary Fallback', 'awesome-cv');
    resume.content.profileHighlights = [];
    resume.content.summary = 'First line.\n\nSecond line.';

    expect(visibleProfileHighlights(resume)).toEqual(['First line.', 'Second line.']);
  });
});
