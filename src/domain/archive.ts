import type { CompileArtifact, FittedCvRecord, JobDescriptionRecord, ProviderSettingsRecord, ResumeRecord, ScoringReportRecord } from './types';
import { ensureTemplateLayouts } from './resume';

type ExportedProviderSettings = Omit<ProviderSettingsRecord, 'apiKey'> & { rememberApiKey: false };

export interface FitcvArchive {
  schemaVersion: 1;
  exportedAt: string;
  resumes: ResumeRecord[];
  fittedCvs: FittedCvRecord[];
  jobDescriptions: JobDescriptionRecord[];
  scoringReports: ScoringReportRecord[];
  providerSettings: ExportedProviderSettings[];
  artifacts: Omit<CompileArtifact, 'pdfBlob'>[];
}

const sanitizeProviderSettings = (settings: ProviderSettingsRecord[]): ExportedProviderSettings[] =>
  settings.map(({ apiKey: _apiKey, ...safe }) => ({ ...safe, rememberApiKey: false }));

export const exportFitcvArchive = async (input: {
  resumes: ResumeRecord[];
  artifacts: CompileArtifact[];
  fittedCvs?: FittedCvRecord[];
  jobDescriptions?: JobDescriptionRecord[];
  scoringReports?: ScoringReportRecord[];
  providerSettings?: ProviderSettingsRecord[];
}) => {
  const archive: FitcvArchive = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    resumes: input.resumes,
    fittedCvs: input.fittedCvs ?? [],
    jobDescriptions: input.jobDescriptions ?? [],
    scoringReports: input.scoringReports ?? [],
    providerSettings: sanitizeProviderSettings(input.providerSettings ?? []),
    artifacts: input.artifacts.map(({ pdfBlob: _pdfBlob, ...artifact }) => artifact)
  };
  const payload = JSON.stringify(archive, null, 2);
  const blob = new Blob([payload], { type: 'application/vnd.fitcv+json' });
  Object.defineProperty(blob, 'name', { value: `fitcv-backup-${new Date().toISOString().slice(0, 10)}.fitcv` });
  if (typeof blob.text !== 'function') {
    Object.defineProperty(blob, 'text', { value: async () => payload });
  }
  return blob as Blob & { name: string };
};

export const importFitcvArchive = async (file: Blob): Promise<FitcvArchive> => {
  const text = typeof file.text === 'function' ? await file.text() : await new Response(file).text();
  const archive = JSON.parse(text) as FitcvArchive;
  if (archive.schemaVersion !== 1 || !Array.isArray(archive.resumes)) {
    throw new Error('Unsupported .fitcv archive.');
  }
  archive.resumes = archive.resumes.map(ensureTemplateLayouts);
  archive.fittedCvs ??= [];
  archive.jobDescriptions ??= [];
  archive.scoringReports ??= [];
  archive.providerSettings ??= [];
  archive.artifacts ??= [];
  const serialized = JSON.stringify(archive);
  if (/api[_-]?key|secret|token/i.test(serialized)) {
    throw new Error('Archive contains secret-like fields and was not imported.');
  }
  return archive;
};
