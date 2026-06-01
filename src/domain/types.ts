export type TemplateId = 'classic-ats' | 'modern-compact' | 'awesome-cv';
export type TemplateKey = string;

export type ProfileFieldKey =
  | 'fullName'
  | 'headline'
  | 'email'
  | 'phone'
  | 'location'
  | 'links'
  | 'gitlab'
  | 'stackoverflow'
  | 'twitter'
  | 'x'
  | 'skype'
  | 'reddit'
  | 'medium'
  | 'kaggle'
  | 'hackerrank'
  | 'telegram'
  | 'googleScholar'
  | 'extraInfo'
  | 'quote';

export interface Profile {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  gitlab?: string;
  stackoverflow?: {
    id: string;
    name: string;
  };
  twitter?: string;
  x?: string;
  skype?: string;
  reddit?: string;
  medium?: string;
  kaggle?: string;
  hackerrank?: string;
  telegram?: string;
  googleScholar?: {
    id: string;
    name: string;
  };
  extraInfo?: string;
  quote?: string;
  hiddenFields?: ProfileFieldKey[];
}

export interface ProfileHighlightItem {
  id: string;
  text: string;
  hidden?: boolean;
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  highlights: string[];
  hidden?: boolean;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  location: string;
  startDate: string;
  endDate: string;
  highlights: string[];
  hidden?: boolean;
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  links: string[];
  hidden?: boolean;
}

export interface CustomSection {
  id: string;
  title: string;
  body: string;
  hidden?: boolean;
}

export interface ReviewMarker {
  field: string;
  sourceSnippet?: string;
  note: string;
  needsReview: boolean;
}

export interface ResumeContent {
  profile: Profile;
  summary: string;
  profileHighlights?: ProfileHighlightItem[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  skills: string[];
  awards: string[];
  customSections: CustomSection[];
}

export type SectionKey = keyof Pick<
  ResumeContent,
  'summary' | 'experience' | 'education' | 'projects' | 'skills' | 'awards' | 'customSections'
>;

export type LayoutModule =
  | {
      id: string;
      kind: 'section';
      section: SectionKey;
      sectionType: string;
      enabled: boolean;
      options?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: 'space';
      enabled: boolean;
      value: number;
      size?: 'small' | 'medium' | 'large';
    }
  | {
      id: string;
      kind: 'new-page';
      enabled: boolean;
    };

export interface TemplateSettings {
  color: string;
  typography: string;
  spacing: 'compact' | 'comfortable';
  pagePadding: number;
}

export interface ResumeRecord {
  id: string;
  schemaVersion: 1;
  title: string;
  activeTemplateId: TemplateId;
  sectionOrder: SectionKey[];
  hiddenSections: SectionKey[];
  templateLayouts: Record<TemplateKey, LayoutModule[]>;
  content: ResumeContent;
  templateSettings: Record<string, TemplateSettings>;
  reviewMarkers: ReviewMarker[];
  importNotes: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CompileArtifact {
  id: string;
  schemaVersion: 1;
  resumeId: string;
  templateId: TemplateId;
  resumeVersion: number;
  status: 'clean' | 'compiling' | 'stale' | 'failed';
  logs: string[];
  latexSource: string;
  pdfBlob?: Blob;
  generatedText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobDescriptionRecord {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface FittedCvRecord {
  id: string;
  schemaVersion: 1;
  title: string;
  sourceResumeId: string;
  sourceVersion: number;
  content: ResumeContent;
  jobDescriptionId?: string;
  acceptedChangeIds: string[];
  rejectedChangeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScoringReportRecord {
  id: string;
  schemaVersion: 1;
  resumeId: string;
  resumeVersion: number;
  kind: 'ats' | 'cv-quality' | 'jd-match';
  methodologyVersion: string;
  suggestions: {
    field: string;
    message: string;
    severity: 'info' | 'medium' | 'high';
  }[];
  createdAt: string;
}

export interface ProviderSettingsRecord {
  id: string;
  schemaVersion: 1;
  provider: 'openai' | 'claude' | 'deepseek' | 'gemini' | 'local-openai-compatible';
  endpoint?: string;
  model?: string;
  rememberApiKey: false;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedFileAttachmentRecord {
  id: string;
  schemaVersion: 1;
  resumeId: string;
  name: string;
  mimeType: string;
  size: number;
  retainedExplicitly: true;
  createdAt: string;
}

export interface AppPreference {
  schemaVersion: 1;
  id: 'default';
  theme: 'light' | 'dark';
  activeResumeId?: string;
  panels: {
    style: boolean;
    preview: boolean;
  };
}
