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
      { id: 'space-on', kind: 'space', enabled: true, value: 18 },
      { id: 'page-off', kind: 'new-page', enabled: false },
      { id: 'page-on', kind: 'new-page', enabled: true }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\vspace{18pt}');
    expect(result.latexSource.match(/\\newpage/g)).toHaveLength(1);
  });

  it('normalizes legacy space size labels to point values', async () => {
    const resume = createResume('Legacy Layout Controls', 'awesome-cv');
    resume.templateLayouts['awesome-cv'] = [
      { id: 'space-on', kind: 'space', enabled: true, size: 'large' } as never
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\vspace{18pt}');
  });

  it('includes custom sections in the Awesome CV default layout with template metadata', () => {
    const resume = createResume('Custom Layout', 'awesome-cv');

    const adapter = getTemplateAdapter('awesome-cv');
    const layout = adapter?.defaultLayout(resume) ?? [];

    expect(layout.map((module) => module.kind === 'section' ? module.section : module.kind)).toEqual([
      'summary',
      'education',
      'experience',
      'space',
      'new-page',
      'projects',
      'skills',
      'awards',
      'customSections'
    ]);
    expect(layout.find((module) => module.kind === 'section' && module.section === 'customSections')).toMatchObject({
      sectionType: 'awesome-custom'
    });
    expect(adapter?.sectionTypes.find((sectionType) => sectionType.section === 'customSections')).toMatchObject({
      id: 'awesome-custom'
    });
  });

  it('renders visible custom sections in Awesome CV projects', async () => {
    const resume = createResume('Custom Sections', 'awesome-cv');
    resume.content.customSections = [
      { id: 'custom-1', title: 'Publications & Talks', body: 'Spoke about R&D systems at 100% scale.' },
      { id: 'custom-2', title: 'Hidden Notes', body: 'This should not render.', hidden: true }
    ];
    resume.templateLayouts['awesome-cv'] = [
      { id: 'custom', kind: 'section', section: 'customSections', sectionType: 'awesome-custom', enabled: true }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\cvsection{PUBLICATIONS \\& TALKS}');
    expect(result.latexSource).toContain('\\item {Spoke about R\\&D systems at 100\\% scale.}');
    expect(result.latexSource).not.toContain('Hidden Notes');
    expect(result.latexSource).not.toContain('This should not render.');
  });

  it('can render a layout module for one custom section', async () => {
    const resume = createResume('Targeted Custom Sections', 'awesome-cv');
    resume.content.customSections = [
      { id: 'custom-1', title: 'Publications', body: 'Published one paper.' },
      { id: 'custom-2', title: 'Talks', body: 'Gave one talk.' }
    ];
    resume.templateLayouts['awesome-cv'] = [
      {
        id: 'custom-talks',
        kind: 'section',
        section: 'customSections',
        sectionType: 'awesome-custom',
        enabled: true,
        options: { customSectionId: 'custom-2' }
      }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\cvsection{TALKS}');
    expect(result.latexSource).toContain('Gave one talk.');
    expect(result.latexSource).not.toContain('\\cvsection{PUBLICATIONS}');
    expect(result.latexSource).not.toContain('Published one paper.');
  });

  it('uses layout module title overrides for Awesome CV section headings', async () => {
    const resume = createResume('Renamed Sections', 'awesome-cv');
    resume.content.experience = [{
      id: 'exp-1',
      company: 'Analytical Engine Lab',
      role: 'Systems Analyst',
      location: 'London',
      startDate: '1842',
      endDate: '1843',
      highlights: ['Built reliable systems.']
    }];
    resume.templateLayouts['awesome-cv'] = [
      {
        id: 'experience',
        kind: 'section',
        section: 'experience',
        sectionType: 'awesome-experience',
        enabled: true,
        options: { title: 'Selected Experience' }
      }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\cvsection{SELECTED EXPERIENCE}');
    expect(result.latexSource).not.toContain('\\cvsection{WORK EXPERIENCE}');
  });

  it('renders Awesome CV profile fields and itemized visible profile highlights', async () => {
    const resume = createResume('Social Resume', 'awesome-cv');
    resume.content.profile = {
      fullName: 'Grace Hopper',
      headline: 'Compiler pioneer',
      email: 'grace@example.com',
      phone: '+1 555 0101',
      location: 'Arlington, VA',
      links: ['grace.dev'],
      gitlab: 'grace-lab',
      linkedin: 'linkedin.com/in/grace-hopper',
      stackoverflow: { id: '42', name: 'Grace H.' },
      twitter: '@amazing-grace',
      x: 'grace-x',
      skype: 'grace.skype',
      reddit: 'u/grace',
      medium: '@grace',
      kaggle: 'gracek',
      hackerrank: 'gracehr',
      telegram: 'gracechat',
      googleScholar: { id: 'scholar-id', name: 'G. Hopper' },
      extraInfo: 'US Navy',
      quote: 'The most dangerous phrase is we have always done it this way.',
      hiddenFields: ['twitter', 'quote']
    };
    resume.content.profileHighlights = [
      { id: 'highlight-1', text: 'Built compilers for readable systems.' },
      { id: 'highlight-2', text: 'Hidden highlight.', hidden: true }
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\gitlab{grace-lab}');
    expect(result.latexSource).toContain('\\linkedin{linkedin.com/in/grace-hopper}');
    expect(result.latexSource).toContain('\\stackoverflow{42}{Grace H.}');
    expect(result.latexSource).toContain('\\googlescholar{scholar-id}{G. Hopper}');
    expect(result.latexSource).toContain('\\extrainfo{US Navy}');
    expect(result.latexSource).toContain('Built compilers for readable systems.');
    expect(result.latexSource).not.toContain('\\twitter');
    expect(result.latexSource).not.toContain('\\quote');
    expect(result.latexSource).not.toContain('Hidden highlight.');
  });

  it('does not expose an adapter for fallback templates', () => {
    expect(getTemplateAdapter('classic-ats')).toBeUndefined();
  });
});
