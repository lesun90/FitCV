import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createResume, sampleResume, starterResume } from './resume';
import { getTemplateAdapter, renderAdapterLatexProject } from './templateAdapters';
import { getTemplate } from './templates';
import type { FlexEntry, FlexSection, FlexSubSection } from './types';
import { createId } from './ids';

const makeEntry = (type: string, fields: FlexEntry['fields']): FlexEntry => ({
  id: createId('entry'),
  type,
  fields,
});

const makeSub = (environment: string, items: FlexEntry[]): FlexSubSection => ({
  id: createId('sub'),
  environment,
  items,
});

const makeSection = (name: string, items: FlexSection['items']): FlexSection => ({
  id: createId('section'),
  name,
  items,
});

describe('template adapters', () => {
  it('renders Awesome CV as a complete BusyTeX project', async () => {
    const resume = createResume('Ada Awesome', 'awesome-cv');
    resume.content.profile = {
      fullName: 'Ada Lovelace',
      headline: 'Compiler & systems analyst',
      email: 'ada@example.com',
      phone: '+1 555 0142',
      location: 'London, UK',
      links: ['github.com/ada'],
    };
    resume.content.summary = 'Builds R&D tools with 100% care.';
    resume.content.profileHighlights = [{ id: 'h1', text: 'Builds R&D tools with 100% care.' }];

    const result = await renderAdapterLatexProject(resume);

    expect(result.mainFile).toBe('resume.tex');
    expect(result.engine).toBe('xelatex');
    expect(result.files.some((f) => f.path === 'awesome-cv.cls')).toBe(true);
    expect(result.files.some((f) => f.path === 'fontawesome.sty')).toBe(true);
    expect(result.files.some((f) => f.path === 'fonts/Roboto-Regular.ttf')).toBe(true);
    expect(result.latexSource).toContain('\\makecvheader');
    expect(result.latexSource).toContain('Ada');
    expect(result.latexSource).toContain('Lovelace');
    expect(result.latexSource).toContain('R\\&D');
    expect(result.latexSource).toContain('100\\%');
  });

  it('renders a flex section with a sub-section and cventry items', async () => {
    const resume = createResume('Flex Test', 'awesome-cv');
    resume.content.profile = { fullName: 'Grace Hopper', email: 'grace@example.com', phone: '', location: '', links: [], headline: '' };
    const section = makeSection('WORK EXPERIENCE', [
      makeSub('experience', [
        makeEntry('cventry', { position: 'Admiral', title: 'US Navy', location: 'Arlington, VA', date: '1944 -- 1986', highlights: 'Built the first compiler\nInvented COBOL' }),
      ]),
    ]);
    resume.content.flexSections = [section];
    resume.templateLayouts['awesome-cv'] = [
      { id: 'sum', kind: 'section', section: 'summary', sectionType: 'awesome-highlight', enabled: false },
      { id: 'flex', kind: 'flex-section', flexSectionId: section.id, enabled: true },
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\cvsection{WORK EXPERIENCE}');
    expect(result.latexSource).toContain('\\begin{experience}');
    expect(result.latexSource).toContain('\\cventry');
    expect(result.latexSource).toContain('{Admiral}');
    expect(result.latexSource).toContain('{US Navy}');
    expect(result.latexSource).toContain('Built the first compiler');
    expect(result.latexSource).toContain('\\end{experience}');
  });

  it('renders a flex section with a cvsubsection heading between two cvhonors groups', async () => {
    const resume = createResume('Headings Test', 'awesome-cv');
    resume.content.profile = { fullName: 'Test User', email: 't@t.com', phone: '', location: '', links: [], headline: '' };
    const heading = { id: createId('h'), kind: 'subsection-heading' as const, text: 'International' };
    const sub1: FlexSubSection = { id: createId('sub'), environment: 'cvhonors', items: [heading, makeEntry('cvhonor', { award: 'Gold', event: 'ACM', location: 'NYC', date: '2023' })] };
    const section = makeSection('HONORS', [sub1]);
    resume.content.flexSections = [section];
    resume.templateLayouts['awesome-cv'] = [
      { id: 'flex', kind: 'flex-section', flexSectionId: section.id, enabled: true },
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\cvsection{HONORS}');
    expect(result.latexSource).toContain('\\begin{cvhonors}');
    expect(result.latexSource).toContain('\\cvsubsection{International}');
    expect(result.latexSource).toContain('\\cvhonor{Gold}{ACM}{NYC}{2023}');
    expect(result.latexSource).toContain('\\end{cvhonors}');
  });

  it('renders enabled layout controls and skips disabled ones', async () => {
    const resume = createResume('Layout Controls', 'awesome-cv');
    resume.content.summary = 'Short summary.';
    resume.content.profileHighlights = [{ id: 'h1', text: 'Short summary.' }];
    resume.templateLayouts['awesome-cv'] = [
      { id: 'summary', kind: 'section', section: 'summary', sectionType: 'awesome-highlight', enabled: true },
      { id: 'space-on', kind: 'space', enabled: true, value: 18 },
      { id: 'page-off', kind: 'new-page', enabled: false },
      { id: 'page-on', kind: 'new-page', enabled: true },
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\vspace{18pt}');
    expect(result.latexSource.match(/\\newpage/g)).toHaveLength(1);
  });

  it('normalizes legacy space size labels to point values', async () => {
    const resume = createResume('Legacy Layout Controls', 'awesome-cv');
    resume.templateLayouts['awesome-cv'] = [
      { id: 'space-on', kind: 'space', enabled: true, size: 'large' } as never,
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('\\vspace{18pt}');
  });

  it('default layout includes a summary module and flex section modules', () => {
    const resume = sampleResume();
    const adapter = getTemplateAdapter('awesome-cv');
    const layout = adapter?.defaultLayout(resume) ?? [];

    expect(layout[0]).toMatchObject({ kind: 'section', section: 'summary' });
    expect(layout.some((m) => m.kind === 'flex-section')).toBe(true);
  });

  it('renders Awesome CV profile fields and visible profile highlights', async () => {
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
      hiddenFields: ['twitter', 'quote'],
    };
    resume.content.profileHighlights = [
      { id: 'h1', text: 'Built compilers for readable systems.' },
      { id: 'h2', text: 'Hidden highlight.', hidden: true },
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

  it('awesome-cv contract declares pinnedSections, sectionEnvs, and entryTypes', () => {
    const template = getTemplate('awesome-cv');
    expect(template.pinnedSections).toContain('summary');
    expect(template.sectionEnvs?.length).toBeGreaterThan(0);
    expect(template.entryTypes?.length).toBeGreaterThan(0);
    expect(template.entryTypes?.find((et) => et.id === 'cventry')?.fields.map((f) => f.id)).toEqual(['position', 'title', 'location', 'date', 'highlights']);
    expect(template.sectionEnvs?.find((e) => e.id === 'experience')?.allowedEntryTypeIds).toContain('cventry');
    expect(template.sectionEnvs?.find((e) => e.id === 'cvsubsection')?.allowedEntryTypeIds).toContain('item');
    expect(template.sectionEnvs?.find((e) => e.id === 'cvsubsection')?.label).toBe('CV Subsection');
    expect(template.sectionEnvs?.find((e) => e.id === 'cvitems')).toBeUndefined();
    expect(template.entryTypes?.find((et) => et.id === 'cvskill')).toBeUndefined();
  });

  it('bundled Awesome CV skills template matches the adapter skills contract', () => {
    const skillsTemplate = readFileSync(
      resolve(process.cwd(), 'src/latex-templates/awesome-resume/resume/skills.tex'),
      'utf8'
    );

    expect(skillsTemplate).toContain('\\cvsubsection{Programming Languages}');
    expect(skillsTemplate).toContain('\\begin{cvitems}');
    expect(skillsTemplate).toContain('\\item {');
    expect(skillsTemplate).toContain('\\end{cvitems}');
    expect(skillsTemplate).not.toContain('\\begin{cvskills}');
  });

  it('renders bullet-list sub-section headings before cvitems blocks', async () => {
    const resume = starterResume();

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain([
      '\\cvsubsection{Hardware Platform Experience}',
      '\\begin{cvitems}',
      '  \\item {Experience with hardware platform type A.}',
      '  \\item {Experience with hardware platform type B, including sensors, actuators, and control systems.}',
      '\\end{cvitems}',
    ].join('\n'));
  });

  it('hidden flex sections and entries are excluded from output', async () => {
    const resume = createResume('Hidden Test', 'awesome-cv');
    resume.content.profile = { fullName: 'Test', email: '', phone: '', location: '', links: [], headline: '' };
    const visibleSection = makeSection('VISIBLE', [makeSub('cvsubsection', [makeEntry('item', { text: 'Should appear' })])]);
    const hiddenSection = makeSection('HIDDEN', [makeSub('cvsubsection', [makeEntry('item', { text: 'Should not appear' })])]);
    hiddenSection.hidden = true;
    resume.content.flexSections = [visibleSection, hiddenSection];
    resume.templateLayouts['awesome-cv'] = [
      { id: 'v', kind: 'flex-section', flexSectionId: visibleSection.id, enabled: true },
      { id: 'h', kind: 'flex-section', flexSectionId: hiddenSection.id, enabled: true },
    ];

    const result = await renderAdapterLatexProject(resume);

    expect(result.latexSource).toContain('Should appear');
    expect(result.latexSource).not.toContain('Should not appear');
  });
});
