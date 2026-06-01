import { openDB, type DBSchema } from 'idb';
import type { AppPreference, CompileArtifact, ResumeRecord } from '../domain/types';

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
  preferences: {
    key: string;
    value: AppPreference;
  };
}

const db = () =>
  openDB<FitcvDb>('fitcv-local-workbench', 1, {
    upgrade(database) {
      const resumes = database.createObjectStore('resumes', { keyPath: 'id' });
      resumes.createIndex('by-updated', 'updatedAt');
      const artifacts = database.createObjectStore('artifacts', { keyPath: 'id' });
      artifacts.createIndex('by-resume', 'resumeId');
      database.createObjectStore('preferences', { keyPath: 'id' });
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
  async getPreference() {
    return (await db()).get('preferences', 'default');
  },
  async savePreference(preference: AppPreference) {
    await (await db()).put('preferences', preference);
  }
};
