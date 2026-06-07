import type { LatexProjectFile } from './latexProject';

export type TemplateId = 'awesome-cv';
export type TemplateKey = string;

export type ProfileFieldKey =
  | 'fullName'
  | 'headline'
  | 'email'
  | 'phone'
  | 'location'
  | 'links'
  | 'gitlab'
  | 'linkedin'
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
  linkedin?: string;
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

// --- Flex section contract (adapter-defined) ---

export interface FieldDescriptor {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface EntryTypeDefinition {
  id: string;
  label: string;
  fields: FieldDescriptor[];
}

export interface SectionEnvDefinition {
  id: string;
  label: string;
  allowedEntryTypeIds: string[];
  allowsSubsectionHeading?: boolean;
}

export interface CvSubsectionHeading {
  id: string;
  kind: 'subsection-heading';
  text: string;
}

export interface FlexEntry {
  id: string;
  type: string;
  fields: Record<string, string | string[]>;
  hidden?: boolean;
}

export interface FlexSubSection {
  id: string;
  environment: string;
  heading?: string;
  items: (FlexEntry | CvSubsectionHeading)[];
  hidden?: boolean;
}

export interface FlexSection {
  id: string;
  name: string;
  items: (FlexSubSection | FlexEntry | CvSubsectionHeading)[];
  hidden?: boolean;
}

// --- Resume content ---

export interface ResumeContent {
  profile: Profile;
  summary: string;
  profileHighlights?: ProfileHighlightItem[];
  flexSections: FlexSection[];
}

export type SectionKey = 'summary';

// --- Layout modules ---

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
      kind: 'flex-section';
      flexSectionId: string;
      enabled: boolean;
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

// --- Adapter types ---

export type LatexProjectRenderResult = {
  files: LatexProjectFile[];
  mainFile: string;
  engine: 'xelatex' | 'pdflatex' | 'lualatex';
  latexSource: string;
  warnings: string[];
};

export type TemplateAdapter = {
  id: TemplateKey;
  defaultLayout: (resume: ResumeRecord) => LayoutModule[];
  renderLatexProject?: (resume: ResumeRecord, modules: LayoutModule[]) => Promise<LatexProjectRenderResult> | LatexProjectRenderResult;
};

// --- Template settings and records ---

export interface TemplateSettings {
  color: string;
  typography: string;
  spacing: 'compact' | 'comfortable';
  pagePadding: number;
}

export interface ReviewMarker {
  field: string;
  sourceSnippet?: string;
  note: string;
  needsReview: boolean;
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
  thumbnailDataUrl?: string;
}

export interface CompileArtifact {
  id: string;
  schemaVersion: 1;
  resumeId: string;
  targetType?: 'resume' | 'fitted-cv';
  targetId?: string;
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
  activeTemplateId: TemplateId;
  templateLayouts: Record<TemplateKey, LayoutModule[]>;
  templateSettings: Record<string, TemplateSettings>;
  content: ResumeContent;
  jobDescriptionId?: string;
  proposedChanges: FittedCvChangeRecord[];
  acceptedChangeIds: string[];
  rejectedChangeIds: string[];
  latestJdMatchReportId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type FittedCvReviewStatus = 'pending' | 'accepted' | 'rejected' | 'manual';
export type FittedCvRiskFlag = 'unsupported-claim' | 'verify-scope' | 'new-metric' | 'new-skill' | 'seniority-mismatch';

export interface FittedCvChangeRecord {
  id: string;
  sourceMode: 'ai-fit-to-jd';
  targetField: string;
  before: string;
  after: string;
  rationale: string;
  jdEvidence?: string;
  riskFlags: FittedCvRiskFlag[];
  status: FittedCvReviewStatus;
  createdAt: string;
  reviewedAt?: string;
}

export interface ScoringReportRecord {
  id: string;
  schemaVersion: 1;
  resumeId: string;
  targetType?: 'resume' | 'fitted-cv';
  targetId?: string;
  resumeVersion: number;
  kind: 'ats' | 'cv-quality' | 'jd-match';
  jobDescriptionId?: string;
  methodologyVersion: string;
  readinessPercent: number;
  reasons: {
    id: string;
    field?: string;
    message: string;
    severity: 'info' | 'medium' | 'high';
    impact?: number;
  }[];
  createdAt: string;
}

export type AiProvider = 'openai' | 'deepseek' | 'gemini' | 'claude' | 'local';

export interface ProviderSettingsRecord {
  id: string;
  schemaVersion: 1;
  provider?: AiProvider;
  endpointUrl: string;
  model: string;
  rememberApiKey: boolean;
  apiKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeminiQuotaSnapshot {
  remaining: number;
  limit: number;
  updatedAt: string;
}

export interface AppPreference {
  schemaVersion: 1;
  id: 'default';
  theme: 'light' | 'dark';
  activeResumeId?: string;
  seededOnce?: boolean;
  panels: {
    style: boolean;
    preview: boolean;
  };
}
