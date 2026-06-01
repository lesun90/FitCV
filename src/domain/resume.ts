import type { ResumeContent, ResumeRecord, SectionKey, TemplateId, TemplateSettings } from './types';

const sectionOrder: SectionKey[] = ['summary', 'experience', 'education', 'projects', 'skills', 'awards', 'customSections'];

let lastTimestamp = 0;
const now = () => {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  return new Date(lastTimestamp).toISOString();
};
const uuid = () => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};
const id = (prefix: string) => `${prefix}-${uuid()}`;

export const defaultTemplateSettings = (templateId: TemplateId): TemplateSettings => ({
  color: templateId === 'classic-ats' ? '#143d3a' : '#3949ab',
  typography: templateId === 'classic-ats' ? 'Literata' : 'Aptos',
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
    links: []
  },
  summary: '',
  experience: [],
  education: [],
  projects: [],
  skills: [],
  awards: [],
  customSections: []
});

export const sampleResume = (): ResumeRecord => {
  const resume = createResume('Ada Lovelace - Sample Resume', 'classic-ats');
  resume.content.profile = {
    fullName: 'Ada Lovelace',
    headline: 'Computing pioneer and analytical engine collaborator',
    email: 'ada@example.com',
    phone: '+1 555 0142',
    location: 'London, UK',
    links: ['linkedin.com/in/ada', 'github.com/ada']
  };
  resume.content.summary = 'Structured technical leader who turns ambiguous systems into readable, durable programs.';
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
  return {
    id: id('resume'),
    schemaVersion: 1,
    title,
    activeTemplateId: templateId,
    sectionOrder,
    hiddenSections: [],
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
};

export const touchResume = (resume: ResumeRecord): ResumeRecord => ({
  ...resume,
  updatedAt: now(),
  version: resume.version + 1
});

export const duplicateResume = (resume: ResumeRecord): ResumeRecord => {
  const timestamp = now();
  return {
    ...structuredClone(resume),
    id: id('resume'),
    title: `${resume.title} copy`,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: resume.version + 1
  };
};

export const renameResume = (resume: ResumeRecord, title: string): ResumeRecord => touchResume({ ...resume, title });

export const switchTemplate = (resume: ResumeRecord, templateId: TemplateId): ResumeRecord => {
  const next = structuredClone(resume);
  next.activeTemplateId = templateId;
  next.templateSettings[templateId] ??= defaultTemplateSettings(templateId);
  return touchResume(next);
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
