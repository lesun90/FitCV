import { defaultLayoutForTemplate, normalizeLayoutModule } from './templateAdapters';
import { defaultSpaceValue } from '../latex-templates/awesome-resume/adapter';
import type { FlexEntry, FlexSection, FlexSubSection, LayoutModule, ResumeContent, ResumeRecord, SectionKey, TemplateId, TemplateSettings } from './types';
import { createId } from './ids';

const sectionOrder: SectionKey[] = ['summary'];

let lastTimestamp = 0;
const now = () => {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp).toISOString();
};
const id = createId;

export const defaultTemplateSettings = (_templateId: TemplateId): TemplateSettings => ({
  color: '#d13624',
  typography: 'Source Sans Pro',
  spacing: 'comfortable',
  pagePadding: 42,
});

export const emptyContent = (): ResumeContent => ({
  profile: {
    fullName: '',
    headline: '',
    email: '',
    phone: '',
    location: '',
    links: [],
    gitlab: '',
    linkedin: '',
    stackoverflow: { id: '', name: '' },
    twitter: '',
    x: '',
    skype: '',
    reddit: '',
    medium: '',
    kaggle: '',
    hackerrank: '',
    telegram: '',
    googleScholar: { id: '', name: '' },
    extraInfo: '',
    quote: '',
    hiddenFields: [],
  },
  summary: '',
  profileHighlights: [],
  flexSections: [],
});

const cvEntry = (fields: FlexEntry['fields']): FlexEntry => ({
  id: id('entry'),
  type: 'cventry',
  fields,
});

const cvHonor = (fields: FlexEntry['fields']): FlexEntry => ({
  id: id('entry'),
  type: 'cvhonor',
  fields,
});

const cvSkill = (fields: FlexEntry['fields']): FlexEntry => ({
  id: id('entry'),
  type: 'cvskill',
  fields,
});

const projectEntry = (fields: FlexEntry['fields']): FlexEntry => ({
  id: id('entry'),
  type: 'projectentry',
  fields,
});

const subSection = (environment: string, items: FlexEntry[]): FlexSubSection => ({
  id: id('sub'),
  environment,
  items,
});

const flexSection = (name: string, items: FlexSection['items']): FlexSection => ({
  id: id('section'),
  name,
  items,
});

export const sampleResume = (): ResumeRecord => {
  const resume = createResume('Ada Lovelace - Sample Resume', 'awesome-cv');

  resume.content.profile = {
    fullName: 'Ada Lovelace',
    headline: 'Computing pioneer and analytical engine collaborator',
    email: 'ada@example.com',
    phone: '+1 555 0142',
    location: 'London, UK',
    links: ['linkedin.com/in/ada', 'github.com/ada'],
    gitlab: '',
    linkedin: 'linkedin.com/in/ada',
    stackoverflow: { id: '', name: '' },
    twitter: '',
    x: '',
    skype: '',
    reddit: '',
    medium: '',
    kaggle: '',
    hackerrank: '',
    telegram: '',
    googleScholar: { id: '', name: '' },
    extraInfo: '',
    quote: '',
    hiddenFields: [],
  };

  resume.content.summary = 'Structured technical leader who turns ambiguous systems into readable, durable programs.';
  resume.content.profileHighlights = [
    { id: id('highlight'), text: 'Structured technical leader who turns ambiguous systems into readable, durable programs.' },
  ];

  const expSection = flexSection('WORK EXPERIENCE', [
    subSection('experience', [
      cvEntry({ position: 'Principal Systems Analyst', title: 'Analytical Engine Lab', location: 'London, UK', date: '1842 -- Present', highlights: 'Translated complex requirements into executable notation\nDocumented reusable methods for future operators' }),
    ]),
  ]);

  const eduSection = flexSection('EDUCATION', [
    subSection('cventries', [
      cvEntry({ position: 'Mathematics and Logic', title: 'Independent Study', location: 'London, UK', date: '1832 -- 1842', highlights: 'Studied symbolic reasoning, mechanics, and mathematical proof' }),
    ]),
  ]);

  const projSection = flexSection('HIGHLIGHT PROJECTS', [
    subSection('projects', [
      projectEntry({ title: 'Notes on the Analytical Engine', subtitle: '', role: '', links: '', highlights: 'Technical writing and algorithms for a general-purpose computing machine.\nOutlined a repeatable calculation process\nPreserved context for future readers' }),
    ]),
  ]);

  const skillsSection = flexSection('SKILLS', [
    subSection('cvskills', [
      cvSkill({ type: 'Core skills', skills: 'Systems thinking, Technical writing, Mathematics, Algorithm design' }),
    ]),
  ]);

  const awardsSection = flexSection('HONORS & AWARDS', [
    subSection('cvhonors', [
      cvHonor({ award: 'First programmer', event: 'Widely recognized', location: '', date: '' }),
    ]),
  ]);

  resume.content.flexSections = [expSection, eduSection, projSection, skillsSection, awardsSection];

  resume.templateLayouts['awesome-cv'] = [
    { id: id('mod'), kind: 'section', section: 'summary', sectionType: 'awesome-highlight', enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: expSection.id, enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: eduSection.id, enabled: true },
    { id: id('mod'), kind: 'space', enabled: true, value: defaultSpaceValue },
    { id: id('mod'), kind: 'new-page', enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: projSection.id, enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: skillsSection.id, enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: awardsSection.id, enabled: true },
  ];

  resume.version = 2;
  return resume;
};

