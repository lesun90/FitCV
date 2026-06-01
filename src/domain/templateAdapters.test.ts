import { describe, expect, it } from 'vitest';
import { createResume } from './resume';
import { getTemplateAdapter, renderAdapterLatexProject } from './templateAdapters';

describe('template adapters', () => {
  it('renders Awesome CV as a complete BusyTeX project', async () => {
    const resume = createResume('Ada Awesome', 'awesome-cv');
    resume.content.profile = {
      fullName: 'Ada Lovelace',
      headline: 'Compiler & systems analyst',
      email: 'ada@example.com',
      phone: '+1 555 0142',
      location: 'London, UK',
      links: ['github.com/ada']
    };
    resume.content.summary = 'Builds R&D tools with 100% care.';
    resume.content.skills = ['Systems', 'R&D'];

    const result = await renderAdapterLatexProject(resume);

    expect(result.mainFile).toBe('resume.tex');
    expect(result.engine).toBe('xelatex');
    expect(result.files.some((file) => file.path === 'awesome-cv.cls')).toBe(true);
    expect(result.files.some((file) => file.path === 'fontawesome.sty')).toBe(true);
    expect(result.files.some((file) => file.path === 'fonts/Roboto-Regular.ttf')).toBe(true);
    expect(result.latexSource).toContain('\\makecvheader');
    expect(result.latexSource).toContain('Ada');
    expect(result.latexSource).toContain('Lovelace');
    expect(result.latexSource).toContain('R\\&D');
    expect(result.latexSource).toContain('100\\%');
  });

  it('renders enabled layout controls and skips disabled ones', async () => {
    const resume = createResume('Layout Controls', 'awesome-cv');
    resume.content.summary = 'Short summary.';
    resume.templateLayouts['awesome-cv'] = [
      { id: 'summary', kind: 'section', section: 'summary', sectionType: 'awesome-highlight', enabled: true },
      { id: 'space-on', kind: 'space', enabled: true, size: 'large' },
      { id: 'page-off', kind: 'new-page', enabled: false },
      { id: 'page-on', kind: 'new-page', enabled: true }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\vspace{18pt}');
    expect(result.latexSource.match(/\\newpage/g)).toHaveLength(1);
  });

  it('does not expose an adapter for fallback templates', () => {
    expect(getTemplateAdapter('classic-ats')).toBeUndefined();
  });
});
