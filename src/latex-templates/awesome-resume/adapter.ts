import { escapeLatex, escapeLatexRichText, visibleProfileHighlights } from '../../domain/latex';
import type { LatexProjectFile } from '../../domain/latexProject';
import { createId } from '../../domain/ids';
import type {
  CvSubsectionHeading,
  EntryTypeDefinition,
  FlexEntry,
  FlexSection,
  FlexSubSection,
  LatexProjectRenderResult,
  LayoutModule,
  ProfileFieldKey,
  ResumeRecord,
  SectionEnvDefinition,
  TemplateAdapter,
} from '../../domain/types';
import type { TemplateRegistryEntry } from '../../domain/templates';

// --- Contract: declares both the editor shape and the LaTeX output shape ---

const sectionEnvs: SectionEnvDefinition[] = [
  { id: 'experience',      label: 'Experience',      allowedEntryTypeIds: ['cventry'],       allowsSubsectionHeading: true  },
  { id: 'cventries',       label: 'CV Entries',      allowedEntryTypeIds: ['cventry'],       allowsSubsectionHeading: true  },
  { id: 'projects',        label: 'Projects',        allowedEntryTypeIds: ['projectentry'],  allowsSubsectionHeading: false },
  { id: 'researchentries', label: 'Research Entries', allowedEntryTypeIds: ['researchentry'], allowsSubsectionHeading: true  },
  { id: 'cvhonors',        label: 'Honors & Awards', allowedEntryTypeIds: ['cvhonor'],       allowsSubsectionHeading: true  },
  { id: 'patents',         label: 'Patents',         allowedEntryTypeIds: ['cvhonor'],       allowsSubsectionHeading: false },
  { id: 'cvskills',        label: 'Skills',          allowedEntryTypeIds: ['cvskill'],       allowsSubsectionHeading: true  },
  { id: 'cvitems',         label: 'Bullet List',     allowedEntryTypeIds: ['item'],          allowsSubsectionHeading: true  },
  { id: 'publications',    label: 'Publications',    allowedEntryTypeIds: ['item'],          allowsSubsectionHeading: false },
];

const entryTypes: EntryTypeDefinition[] = [
  {
    id: 'cventry',
    label: 'CV Entry',
    fields: [
      { id: 'position',   label: 'Position / Role' },
      { id: 'title',      label: 'Title / Organisation' },
      { id: 'location',   label: 'Location' },
      { id: 'date',       label: 'Date Range' },
      { id: 'highlights', label: 'Highlights', multiline: true },
    ],
  },
  {
    id: 'projectentry',
    label: 'Project Entry',
    fields: [
      { id: 'title',      label: 'Project Title' },
      { id: 'subtitle',   label: 'Subtitle' },
      { id: 'role',       label: 'Role' },
      { id: 'links',      label: 'Links' },
      { id: 'highlights', label: 'Highlights', multiline: true },
    ],
  },
  {
    id: 'researchentry',
    label: 'Research Entry',
    fields: [
      { id: 'title',       label: 'Title' },
      { id: 'description', label: 'Description', multiline: true },
    ],
  },
  {
    id: 'cvhonor',
    label: 'Honor / Award',
    fields: [
      { id: 'award',    label: 'Award' },
      { id: 'event',    label: 'Event' },
      { id: 'location', label: 'Location' },
      { id: 'date',     label: 'Date' },
    ],
  },
  {
    id: 'cvskill',
    label: 'Skill Group',
    fields: [
      { id: 'type',   label: 'Category' },
      { id: 'skills', label: 'Skills' },
    ],
  },
  {
    id: 'item',
    label: 'Bullet Item',
    fields: [
      { id: 'text', label: 'Text', multiline: true },
    ],
  },
];

export const awesomeCvTemplate: TemplateRegistryEntry = {
  id: 'awesome-cv',
  name: 'Awesome CV',
  description: 'A polished LaTeX layout using the Awesome CV class with module-based sections and page breaks.',
  browserCompatibility: {
    engine: 'xelatex',
    notes: ['Generated as an adapter-backed BusyTeX project from structured resume data.', 'Uses bundled Awesome CV class, style, and font assets.'],
  },
  fixture: {
    sampleResumeId: 'sample-awesome-cv',
    expectedText: ['Ada Lovelace', 'Work Experience', 'Skills'],
  },
  pinnedSections: ['summary'],
  sectionEnvs,
  entryTypes,
};

