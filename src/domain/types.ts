export type TemplateId = 'classic-ats' | 'modern-compact';

export interface Profile {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface ExperienceItem {
  id: string;
  company: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  highlights: string[];
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  location: string;
  startDate: string;
  endDate: string;
  highlights: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  links: string[];
}

export interface CustomSection {
  id: string;
  title: string;
  body: string;
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
