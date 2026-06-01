import type { LatexProjectFile } from './latexProject';
import { escapeLatex } from './latex';
import type { LayoutModule, ResumeRecord, SectionKey, TemplateId, TemplateKey } from './types';
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

const sectionTypeBySection: Partial<Record<SectionKey, string>> = {
  summary: 'awesome-highlight',
  education: 'awesome-education',
  experience: 'awesome-experience',
  projects: 'awesome-projects',
  skills: 'awesome-skills',
  awards: 'awesome-honors'
};

const defaultAwesomeSections: SectionKey[] = ['summary', 'education', 'experience', 'projects', 'skills', 'awards'];
const spaceSizes = { small: '6pt', medium: '12pt', large: '18pt' };

export const templateAdapters: TemplateAdapter[] = [
  {
    id: 'awesome-cv',
    defaultLayout: (resume) => [
      ...defaultAwesomeSections.slice(0, 3).map((section) => sectionModule(section, !resume.hiddenSections.includes(section))),
      { id: createModuleId('space'), kind: 'space', enabled: true, size: 'medium' },
      { id: createModuleId('new-page'), kind: 'new-page', enabled: true },
      ...defaultAwesomeSections.slice(3).map((section) => sectionModule(section, !resume.hiddenSections.includes(section)))
    ],
    sectionTypes: [
      { id: 'awesome-highlight', templateId: 'awesome-cv', label: 'Highlight', section: 'summary', description: 'Awesome CV highlight bullets.' },
      { id: 'awesome-education', templateId: 'awesome-cv', label: 'Education', section: 'education', description: 'Awesome CV education entries.' },
      { id: 'awesome-experience', templateId: 'awesome-cv', label: 'Experience', section: 'experience', description: 'Awesome CV experience entries.' },
      { id: 'awesome-projects', templateId: 'awesome-cv', label: 'Projects', section: 'projects', description: 'Awesome CV project entries.' },
      { id: 'awesome-skills', templateId: 'awesome-cv', label: 'Skills', section: 'skills', description: 'Awesome CV skills section.' },
      { id: 'awesome-honors', templateId: 'awesome-cv', label: 'Honors', section: 'awards', description: 'Awesome CV honors entries.' }
    ],
    renderLatexProject: async (resume, modules) => renderAwesomeCvProject(resume, modules)
  }
];

export const getTemplateAdapter = (templateId: TemplateKey) => templateAdapters.find((adapter) => adapter.id === templateId);

export const hasTemplateAdapter = (templateId: TemplateKey) => Boolean(getTemplateAdapter(templateId));

export const defaultLayoutForTemplate = (templateId: TemplateKey, resume: ResumeRecord): LayoutModule[] =>
  getTemplateAdapter(templateId)?.defaultLayout(resume) ?? resume.sectionOrder.map((section) => sectionModule(section, !resume.hiddenSections.includes(section)));

export const renderAdapterLatexProject = async (resume: ResumeRecord): Promise<LatexProjectRenderResult> => {
  const adapter = getTemplateAdapter(resume.activeTemplateId);
  if (!adapter?.renderLatexProject) throw new Error(`Template ${resume.activeTemplateId} does not provide a LaTeX adapter.`);
  const modules = resume.templateLayouts[resume.activeTemplateId] ?? adapter.defaultLayout(resume);
  return adapter.renderLatexProject(resume, modules);
};

const renderAwesomeCvProject = async (resume: ResumeRecord, modules: LayoutModule[]): Promise<LatexProjectRenderResult> => {
  const warnings: string[] = [];
  const generatedSections: Extract<LatexProjectFile, { kind: 'text' }>[] = [];
  const imports: string[] = [];

  modules.forEach((module, index) => {
    if (!module.enabled) return;
    if (module.kind === 'space') {
      imports.push(`\\vspace{${spaceSizes[module.size]}}`);
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
  const links = resume.content.profile.links;

  return [
    '\\documentclass[11pt, a4paper]{awesome-cv}',
    '\\fontdir[fonts/]',
    '\\colorlet{awesome}{awesome-red}',
    '\\usepackage{import}',
    `\\name{${escapeLatex(first)}}{${escapeLatex(last)}}`,
    resume.content.profile.phone ? `\\mobile{${escapeLatex(resume.content.profile.phone)}}` : '',
    resume.content.profile.email ? `\\email{${escapeLatex(resume.content.profile.email)}}` : '',
    resume.content.profile.location ? `\\address{${escapeLatex(resume.content.profile.location)}}` : '',
    links[0] ? `\\homepage{${escapeLatex(links[0])}}` : '',
    resume.content.profile.headline ? `\\position{${escapeLatex(resume.content.profile.headline)}}` : '',
    '\\makecvfooter',
    '  {\\today}',
    `  {${escapeLatex(resume.content.profile.fullName || resume.title)}~~~\\cdotp~~~Resume}`,
    '  {\\thepage}',
    '\\begin{document}',
    '\\makecvheader',
    ...imports,
    '\\end{document}'
  ].filter(Boolean).join('\n');
};

const renderAwesomeSection = (resume: ResumeRecord, module: Extract<LayoutModule, { kind: 'section' }>) => {
  if (module.section === 'summary' && resume.content.summary.trim()) {
    return [
      '\\begin{highlights}',
      ...resume.content.summary.split(/\n+/).filter(Boolean).map((line) => `  \\item[\\textbullet]{${escapeLatex(line)}}`),
      '\\end{highlights}'
    ].join('\n');
  }

  if (module.section === 'education' && resume.content.education.length) {
    return [
      '\\cvsection{EDUCATION}',
      '\\begin{cventries}',
      ...resume.content.education.map((item) => [
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

  if (module.section === 'experience' && resume.content.experience.length) {
    return [
      '\\cvsection{WORK EXPERIENCE}',
      '\\begin{experience}',
      ...resume.content.experience.map((item) => [
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

  if (module.section === 'projects' && resume.content.projects.length) {
    return [
      '\\cvsection{PROJECTS}',
      '\\begin{projects}',
      ...resume.content.projects.map((item) => [
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
      '\\cvsection{SKILLS}',
      '\\begin{cvitems}',
      ...resume.content.skills.map((skill) => `  \\item {${escapeLatex(skill)}}`),
      '\\end{cvitems}'
    ].join('\n');
  }

  if (module.section === 'awards' && resume.content.awards.length) {
    return [
      '\\cvsection{AWARDS}',
      '\\begin{cvhonors}',
      ...resume.content.awards.map((award) => `  \\cvhonor{${escapeLatex(award)}}{}{}{} `),
      '\\end{cvhonors}'
    ].join('\n');
  }

  return '';
};

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
