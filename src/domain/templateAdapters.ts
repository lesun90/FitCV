import type { LatexProjectFile } from './latexProject';
import { escapeLatex, visibleProfileHighlights } from './latex';
import type { LayoutModule, ProfileFieldKey, ResumeRecord, SectionKey, TemplateKey } from './types';
import { createId } from './ids';

export type LatexProjectRenderResult = {
  files: LatexProjectFile[];
  mainFile: string;
  engine: 'xelatex' | 'pdflatex' | 'lualatex';
  latexSource: string;
  warnings: string[];
};

export type TemplateSectionType = {
  id: string;
  templateId: TemplateKey;
  label: string;
  section: SectionKey;
  description: string;
};

export type TemplateAdapter = {
  id: TemplateKey;
  defaultLayout: (resume: ResumeRecord) => LayoutModule[];
  sectionTypes: TemplateSectionType[];
  renderLatexProject?: (resume: ResumeRecord, modules: LayoutModule[]) => Promise<LatexProjectRenderResult> | LatexProjectRenderResult;
};

const textModules = import.meta.glob('../latex-templates/awesome-resume/**/*.{cls,sty}', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>;

const assetModules = import.meta.glob('../latex-templates/awesome-resume/**/*.{ttf,otf,woff,woff2,png,jpg,jpeg,pdf,svg,eps}', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>;

const awesomeSectionTypes: TemplateSectionType[] = [
  { id: 'awesome-highlight', templateId: 'awesome-cv', label: 'Highlight', section: 'summary', description: 'Awesome CV highlight bullets.' },
  { id: 'awesome-education', templateId: 'awesome-cv', label: 'Education', section: 'education', description: 'Awesome CV education entries.' },
  { id: 'awesome-experience', templateId: 'awesome-cv', label: 'Experience', section: 'experience', description: 'Awesome CV experience entries.' },
  { id: 'awesome-projects', templateId: 'awesome-cv', label: 'Projects', section: 'projects', description: 'Awesome CV project entries.' },
  { id: 'awesome-skills', templateId: 'awesome-cv', label: 'Skills', section: 'skills', description: 'Awesome CV skills section.' },
  { id: 'awesome-honors', templateId: 'awesome-cv', label: 'Honors', section: 'awards', description: 'Awesome CV honors entries.' },
  { id: 'awesome-custom', templateId: 'awesome-cv', label: 'Custom Section', section: 'customSections', description: 'Awesome CV user-defined sections.' }
];

const sectionTypeBySection = Object.fromEntries(
  awesomeSectionTypes.map((sectionType) => [sectionType.section, sectionType.id])
) as Partial<Record<SectionKey, string>>;

const defaultAwesomeSections: SectionKey[] = ['summary', 'education', 'experience', 'projects', 'skills', 'awards', 'customSections'];
const legacySpaceValues = { small: 6, medium: 12, large: 18 };
export const MIN_SPACE_VALUE = 0;
export const MAX_SPACE_VALUE = 96;
export const defaultSpaceValue = 12;

export const templateAdapters: TemplateAdapter[] = [
  {
    id: 'awesome-cv',
    defaultLayout: (resume) => [
      ...defaultAwesomeSections.slice(0, 3).map((section) => sectionModule(section, !resume.hiddenSections.includes(section))),
      { id: createModuleId('space'), kind: 'space', enabled: true, value: defaultSpaceValue },
      { id: createModuleId('new-page'), kind: 'new-page', enabled: true },
      ...defaultAwesomeSections.slice(3).map((section) => sectionModule(section, !resume.hiddenSections.includes(section)))
    ],
    sectionTypes: awesomeSectionTypes,
    renderLatexProject: async (resume, modules) => renderAwesomeCvProject(resume, modules)
  }
];

export const getTemplateAdapter = (templateId: TemplateKey) => templateAdapters.find((adapter) => adapter.id === templateId);

export const hasTemplateAdapter = (templateId: TemplateKey) => Boolean(getTemplateAdapter(templateId));

export const defaultLayoutForTemplate = (templateId: TemplateKey, resume: ResumeRecord): LayoutModule[] =>
  getTemplateAdapter(templateId)?.defaultLayout(resume) ?? resume.sectionOrder.map((section) => sectionModule(section, !resume.hiddenSections.includes(section)));

export const normalizeLayoutModule = (module: LayoutModule): LayoutModule => {
  if (module.kind !== 'space') return module;
  return {
    ...module,
    value: resolveSpaceValue(module)
  };
};

export const renderAdapterLatexProject = async (resume: ResumeRecord): Promise<LatexProjectRenderResult> => {
  const adapter = getTemplateAdapter(resume.activeTemplateId);
  if (!adapter?.renderLatexProject) throw new Error(`Template ${resume.activeTemplateId} does not provide a LaTeX adapter.`);
  const modules = (resume.templateLayouts[resume.activeTemplateId] ?? adapter.defaultLayout(resume)).map(normalizeLayoutModule);
  return adapter.renderLatexProject(resume, modules);
};

const renderAwesomeCvProject = async (resume: ResumeRecord, modules: LayoutModule[]): Promise<LatexProjectRenderResult> => {
  const warnings: string[] = [];
  const generatedSections: Extract<LatexProjectFile, { kind: 'text' }>[] = [];
  const imports: string[] = [];

  modules.forEach((module, index) => {
    if (!module.enabled) return;
    if (module.kind === 'space') {
      imports.push(`\\vspace{${formatSpaceValue(module)}}`);
      return;
    }
    if (module.kind === 'new-page') {
      imports.push('\\newpage');
      return;
    }

    const rendered = renderAwesomeSection(resume, module);
    if (!rendered) return;
    const path = `resume/generated-${index}-${module.section}.tex`;
    generatedSections.push({ path, kind: 'text', contents: rendered });
    imports.push(`\\import{resume/}{generated-${index}-${module.section}.tex}`);
  });

  const root = renderAwesomeRoot(resume, imports);
  const files: LatexProjectFile[] = [
    ...supportTextFiles(),
    ...(await supportAssetFiles()),
    { path: 'resume.tex', kind: 'text', contents: root },
    ...generatedSections
  ];

  return {
    files,
    mainFile: 'resume.tex',
    engine: 'xelatex',
    latexSource: [root, ...generatedSections.map((file) => file.contents)].join('\n\n'),
    warnings
  };
};

const renderAwesomeRoot = (resume: ResumeRecord, imports: string[]) => {
  const { first, last } = splitName(resume.content.profile.fullName || resume.title);
  const profile = resume.content.profile;
  const links = profile.links ?? [];
  const visible = (field: ProfileFieldKey) => !(profile.hiddenFields ?? []).includes(field);
  const simpleProfileCommand = (field: ProfileFieldKey, command: string, value: string) =>
    visible(field) && value ? `\\${command}{${escapeLatex(value)}}` : '';
  const stackoverflow = profile.stackoverflow;
  const googleScholar = profile.googleScholar;

  return [
    '\\documentclass[11pt, a4paper]{awesome-cv}',
    '\\fontdir[fonts/]',
    '\\colorlet{awesome}{awesome-red}',
    '\\usepackage{import}',
    `\\name{${escapeLatex(first)}}{${escapeLatex(last)}}`,
    simpleProfileCommand('phone', 'mobile', profile.phone),
    simpleProfileCommand('email', 'email', profile.email),
    simpleProfileCommand('location', 'address', profile.location),
    visible('links') && links[0] ? `\\homepage{${escapeLatex(links[0])}}` : '',
    simpleProfileCommand('headline', 'position', profile.headline),
    simpleProfileCommand('gitlab', 'gitlab', profile.gitlab ?? ''),
    simpleProfileCommand('linkedin', 'linkedin', profile.linkedin ?? ''),
    visible('stackoverflow') && stackoverflow?.id ? `\\stackoverflow{${escapeLatex(stackoverflow.id)}}{${escapeLatex(stackoverflow.name)}}` : '',
    simpleProfileCommand('twitter', 'twitter', profile.twitter ?? ''),
    simpleProfileCommand('x', 'x', profile.x ?? ''),
    simpleProfileCommand('skype', 'skype', profile.skype ?? ''),
    simpleProfileCommand('reddit', 'reddit', profile.reddit ?? ''),
    simpleProfileCommand('medium', 'medium', profile.medium ?? ''),
    simpleProfileCommand('kaggle', 'kaggle', profile.kaggle ?? ''),
    simpleProfileCommand('hackerrank', 'hackerrank', profile.hackerrank ?? ''),
    simpleProfileCommand('telegram', 'telegram', profile.telegram ?? ''),
    visible('googleScholar') && googleScholar?.id ? `\\googlescholar{${escapeLatex(googleScholar.id)}}{${escapeLatex(googleScholar.name)}}` : '',
    simpleProfileCommand('extraInfo', 'extrainfo', profile.extraInfo ?? ''),
    simpleProfileCommand('quote', 'quote', profile.quote ?? ''),
    '\\makecvfooter',
    '  {\\today}',
    `  {${escapeLatex(profile.fullName || resume.title)}~~~\\cdotp~~~Resume}`,
    '  {\\thepage}',
    '\\begin{document}',
    '\\makecvheader',
    ...imports,
    '\\end{document}'
  ].filter(Boolean).join('\n');
};

const renderAwesomeSection = (resume: ResumeRecord, module: Extract<LayoutModule, { kind: 'section' }>) => {
  const profileHighlights = visibleProfileHighlights(resume);
  const titleOverride = moduleTitleOverride(module);
  if (module.section === 'summary' && profileHighlights.length) {
    return [
      '\\begin{highlights}',
      ...profileHighlights.map((line) => `  \\item[\\textbullet]{${escapeLatex(line)}}`),
      '\\end{highlights}'
    ].join('\n');
  }

  if (module.section === 'education') {
    const eduItems = resume.content.education.filter((item) => !item.hidden);
    if (!eduItems.length) return '';
    return [
      `\\cvsection{${awesomeSectionTitle(titleOverride, 'EDUCATION')}}`,
      '\\begin{cventries}',
      ...eduItems.map((item) => [
        '  \\cventry',
        `    {${escapeLatex(item.degree)}}`,
        `    {${escapeLatex(item.school)}}`,
        `    {${escapeLatex(item.location)}}`,
        `    {${escapeLatex([item.startDate, item.endDate].filter(Boolean).join(' -- '))}}`,
        renderCvItems(item.highlights, '    ')
      ].join('\n')),
      '\\end{cventries}'
    ].join('\n');
  }

  if (module.section === 'experience') {
    const expItems = resume.content.experience.filter((item) => !item.hidden);
    if (!expItems.length) return '';
    return [
      `\\cvsection{${awesomeSectionTitle(titleOverride, 'WORK EXPERIENCE')}}`,
      '\\begin{experience}',
      ...expItems.map((item) => [
        '  \\cventry',
        `    {${escapeLatex(item.role)}}`,
        `    {${escapeLatex(item.company)}}`,
        `    {${escapeLatex(item.location)}}`,
        `    {${escapeLatex([item.startDate, item.endDate].filter(Boolean).join(' -- '))}}`,
        renderCvItems(item.highlights, '    ')
      ].join('\n')),
      '\\end{experience}'
    ].join('\n');
  }

  if (module.section === 'projects') {
    const projItems = resume.content.projects.filter((item) => !item.hidden);
    if (!projItems.length) return '';
    return [
      `\\cvsection{${awesomeSectionTitle(titleOverride, 'PROJECTS')}}`,
      '\\begin{projects}',
      ...projItems.map((item) => [
        '  \\projectentry',
        `    {${escapeLatex(item.name)}}`,
        '    {}',
        '    {}',
        `    {${escapeLatex(item.links.join(', '))}}`,
        renderCvItems([item.description, ...item.highlights].filter(Boolean), '    ')
      ].join('\n')),
      '\\end{projects}'
    ].join('\n');
  }

  if (module.section === 'skills' && resume.content.skills.length) {
    return [
      `\\cvsection{${awesomeSectionTitle(titleOverride, 'SKILLS')}}`,
      '\\begin{cvitems}',
      ...resume.content.skills.map((skill) => `  \\item {${escapeLatex(skill)}}`),
      '\\end{cvitems}'
    ].join('\n');
  }

  if (module.section === 'awards' && resume.content.awards.length) {
    return [
      `\\cvsection{${awesomeSectionTitle(titleOverride, 'AWARDS')}}`,
      '\\begin{cvhonors}',
      ...resume.content.awards.map((award) => `  \\cvhonor{${escapeLatex(award)}}{}{}{} `),
      '\\end{cvhonors}'
    ].join('\n');
  }

  if (module.section === 'customSections') {
    const customSectionId = typeof module.options?.customSectionId === 'string' ? module.options.customSectionId : undefined;
    const customSections = resume.content.customSections.filter((item) =>
      (!customSectionId || item.id === customSectionId) && !item.hidden && (item.title.trim() || item.body.trim())
    );
    if (!customSections.length) return '';
    return customSections.map((item) => [
      `\\cvsection{${awesomeSectionTitle(titleOverride, item.title)}}`,
      '\\begin{cvitems}',
      ...item.body.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => `  \\item {${escapeLatex(line)}}`),
      '\\end{cvitems}'
    ].join('\n')).join('\n\n');
  }

  return '';
};

const moduleTitleOverride = (module: Extract<LayoutModule, { kind: 'section' }>) =>
  typeof module.options?.title === 'string' && module.options.title.trim() ? module.options.title.trim() : '';

const awesomeSectionTitle = (title: string, fallback: string) => escapeLatex((title || fallback).trim().toUpperCase());

const resolveSpaceValue = (module: Extract<LayoutModule, { kind: 'space' }>) => {
  if (Number.isFinite(module.value)) return clampSpaceValue(module.value);
  return clampSpaceValue(module.size ? legacySpaceValues[module.size] : defaultSpaceValue);
};

export const clampSpaceValue = (value: number) => Math.min(MAX_SPACE_VALUE, Math.max(MIN_SPACE_VALUE, Math.round(value * 10) / 10));

const formatSpaceValue = (module: Extract<LayoutModule, { kind: 'space' }>) => `${resolveSpaceValue(module)}pt`;

const renderCvItems = (items: string[], indent: string) => {
  const lines = items.filter((item) => item.trim());
  if (lines.length === 0) return `${indent}{}`;
  return [
    `${indent}{`,
    `${indent}  \\begin{cvitems}`,
    ...lines.map((item) => `${indent}    \\item {${escapeLatex(item)}}`),
    `${indent}  \\end{cvitems}`,
    `${indent}}`
  ].join('\n');
};

const sectionModule = (section: SectionKey, enabled = true): LayoutModule => ({
  id: createModuleId(section),
  kind: 'section',
  section,
  sectionType: sectionTypeBySection[section] ?? `${section}-default`,
  enabled
});

const supportTextFiles = (): LatexProjectFile[] =>
  Object.entries(textModules).map(([path, contents]) => ({ path: parseAwesomePath(path), kind: 'text' as const, contents }));

const supportAssetFiles = async (): Promise<LatexProjectFile[]> =>
  Promise.all(
    Object.entries(assetModules).map(async ([path, url]) => ({
      path: parseAwesomePath(path),
      kind: 'binary' as const,
      data: await fetchAsset(url)
    }))
  );

const fetchAsset = async (url: string) => {
  try {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return new Uint8Array();
  }
};

const parseAwesomePath = (path: string) => path.replace(/^\.\.\/latex-templates\/awesome-resume\//, '');

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) ?? '' };
};

const createModuleId = (name: string) => createId(`module-${name}`);