// --- Adapter ---

const textModules = import.meta.glob('./**/*.{cls,sty}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const assetModules = import.meta.glob('./**/*.{ttf,otf,woff,woff2,png,jpg,jpeg,pdf,svg,eps}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export const awesomeCvAdapter: TemplateAdapter = {
  id: 'awesome-cv',
  defaultLayout: (resume) => [
    {
      id: createId('module-summary'),
      kind: 'section',
      section: 'summary',
      sectionType: 'awesome-highlight',
      enabled: true,
    },
    ...(resume.content.flexSections ?? []).map(
      (section): LayoutModule => ({
        id: createId(`module-flex-${section.id}`),
        kind: 'flex-section',
        flexSectionId: section.id,
        enabled: !section.hidden,
      })
    ),
  ],
  renderLatexProject: async (resume, modules) => renderAwesomeCvProject(resume, modules),
};

// --- LaTeX rendering (private to this adapter) ---

const renderHighlightsBlock = (lines: string[], indent: string): string => {
  if (!lines.length) return `${indent}{}`;
  return [
    `${indent}{`,
    `${indent}  \\begin{cvitems}`,
    ...lines.map((line) => `${indent}    \\item {${escapeLatexRichText(line)}}`),
    `${indent}  \\end{cvitems}`,
    `${indent}}`,
  ].join('\n');
};

const renderFlexEntry = (entry: FlexEntry, indent: string): string => {
  const field = (key: string): string => {
    const v = entry.fields[key];
    return Array.isArray(v) ? v.join('\n') : (v ?? '');
  };

  switch (entry.type) {
    case 'cventry': {
      const highlights = field('highlights').split('\n').filter(Boolean);
      return [
        `${indent}\\cventry`,
        `${indent}  {${escapeLatex(field('position'))}}`,
        `${indent}  {${escapeLatex(field('title'))}}`,
        `${indent}  {${escapeLatex(field('location'))}}`,
        `${indent}  {${escapeLatex(field('date'))}}`,
        renderHighlightsBlock(highlights, `${indent}  `),
      ].join('\n');
    }
    case 'projectentry': {
      const highlights = field('highlights').split('\n').filter(Boolean);
      return [
        `${indent}\\projectentry`,
        `${indent}  {${escapeLatex(field('title'))}}`,
        `${indent}  {${escapeLatex(field('subtitle'))}}`,
        `${indent}  {${escapeLatex(field('role'))}}`,
        `${indent}  {${escapeLatex(field('links'))}}`,
        renderHighlightsBlock(highlights, `${indent}  `),
      ].join('\n');
    }
    case 'researchentry': {
      return [
        `${indent}\\researchentry`,
        `${indent}  {${escapeLatex(field('title'))}}`,
        `${indent}  {${escapeLatexRichText(field('description'))}}`,
      ].join('\n');
    }
    case 'cvhonor': {
      return `${indent}\\cvhonor{${escapeLatex(field('award'))}}{${escapeLatex(field('event'))}}{${escapeLatex(field('location'))}}{${escapeLatex(field('date'))}} `;
    }
    case 'cvskill': {
      return `${indent}\\cvskill{${escapeLatex(field('type'))}}{${escapeLatex(field('skills'))}}`;
    }
    case 'item': {
      return `${indent}\\item {${escapeLatexRichText(field('text'))}}`;
    }
    default:
      return '';
  }
};

const renderFlexSubSection = (sub: FlexSubSection): string => {
  if (sub.hidden) return '';
  const hasEntries = sub.items.some((item) => !('kind' in item) && !(item as FlexEntry).hidden);
  if (!hasEntries) return '';

  const lines: string[] = [`\\begin{${sub.environment}}`];
  for (const item of sub.items) {
    if ('kind' in item && (item as CvSubsectionHeading).kind === 'subsection-heading') {
      lines.push(`\\cvsubsection{${escapeLatex((item as CvSubsectionHeading).text)}}`);
    } else {
      const entry = item as FlexEntry;
      if (!entry.hidden) {
        const rendered = renderFlexEntry(entry, '  ');
        if (rendered) lines.push(rendered);
      }
    }
  }
  lines.push(`\\end{${sub.environment}}`);
  return lines.join('\n');
};

const renderFlexSection = (section: FlexSection): string => {
  if (section.hidden) return '';
  const body: string[] = [];

  for (const item of section.items) {
    if ('kind' in item && (item as CvSubsectionHeading).kind === 'subsection-heading') {
      body.push(`\\cvsubsection{${escapeLatex((item as CvSubsectionHeading).text)}}`);
    } else if ('environment' in item) {
      const rendered = renderFlexSubSection(item as FlexSubSection);
      if (rendered) body.push(rendered);
    } else {
      const entry = item as FlexEntry;
      if (!entry.hidden) {
        const rendered = renderFlexEntry(entry, '');
        if (rendered) body.push(rendered);
      }
    }
  }

  if (!body.length) return '';
  return [`\\cvsection{${escapeLatex(section.name.toUpperCase())}}`, ...body].join('\n');
};

const renderAwesomeCvProject = async (resume: ResumeRecord, modules: LayoutModule[]): Promise<LatexProjectRenderResult> => {
  const warnings: string[] = [];
  const generatedSections: Extract<LatexProjectFile, { kind: 'text' }>[] = [];
  const imports: string[] = [];

  modules.forEach((module, index) => {
    if (!module.enabled) return;

    if (module.kind === 'space') {
      imports.push(`\\vspace{${resolveSpaceValue(module)}pt}`);
      return;
    }
    if (module.kind === 'new-page') {
      imports.push('\\newpage');
      return;
    }
    if (module.kind === 'section') {
      const rendered = renderSummarySection(resume, module);
      if (!rendered) return;
      const path = `resume/generated-${index}-summary.tex`;
      generatedSections.push({ path, kind: 'text', contents: rendered });
      imports.push(`\\import{resume/}{generated-${index}-summary.tex}`);
      return;
    }
    if (module.kind === 'flex-section') {
      const section = resume.content.flexSections.find((s) => s.id === module.flexSectionId);
      if (!section) return;
      const rendered = renderFlexSection(section);
      if (!rendered) return;
      const path = `resume/generated-${index}-${section.id}.tex`;
      generatedSections.push({ path, kind: 'text', contents: rendered });
      imports.push(`\\import{resume/}{generated-${index}-${section.id}.tex}`);
    }
  });

  const root = renderAwesomeRoot(resume, imports);
  const files: LatexProjectFile[] = [
    ...supportTextFiles(),
    ...(await supportAssetFiles()),
    { path: 'resume.tex', kind: 'text', contents: root },
    ...generatedSections,
  ];

  return {
    files,
    mainFile: 'resume.tex',
    engine: 'xelatex',
    latexSource: [root, ...generatedSections.map((f) => f.contents)].join('\n\n'),
    warnings,
  };
};

const renderSummarySection = (
  resume: ResumeRecord,
  module: Extract<LayoutModule, { kind: 'section' }>
): string => {
  const profileHighlights = visibleProfileHighlights(resume);
  if (!profileHighlights.length) return '';
  const titleOverride = typeof module.options?.title === 'string' ? module.options.title.trim() : '';
  if (titleOverride) {
    return [
      `\\cvsection{${escapeLatex(titleOverride.toUpperCase())}}`,
      '\\begin{highlights}',
      ...profileHighlights.map((line) => `  \\item[\\textbullet]{${escapeLatexRichText(line)}}`),
      '\\end{highlights}',
    ].join('\n');
  }
  return [
    '\\begin{highlights}',
    ...profileHighlights.map((line) => `  \\item[\\textbullet]{${escapeLatexRichText(line)}}`),
    '\\end{highlights}',
  ].join('\n');
};

const renderAwesomeRoot = (resume: ResumeRecord, imports: string[]) => {
  const { first, last } = splitName(resume.content.profile.fullName || resume.title);
  const profile = resume.content.profile;
  const links = profile.links ?? [];
  const visible = (field: ProfileFieldKey) => !(profile.hiddenFields ?? []).includes(field);
  const simpleCmd = (field: ProfileFieldKey, cmd: string, value: string) =>
    visible(field) && value ? `\\${cmd}{${escapeLatex(value)}}` : '';
  const stackoverflow = profile.stackoverflow;
  const googleScholar = profile.googleScholar;

  return [
    '\\documentclass[11pt, a4paper]{awesome-cv}',
    '\\fontdir[fonts/]',
    '\\colorlet{awesome}{awesome-red}',
    '\\usepackage{import}',
    `\\name{${escapeLatex(first)}}{${escapeLatex(last)}}`,
    simpleCmd('phone',    'mobile',   profile.phone),
    simpleCmd('email',    'email',    profile.email),
    simpleCmd('location', 'address',  profile.location),
    visible('links') && links[0] ? `\\homepage{${escapeLatex(links[0])}}` : '',
    simpleCmd('headline', 'position', profile.headline),
    simpleCmd('gitlab',   'gitlab',   profile.gitlab ?? ''),
    simpleCmd('linkedin', 'linkedin', profile.linkedin ?? ''),
    visible('stackoverflow') && stackoverflow?.id ? `\\stackoverflow{${escapeLatex(stackoverflow.id)}}{${escapeLatex(stackoverflow.name)}}` : '',
    simpleCmd('twitter',      'twitter',     profile.twitter ?? ''),
    simpleCmd('x',            'x',           profile.x ?? ''),
    simpleCmd('skype',        'skype',       profile.skype ?? ''),
    simpleCmd('reddit',       'reddit',      profile.reddit ?? ''),
    simpleCmd('medium',       'medium',      profile.medium ?? ''),
    simpleCmd('kaggle',       'kaggle',      profile.kaggle ?? ''),
    simpleCmd('hackerrank',   'hackerrank',  profile.hackerrank ?? ''),
    simpleCmd('telegram',     'telegram',    profile.telegram ?? ''),
    visible('googleScholar') && googleScholar?.id ? `\\googlescholar{${escapeLatex(googleScholar.id)}}{${escapeLatex(googleScholar.name)}}` : '',
    simpleCmd('extraInfo', 'extrainfo', profile.extraInfo ?? ''),
    simpleCmd('quote',     'quote',     profile.quote ?? ''),
    '\\makecvfooter',
    '  {\\today}',
    `  {${escapeLatex(profile.fullName || resume.title)}~~~\\cdotp~~~Resume}`,
    '  {\\thepage}',
    '\\begin{document}',
    '\\makecvheader',
    ...imports,
    '\\end{document}',
  ]
    .filter(Boolean)
    .join('\n');
};

// --- Space value helpers ---

const legacySpaceValues = { small: 6, medium: 12, large: 18 };
export const MIN_SPACE_VALUE = 0;
export const MAX_SPACE_VALUE = 96;
export const defaultSpaceValue = 12;

export const clampSpaceValue = (value: number) =>
  Math.min(MAX_SPACE_VALUE, Math.max(MIN_SPACE_VALUE, Math.round(value * 10) / 10));

const resolveSpaceValue = (module: Extract<LayoutModule, { kind: 'space' }>) => {
  if (Number.isFinite(module.value)) return clampSpaceValue(module.value);
  return clampSpaceValue(module.size ? legacySpaceValues[module.size] : defaultSpaceValue);
};

// --- Asset bundling ---

const supportTextFiles = (): LatexProjectFile[] =>
  Object.entries(textModules).map(([path, contents]) => ({
    path: parseAdapterPath(path),
    kind: 'text' as const,
    contents,
  }));

const supportAssetFiles = async (): Promise<LatexProjectFile[]> =>
  Promise.all(
    Object.entries(assetModules).map(async ([path, url]) => ({
      path: parseAdapterPath(path),
      kind: 'binary' as const,
      data: await fetchAsset(url),
    }))
  );

const fetchAsset = async (url: string) => {
  try {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return new Uint8Array();
  }
};

const parseAdapterPath = (path: string) => path.replace(/^\.\//, '');

const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) ?? '' };
};
