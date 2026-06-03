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
import { ensureTemplateLayouts } from '../domain/resume';

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
    const database = await db();
    try {
      return (await database.getAll('resumes')).map(ensureTemplateLayouts);
    } finally {
      database.close();
    }
  },
  async saveResume(resume: ResumeRecord) {
    const database = await db();
    try {
      await database.put('resumes', ensureTemplateLayouts(resume));
    } finally {
      database.close();
    }
  },
  async deleteResume(id: string) {
    const database = await db();
    try {
      await database.delete('resumes', id);
    } finally {
      database.close();
    }
  },
  async saveArtifact(artifact: CompileArtifact) {
    const database = await db();
    try {
      await database.put('artifacts', artifact);
    } finally {
      database.close();
    }
  },
  async listArtifacts() {
    const database = await db();
    try {
      return database.getAll('artifacts');
    } finally {
      database.close();
    }
  },
  async latestArtifact(resumeId: string) {
    const database = await db();
    try {
      const artifacts = await database.getAllFromIndex('artifacts', 'by-resume', resumeId);
      return artifacts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    } finally {
      database.close();
    }
  },
  async listFittedCvs() {
    const database = await db();
    try {
      return database.getAll('fittedCvs');
    } finally {
      database.close();
    }
  },
  async saveFittedCv(fittedCv: FittedCvRecord) {
    const database = await db();
    try {
      await database.put('fittedCvs', fittedCv);
    } finally {
      database.close();
    }
  },
  async listJobDescriptions() {
    const database = await db();
    try {
      return database.getAll('jobDescriptions');
    } finally {
      database.close();
    }
  },
  async saveJobDescription(jobDescription: JobDescriptionRecord) {
    const database = await db();
    try {
      await database.put('jobDescriptions', jobDescription);
    } finally {
      database.close();
    }
  },
  async listScoringReports() {
    const database = await db();
    try {
      return database.getAll('scoringReports');
    } finally {
      database.close();
    }
  },
  async saveScoringReport(scoringReport: ScoringReportRecord) {
    const database = await db();
    try {
      await database.put('scoringReports', scoringReport);
    } finally {
      database.close();
    }
  },
  async listProviderSettings() {
    const database = await db();
    try {
      return database.getAll('providerSettings');
    } finally {
      database.close();
    }
  },
  async getProviderSettings() {
    const database = await db();
    try {
      return database.get('providerSettings', 'default');
    } finally {
      database.close();
    }
  },
  async saveProviderSettings(providerSettings: ProviderSettingsRecord) {
    const database = await db();
    try {
      await database.put('providerSettings', providerSettings);
    } finally {
      database.close();
    }
  },
  async clearRememberedProviderApiKey() {
    const database = await db();
    try {
      const current = await database.get('providerSettings', 'default');
      if (!current) return;
      const { apiKey: _apiKey, ...withoutKey } = current;
      await database.put('providerSettings', {
        ...withoutKey,
        rememberApiKey: false,
        updatedAt: new Date().toISOString()
      });
    } finally {
      database.close();
    }
  },
  async listUploadedFileAttachments() {
    const database = await db();
    try {
      return database.getAll('uploadedFileAttachments');
    } finally {
      database.close();
    }
  },
  async saveUploadedFileAttachment(attachment: UploadedFileAttachmentRecord) {
    const database = await db();
    try {
      await database.put('uploadedFileAttachments', attachment);
    } finally {
      database.close();
    }
  },
  async getPreference() {
    const database = await db();
    try {
      return database.get('preferences', 'default');
    } finally {
      database.close();
    }
  },
  async savePreference(preference: AppPreference) {
    const database = await db();
    try {
      await database.put('preferences', preference);
    } finally {
      database.close();
    }
  }
};
