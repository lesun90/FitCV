import { defaultLayoutForTemplate, normalizeLayoutModule } from './templateAdapters';
import type { LayoutModule, ResumeContent, ResumeRecord, SectionKey, TemplateId, TemplateSettings } from './types';
import { createId } from './ids';

const sectionOrder: SectionKey[] = ['summary', 'experience', 'education', 'projects', 'skills', 'awards', 'customSections'];

let lastTimestamp = 0;
const now = () => {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp).toISOString();
};
const id = createId;

export const defaultTemplateSettings = (templateId: TemplateId): TemplateSettings => ({
  color: templateId === 'classic-ats' ? '#143d3a' : templateId === 'awesome-cv' ? '#d13624' : '#3949ab',
  typography: templateId === 'classic-ats' ? 'Literata' : templateId === 'awesome-cv' ? 'Source Sans Pro' : 'Aptos',
  spacing: 'comfortable',
  pagePadding: 42
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
    stackoverflow: {
      id: '',
      name: ''
    },
    twitter: '',
    x: '',
    skype: '',
    reddit: '',
    medium: '',
    kaggle: '',
    hackerrank: '',
    telegram: '',
    googleScholar: {
      id: '',
      name: ''
    },
    extraInfo: '',
    quote: '',
    hiddenFields: []
  },
  summary: '',
  profileHighlights: [],
  experience: [],
  education: [],
  projects: [],
  skills: [],
  awards: [],
  customSections: []
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
    stackoverflow: {
      id: '',
      name: ''
    },
    twitter: '',
    x: '',
    skype: '',
    reddit: '',
    medium: '',
    kaggle: '',
    hackerrank: '',
    telegram: '',
    googleScholar: {
      id: '',
      name: ''
    },
    extraInfo: '',
    quote: '',
    hiddenFields: []
  };
  resume.content.summary = 'Structured technical leader who turns ambiguous systems into readable, durable programs.';
  resume.content.profileHighlights = [
    { id: id('highlight'), text: 'Structured technical leader who turns ambiguous systems into readable, durable programs.' }
  ];
  resume.content.experience.push({
    id: id('exp'),
    company: 'Analytical Engine Lab',
    role: 'Principal Systems Analyst',
    location: 'London, UK',
    startDate: '1842',
    endDate: 'Present',
    highlights: ['Translated complex requirements into executable notation', 'Documented reusable methods for future operators']
  });
  resume.content.education.push({
    id: id('edu'),
    school: 'Independent Study',
    degree: 'Mathematics and Logic',
    location: 'London, UK',
    startDate: '1832',
    endDate: '1842',
    highlights: ['Studied symbolic reasoning, mechanics, and mathematical proof']
  });
  resume.content.projects.push({
    id: id('project'),
    name: 'Notes on the Analytical Engine',
    description: 'Technical writing and algorithms for a general-purpose computing machine.',
    highlights: ['Outlined a repeatable calculation process', 'Preserved context for future readers'],
    links: []
  });
  resume.content.skills = ['Systems thinking', 'Technical writing', 'Mathematics', 'Algorithm design'];
  resume.content.awards = ['First programmer, widely recognized'];
  resume.version = 2;
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
      [templateId]: defaultTemplateSettings(templateId)
    },
    reviewMarkers: [],
    importNotes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1
  };
  return ensureTemplateLayouts(resume);
};

export const touchResume = (resume: ResumeRecord): ResumeRecord => ({
  ...resume,
  updatedAt: now(),
  version: resume.version + 1
});

export const duplicateResume = (resume: ResumeRecord): ResumeRecord => {
  const timestamp = now();
  return {
    ...structuredClone(ensureTemplateLayouts(resume)),
    id: id('resume'),
    title: `${resume.title} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: resume.version + 1
  };
};

export const renameResume = (resume: ResumeRecord, title: string): ResumeRecord => touchResume({ ...resume, title });

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
      name: next.content.profile.stackoverflow?.name ?? ''
    },
    googleScholar: {
      id: next.content.profile.googleScholar?.id ?? '',
      name: next.content.profile.googleScholar?.name ?? ''
    },
    hiddenFields: next.content.profile.hiddenFields ?? []
  };
  next.content.profileHighlights ??= next.content.summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ id: id('highlight'), text }));
  next.templateLayouts ??= {};
  next.templateLayouts = Object.fromEntries(
    Object.entries(next.templateLayouts).map(([templateId, layout]) => [templateId, layout.map(normalizeLayoutModule)])
  );
  next.templateSettings ??= {};
  next.templateSettings[next.activeTemplateId] ??= defaultTemplateSettings(next.activeTemplateId);
  next.templateLayouts[next.activeTemplateId] ??= defaultLayoutForTemplate(next.activeTemplateId, next);
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