export const starterResume = (templateId: TemplateId = 'awesome-cv'): ResumeRecord => {
  const resume = createResume('Untitled Resume', templateId);

  resume.content.profile = {
    ...emptyContent().profile,
    fullName: 'First Last',
    email: 'your.email@example.com',
    phone: '(XXX) XXX-XXXX',
    links: ['yourwebsite.com', 'github.com/yourusername'],
  };

  resume.content.profileHighlights = [
    { id: id('highlight'), text: 'Brief highlight sentence one — e.g., years of industry experience or a career milestone.' },
    { id: id('highlight'), text: 'Brief highlight sentence two — e.g., academic background or research focus.' },
    { id: id('highlight'), text: 'Brief highlight sentence three — e.g., notable achievement such as patents or awards.' },
    { id: id('highlight'), text: 'Brief highlight sentence four — e.g., key deliverable deployed in production.' },
  ];

  const expSection = flexSection('WORK EXPERIENCE', [
    subSection('experience', [
      cvEntry({ position: 'Senior Job Title',    title: 'Company Name', location: 'City, State', date: 'Month Year -- Present',       highlights: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.\nExcepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.' }),
      cvEntry({ position: 'Mid-Level Job Title', title: 'Company Name', location: 'City, State', date: 'Month Year -- Month Year',    highlights: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.\nExcepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.' }),
      cvEntry({ position: 'Junior Job Title',    title: 'Company Name', location: 'City, State', date: 'Month Year -- Month Year',    highlights: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.\nUt enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.\nDuis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.' }),
    ]),
  ]);

  const eduSection = flexSection('EDUCATION', [
    subSection('cventries', [
      cvEntry({ position: 'Ph.D. in Your Field', title: 'University Name', location: 'City, State', date: 'Year', highlights: 'Thesis Title: Lorem ipsum dolor sit amet, consectetur adipiscing elit.\nAdvisor: Advisor Name, Ph.D.' }),
      cvEntry({ position: 'M.S. in Your Field',  title: 'University Name', location: 'City, State', date: 'Year', highlights: '' }),
      cvEntry({ position: 'B.S. in Your Field',  title: 'University Name', location: 'City, State', date: 'Year', highlights: '' }),
    ]),
  ]);

  const skillsSection = flexSection('SKILLS AND EXPERIENCE', [
    subSection('cvskills', [
      cvSkill({ type: 'Languages', skills: 'Language A, Language B' }),
      cvSkill({ type: 'Tools',     skills: 'Tool A, Tool B, Framework A, Framework B, Framework C' }),
    ]),
  ]);

  resume.content.flexSections = [expSection, eduSection, skillsSection];

  resume.templateLayouts['awesome-cv'] = [
    { id: id('mod'), kind: 'section', section: 'summary', sectionType: 'awesome-highlight', enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: expSection.id, enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: eduSection.id, enabled: true },
    { id: id('mod'), kind: 'space', enabled: true, value: defaultSpaceValue },
    { id: id('mod'), kind: 'new-page', enabled: true },
    { id: id('mod'), kind: 'flex-section', flexSectionId: skillsSection.id, enabled: true },
  ];

  return resume;
};

export const createResume = (title: string, templateId: TemplateId): ResumeRecord => {
  const timestamp = now();
  const resume: ResumeRecord = {
    id: id('resume'),
    schemaVersion: 1,
    title,
    activeTemplateId: templateId,
    sectionOrder,
    hiddenSections: [],
    templateLayouts: {},
    content: emptyContent(),
    templateSettings: {
      [templateId]: defaultTemplateSettings(templateId),
    },
    reviewMarkers: [],
    importNotes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  };
  return ensureTemplateLayouts(resume);
};

export const touchResume = (resume: ResumeRecord): ResumeRecord => ({
  ...resume,
  updatedAt: now(),
  version: resume.version + 1,
});

export const duplicateResume = (resume: ResumeRecord): ResumeRecord => {
  const timestamp = now();
  return {
    ...structuredClone(ensureTemplateLayouts(resume)),
    id: id('resume'),
    title: `${resume.title} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: resume.version + 1,
  };
};

export const renameResume = (resume: ResumeRecord, title: string): ResumeRecord =>
  touchResume({ ...resume, title });

export const switchTemplate = (resume: ResumeRecord, templateId: TemplateId): ResumeRecord => {
  const next = structuredClone(ensureTemplateLayouts(resume));
  next.activeTemplateId = templateId;
  next.templateSettings[templateId] ??= defaultTemplateSettings(templateId);
  return touchResume(ensureTemplateLayouts(next));
};

export const ensureTemplateLayouts = (resume: ResumeRecord): ResumeRecord => {
  const next = structuredClone(resume) as ResumeRecord & { templateLayouts?: Record<string, LayoutModule[]> };
  const defaults = emptyContent();

  next.content.profile = {
    ...defaults.profile,
    ...next.content.profile,
    stackoverflow: {
      id: next.content.profile.stackoverflow?.id ?? '',
      name: next.content.profile.stackoverflow?.name ?? '',
    },
    googleScholar: {
      id: next.content.profile.googleScholar?.id ?? '',
      name: next.content.profile.googleScholar?.name ?? '',
    },
    hiddenFields: next.content.profile.hiddenFields ?? [],
  };

  next.content.profileHighlights ??= next.content.summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ id: id('highlight'), text }));

  next.content.flexSections ??= [];

  next.templateLayouts ??= {};
  next.templateLayouts = Object.fromEntries(
    Object.entries(next.templateLayouts).map(([templateId, layout]) => [
      templateId,
      layout.map(normalizeLayoutModule),
    ])
  );
  next.templateSettings ??= {};
  next.templateSettings[next.activeTemplateId] ??= defaultTemplateSettings(next.activeTemplateId);
  next.templateLayouts[next.activeTemplateId] ??= defaultLayoutForTemplate(next.activeTemplateId, next as ResumeRecord);

  return next as ResumeRecord;
};

export const clearReviewMarkersForField = (resume: ResumeRecord, field: string): ResumeRecord => {
  let changed = false;
  const reviewMarkers = resume.reviewMarkers.map((marker) => {
    if (marker.field !== field || !marker.needsReview) return marker;
    changed = true;
    return { ...marker, needsReview: false };
  });
  return changed ? touchResume({ ...resume, reviewMarkers }) : resume;
};
