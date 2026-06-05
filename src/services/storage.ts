import { openDB, type DBSchema } from 'idb';
import type {
  AppPreference,
  CompileArtifact,
  FittedCvRecord,
  GeminiQuotaSnapshot,
  JobDescriptionRecord,
  ProviderSettingsRecord,
  ResumeRecord,
  ScoringReportRecord,
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
  async deleteResumeCascade(id: string) {
    const database = await db();
    try {
      const fittedCvs = await database.getAllFromIndex('fittedCvs', 'by-source-resume', id);
      const fittedIds = new Set(fittedCvs.map((cv) => cv.id));
      const candidateJobDescriptionIds = new Set(fittedCvs.map((cv) => cv.jobDescriptionId).filter((value): value is string => Boolean(value)));
      const allFittedCvs = await database.getAll('fittedCvs');
      const retainedJobDescriptionIds = new Set(allFittedCvs
        .filter((cv) => !fittedIds.has(cv.id))
        .map((cv) => cv.jobDescriptionId)
        .filter((value): value is string => Boolean(value)));
      const artifacts = await database.getAll('artifacts');
      const reports = await database.getAll('scoringReports');
      const tx = database.transaction(['resumes', 'fittedCvs', 'jobDescriptions', 'artifacts', 'scoringReports'], 'readwrite');
      await Promise.all([
        tx.objectStore('resumes').delete(id),
        ...fittedCvs.map((cv) => tx.objectStore('fittedCvs').delete(cv.id)),
        ...artifacts
          .filter((artifact) => artifact.resumeId === id || artifact.targetId === id || fittedIds.has(artifact.resumeId) || (artifact.targetId ? fittedIds.has(artifact.targetId) : false))
          .map((artifact) => tx.objectStore('artifacts').delete(artifact.id)),
        ...reports
          .filter((report) => report.resumeId === id || report.targetId === id || fittedIds.has(report.resumeId) || (report.targetId ? fittedIds.has(report.targetId) : false))
          .map((report) => tx.objectStore('scoringReports').delete(report.id)),
        ...Array.from(candidateJobDescriptionIds)
          .filter((jobDescriptionId) => !retainedJobDescriptionIds.has(jobDescriptionId))
          .map((jobDescriptionId) => tx.objectStore('jobDescriptions').delete(jobDescriptionId)),
      ]);
      await tx.done;
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
      const existing = await database.getAllFromIndex('scoringReports', 'by-resume', scoringReport.resumeId);
      const targetType = scoringReport.targetType ?? 'resume';
      const targetId = scoringReport.targetId ?? scoringReport.resumeId;
      const tx = database.transaction('scoringReports', 'readwrite');
      await Promise.all(existing
        .filter((report) => {
          const reportTargetType = report.targetType ?? 'resume';
          const reportTargetId = report.targetId ?? report.resumeId;
          return report.id !== scoringReport.id
            && report.kind === scoringReport.kind
            && reportTargetType === targetType
            && reportTargetId === targetId
            && (report.jobDescriptionId ?? '') === (scoringReport.jobDescriptionId ?? '');
        })
        .map((report) => tx.store.delete(report.id)));
      await tx.store.put(scoringReport);
      await tx.done;
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
  },

  getGeminiQuota(): GeminiQuotaSnapshot | null {
    try {
      const raw = localStorage.getItem('fitcv-gemini-quota');
      return raw ? (JSON.parse(raw) as GeminiQuotaSnapshot) : null;
    } catch {
      return null;
    }
  },

  saveGeminiQuota(snapshot: GeminiQuotaSnapshot): void {
    try {
      localStorage.setItem('fitcv-gemini-quota', JSON.stringify(snapshot));
    } catch {
      // ignore quota write errors
    }
  },
};
