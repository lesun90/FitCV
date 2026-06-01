import { openDB, type DBSchema } from 'idb';
import type {
  AppPreference,
  CompileArtifact,
  FittedCvRecord,
  JobDescriptionRecord,
  ProviderSettingsRecord,
  ResumeRecord,
  ScoringReportRecord,
  UploadedFileAttachmentRecord
} from '../domain/types';

interface FitcvDb extends DBSchema {
  resumes: {
    key: string;
    value: ResumeRecord;
    indexes: { 'by-updated': string };
  };
  artifacts: {
    key: string;
    value: CompileArtifact;
    indexes: { 'by-resume': string };
  };
  fittedCvs: {
    key: string;
    value: FittedCvRecord;
    indexes: { 'by-source-resume': string };
  };
  jobDescriptions: {
    key: string;
    value: JobDescriptionRecord;
    indexes: { 'by-updated': string };
  };
  scoringReports: {
    key: string;
    value: ScoringReportRecord;
    indexes: { 'by-resume': string };
  };
  providerSettings: {
    key: string;
    value: ProviderSettingsRecord;
  };
  uploadedFileAttachments: {
    key: string;
    value: UploadedFileAttachmentRecord;
    indexes: { 'by-resume': string };
  };
  preferences: {
    key: string;
    value: AppPreference;
  };
}

const db = () =>
  openDB<FitcvDb>('fitcv-local-workbench', 2, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('resumes')) {
        const resumes = database.createObjectStore('resumes', { keyPath: 'id' });
        resumes.createIndex('by-updated', 'updatedAt');
      }
      if (!database.objectStoreNames.contains('artifacts')) {
        const artifacts = database.createObjectStore('artifacts', { keyPath: 'id' });
        artifacts.createIndex('by-resume', 'resumeId');
      }
      if (!database.objectStoreNames.contains('fittedCvs')) {
        const fittedCvs = database.createObjectStore('fittedCvs', { keyPath: 'id' });
        fittedCvs.createIndex('by-source-resume', 'sourceResumeId');
      }
      if (!database.objectStoreNames.contains('jobDescriptions')) {
        const jobDescriptions = database.createObjectStore('jobDescriptions', { keyPath: 'id' });
        jobDescriptions.createIndex('by-updated', 'updatedAt');
      }
      if (!database.objectStoreNames.contains('scoringReports')) {
        const scoringReports = database.createObjectStore('scoringReports', { keyPath: 'id' });
        scoringReports.createIndex('by-resume', 'resumeId');
      }
      if (!database.objectStoreNames.contains('providerSettings')) {
        database.createObjectStore('providerSettings', { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains('uploadedFileAttachments')) {
        const uploadedFileAttachments = database.createObjectStore('uploadedFileAttachments', { keyPath: 'id' });
        uploadedFileAttachments.createIndex('by-resume', 'resumeId');
      }
      if (!database.objectStoreNames.contains('preferences')) {
        database.createObjectStore('preferences', { keyPath: 'id' });
      }
    }
  });

export const storage = {
  async listResumes() {
    return (await db()).getAll('resumes');
  },
  async saveResume(resume: ResumeRecord) {
    await (await db()).put('resumes', resume);
  },
  async deleteResume(id: string) {
    await (await db()).delete('resumes', id);
  },
  async saveArtifact(artifact: CompileArtifact) {
    await (await db()).put('artifacts', artifact);
  },
  async listArtifacts() {
    return (await db()).getAll('artifacts');
  },
  async latestArtifact(resumeId: string) {
    const artifacts = await (await db()).getAllFromIndex('artifacts', 'by-resume', resumeId);
    return artifacts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  },
  async listFittedCvs() {
    return (await db()).getAll('fittedCvs');
  },
  async saveFittedCv(fittedCv: FittedCvRecord) {
    await (await db()).put('fittedCvs', fittedCv);
  },
  async listJobDescriptions() {
    return (await db()).getAll('jobDescriptions');
  },
  async saveJobDescription(jobDescription: JobDescriptionRecord) {
    await (await db()).put('jobDescriptions', jobDescription);
  },
  async listScoringReports() {
    return (await db()).getAll('scoringReports');
  },
  async saveScoringReport(scoringReport: ScoringReportRecord) {
    await (await db()).put('scoringReports', scoringReport);
  },
  async listProviderSettings() {
    return (await db()).getAll('providerSettings');
  },
  async saveProviderSettings(providerSettings: ProviderSettingsRecord) {
    await (await db()).put('providerSettings', providerSettings);
  },
  async listUploadedFileAttachments() {
    return (await db()).getAll('uploadedFileAttachments');
  },
  async saveUploadedFileAttachment(attachment: UploadedFileAttachmentRecord) {
    await (await db()).put('uploadedFileAttachments', attachment);
  },
  async getPreference() {
    return (await db()).get('preferences', 'default');
  },
  async savePreference(preference: AppPreference) {
    await (await db()).put('preferences', preference);
  }
};
