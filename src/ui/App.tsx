import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileCheck2,
  FilePlus2,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap
} from 'lucide-react';
import { exportFitcvArchive, importFitcvArchive } from '../domain/archive';
import { buildAtsReadinessReport } from '../domain/checks';
import { applyFittedCvChange, createFittedCvDraft, fittedCvHasUnreviewedChanges, markFittedCvChangeReviewed } from '../domain/fittedCv';
import { clearReviewMarkersForField, createResume, ensureTemplateLayouts, renameResume, sampleResume, starterResume, switchTemplate, touchResume } from '../domain/resume';
import { templates, getTemplate } from '../domain/templates';
import type {
  CompileArtifact,
  CvSubsectionHeading,
  EntryTypeDefinition,
  FittedCvRecord,
  FlexEntry,
  FlexSection,
  FlexSubSection,
  JobDescriptionRecord,
  LayoutModule,
  ProfileFieldKey,
  ProfileHighlightItem,
  ResumeRecord,
  ScoringReportRecord,
  SectionEnvDefinition,
  TemplateId,
} from '../domain/types';
import { createId } from '../domain/ids';
import { storage } from '../services/storage';
import { requestFitToJdDraft, requestJdMatchReport, requestReadinessReport } from '../services/aiProvider';
import { clearBusyTexAssetCaches, ensureBusyTexAssetsInstalled, getBusyTexAssetStatus, type BusyTexAssetProgress, type BusyTexAssetState } from '../services/busytexAssets';
import { LatexEditorRoute } from './LatexEditorRoute';
import { AiAssistButton, AiSettingsButton } from './AiAssist';
import { formatPdfPreviewUrl, parseLatexDiagnostics, type LatexDiagnosticIssue } from './latexUtils';
import { WysiwygEditor } from './WysiwygEditor';
import { downloadBlob, StatusPill } from './shared';
import { clampSpaceValue, defaultSpaceValue, hasTemplateAdapter, MAX_SPACE_VALUE, MIN_SPACE_VALUE } from '../domain/templateAdapters';

// --- Type guards ---

const isHeading = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is CvSubsectionHeading =>
  'kind' in item && (item as CvSubsectionHeading).kind === 'subsection-heading';

const isSubSection = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is FlexSubSection =>
  'environment' in item;

const fittedCvToResume = (fittedCv: FittedCvRecord): ResumeRecord => ({
  id: fittedCv.id,
  schemaVersion: 1,
  title: fittedCv.title,
  activeTemplateId: fittedCv.activeTemplateId,
  sectionOrder: ['summary'],
  hiddenSections: [],
  templateLayouts: fittedCv.templateLayouts,
  content: fittedCv.content,
  templateSettings: fittedCv.templateSettings,
  reviewMarkers: [],
  importNotes: [],
  createdAt: fittedCv.createdAt,
  updatedAt: fittedCv.updatedAt,
  version: fittedCv.version,
});

const resumeToFittedCv = (current: FittedCvRecord, resume: ResumeRecord): FittedCvRecord => ({
  ...current,
  title: resume.title,
  activeTemplateId: resume.activeTemplateId,
  templateLayouts: resume.templateLayouts,
  templateSettings: resume.templateSettings,
  content: resume.content,
  updatedAt: resume.updatedAt,
  version: resume.version,
});

// --- Label helpers ---

const visibleLayoutTemplates = templates.filter((template) => template.id === 'awesome-cv');

const labelForLayoutModule = (module: LayoutModule, flexSections: FlexSection[]): string => {
  if (module.kind === 'space') return 'Space';
  if (module.kind === 'new-page') return 'New page';
  if (module.kind === 'flex-section') {
    return flexSections.find((s) => s.id === module.flexSectionId)?.name || 'Untitled section';
  }
  const title = typeof module.options?.title === 'string' ? module.options.title.trim() : '';
  return title || 'Summary';
};

const updateLayoutModule = (
  resume: ResumeRecord,
  moduleId: string,
  recipe: (module: LayoutModule) => LayoutModule
): ResumeRecord => {
  const layout = resume.templateLayouts[resume.activeTemplateId] ?? [];
  return touchResume({
    ...resume,
    templateLayouts: {
      ...resume.templateLayouts,
      [resume.activeTemplateId]: layout.map((module) => (module.id === moduleId ? recipe(module) : module)),
    },
  });
};

type ViewMode = 'dashboard' | 'editor';

export const App = () => {
  if (window.location.pathname.endsWith('/latexeditor')) return <LatexEditorRoute />;

  const [loaded, setLoaded] = useState(false);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [fittedCvs, setFittedCvs] = useState<FittedCvRecord[]>([]);
  const [jobDescriptions, setJobDescriptions] = useState<JobDescriptionRecord[]>([]);
  const [readinessReports, setReadinessReports] = useState<ScoringReportRecord[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [activeFittedId, setActiveFittedId] = useState<string>();
  const [artifact, setArtifact] = useState<CompileArtifact>();
  const [compilerAssetState, setCompilerAssetState] = useState<BusyTexAssetState>('not-installed');
  const [compilerAssetProgress, setCompilerAssetProgress] = useState<BusyTexAssetProgress>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ViewMode>('dashboard');
  const [autoCompile, setAutoCompile] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean } | null>(null);
  const active = resumes.find((resume) => resume.id === activeId) ?? resumes[0];
  const activeFittedCv = activeFittedId ? fittedCvs.find((cv) => cv.id === activeFittedId) : undefined;
  const editorResume = activeFittedCv ? fittedCvToResume(activeFittedCv) : active;
  const sourceResume = activeFittedCv ? resumes.find((resume) => resume.id === activeFittedCv.sourceResumeId) : undefined;
  const editorTargetType = activeFittedCv ? 'fitted-cv' as const : 'resume' as const;
  const editorTargetId = activeFittedCv?.id ?? active?.id;

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const compileGenRef = useRef(0);
  const activeRef = useRef(editorResume);
  activeRef.current = editorResume;

  useEffect(() => {
    void hydrate();
  }, []);

  const hydrate = async () => {
    const [stored, pref, storedFittedCvs, storedJobDescriptions, storedReadinessReports] = await Promise.all([
      storage.listResumes(),
      storage.getPreference(),
      storage.listFittedCvs(),
      storage.listJobDescriptions(),
      storage.listScoringReports(),
    ]);
    setFittedCvs(storedFittedCvs);
    setJobDescriptions(storedJobDescriptions);
    setReadinessReports(storedReadinessReports);
    getBusyTexAssetStatus().then((status) => setCompilerAssetState(status.state));
    if (stored.length === 0) {
      if (!pref?.seededOnce) {
        const seed = sampleResume();
        await storage.saveResume(seed);
        await storage.savePreference({ schemaVersion: 1, id: 'default', theme: 'light', seededOnce: true, panels: { style: true, preview: true } });
        setResumes([seed]);
        setActiveId(seed.id);
      }
      setLoaded(true);
      return;
    }
    const sorted = stored.map(ensureTemplateLayouts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setResumes(sorted);
    setActiveId(pref?.activeResumeId ?? sorted[0].id);
    setLoaded(true);
  };

  const save = async (resume: ResumeRecord) => {
    activeRef.current = resume;
    await storage.saveResume(resume);
    setResumes((current) => [resume, ...current.filter((item) => item.id !== resume.id)]);
    setActiveId(resume.id);
    setActiveFittedId(undefined);
    if (artifact?.resumeId === resume.id && artifact.resumeVersion !== resume.version) {
      setArtifact({ ...artifact, status: 'stale' });
    }
  };

  const saveFitted = async (fittedCv: FittedCvRecord) => {
    activeRef.current = fittedCvToResume(fittedCv);
    await storage.saveFittedCv(fittedCv);
    setFittedCvs((current) => [fittedCv, ...current.filter((item) => item.id !== fittedCv.id)]);
    setActiveId(fittedCv.sourceResumeId);
    setActiveFittedId(fittedCv.id);
    if (artifact?.resumeId === fittedCv.id && artifact.resumeVersion !== fittedCv.version) {
      setArtifact({ ...artifact, status: 'stale' });
    }
  };

  const updateActive = (recipe: (resume: ResumeRecord) => ResumeRecord) => {
    if (!editorResume) return;
    const next = recipe(structuredClone(editorResume));
    if (activeFittedCv) {
      void saveFitted(resumeToFittedCv(activeFittedCv, next));
      return;
    }
    void save(next);
  };

  const atsReadiness = useMemo(() => (
    editorResume
      ? buildAtsReadinessReport(editorResume, {
        generatedText: artifact?.resumeId === editorResume.id && artifact.resumeVersion === editorResume.version ? artifact.generatedText : undefined
      })
      : undefined
  ), [editorResume, artifact]);
  const cvQualityReadiness = useMemo(() => (
    editorTargetId ? readinessReports.find((report) =>
      report.kind === 'cv-quality'
      && (report.targetType ?? 'resume') === editorTargetType
      && (report.targetId ?? report.resumeId) === editorTargetId
    ) : undefined
  ), [editorTargetId, editorTargetType, readinessReports]);
  const jdMatchReadiness = useMemo(() => (
    activeFittedCv ? readinessReports.find((report) =>
      report.kind === 'jd-match'
      && (report.targetType ?? 'resume') === 'fitted-cv'
      && (report.targetId ?? report.resumeId) === activeFittedCv.id
      && (report.jobDescriptionId ?? '') === (activeFittedCv.jobDescriptionId ?? '')
    ) : undefined
  ), [activeFittedCv, readinessReports]);
  const hasJobDescription = Boolean(activeFittedCv?.jobDescriptionId);
  const activeTemplate = editorResume ? templates.find((template) => template.id === editorResume.activeTemplateId) : undefined;
  const pdfUrl = useMemo(() => (
    artifact?.pdfBlob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(artifact.pdfBlob) : ''
  ), [artifact?.pdfBlob]);
  const reviewCount = editorResume?.reviewMarkers.filter((marker) => marker.needsReview).length ?? 0;
  const dashboardReviewCount = useMemo(
    () => resumes.reduce((total, resume) => total + resume.reviewMarkers.filter((marker) => marker.needsReview).length, 0),
    [resumes]
  );
  const cleanCompile = artifact?.status === 'clean' && artifact.resumeVersion === editorResume?.version;
  const unreviewedFitChangeCount = activeFittedCv?.proposedChanges.filter((change) => change.status === 'pending').length ?? 0;
  const exportBlocked = Boolean(activeFittedCv && fittedCvHasUnreviewedChanges(activeFittedCv));

  const saveReadinessReport = async (report: ScoringReportRecord) => {
    await storage.saveScoringReport(report);
    const next = await storage.listScoringReports();
    setReadinessReports(next);
  };

  const runAtsReadiness = async () => {
    if (!activeRef.current) return;
    const report = buildAtsReadinessReport(activeRef.current, {
      generatedText: artifact?.resumeId === activeRef.current.id && artifact.resumeVersion === activeRef.current.version ? artifact.generatedText : undefined
    });
    await saveReadinessReport({
      ...report,
      targetType: editorTargetType,
      targetId: activeRef.current.id,
    });
  };

  const runCvQualityReadiness = async () => {
    const target = activeRef.current;
    if (!target) return;
    const settings = await storage.getProviderSettings();
    if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
      setError('AI settings are required before running CV Quality Readiness.');
      return;
    }
    if (!await confirmAsync('Run CV Quality Readiness with your configured AI provider? Resume content will be sent for analysis.')) return;
    try {
      setBusy('Running CV Quality Readiness');
      setError('');
      const result = await requestReadinessReport(settings, {
        kind: 'cv-quality',
        resumeTitle: target.title,
        resumeText: resumeTextForReadiness(target)
      });
      await saveReadinessReport({
        id: createId('score'),
        schemaVersion: 1,
        resumeId: target.id,
        targetType: editorTargetType,
        targetId: target.id,
        resumeVersion: target.version,
        kind: 'cv-quality',
        methodologyVersion: 'cv-quality-ai-v1',
        readinessPercent: result.readinessPercent,
        reasons: result.reasons,
        createdAt: new Date().toISOString()
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'CV Quality Readiness failed.');
    } finally {
      setBusy('');
    }
  };

  const runJdMatchReadiness = async (fittedCvOverride?: FittedCvRecord, jobDescriptionOverride?: JobDescriptionRecord) => {
    const fittedCv = fittedCvOverride ?? activeFittedCv;
    const target = fittedCv ? fittedCvToResume(fittedCv) : undefined;
    const jd = jobDescriptionOverride ?? (fittedCv?.jobDescriptionId ? jobDescriptions.find((item) => item.id === fittedCv.jobDescriptionId) : undefined);
    if (!fittedCv || !target || !jd) return;
    const settings = await storage.getProviderSettings();
    if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
      setError('AI settings are required before running JD Match.');
      return;
    }
    try {
      setBusy('Running JD Match');
      setError('');
      const result = await requestJdMatchReport(settings, {
        resumeTitle: target.title,
        resumeText: resumeTextForReadiness(target),
        jobDescriptionText: jd.description
      });
      const report: ScoringReportRecord = {
        id: createId('score'),
        schemaVersion: 1,
        resumeId: target.id,
        targetType: 'fitted-cv',
        targetId: target.id,
        resumeVersion: target.version,
        kind: 'jd-match',
        jobDescriptionId: jd.id,
        methodologyVersion: 'jd-match-ai-v1',
        readinessPercent: result.readinessPercent,
        reasons: result.reasons,
        createdAt: new Date().toISOString()
      };
      await saveReadinessReport(report);
      const updated = { ...fittedCv, latestJdMatchReportId: report.id, updatedAt: new Date().toISOString() };
      await storage.saveFittedCv(updated);
      setFittedCvs((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'JD Match failed.');
    } finally {
      setBusy('');
    }
  };

  const createFittedCvFromJd = async (input: { title: string; jobDescriptionText: string }) => {
    const base = active;
    if (!base) return;
    const settings = await storage.getProviderSettings();
    if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
      setError('AI settings are required before fitting a CV to a JD.');
      return;
    }
    try {
      setBusy('Creating fitted CV');
      setError('');
      const timestamp = new Date().toISOString();
      const jd: JobDescriptionRecord = {
        id: createId('jd'),
        schemaVersion: 1,
        title: input.title,
        description: input.jobDescriptionText,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const result = await requestFitToJdDraft(settings, {
        resumeTitle: base.title,
        resumeText: resumeTextForReadiness(base),
        jobDescriptionText: input.jobDescriptionText
      });
      const fittedCv = createFittedCvDraft({
        baseResume: base,
        jobDescriptionId: jd.id,
        title: input.title,
        changes: result.proposedChanges,
        createdAt: timestamp
      });
      await storage.saveJobDescription(jd);
      await storage.saveFittedCv(fittedCv);
      setJobDescriptions((current) => [jd, ...current.filter((item) => item.id !== jd.id)]);
      setFittedCvs((current) => [fittedCv, ...current.filter((item) => item.id !== fittedCv.id)]);
      setActiveId(base.id);
      setActiveFittedId(fittedCv.id);
      setMode('editor');
      await runJdMatchReadiness(fittedCv, jd);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Fit-to-JD failed.');
    } finally {
      setBusy('');
    }
  };

  const reviewFittedChange = (changeId: string, decision: 'accept' | 'reject' | 'manual') => {
    if (!activeFittedCv) return;
    const next = decision === 'manual'
      ? markFittedCvChangeReviewed(activeFittedCv, changeId)
      : applyFittedCvChange(activeFittedCv, changeId, decision);
    void saveFitted(next);
  };

  const compile = async (resumeOverride?: ResumeRecord) => {
    clearTimeout(debounceRef.current);
    const target = resumeOverride ?? activeRef.current;
    if (!target) return;
    const gen = ++compileGenRef.current;
    try {
      setBusy('Compiling in browser');
      setError('');
      await prepareCompilerAssets();
      if (gen !== compileGenRef.current) return;
      setBusy('Running LaTeX in browser');
      const { compileResumeToPdf } = await import('../services/pdf');
      const result = {
        ...await compileResumeToPdf(target),
        targetType: editorTargetType,
        targetId: target.id,
      };
      if (gen !== compileGenRef.current) return;
      await storage.saveArtifact(result);
      setArtifact(result);
      if (result.status === 'clean' && result.pdfBlob) {
        void saveThumbnail(target.id, result.pdfBlob);
      }
    } catch (caught) {
      if (gen !== compileGenRef.current) return;
      setError(caught instanceof Error ? caught.message : 'PDF compile failed.');
    } finally {
      if (gen === compileGenRef.current) setBusy('');
    }
  };

  const prepareCompilerAssets = async (force = false) => {
    setCompilerAssetState('downloading');
    const status = await ensureBusyTexAssetsInstalled((progress) => {
      setCompilerAssetProgress(progress);
      if (progress.phase === 'downloading' && progress.bytesTotal > 0) {
        setBusy(`Downloading compiler assets ${Math.round((progress.bytesLoaded / progress.bytesTotal) * 100)}%`);
      } else if (progress.phase === 'service-worker') {
        setBusy('Preparing compiler cache');
      } else if (progress.phase === 'validating') {
        setBusy('Validating compiler assets');
      }
    }, { full: true, force });
    setCompilerAssetState(status.state);
    setCompilerAssetProgress(undefined);
  };

  const clearCompilerAssets = async () => {
    const confirmed = await confirmAsync('Remove offline PDF compiler files from this browser?', true);
    if (!confirmed) return;
    const { terminateBusyTexRunner } = await import('../services/latexCompiler');
    terminateBusyTexRunner();
    setCompilerAssetState('clearing-cache');
    setBusy('Clearing compiler cache');
    await clearBusyTexAssetCaches(setCompilerAssetProgress);
    setCompilerAssetProgress(undefined);
    setCompilerAssetState('not-installed');
    setBusy('');
  };

  const saveThumbnail = async (resumeId: string, pdfBlob: Blob) => {
    if (activeFittedCv) return;
    const { generateThumbnailDataUrl } = await import('../services/pdf');
    const thumbnailDataUrl = await generateThumbnailDataUrl(pdfBlob);
    if (!thumbnailDataUrl) return;
    const current = activeRef.current?.id === resumeId ? activeRef.current : resumes.find((resume) => resume.id === resumeId);
    if (!current) return;
    const updated = { ...current, thumbnailDataUrl };
    if (activeRef.current?.id === resumeId) activeRef.current = updated;
    setResumes((items) => items.map((item) => (item.id === resumeId ? updated : item)));
    await storage.saveResume(updated);
  };

  useEffect(() => {
    if (!autoCompile || !editorResume || mode !== 'editor') return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void compile(), 500);
    return () => clearTimeout(debounceRef.current);
  }, [editorResume?.version, autoCompile]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const createBlank = (templateId: TemplateId) => { void save(starterResume(templateId)); setMode('editor'); setShowCreateModal(false); };
  const openResume = (resume: ResumeRecord) => { setActiveId(resume.id); setActiveFittedId(undefined); setMode('editor'); void compile(resume); };
  const openFittedCv = (fittedCv: FittedCvRecord) => {
    setActiveId(fittedCv.sourceResumeId);
    setActiveFittedId(fittedCv.id);
    setMode('editor');
    void compile(fittedCvToResume(fittedCv));
  };

  const confirmAsync = (message: string, danger = false): Promise<boolean> =>
    new Promise((resolve) => {
      setConfirmDialog({
        message,
        danger,
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });

  const deleteResume = async (id: string) => {
    const target = resumes.find((r) => r.id === id);
    const linkedCount = fittedCvs.filter((cv) => cv.sourceResumeId === id).length;
    const cascadeNote = linkedCount > 0 ? ` This will also delete ${linkedCount} linked fitted CV${linkedCount !== 1 ? 's' : ''}.` : '';
    if (!target) return;
    if (!await confirmAsync(`Delete "${target.title}"?${cascadeNote} This only removes browser-local data.`, true)) return;
    if (linkedCount > 0) await storage.deleteResumeCascade(id);
    else await storage.deleteResume(id);
    const remaining = resumes.filter((r) => r.id !== id);
    setResumes(remaining);
    setFittedCvs((items) => items.filter((cv) => cv.sourceResumeId !== id));
    setJobDescriptions(await storage.listJobDescriptions());
    setReadinessReports(await storage.listScoringReports());
    if (activeId === id) { setActiveId(remaining[0]?.id); if (mode === 'editor') setMode('dashboard'); }
  };

  const deleteActive = async () => { if (!active) return; await deleteResume(active.id); };

  const importArchive = async (file: File) => {
    try {
      setBusy('Importing archive');
      const archive = await importFitcvArchive(file);
      for (const resume of archive.resumes) await storage.saveResume(resume);
      for (const fittedCv of archive.fittedCvs) await storage.saveFittedCv(fittedCv);
      for (const jobDescription of archive.jobDescriptions) await storage.saveJobDescription(jobDescription);
      for (const scoringReport of archive.scoringReports) await storage.saveScoringReport(scoringReport);
      await hydrate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Archive import failed.');
    } finally {
      setBusy('');
    }
  };

  const exportArchive = async () => {
    const [fittedCvs, jobDescriptions, scoringReports, providerSettings] = await Promise.all([
      storage.listFittedCvs(),
      storage.listJobDescriptions(),
      storage.listScoringReports(),
      storage.listProviderSettings(),
    ]);
    const file = await exportFitcvArchive({ resumes, artifacts: artifact ? [artifact] : [], fittedCvs, jobDescriptions, scoringReports, providerSettings });
    downloadBlob(file, file.name);
  };

  const openImportCvModal = async () => {
    const settings = await storage.getProviderSettings();
    if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
      setError('AI settings are required before importing a CV. Configure them via the AI settings button.');
      return;
    }
    setShowImportModal(true);
  };

  const importCvAsNew = async (file: File, templateId: TemplateId) => {
    setShowImportModal(false);
    try {
      setBusy('Extracting and analysing CV');
      setError('');
      const settings = await storage.getProviderSettings();
      if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
        setError('AI settings are required to import a CV.');
        return;
      }
      const { aiImportResumeContent } = await import('../services/importer');
      const template = getTemplate(templateId);
      const { content, reviewMarkers, importNotes } = await aiImportResumeContent(file, settings, template);
      const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Imported CV';
      const base = createResume(title, templateId);
      const otherLayouts = Object.fromEntries(
        Object.entries(base.templateLayouts).filter(([k]) => k !== templateId)
      ) as typeof base.templateLayouts;
      const populated = ensureTemplateLayouts(touchResume({ ...base, content, reviewMarkers, importNotes, templateLayouts: otherLayouts }));
      await save(populated);
      setMode('editor');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'CV import failed.');
    } finally {
      setBusy('');
    }
  };

  const importCvWithAi = async (file: File) => {
    const settings = await storage.getProviderSettings();
    if (!settings?.endpointUrl.trim() || !settings.model.trim()) {
      setError('AI settings are required before importing a CV. Configure them via the AI settings button.');
      return;
    }
    if (!active) return;
    const confirmed = await confirmAsync('This will replace all content in the current CV. This cannot be undone.', true);
    if (!confirmed) return;
    try {
      setBusy('Extracting and analysing CV');
      setError('');
      const { aiImportResumeContent } = await import('../services/importer');
      const template = getTemplate(active.activeTemplateId);
      const { content, reviewMarkers, importNotes } = await aiImportResumeContent(file, settings, template);
      updateActive((resume) => {
        const otherLayouts = Object.fromEntries(
          Object.entries(resume.templateLayouts).filter(([k]) => k !== resume.activeTemplateId)
        ) as typeof resume.templateLayouts;
        return ensureTemplateLayouts(touchResume({ ...resume, content, reviewMarkers, importNotes, templateLayouts: otherLayouts }));
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'CV import failed.');
    } finally {
      setBusy('');
    }
  };

  if (!loaded) return <main className="empty">Loading FitCV…</main>;

  if (mode === 'dashboard' || !active) {
    return (
      <>
        <Dashboard
          resumes={resumes} fittedCvs={fittedCvs} active={active} reviewCount={dashboardReviewCount} readinessReports={readinessReports}
          busy={busy} error={error} onCreate={() => setShowCreateModal(true)} onOpen={openResume}
          onOpenFitted={openFittedCv} onDelete={deleteResume} onImportArchive={importArchive} onExportArchive={exportArchive}
          onImportCvWithAi={() => void openImportCvModal()}
        />
        {showCreateModal && <CreateResumeModal onCreate={createBlank} onClose={() => setShowCreateModal(false)} />}
        {showImportModal && <ImportResumeModal onImport={importCvAsNew} onClose={() => setShowImportModal(false)} />}
        {confirmDialog && <ConfirmDialog {...confirmDialog} />}
      </>
    );
  }

  return (
    <>
      <EditorWorkspace
      active={editorResume} activeFittedCv={activeFittedCv} sourceResume={sourceResume} activeTemplate={activeTemplate} artifact={artifact} autoCompile={autoCompile}
      busy={busy} cleanCompile={cleanCompile} compilerAssetState={compilerAssetState} compilerAssetProgress={compilerAssetProgress} error={error} pdfUrl={pdfUrl} reviewCount={reviewCount}
      atsReadiness={atsReadiness} cvQualityReadiness={cvQualityReadiness} jdMatchReadiness={jdMatchReadiness} hasJobDescription={hasJobDescription}
      unreviewedFitChangeCount={unreviewedFitChangeCount} exportBlocked={exportBlocked}
      onBack={() => setMode('dashboard')} onChange={updateActive} onCompile={() => void compile()}
      onDelete={deleteActive} onDownloadPdf={() => artifact?.pdfBlob && !exportBlocked && downloadBlob(artifact.pdfBlob, `${editorResume.title}.pdf`)}
      onPrepareCompiler={() => void prepareCompilerAssets()} onRepairCompiler={() => void prepareCompilerAssets(true)} onClearCompiler={() => void clearCompilerAssets()}
      onRunAts={() => void runAtsReadiness()} onRunCvQuality={() => void runCvQualityReadiness()} onRunJdMatch={() => void runJdMatchReadiness()}
      onCreateFittedCv={createFittedCvFromJd} onReviewFittedChange={reviewFittedChange}
      onToggleAutoCompile={() => setAutoCompile((v) => !v)}
      onImportCvWithAi={importCvWithAi}
    />
      {confirmDialog && <ConfirmDialog {...confirmDialog} />}
    </>
  );
};

// --- Confirm dialog ---

const ConfirmDialog = ({ message, onConfirm, onCancel, danger }: { message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) => (
  <div className="confirm-overlay" onClick={onCancel}>
    <div className="confirm-dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <p className="confirm-message">{message}</p>
      <div className="confirm-actions">
        <button className="ghost-button" onClick={onCancel}>Cancel</button>
        <button className={danger ? 'button danger-solid' : 'button primary'} onClick={onConfirm}>
          {danger ? 'Delete' : 'Confirm'}
        </button>
      </div>
    </div>
  </div>
);

// --- Create resume modal ---

const TemplateSkeleton = ({ templateId }: { templateId: TemplateId }) => {
  if (templateId === 'awesome-cv') {
    return (
      <div className="template-skeleton awesome-cv-skeleton">
        <div className="tsk-header">
          <div className="tsk-header-name" />
          <div className="tsk-header-title" />
          <div className="tsk-header-contact">
            <div className="tsk-dot" /><div className="tsk-dot" /><div className="tsk-dot" />
          </div>
        </div>
        <div className="tsk-body">
          <div className="tsk-sidebar">
            <div className="tsk-section-label" />
            <div className="tsk-line short" /><div className="tsk-line med" /><div className="tsk-line short" />
            <div className="tsk-section-label" style={{ marginTop: 14 }} />
            <div className="tsk-line med" /><div className="tsk-line short" /><div className="tsk-line long" />
          </div>
          <div className="tsk-main">
            <div className="tsk-section-label" />
            <div className="tsk-line long" /><div className="tsk-line long" /><div className="tsk-line med" />
            <div className="tsk-section-label" style={{ marginTop: 14 }} />
            <div className="tsk-entry-head" />
            <div className="tsk-line med" /><div className="tsk-line long" /><div className="tsk-line short" />
            <div className="tsk-entry-head" style={{ marginTop: 8 }} />
            <div className="tsk-line long" /><div className="tsk-line med" />
          </div>
        </div>
      </div>
    );
  }
  return <div className="template-skeleton" />;
};

const CreateResumeModal = ({ onCreate, onClose }: { onCreate: (templateId: TemplateId) => void; onClose: () => void }) => {
  const [selected, setSelected] = useState<TemplateId>(visibleLayoutTemplates[0].id);
  const selectedTemplate = visibleLayoutTemplates.find((t) => t.id === selected)!;
  return (
    <div className="create-resume-overlay" onClick={onClose}>
      <div className="create-resume-modal" role="dialog" aria-modal="true" aria-label="Choose a template" onClick={(e) => e.stopPropagation()}>
        <div className="create-resume-modal-head">
          <h2>Choose a template</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="create-resume-modal-body">
          <div className="create-resume-template-list">
            {visibleLayoutTemplates.map((t) => (
              <button
                key={t.id}
                className={`template-list-item${t.id === selected ? ' selected' : ''}`}
                onClick={() => setSelected(t.id)}
              >
                <span className="template-list-name">{t.name}</span>
                <span className="template-list-engine">{t.browserCompatibility.engine}</span>
              </button>
            ))}
          </div>
          <div className="create-resume-preview-panel">
            <div className="create-resume-preview-frame">
              <TemplateSkeleton templateId={selected} />
            </div>
            <div className="create-resume-preview-meta">
              <span className="template-choice-name">{selectedTemplate.name}</span>
              <span className="template-choice-desc">{selectedTemplate.description}</span>
            </div>
            <button className="primary-button" onClick={() => onCreate(selected)}>
              Create with this template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ImportResumeModal = ({ onImport, onClose }: { onImport: (file: File, templateId: TemplateId) => void; onClose: () => void }) => {
  const [selected, setSelected] = useState<TemplateId>(visibleLayoutTemplates[0].id);
  const [file, setFile] = useState<File | null>(null);
  const selectedTemplate = visibleLayoutTemplates.find((t) => t.id === selected)!;
  return (
    <div className="create-resume-overlay" onClick={onClose}>
      <div className="create-resume-modal" role="dialog" aria-modal="true" aria-label="Import CV with AI" onClick={(e) => e.stopPropagation()}>
        <div className="create-resume-modal-head">
          <h2>Import CV with AI</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="create-resume-modal-body">
          <div className="create-resume-template-list">
            {visibleLayoutTemplates.map((t) => (
              <button
                key={t.id}
                className={`template-list-item${t.id === selected ? ' selected' : ''}`}
                onClick={() => setSelected(t.id)}
              >
                <span className="template-list-name">{t.name}</span>
                <span className="template-list-engine">{t.browserCompatibility.engine}</span>
              </button>
            ))}
          </div>
          <div className="create-resume-preview-panel">
            <div className="create-resume-preview-frame">
              <TemplateSkeleton templateId={selected} />
            </div>
            <div className="create-resume-preview-meta">
              <span className="template-choice-name">{selectedTemplate.name}</span>
              <span className="template-choice-desc">{selectedTemplate.description}</span>
            </div>
            <label className="chrome-button" style={{ justifyContent: 'center', cursor: 'pointer' }}>
              <Upload />{file ? file.name : 'Choose file (PDF, TXT, MD)'}
              <input type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="primary-button" disabled={!file} onClick={() => file && onImport(file, selected)}>
              Import with this template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Dashboard ---

const Dashboard = ({ resumes, fittedCvs, active, reviewCount, readinessReports, busy, error, onCreate, onOpen, onOpenFitted, onDelete, onImportArchive, onExportArchive, onImportCvWithAi }: {
  resumes: ResumeRecord[]; fittedCvs: FittedCvRecord[]; active?: ResumeRecord; reviewCount: number; readinessReports: ScoringReportRecord[];
  busy: string; error: string; onCreate: () => void; onOpen: (resume: ResumeRecord) => void;
  onOpenFitted: (fittedCv: FittedCvRecord) => void;
  onDelete: (id: string) => void; onImportArchive: (file: File) => void; onExportArchive: () => void;
  onImportCvWithAi: () => void;
}) => (
  <main className="dashboard-shell">
    <TopChrome label="Resume library">
      <button className="chrome-button" onClick={onImportCvWithAi}><Zap />Import CV (AI)</button>
      <AiSettingsButton />
      <button className="chrome-button primary" onClick={onCreate}><FilePlus2 />New Resume</button>
    </TopChrome>
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="dashboard-head">
        <div>
          <h1 id="dashboard-heading">My Resumes</h1>
          <p>Base resumes stay canonical. Open one to edit content, tune layout, compile a local PDF, or duplicate it for a job-specific fit.</p>
        </div>
      </div>
      {busy && <div className="notice" role="status">{busy}</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="dashboard-grid">
        <aside className="dashboard-rail">
          <button className="create-card" onClick={onCreate}>
            <span className="create-icon"><Plus /></span>
            <strong>Create base resume</strong>
            <span>Start with a clean LaTeX template and edit with live preview.</span>
          </button>
          <section className="filter-card" aria-label="Library filters">
            <h2>Library</h2>
            <ul className="filter-list" aria-label="Library summaries">
              <FilterItem active label="All resumes" value={resumes.length.toString()} />
              <FilterItem label="Base resumes" value={resumes.length.toString()} />
              <FilterItem label="Needs review" value={reviewCount.toString()} />
            </ul>
          </section>
          <section className="filter-card" aria-label="Library actions">
            <h2>Actions</h2>
            <button className="filter-action" onClick={onExportArchive}><Download />Export backup</button>
            <label className="filter-action"><FileArchive />Restore backup<input type="file" accept=".fitcv,application/json" hidden onChange={(e) => e.target.files?.[0] && onImportArchive(e.target.files[0])} /></label>
          </section>
        </aside>
        <section className="resume-library" aria-label="Resume groups">
          {resumes.length === 0 ? (
            <div className="empty-library">
              <FilePlus2 className="empty-library-icon" />
              <h2>No resumes</h2>
              <p>Create a resume to get started.</p>
              <button className="button green" onClick={onCreate}><FilePlus2 />Create resume</button>
            </div>
          ) : resumes.map((resume) => (
            <ResumeGroup key={resume.id} resume={resume} fittedCvs={fittedCvs.filter((cv) => cv.sourceResumeId === resume.id)}
              active={resume.id === active?.id}
              cvQualityReadiness={readinessReports.find((report) => report.resumeId === resume.id && report.kind === 'cv-quality')}
              readinessReports={readinessReports}
              onOpen={() => onOpen(resume)} onOpenFitted={onOpenFitted} onDelete={() => onDelete(resume.id)} />
          ))}
        </section>
      </div>
    </section>
  </main>
);

// --- Editor workspace ---

const EditorWorkspace = ({ active, activeFittedCv, sourceResume, activeTemplate, artifact, autoCompile, busy, cleanCompile, compilerAssetState, compilerAssetProgress, error, pdfUrl, reviewCount, atsReadiness, cvQualityReadiness, jdMatchReadiness, hasJobDescription, unreviewedFitChangeCount, exportBlocked, onBack, onChange, onCompile, onDelete, onDownloadPdf, onPrepareCompiler, onRepairCompiler, onClearCompiler, onRunAts, onRunCvQuality, onRunJdMatch, onCreateFittedCv, onReviewFittedChange, onToggleAutoCompile, onImportCvWithAi }: {
  active: ResumeRecord; activeFittedCv?: FittedCvRecord; sourceResume?: ResumeRecord; activeTemplate?: (typeof templates)[number]; artifact?: CompileArtifact; autoCompile: boolean;
  busy: string; cleanCompile: boolean; compilerAssetState: BusyTexAssetState; compilerAssetProgress?: BusyTexAssetProgress; error: string; pdfUrl: string; reviewCount: number; atsReadiness?: ScoringReportRecord; cvQualityReadiness?: ScoringReportRecord; jdMatchReadiness?: ScoringReportRecord; hasJobDescription: boolean;
  unreviewedFitChangeCount: number; exportBlocked: boolean;
  onBack: () => void; onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void; onCompile: () => void; onDelete: () => void;
  onDownloadPdf: () => void; onPrepareCompiler: () => void; onRepairCompiler: () => void; onClearCompiler: () => void; onRunAts: () => void; onRunCvQuality: () => void; onRunJdMatch: () => void;
  onCreateFittedCv: (input: { title: string; jobDescriptionText: string }) => Promise<void>;
  onReviewFittedChange: (changeId: string, decision: 'accept' | 'reject' | 'manual') => void;
  onToggleAutoCompile: () => void;
  onImportCvWithAi: (file: File) => void;
}) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string>();
  const [showFitModal, setShowFitModal] = useState(false);
  const [drawerDimension, setDrawerDimension] = useState<ReadinessDimension | null>(null);
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const selectedModule = activeLayout.find((m) => m.id === selectedModuleId) ?? activeLayout[0];
  const pendingScrollField = useRef<string>();
  const focusField = (field: string) => {
    setTimeout(() => {
      const el = document.querySelector(`[data-field="${field}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        (el.querySelector('input, textarea') as HTMLElement | null)?.focus();
      }
    }, 50);
  };

  useEffect(() => {
    const field = pendingScrollField.current;
    if (!field) return;
    pendingScrollField.current = undefined;
    focusField(field);
  }, [selectedModuleId]);

  const navigateToField = (field: string) => {
    if (field.startsWith('content.profile') || field.startsWith('content.summary')) {
      const module = activeLayout.find((m) => m.kind === 'section' && m.section === 'summary') ?? activeLayout[0];
      if (module) {
        pendingScrollField.current = field;
        setSelectedModuleId(module.id);
        if (selectedModuleId === module.id) {
          pendingScrollField.current = undefined;
          focusField(field);
        }
      }
    } else {
      const match = field.match(/^content\.flexSections\.([^.]+)/);
      if (match) {
        const module = activeLayout.find((m) => m.kind === 'flex-section' && m.flexSectionId === match[1]);
        if (module) {
          pendingScrollField.current = field;
          setSelectedModuleId(module.id);
          if (selectedModuleId === module.id) {
            pendingScrollField.current = undefined;
            focusField(field);
          }
        }
      }
    }
  };

  return (
    <main className="editor-shell">
      <header className="magic-chrome">
        <div className="magic-brand"><strong>FitCV</strong><span>/</span></div>
        <button className="ghost-button back-link" onClick={onBack}><ChevronLeft />Dashboard</button>
        <div className="resume-name-field">
          <AiInput value={active.title} onValue={(value) => onChange((resume) => renameResume(resume, value))} ariaLabel="Resume title" assistLabel="Resume title" />
          <Pencil aria-hidden="true" />
        </div>
        <label className="top-layout-select">
          <span>Layout</span>
          <select aria-label="Layout"
            value={visibleLayoutTemplates.some((t) => t.id === active.activeTemplateId) ? active.activeTemplateId : 'awesome-cv'}
            onChange={(e) => onChange((resume) => switchTemplate(resume, e.target.value as TemplateId))}
          >
            {visibleLayoutTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {activeFittedCv && (
          <div className="fitted-context">
            <span className="fitted-badge">Fitted CV</span>
            <span>Based on: {sourceResume?.title ?? activeFittedCv.sourceResumeId} · Source v{activeFittedCv.sourceVersion}</span>
          </div>
        )}
        <div className="chrome-end-actions">
          <ReadinessPills
            atsReadiness={atsReadiness}
            cvQualityReadiness={cvQualityReadiness}
            jdMatchReadiness={jdMatchReadiness}
            hasJobDescription={hasJobDescription}
            onOpen={setDrawerDimension}
          />
          <span className={cleanCompile ? 'backup-state clean' : 'backup-state'}>
            {cleanCompile ? <CheckCircle2 /> : <Clock3 />}{cleanCompile ? 'PDF ready' : 'Compile needed'}
          </span>
          <div className="chrome-action-group">
            <AiSettingsButton />
            {!activeFittedCv && <button className="chrome-button" onClick={() => setShowFitModal(true)}><FileCheck2 />Fit to JD</button>}
            {!activeFittedCv && (
              <label className="chrome-button" title="Import CV data from a PDF, TXT, or Markdown file using AI" style={{ cursor: 'pointer' }}>
                <Upload />Import CV (AI)
                <input type="file" accept=".pdf,.txt,.md" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { e.target.value = ''; onImportCvWithAi(f); } }} />
              </label>
            )}
            <button className={`chrome-button${autoCompile ? ' selected' : ''}`} onClick={onToggleAutoCompile} title={autoCompile ? 'Auto-compile on' : 'Auto-compile off'}><Zap />Auto</button>
            <StatusPill icon={<Terminal />} label="Compiler assets" value={formatCompilerAssetState(compilerAssetState, compilerAssetProgress)} tone={compilerAssetState === 'ready-offline' ? 'good' : 'warn'} />
            <button className="chrome-button" onClick={onPrepareCompiler} disabled={!!busy}><Download />Prepare</button>
            <button className="chrome-button" onClick={onRepairCompiler} disabled={!!busy}><RotateCw />Repair</button>
            <button className="chrome-button" onClick={onClearCompiler} disabled={!!busy}><Trash2 />Clear cache</button>
            <button className="chrome-button" onClick={onCompile} disabled={!!busy}><RotateCw />Compile</button>
            <button className="chrome-button primary" disabled={!artifact?.pdfBlob || artifact.status !== 'clean' || exportBlocked} onClick={onDownloadPdf}><Download />Export</button>
          </div>
          <button className="ghost-button danger" onClick={onDelete}><Trash2 /></button>
        </div>
      </header>
      {error && <div className="notice editor-notice" role="alert">{error}</div>}
      {exportBlocked && <div className="notice editor-notice" role="alert">{unreviewedFitChangeCount} unreviewed change{unreviewedFitChangeCount !== 1 ? 's' : ''} must be reviewed before export.</div>}
      {activeFittedCv && <FittedChangeReviewPanel fittedCv={activeFittedCv} onReview={onReviewFittedChange} />}
      <section className="editor-board" aria-label="Editor workbench"
        onBlur={(e) => {
          if (!autoCompile) return;
          const { target } = e;
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) void onCompile();
        }}
      >
        <StylePanel active={active} onChange={onChange} selectedModule={selectedModule}
          onSelectModule={(module) => setSelectedModuleId(module.id)} />
        <EditorPanel active={active} onChange={onChange} reviewCount={reviewCount} selectedModule={selectedModule} />
        <PreviewPanel activeTemplateName={activeTemplate?.name ?? active.activeTemplateId} artifact={artifact} busy={busy} cleanCompile={cleanCompile} pdfUrl={pdfUrl} />
      </section>
      {showFitModal && (
        <FitToJdModal
          defaultTitle={`${active.title} fitted`}
          busy={busy}
          onClose={() => setShowFitModal(false)}
          onCreate={async (input) => {
            await onCreateFittedCv(input);
            setShowFitModal(false);
          }}
        />
      )}
      {drawerDimension !== null && (
        <ReadinessDrawer
          dimension={drawerDimension}
          busy={busy}
          atsReadiness={atsReadiness}
          cvQualityReadiness={cvQualityReadiness}
          jdMatchReadiness={jdMatchReadiness}
          hasJobDescription={hasJobDescription}
          onDimensionChange={setDrawerDimension}
          onClose={() => setDrawerDimension(null)}
          onRunAts={onRunAts}
          onRunCvQuality={onRunCvQuality}
          onRunJdMatch={onRunJdMatch}
          onNavigate={navigateToField}
        />
      )}
    </main>
  );
};

const scoreClass = (pct: number) => pct >= 80 ? 'score-good' : pct >= 60 ? 'score-warn' : 'score-bad';

const isNavigableField = (field?: string): field is string =>
  !!field && (
    field.startsWith('content.profile') ||
    field.startsWith('content.summary') ||
    /^content\.flexSections\.[^.]+/.test(field)
  );

// --- Readiness drawer (Option B: score pills in chrome + slide-in panel) ---

type ReadinessDimension = 'ats' | 'cvq' | 'jd';

const pillVariant = (report?: ScoringReportRecord): 'good' | 'warn' | 'bad' | 'idle' => {
  if (!report) return 'idle';
  return report.readinessPercent >= 80 ? 'good' : report.readinessPercent >= 60 ? 'warn' : 'bad';
};

const ReadinessPills = ({ atsReadiness, cvQualityReadiness, jdMatchReadiness, hasJobDescription, onOpen }: {
  atsReadiness?: ScoringReportRecord;
  cvQualityReadiness?: ScoringReportRecord;
  jdMatchReadiness?: ScoringReportRecord;
  hasJobDescription: boolean;
  onOpen: (dimension: ReadinessDimension) => void;
}) => (
  <div className="readiness-pills">
    <button
      className={`readiness-pill pill-${pillVariant(atsReadiness)}`}
      type="button"
      onClick={() => onOpen('ats')}
      aria-label={`ATS Readiness${atsReadiness ? `: ${atsReadiness.readinessPercent}%` : ': not run'}`}
    >
      <span className="readiness-pill-dot" aria-hidden="true" />
      ATS{atsReadiness ? ` ${atsReadiness.readinessPercent}%` : ' —'}
    </button>
    <button
      className={`readiness-pill pill-${pillVariant(cvQualityReadiness)}`}
      type="button"
      onClick={() => onOpen('cvq')}
      aria-label={`CV Quality${cvQualityReadiness ? `: ${cvQualityReadiness.readinessPercent}%` : ': not run'}`}
    >
      <span className="readiness-pill-dot" aria-hidden="true" />
      CV{cvQualityReadiness ? ` ${cvQualityReadiness.readinessPercent}%` : ' —'}
    </button>
    {hasJobDescription && (
      <button
        className={`readiness-pill pill-${pillVariant(jdMatchReadiness)}`}
        type="button"
        onClick={() => onOpen('jd')}
        aria-label={`JD Match${jdMatchReadiness ? `: ${jdMatchReadiness.readinessPercent}%` : ': not run'}`}
      >
        <span className="readiness-pill-dot" aria-hidden="true" />
        JD{jdMatchReadiness ? ` ${jdMatchReadiness.readinessPercent}%` : ' —'}
      </button>
    )}
  </div>
);

const ARC_LENGTH = 163.4;

const ArcGauge = ({ score, variant }: { score: number | undefined; variant: ReturnType<typeof pillVariant> }) => {
  const fillRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = fillRef.current;
    if (!el || score === undefined) return;
    const target = ARC_LENGTH * (1 - score / 100);
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.style.transition = 'none';
    el.style.strokeDashoffset = String(ARC_LENGTH);
    if (reduceMotion) {
      el.style.strokeDashoffset = String(target);
      return;
    }
    const id = requestAnimationFrame(() => {
      if (!fillRef.current) return;
      fillRef.current.style.transition = 'stroke-dashoffset 600ms cubic-bezier(0.34, 1.56, 0.64, 1)';
      fillRef.current.style.strokeDashoffset = String(target);
    });
    return () => cancelAnimationFrame(id);
  }, [score]);

  const strokeColor =
    variant === 'good' ? 'var(--green)' :
    variant === 'warn' ? 'var(--amber)' :
    variant === 'bad'  ? 'var(--red)'   : 'var(--faint)';

  return (
    <div className="readiness-arc-wrap">
      <svg width="130" height="75" viewBox="0 0 130 75" aria-hidden="true">
        <path className="readiness-arc-bg" d="M 18 70 A 52 52 0 0 1 112 70" />
        {score !== undefined && (
          <path
            ref={fillRef}
            className="readiness-arc-fill"
            d="M 18 70 A 52 52 0 0 1 112 70"
            style={{ stroke: strokeColor, strokeDasharray: ARC_LENGTH, strokeDashoffset: ARC_LENGTH }}
          />
        )}
      </svg>
      <div className="readiness-arc-center">
        {score !== undefined
          ? <span className={`readiness-arc-score ${scoreClass(score)}`}>{score}%</span>
          : <span className="readiness-arc-unrun">—</span>
        }
      </div>
    </div>
  );
};

const DRAWER_META: Record<ReadinessDimension, { title: string; tabLabel: string; runLabel: string; disclosure: string }> = {
  ats: {
    title: 'ATS Readiness',
    tabLabel: 'ATS',
    runLabel: 'Run ATS Check',
    disclosure: 'ATS Readiness runs locally and does not send resume content to AI.'
  },
  cvq: {
    title: 'CV Quality',
    tabLabel: 'CV Quality',
    runLabel: 'Run CV Quality',
    disclosure: 'CV Quality sends resume text to your configured AI provider for analysis.'
  },
  jd: {
    title: 'JD Match',
    tabLabel: 'JD Match',
    runLabel: 'Run JD Match',
    disclosure: 'JD Match sends fitted CV text and the job description to your configured AI provider.'
  },
};

const ReadinessDrawer = ({
  dimension, busy, atsReadiness, cvQualityReadiness, jdMatchReadiness, hasJobDescription,
  onDimensionChange, onClose, onRunAts, onRunCvQuality, onRunJdMatch, onNavigate,
}: {
  dimension: ReadinessDimension;
  busy: string;
  atsReadiness?: ScoringReportRecord;
  cvQualityReadiness?: ScoringReportRecord;
  jdMatchReadiness?: ScoringReportRecord;
  hasJobDescription: boolean;
  onDimensionChange: (d: ReadinessDimension) => void;
  onClose: () => void;
  onRunAts: () => void;
  onRunCvQuality: () => void;
  onRunJdMatch: () => void;
  onNavigate?: (field: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeReport =
    dimension === 'ats' ? atsReadiness :
    dimension === 'cvq' ? cvQualityReadiness : jdMatchReadiness;

  const meta = DRAWER_META[dimension];
  const tabs: ReadinessDimension[] = ['ats', 'cvq', ...(hasJobDescription ? ['jd' as const] : [])];
  const isBusy = Boolean(busy);

  const runActive = () => {
    if (isBusy) return;
    if (dimension === 'ats') onRunAts();
    else if (dimension === 'cvq') onRunCvQuality();
    else onRunJdMatch();
  };

  const tabIssueCount = (d: ReadinessDimension) => {
    const r = d === 'ats' ? atsReadiness : d === 'cvq' ? cvQualityReadiness : jdMatchReadiness;
    return r?.reasons.filter((reason) => reason.severity !== 'info').length ?? 0;
  };

  const groupedReasons = activeReport ? groupReadinessReasons(activeReport.reasons) : [];

  return (
    <>
      <div className="readiness-drawer-overlay" aria-hidden="true" onClick={onClose} />
      <aside
        className={`readiness-drawer${isOpen ? ' is-open' : ''}`}
        role="dialog"
        aria-label={`${meta.title} details`}
        aria-modal="true"
      >
        <div className="readiness-drawer-head">
          <div className="readiness-drawer-head-text">
            <strong>{meta.title}</strong>
            {activeReport && <span className="readiness-drawer-timestamp">Updated {formatRelative(activeReport.createdAt)}</span>}
          </div>
          {activeReport && (
            <span className={`readiness-drawer-score ${scoreClass(activeReport.readinessPercent)}`}>
              {activeReport.readinessPercent}%
            </span>
          )}
          <button className="readiness-drawer-close" type="button" onClick={onClose} aria-label="Close readiness drawer">
            <X />
          </button>
        </div>
        <div className="readiness-drawer-tabs" role="tablist">
          {tabs.map((d) => {
            const count = tabIssueCount(d);
            return (
              <button
                key={d}
                role="tab"
                aria-selected={dimension === d}
                className={`readiness-drawer-tab${dimension === d ? ' active' : ''}`}
                type="button"
                onClick={() => onDimensionChange(d)}
              >
                {DRAWER_META[d].tabLabel}
                {count > 0 && <span className="readiness-drawer-tab-badge">{count}</span>}
              </button>
            );
          })}
        </div>
        <div className="readiness-drawer-body">
          <ArcGauge key={dimension} score={activeReport?.readinessPercent} variant={pillVariant(activeReport)} />
          <p className="readiness-drawer-disclosure">{meta.disclosure}</p>
          {activeReport ? (
            activeReport.reasons.length > 0 ? (
              <div className="readiness-drawer-issues">
                {groupedReasons.map((group) => (
                  <section key={group.severity} className="readiness-drawer-issue-group" aria-label={`${group.label} findings`}>
                    <div className="readiness-drawer-section-lbl">{group.label} · {group.reasons.length}</div>
                    {group.reasons.map((reason, index) => {
                      const navigable = isNavigableField(reason.field) && !!onNavigate;
                      const goToReason = () => { onNavigate!(reason.field!); onClose(); };
                      return (
                        <div
                          key={`${reason.id}-${reason.field ?? 'resume'}-${index}`}
                          className={`readiness-drawer-issue${navigable ? ' navigable' : ''}`}
                          {...(navigable ? {
                            role: 'button',
                            tabIndex: 0,
                            onClick: goToReason,
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                goToReason();
                              }
                            },
                          } : {})}
                        >
                          <span className={`readiness-drawer-issue-sev ${reason.severity}`}>
                            {reason.severity === 'high' ? 'High' : reason.severity === 'medium' ? 'Med' : 'Info'}
                          </span>
                          <div className="readiness-drawer-issue-body">
                            <div className="readiness-drawer-issue-msg">{reason.message}</div>
                            {reason.impact !== undefined && (
                              <div className="readiness-drawer-issue-impact">{reason.impact} pts</div>
                            )}
                          </div>
                          {navigable && <ArrowRight className="readiness-drawer-issue-arrow" aria-hidden="true" />}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            ) : (
              <p className="readiness-drawer-empty">No issues found. Looking good.</p>
            )
          ) : (
            <p className="readiness-drawer-empty">
              {dimension === 'jd'
                ? 'Fit this resume to a job description to see alignment.'
                : 'Run this check to see results.'}
            </p>
          )}
          <button className="readiness-drawer-run" type="button" disabled={isBusy} onClick={runActive}>
            {isBusy ? <Loader2 className="spin" /> : <RotateCw />}{isBusy ? busy : meta.runLabel}
          </button>
        </div>
      </aside>
    </>
  );
};

const groupReadinessReasons = (reasons: ScoringReportRecord['reasons']) => (
  [
    { severity: 'high' as const, label: 'High' },
    { severity: 'medium' as const, label: 'Medium' },
    { severity: 'info' as const, label: 'Info' },
  ]
    .map((group) => ({
      ...group,
      reasons: reasons.filter((reason) => reason.severity === group.severity),
    }))
    .filter((group) => group.reasons.length > 0)
);

const FitToJdModal = ({ defaultTitle, busy, onCreate, onClose }: {
  defaultTitle: string;
  busy: string;
  onCreate: (input: { title: string; jobDescriptionText: string }) => Promise<void>;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const canSubmit = title.trim().length > 0 && jobDescriptionText.trim().length >= 20 && !busy;
  return (
    <div className="create-resume-overlay" onClick={onClose}>
      <div className="fit-jd-modal" role="dialog" aria-modal="true" aria-label="Fit to job description" onClick={(event) => event.stopPropagation()}>
        <div className="create-resume-modal-head">
          <h2>Fit to job description</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="fit-jd-fields">
          <label>
            <span>Fitted CV title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Fitted CV title" />
          </label>
          <label>
            <span>Job description</span>
            <textarea value={jobDescriptionText} onChange={(event) => setJobDescriptionText(event.target.value)} aria-label="Job description" rows={10} />
          </label>
          <div className="provider-disclosure">
            <strong>Provider disclosure</strong>
            <span>The current resume text and this job description will be sent to your configured AI provider. FitCV stores the fitted CV and JD locally.</span>
          </div>
        </div>
        <div className="modal-actions">
          <button className="chrome-button" onClick={onClose}>Cancel</button>
          <button className="chrome-button primary" disabled={!canSubmit} onClick={() => onCreate({ title: title.trim(), jobDescriptionText: jobDescriptionText.trim() })}>
            {busy ? <Loader2 className="spin" /> : <FileCheck2 />}Create fitted CV
          </button>
        </div>
      </div>
    </div>
  );
};

const FittedChangeReviewPanel = ({ fittedCv, onReview }: {
  fittedCv: FittedCvRecord;
  onReview: (changeId: string, decision: 'accept' | 'reject' | 'manual') => void;
}) => {
  const pendingCount = fittedCv.proposedChanges.filter((change) => change.status === 'pending').length;
  const [expanded, setExpanded] = useState(pendingCount > 0);

  if (!fittedCv.proposedChanges.length) return null;

  return (
    <section className="fit-review-panel" aria-label="AI change review">
      <div className="fit-review-panel-head">
        <button
          className="fit-review-collapse-btn"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp /> : <ChevronDown />}
          <span className="fit-review-head-title">AI change review</span>
          <span className="fit-review-head-meta">{pendingCount ? `${pendingCount} unreviewed change${pendingCount !== 1 ? 's' : ''}` : 'All reviewed'}</span>
        </button>
      </div>
      <div className={`fit-review-panel-body${expanded ? ' is-open' : ''}`} aria-hidden={!expanded}>
        <div className="fit-review-panel-body-inner">
          <div className="fit-review-list">
            {fittedCv.proposedChanges.map((change) => (
              <article key={change.id} className={`fit-review-item ${change.status}`}>
                <div className="fit-review-meta">
                  <span className="template-chip">{change.status}</span>
                  <strong>{change.targetField}</strong>
                </div>
                <div className="fit-review-diff">
                  <div><span>Original</span><p>{change.before || 'Empty'}</p></div>
                  <div><span>Proposed</span><p>{change.after}</p></div>
                </div>
                <p className="fit-review-rationale">{change.rationale}</p>
                {change.jdEvidence && <p className="fit-review-evidence">JD: {change.jdEvidence}</p>}
                {change.riskFlags.length > 0 && (
                  <div className="risk-flags">
                    {change.riskFlags.map((flag) => <span key={flag}>{flag}</span>)}
                  </div>
                )}
                {change.status === 'pending' && (
                  <div className="fit-review-actions">
                    <button className="chrome-button primary" onClick={() => onReview(change.id, 'accept')}><CheckCircle2 />Accept change</button>
                    <button className="chrome-button" onClick={() => onReview(change.id, 'reject')}>Reject change</button>
                    <button className="chrome-button" onClick={() => onReview(change.id, 'manual')}><Pencil />Mark manually reviewed</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// --- Common chrome ---

const TopChrome = ({ label, children }: { label: string; children: ReactNode }) => (
  <header className="top-chrome">
    <div className="top-chrome-inner">
      <div className="brand"><span className="brand-mark">CV</span><strong>FitCV</strong></div>
      <span className="chrome-divider" />
      <span className="chrome-label">{label}</span>
      <div className="chrome-actions">{children}</div>
    </div>
  </header>
);

const FilterItem = ({ active = false, label, value }: { active?: boolean; label: string; value: string }) => (
  <li className={active ? 'filter-item active' : 'filter-item'}><span>{label}</span><strong>{value}</strong></li>
);

// --- Resume group card ---

const ResumeGroup = ({ resume, fittedCvs, active, cvQualityReadiness, readinessReports, onOpen, onOpenFitted, onDelete }: {
  resume: ResumeRecord;
  fittedCvs: FittedCvRecord[];
  active: boolean;
  cvQualityReadiness?: ScoringReportRecord;
  readinessReports: ScoringReportRecord[];
  onOpen: () => void;
  onOpenFitted: (fittedCv: FittedCvRecord) => void;
  onDelete: () => void;
}) => {
  const template = templates.find((item) => item.id === resume.activeTemplateId);
  const atsReadiness = buildAtsReadinessReport(resume);
  const reviewCount = resume.reviewMarkers.filter((marker) => marker.needsReview).length;
  const sectionCount = resume.content.flexSections.length;

  return (
    <article className={active ? 'base-group active' : 'base-group'}>
      <div className="base-row">
        <MiniPaper resume={resume} />
        <div className="base-info">
          <div className="eyebrow">Base resume</div>
          <div className="base-title-row">
            <h2>{resume.title}</h2>
            <span className="template-chip">{template?.name ?? resume.activeTemplateId}</span>
          </div>
          <div className="meta">
            <span>Updated {formatRelative(resume.updatedAt)}</span>
            <span>{sectionCount} section{sectionCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="resume-readiness" aria-label={`${resume.title} readiness`}>
            <span className={`readiness-chip ${scoreClass(atsReadiness.readinessPercent)}`}>ATS {atsReadiness.readinessPercent}%</span>
            <span className={cvQualityReadiness ? `readiness-chip ${scoreClass(cvQualityReadiness.readinessPercent)}` : 'readiness-chip muted'}>
              CV Quality {cvQualityReadiness ? `${cvQualityReadiness.readinessPercent}%` : 'Not run'}
            </span>
            {reviewCount > 0 && <span className="readiness-chip score-warn">Review {reviewCount} field{reviewCount !== 1 ? 's' : ''}</span>}
          </div>
          <p className="summary">{resume.content.summary || 'No summary yet. Open the editor to add a focused positioning statement.'}</p>
          <div className="actions">
            <button className="button green" onClick={onOpen}><Pencil />Edit</button>
            <button className="button ghost danger" onClick={onDelete}><Trash2 />Delete</button>
          </div>
        </div>
      </div>
      <div className="fit-strip">
        <div className="strip-head"><h3>Fitted CVs</h3><p>Job-specific versions of this resume</p></div>
        <div className="fit-grid">
          {fittedCvs.length > 0 ? fittedCvs.map((cv) => (
            <FittedCvCard
              key={cv.id}
              fittedCv={cv}
              jdMatchReadiness={readinessReports.find((report) =>
                report.kind === 'jd-match'
                && (report.targetType ?? 'resume') === 'fitted-cv'
                && (report.targetId ?? report.resumeId) === cv.id
                && (report.jobDescriptionId ?? '') === (cv.jobDescriptionId ?? '')
              )}
              onOpen={() => onOpenFitted(cv)}
            />
          )) : <FitCardCta />}
        </div>
      </div>
    </article>
  );
};

const FittedCvCard = ({ fittedCv, jdMatchReadiness, onOpen }: { fittedCv: FittedCvRecord; jdMatchReadiness?: ScoringReportRecord; onOpen: () => void }) => (
  <article className="fit-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(); }}>
    <div className="fit-top">
      <div className="doc-mini"><span /><span /><span /><span /></div>
      <div className="fit-title"><div className="company">Fitted CV</div><div className="role">{fittedCv.title}</div></div>
    </div>
    <div className="fit-footer">
      <span className={jdMatchReadiness ? `score ${scoreClass(jdMatchReadiness.readinessPercent)}` : 'score'}>JD Match {jdMatchReadiness ? `${jdMatchReadiness.readinessPercent}%` : 'Not run'}</span>
      <span className={fittedCvHasUnreviewedChanges(fittedCv) ? 'score score-warn' : 'score high'}>{fittedCvHasUnreviewedChanges(fittedCv) ? 'Review needed' : `${fittedCv.acceptedChangeIds.length} accepted`}</span>
      <span className="date">{formatRelative(fittedCv.updatedAt)}</span>
    </div>
  </article>
);

const FitCardCta = () => (
  <article className="fit-card fit-card-cta">
    <div className="fit-top">
      <div className="doc-mini"><span /><span /><span /><span /></div>
      <div className="fit-title"><div className="company">No fitted CVs yet</div><div className="role">Fit to a job description to create a tailored version here</div></div>
    </div>
  </article>
);

// --- Style panel (layout editor) ---

const StylePanel = ({ active, onChange, selectedModule, onSelectModule }: {
  active: ResumeRecord;
  onChange: (recipe: (r: ResumeRecord) => ResumeRecord) => void;
  selectedModule?: LayoutModule;
  onSelectModule: (module: LayoutModule) => void;
}) => {
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const template = getTemplate(active.activeTemplateId);
  const pinnedSections = template.pinnedSections ?? [];
  const usesLayoutModules = hasTemplateAdapter(active.activeTemplateId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState<number>(0);
  const [showAddModule, setShowAddModule] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const rowHeights = useRef<number[]>([]);
  const rowTops = useRef<number[]>([]);
  const grabOffset = useRef<number>(0);

  const isPinned = (module: LayoutModule): boolean =>
    module.kind === 'section' && pinnedSections.includes(module.section);

  const removeModule = (module: LayoutModule) => {
    onChange((r) => {
      const layout = (r.templateLayouts[r.activeTemplateId] ?? []).filter((m) => m.id !== module.id);
      const flexSections = module.kind === 'flex-section'
        ? r.content.flexSections.filter((s) => s.id !== module.flexSectionId)
        : r.content.flexSections;
      return touchResume({ ...r, content: { ...r.content, flexSections }, templateLayouts: { ...r.templateLayouts, [r.activeTemplateId]: layout } });
    });
  };

  const addLayoutControlModule = (kind: 'space' | 'new-page') => {
    const newModule: LayoutModule = kind === 'space'
      ? { id: createId('module-space'), kind: 'space', enabled: true, value: defaultSpaceValue }
      : { id: createId('module-new-page'), kind: 'new-page', enabled: true };
    onChange((r) => {
      const layout = [...(r.templateLayouts[r.activeTemplateId] ?? [])];
      return touchResume({ ...r, templateLayouts: { ...r.templateLayouts, [r.activeTemplateId]: [...layout, newModule] } });
    });
    onSelectModule(newModule);
    setShowAddModule(false);
  };

  const addFlexSection = () => {
    const sectionId = createId('section');
    const newSection: FlexSection = { id: sectionId, name: 'NEW SECTION', items: [] };
    const newModule: LayoutModule = { id: createId('module-flex'), kind: 'flex-section', flexSectionId: sectionId, enabled: true };
    onChange((r) => {
      const layout = [...(r.templateLayouts[r.activeTemplateId] ?? [])];
      return touchResume({ ...r, content: { ...r.content, flexSections: [...r.content.flexSections, newSection] }, templateLayouts: { ...r.templateLayouts, [r.activeTemplateId]: [...layout, newModule] } });
    });
    onSelectModule(newModule);
    setShowAddModule(false);
  };

  const reorderModule = (fromId: string, toId: string) => {
    onChange((r) => {
      const layout = [...(r.templateLayouts[r.activeTemplateId] ?? [])];
      const fi = layout.findIndex((m) => m.id === fromId);
      const ti = layout.findIndex((m) => m.id === toId);
      if (fi === -1 || ti === -1) return r;
      const [moved] = layout.splice(fi, 1);
      layout.splice(ti, 0, moved);
      return touchResume({ ...r, templateLayouts: { ...r.templateLayouts, [r.activeTemplateId]: layout } });
    });
  };

  const handleGripPointerDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll<HTMLElement>('.module-row');
    rowHeights.current = Array.from(rows).map((r) => r.getBoundingClientRect().height);
    rowTops.current = Array.from(rows).map((r) => r.getBoundingClientRect().top);
    grabOffset.current = e.clientY - rowTops.current[index];
    listRef.current.setPointerCapture(e.pointerId);
    setDragIndex(index);
    setOverIndex(index);
    setPointerY(e.clientY);
  };

  const handleListPointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    setPointerY(e.clientY);
    const n = usesLayoutModules ? activeLayout.length : 1;
    let newOver = n - 1;
    for (let i = 0; i < n; i++) {
      if (rowTops.current[i] + rowHeights.current[i] / 2 > e.clientY) { newOver = i; break; }
    }
    if (newOver !== overIndex) setOverIndex(newOver);
  };

  const handleListPointerUp = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      if (usesLayoutModules) reorderModule(activeLayout[dragIndex].id, activeLayout[overIndex].id);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const getItemStyle = (index: number): React.CSSProperties => {
    if (dragIndex === null || overIndex === null) return {};
    if (index === dragIndex) {
      const dy = pointerY - grabOffset.current - rowTops.current[index];
      return { transform: `translateY(${dy}px) scale(1.02)`, transition: 'box-shadow 150ms ease', position: 'relative', zIndex: 100, boxShadow: '0 8px 24px rgba(27,27,24,0.14)' };
    }
    const gap = 8;
    const h = (rowHeights.current[dragIndex] ?? 42) + gap;
    if (dragIndex < overIndex && index > dragIndex && index <= overIndex) return { transform: `translateY(-${h}px)` };
    if (dragIndex > overIndex && index >= overIndex && index < dragIndex) return { transform: `translateY(${h}px)` };
    return {};
  };

  return (
    <aside className="panel style-panel" aria-label="Layout and template controls">
      <div className="design-card module-card">
        <div className="panel-title">Layout</div>
        <div
          className={`module-list${dragIndex !== null ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerMove={handleListPointerMove}
          onPointerUp={handleListPointerUp}
          onPointerCancel={handleListPointerUp}
        >
          {usesLayoutModules ? activeLayout.map((module, index) => {
            const label = labelForLayoutModule(module, active.content.flexSections);
            const locked = isPinned(module);
            const isHidden = !module.enabled;
            return (
              <div
                key={module.id}
                style={getItemStyle(index)}
                className={['module-row', module.id === selectedModule?.id ? 'selected' : '', isHidden ? 'hidden' : '', dragIndex === index ? 'dragging' : '', locked ? 'pinned' : ''].filter(Boolean).join(' ')}
              >
                {locked ? (
                  <span className="grip-placeholder" aria-hidden="true" />
                ) : (
                  <GripVertical aria-hidden="true" onPointerDown={(e) => handleGripPointerDown(e, index)} />
                )}
                <button className="module-select-btn" onClick={() => onSelectModule(module)}>{label}</button>
                {!locked && (
                  <button className="visibility-toggle"
                    onClick={() => onChange((r) => updateLayoutModule(r, module.id, (item) => ({ ...item, enabled: !item.enabled })))}
                    aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${label}`}
                  >
                    {module.enabled ? <Eye /> : <EyeOff />}
                  </button>
                )}
                {!locked && (
                  <button className="visibility-toggle" onClick={() => removeModule(module)} aria-label={`Remove ${label}`}><Trash2 /></button>
                )}
              </div>
            );
          }) : (
            <div className="module-row selected">
              <button className="module-select-btn">Summary</button>
            </div>
          )}
          {showAddModule ? (
            <div className="add-module-picker" role="menu" aria-label="Add module options">
              <button className="add-module-option" role="menuitem" onClick={addFlexSection}><Plus />New section</button>
              <button className="add-module-option" role="menuitem" onClick={() => addLayoutControlModule('space')}><Plus />Space</button>
              <button className="add-module-option" role="menuitem" onClick={() => addLayoutControlModule('new-page')}><Plus />New page</button>
              <button className="add-module-cancel" onClick={() => setShowAddModule(false)}>Cancel</button>
            </div>
          ) : (
            <button className="add-module" aria-haspopup="menu" aria-expanded={false} onClick={() => setShowAddModule(true)}><Plus />Add module<ChevronDown /></button>
          )}
        </div>
      </div>
    </aside>
  );
};

// --- Editor panel ---

const EditorPanel = ({ active, onChange, reviewCount, selectedModule }: {
  active: ResumeRecord;
  onChange: (recipe: (r: ResumeRecord) => ResumeRecord) => void;
  reviewCount: number;
  selectedModule?: LayoutModule;
}) => {
  const label = selectedModule ? labelForLayoutModule(selectedModule, active.content.flexSections) : 'Summary';
  const template = getTemplate(active.activeTemplateId);
  const [editingSectionName, setEditingSectionName] = useState(false);

  useEffect(() => {
    setEditingSectionName(false);
  }, [selectedModule?.id]);

  const canRenameSelectedModule = selectedModule?.kind === 'flex-section' || selectedModule?.kind === 'section';

  const renameSelectedModule = (name: string) => {
    if (!selectedModule) return;
    if (selectedModule.kind === 'flex-section') {
      onChange((r) => touchResume({
        ...r,
        content: {
          ...r.content,
          flexSections: r.content.flexSections.map((s) => s.id === selectedModule.flexSectionId ? { ...s, name } : s),
        },
      }));
      return;
    }
    if (selectedModule.kind === 'section') {
      onChange((r) => updateLayoutModule(r, selectedModule.id, (m) => (
        m.kind !== 'section' ? m : { ...m, options: { ...(m.options ?? {}), title: name } }
      )));
    }
  };

  const renderEditor = (): ReactNode => {
    if (!selectedModule || selectedModule.kind === 'section') return <SummaryEditor active={active} onChange={onChange} />;
    if (selectedModule.kind === 'flex-section') {
      const section = active.content.flexSections.find((s) => s.id === selectedModule.flexSectionId);
      if (!section) return <div className="section-card"><p>Section not found.</p></div>;
      return <FlexSectionEditor section={section} onChange={onChange} sectionEnvs={template.sectionEnvs ?? []} entryTypes={template.entryTypes ?? []} />;
    }
    return renderLayoutControlEditor(selectedModule, onChange);
  };

  return (
    <section className="panel editor" aria-label="Section editor">
      <div className="editor-subhead">
        {editingSectionName ? (
          <AiInput
            ariaLabel="Section name"
            assistLabel="Section name"
            className="editor-subhead-input"
            value={label}
            onValue={renameSelectedModule}
            onBlur={() => setEditingSectionName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
            autoFocus
          />
        ) : (
          <span>{label}</span>
        )}
        {canRenameSelectedModule && !editingSectionName && (
          <button className="editor-subhead-edit" onClick={() => setEditingSectionName(true)} aria-label="Edit section name"><Pencil /></button>
        )}
      </div>
      <div className="section-editor" key={selectedModule?.id ?? 'summary'}>
        {renderEditor()}
      </div>
      {reviewCount > 0 && (
        <div className="review-box">
          <strong>Needs review</strong>
          {active.reviewMarkers.filter((marker) => marker.needsReview).map((marker) => (
            <span key={marker.field}>{marker.field}: {marker.note}</span>
          ))}
        </div>
      )}
    </section>
  );
};

// --- Layout control editors ---

const renderLayoutControlEditor = (
  module: Exclude<LayoutModule, { kind: 'section' | 'flex-section' }>,
  onChange: (recipe: (r: ResumeRecord) => ResumeRecord) => void
) => {
  if (module.kind === 'space') {
    const value = Number.isFinite(module.value) ? module.value : defaultSpaceValue;
    const updateSpaceValue = (rawValue: number) => {
      const nextValue = clampSpaceValue(rawValue);
      onChange((r) => updateLayoutModule(r, module.id, (item) => item.kind === 'space' ? { ...item, value: nextValue } : item));
    };
    return (
      <div className="section-card">
        <div className="subhead"><h3>Space</h3><span className="template-chip">{module.enabled ? 'Enabled' : 'Disabled'}</span></div>
        <div className="space-value-control">
          <label className="space-slider-label">
            <span>Space value: {value}pt</span>
            <input type="range" min={MIN_SPACE_VALUE} max={MAX_SPACE_VALUE} step={1} value={value} onChange={(e) => updateSpaceValue(Number(e.target.value))} />
          </label>
          <label className="space-number-field">
            <span>Value</span>
            <div><input aria-label="Space value in points" type="number" min={MIN_SPACE_VALUE} max={MAX_SPACE_VALUE} step={1} value={value} onChange={(e) => updateSpaceValue(Number(e.target.value))} /><span>pt</span></div>
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className="section-card">
      <div className="subhead"><h3>New page</h3><span className="template-chip">{module.enabled ? 'Enabled' : 'Disabled'}</span></div>
      <div className="segmented">
        <button className={module.enabled ? 'selected' : ''} onClick={() => onChange((r) => updateLayoutModule(r, module.id, (item) => ({ ...item, enabled: true })))}>Enable</button>
        <button className={!module.enabled ? 'selected' : ''} onClick={() => onChange((r) => updateLayoutModule(r, module.id, (item) => ({ ...item, enabled: false })))}>Disable</button>
      </div>
    </div>
  );
};

// --- Summary editor ---

const SummaryEditor = ({ active, onChange }: { active: ResumeRecord; onChange: (recipe: (r: ResumeRecord) => ResumeRecord) => void }) => {
  const profile = active.content.profile;
  const highlights = profileHighlightsForResume(active);
  const hiddenFields = profile.hiddenFields ?? [];
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const summaryModule = activeLayout.find((m) => m.kind === 'section' && m.section === 'summary');
  const highlightsWillCompile = summaryModule?.enabled === true;
  const visibleHighlightCount = highlightsWillCompile ? highlights.filter((item) => !item.hidden && item.text.trim()).length : 0;

  const textField = (field: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>, label: string, value: string, options: { type?: string; parseValue?: (v: string) => string | string[] } = {}) => (
    <ProfileTextField field={field} hidden={hiddenFields.includes(field)} label={label} onChange={onChange} value={value} {...options} />
  );
  const nestedField = (group: 'stackoverflow' | 'googleScholar', keyName: 'id' | 'name', label: string, value: string) => (
    <ProfileNestedTextField group={group} hidden={hiddenFields.includes(group)} keyName={keyName} label={label} onChange={onChange} value={value} />
  );

  return (
    <div className="section-card">
      <div className="field-grid profile-field-grid">
        {textField('fullName', 'Name', profile.fullName ?? '')}
        {textField('headline', 'Title', profile.headline ?? '')}
        {textField('email', 'Email', profile.email ?? '', { type: 'email' })}
        {textField('phone', 'Phone', profile.phone ?? '', { type: 'tel' })}
        {textField('location', 'Location', profile.location ?? '')}
        {textField('links', 'Links', (profile.links ?? []).join(', '), { parseValue: splitList })}
        {textField('gitlab', 'GitLab', profile.gitlab ?? '')}
        {textField('linkedin', 'LinkedIn', profile.linkedin ?? '')}
        {nestedField('stackoverflow', 'id', 'Stack Overflow ID', profile.stackoverflow?.id ?? '')}
        {nestedField('stackoverflow', 'name', 'Stack Overflow name', profile.stackoverflow?.name ?? '')}
        {textField('twitter', 'Twitter', profile.twitter ?? '')}
        {textField('x', 'X', profile.x ?? '')}
        {textField('skype', 'Skype', profile.skype ?? '')}
        {textField('reddit', 'Reddit', profile.reddit ?? '')}
        {textField('medium', 'Medium', profile.medium ?? '')}
        {textField('kaggle', 'Kaggle', profile.kaggle ?? '')}
        {textField('hackerrank', 'HackerRank', profile.hackerrank ?? '')}
        {textField('telegram', 'Telegram', profile.telegram ?? '')}
        {nestedField('googleScholar', 'id', 'Google Scholar ID', profile.googleScholar?.id ?? '')}
        {nestedField('googleScholar', 'name', 'Google Scholar name', profile.googleScholar?.name ?? '')}
        {textField('extraInfo', 'Extra info', profile.extraInfo ?? '')}
        {textField('quote', 'Quote', profile.quote ?? '')}
      </div>
      <div className="items profile-highlight-list">
        <div className="subhead">
          <div>
            <h3>Profile highlights</h3>
            <span className="subhead-meta">{visibleHighlightCount} visible on resume</span>
          </div>
          <button aria-label="Add profile highlight" onClick={() => onChange((r) => updateProfileHighlights(r, [...profileHighlightsForResume(r), { id: createId('highlight'), text: '' }]))}>
            <Plus />Add highlight
          </button>
        </div>
        {!highlightsWillCompile && highlights.length > 0 && (
          <div className="profile-highlight-warning">
            <div><strong>Summary disabled</strong><span>Profile highlights are saved, but they will not compile until the Summary module is enabled.</span></div>
          </div>
        )}
        {!highlights.length && (
          <div className="profile-highlight-empty"><strong>No highlights yet</strong><span>Add short, outcome-focused bullets for the top profile block.</span></div>
        )}
        {highlights.map((item, index) => (
          <div className={`highlight-row${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
            <span className="highlight-num" aria-hidden="true">{index + 1}</span>
            <WysiwygEditor ariaLabel="Profile highlight item" value={item.text} placeholder="Led a 4-person migration that reduced report generation time by 38%."
              showToolbar={false}
              onChange={(v) => onChange((r) => updateProfileHighlight(r, index, { text: v }))} />
            <button className="ghost-button item-hide" aria-label={item.hidden ? `Show profile highlight ${index + 1}` : `Hide profile highlight ${index + 1}`}
              onClick={() => onChange((r) => updateProfileHighlight(r, index, { hidden: !item.hidden }))}>
              {item.hidden ? <EyeOff /> : <Eye />}
            </button>
            <button className="ghost-button danger item-delete" aria-label={`Remove profile highlight ${index + 1}`}
              onClick={() => onChange((r) => updateProfileHighlights(r, profileHighlightsForResume(r).filter((_, i) => i !== index)))}>
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Drag-reorder hook (shared by section and subsection editors) ---

const useDragOrder = (count: number, onReorder: (from: number, to: number) => void) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const rowHeights = useRef<number[]>([]);
  const rowTops = useRef<number[]>([]);
  const grabOffset = useRef(0);

  const onGripDown = (e: React.PointerEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!listRef.current) return;
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    rowHeights.current = rows.map((r) => r.getBoundingClientRect().height);
    rowTops.current = rows.map((r) => r.getBoundingClientRect().top);
    grabOffset.current = e.clientY - rowTops.current[index];
    listRef.current.setPointerCapture(e.pointerId);
    setDragIndex(index);
    setOverIndex(index);
    setPointerY(e.clientY);
  };

  const onMove = (e: React.PointerEvent) => {
    if (dragIndex === null) return;
    setPointerY(e.clientY);
    let newOver = count - 1;
    for (let i = 0; i < count; i++) {
      if (rowTops.current[i] + rowHeights.current[i] / 2 > e.clientY) { newOver = i; break; }
    }
    if (newOver !== overIndex) setOverIndex(newOver);
  };

  const onUp = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      onReorder(dragIndex, overIndex);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const getStyle = (index: number): React.CSSProperties => {
    if (dragIndex === null || overIndex === null) return {};
    if (index === dragIndex) {
      const dy = pointerY - grabOffset.current - rowTops.current[index];
      return { transform: `translateY(${dy}px) scale(1.02)`, position: 'relative', zIndex: 100, boxShadow: '0 8px 24px rgba(27,27,24,0.14)', transition: 'box-shadow 150ms ease' };
    }
    const gap = 12;
    const h = (rowHeights.current[dragIndex] ?? 44) + gap;
    if (dragIndex < overIndex && index > dragIndex && index <= overIndex) return { transform: `translateY(-${h}px)`, transition: 'transform 150ms ease' };
    if (dragIndex > overIndex && index >= overIndex && index < dragIndex) return { transform: `translateY(${h}px)`, transition: 'transform 150ms ease' };
    return { transition: 'transform 150ms ease' };
  };

  return { listRef, dragIndex, onGripDown, onMove, onUp, getStyle };
};

// --- Flex section editor ---

const FlexSectionEditor = ({ section, onChange, sectionEnvs, entryTypes }: {
  section: FlexSection;
  onChange: (recipe: (r: ResumeRecord) => ResumeRecord) => void;
  sectionEnvs: SectionEnvDefinition[];
  entryTypes: EntryTypeDefinition[];
}) => {
  const [addOpen, setAddOpen] = useState<'subsection' | 'entry' | null>(null);

  const updateSection = (patch: Partial<FlexSection>) =>
    onChange((r) => touchResume({ ...r, content: { ...r.content, flexSections: r.content.flexSections.map((s) => s.id === section.id ? { ...s, ...patch } : s) } }));

  const addSubSection = (envId: string) => {
    const newSub: FlexSubSection = { id: createId('sub'), environment: envId, items: [] };
    updateSection({ items: [...section.items, newSub] });
    setAddOpen(null);
  };

  const addDirectEntry = (typeId: string) => {
    const newEntry: FlexEntry = { id: createId('entry'), type: typeId, fields: {} };
    updateSection({ items: [...section.items, newEntry] });
    setAddOpen(null);
  };

  const updateItem = (index: number, updated: FlexSection['items'][number]) =>
    updateSection({ items: section.items.map((it, i) => i === index ? updated : it) });

  const removeItem = (index: number) =>
    updateSection({ items: section.items.filter((_, i) => i !== index) });

  const drag = useDragOrder(section.items.length, (from, to) => {
    const items = [...section.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    updateSection({ items });
  });

  return (
    <div className="section-card items">
      {section.items.length === 0 && addOpen === null && (
        <div className="empty-section-hint">
          <strong>This section is empty</strong>
          <span>{sectionEnvs.length > 0 ? 'Add a sub-section or entry below to get started.' : 'Add an entry below to get started.'}</span>
        </div>
      )}
      <div
        ref={drag.listRef}
        className={`drag-list${drag.dragIndex !== null ? ' is-dragging' : ''}`}
        onPointerMove={drag.onMove}
        onPointerUp={drag.onUp}
        onPointerCancel={drag.onUp}
      >
        {section.items.map((item, index) => {
          if (isHeading(item)) {
            return (
              <div key={item.id} style={drag.getStyle(index)}>
                <article className="item-card">
                  <div className="item-card-head">
                    <GripVertical className="drag-grip" aria-hidden="true" onPointerDown={(e) => drag.onGripDown(e, index)} />
                    <strong>— Subsection heading —</strong>
                    <button className="ghost-button danger item-delete" aria-label="Remove heading" onClick={() => removeItem(index)}><Trash2 /></button>
                  </div>
                  <WysiwygEditor label="Heading text" value={item.text} showToolbar={false} singleLine={true}
                    onChange={(v) => updateItem(index, { ...item, text: v })} />
                </article>
              </div>
            );
          }
          if (isSubSection(item)) {
            return (
              <div key={item.id} style={drag.getStyle(index)}>
                <FlexSubSectionEditor sub={item} sectionEnvs={sectionEnvs} entryTypes={entryTypes}
                  onUpdate={(updated) => updateItem(index, updated)} onRemove={() => removeItem(index)}
                  onGripDown={(e) => drag.onGripDown(e, index)} />
              </div>
            );
          }
          return (
            <div key={(item as FlexEntry).id} style={drag.getStyle(index)}>
              <FlexEntryEditor entry={item as FlexEntry} entryTypes={entryTypes}
                onUpdate={(updated) => updateItem(index, updated)} onRemove={() => removeItem(index)}
                onGripDown={(e) => drag.onGripDown(e, index)} />
            </div>
          );
        })}
      </div>

      <div className="section-add-footer">
        {addOpen === 'subsection' ? (
          <div className="add-type-picker">
            <div className="add-type-header">
              <span>Choose sub-section type</span>
              <button className="add-type-cancel-btn" onClick={() => setAddOpen(null)} aria-label="Cancel">×</button>
            </div>
            <div className="add-type-pills">
              {sectionEnvs.map((env) => (
                <button key={env.id} className="add-type-pill" onClick={() => addSubSection(env.id)}>{env.label}</button>
              ))}
            </div>
          </div>
        ) : addOpen === 'entry' ? (
          <div className="add-type-picker">
            <div className="add-type-header">
              <span>Choose entry type</span>
              <button className="add-type-cancel-btn" onClick={() => setAddOpen(null)} aria-label="Cancel">×</button>
            </div>
            <div className="add-type-pills">
              {entryTypes.map((et) => (
                <button key={et.id} className="add-type-pill" onClick={() => addDirectEntry(et.id)}>{et.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="add-footer-row">
            {sectionEnvs.length > 0 && (
              <button className="add-footer-btn" onClick={() => sectionEnvs.length === 1 ? addSubSection(sectionEnvs[0].id) : setAddOpen('subsection')}>
                <Plus />Sub-section{sectionEnvs.length > 1 && <ChevronDown />}
              </button>
            )}
            {entryTypes.length > 0 && (
              <button className="add-footer-btn" onClick={() => entryTypes.length === 1 ? addDirectEntry(entryTypes[0].id) : setAddOpen('entry')}>
                <Plus />Entry{entryTypes.length > 1 && <ChevronDown />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Flex sub-section editor ---

const FlexSubSectionEditor = ({ sub, sectionEnvs, entryTypes, onUpdate, onRemove, onGripDown }: {
  sub: FlexSubSection;
  sectionEnvs: SectionEnvDefinition[];
  entryTypes: EntryTypeDefinition[];
  onUpdate: (sub: FlexSubSection) => void;
  onRemove: () => void;
  onGripDown: (e: React.PointerEvent) => void;
}) => {
  const envDef = sectionEnvs.find((e) => e.id === sub.environment);
  const allowedEntryTypes = entryTypes.filter((et) => envDef?.allowedEntryTypeIds.includes(et.id) ?? true);
  const usesInlineHeading = sub.environment === 'cvsubsection' || sub.environment === 'cvitems';
  const subSectionLabel = sub.environment === 'cvitems'
    ? 'CV Subsection'
    : (envDef?.label ?? sub.environment);
  const [addOpen, setAddOpen] = useState(false);

  const addEntry = (typeId: string) => {
    const newEntry: FlexEntry = { id: createId('entry'), type: typeId, fields: {} };
    onUpdate({ ...sub, items: [...sub.items, newEntry] });
    setAddOpen(false);
  };

  const addHeading = () => {
    const heading: CvSubsectionHeading = { id: createId('heading'), kind: 'subsection-heading', text: '' };
    onUpdate({ ...sub, items: [...sub.items, heading] });
  };

  const updateSubItem = (index: number, updated: FlexSubSection['items'][number]) =>
    onUpdate({ ...sub, items: sub.items.map((it, i) => i === index ? updated : it) });

  const removeSubItem = (index: number) =>
    onUpdate({ ...sub, items: sub.items.filter((_, i) => i !== index) });

  const drag = useDragOrder(sub.items.length, (from, to) => {
    const items = [...sub.items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    onUpdate({ ...sub, items });
  });

  return (
    <article className={`item-card sub-section-card${sub.hidden ? ' item-hidden' : ''}`}>
      <div className="item-card-head">
        <GripVertical className="drag-grip" aria-hidden="true" onPointerDown={onGripDown} />
        <strong>{subSectionLabel}</strong>
        <button className="ghost-button item-hide" aria-label={sub.hidden ? 'Show sub-section' : 'Hide sub-section'} onClick={() => onUpdate({ ...sub, hidden: !sub.hidden })}>
          {sub.hidden ? <EyeOff /> : <Eye />}
        </button>
        <button className="ghost-button danger item-delete" aria-label="Remove sub-section" onClick={onRemove}><Trash2 /></button>
      </div>

      {usesInlineHeading && (
        <WysiwygEditor label="Subsection name" value={sub.heading ?? ''} showToolbar={false} singleLine={true}
          onChange={(v) => onUpdate({ ...sub, heading: v })} />
      )}

      {sub.items.length === 0 && !addOpen && (
        <div className="empty-section-hint empty-section-hint-sm">
          <span>No entries yet — add one below.</span>
        </div>
      )}

      <div
        ref={drag.listRef}
        className={`drag-list${drag.dragIndex !== null ? ' is-dragging' : ''}`}
        onPointerMove={drag.onMove}
        onPointerUp={drag.onUp}
        onPointerCancel={drag.onUp}
      >
        {sub.items.map((item, index) => {
          if (isHeading(item)) {
            return (
              <div key={item.id} style={drag.getStyle(index)}>
                <article className="item-card">
                  <div className="item-card-head">
                    <GripVertical className="drag-grip" aria-hidden="true" onPointerDown={(e) => drag.onGripDown(e, index)} />
                    <strong>— Heading —</strong>
                    <button className="ghost-button danger item-delete" aria-label="Remove heading" onClick={() => removeSubItem(index)}><Trash2 /></button>
                  </div>
                  <WysiwygEditor label="Heading text" value={item.text} showToolbar={false} singleLine={true}
                    onChange={(v) => updateSubItem(index, { ...item, text: v })} />
                </article>
              </div>
            );
          }
          return (
            <div key={(item as FlexEntry).id} style={drag.getStyle(index)}>
              <FlexEntryEditor entry={item as FlexEntry} entryTypes={entryTypes}
                onUpdate={(updated) => updateSubItem(index, updated)} onRemove={() => removeSubItem(index)}
                onGripDown={(e) => drag.onGripDown(e, index)} />
            </div>
          );
        })}
      </div>

      <div className="section-add-footer subsection-add-footer">
        {addOpen ? (
          <div className="add-type-picker">
            <div className="add-type-header">
              <span>Choose entry type</span>
              <button className="add-type-cancel-btn" onClick={() => setAddOpen(false)} aria-label="Cancel">×</button>
            </div>
            <div className="add-type-pills">
              {allowedEntryTypes.map((et) => (
                <button key={et.id} className="add-type-pill" onClick={() => addEntry(et.id)}>{et.label}</button>
              ))}
              {envDef?.allowsSubsectionHeading && !usesInlineHeading && (
                <button className="add-type-pill add-type-pill-secondary" onClick={() => { addHeading(); setAddOpen(false); }}>Heading</button>
              )}
            </div>
          </div>
        ) : (
          <div className="add-footer-row">
            {allowedEntryTypes.length > 0 && (
              <button className="add-footer-btn add-footer-btn-sm" onClick={() => allowedEntryTypes.length === 1 ? addEntry(allowedEntryTypes[0].id) : setAddOpen(true)}>
                <Plus />{allowedEntryTypes.length === 1 ? allowedEntryTypes[0].label : 'Entry'}{allowedEntryTypes.length > 1 && <ChevronDown />}
              </button>
            )}
            {envDef?.allowsSubsectionHeading && !usesInlineHeading && (
              <button className="add-footer-btn add-footer-btn-sm add-footer-btn-ghost" onClick={addHeading}>
                <Plus />Heading
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

// --- Flex entry editor (adapter-driven) ---

const FlexEntryEditor = ({ entry, entryTypes, onUpdate, onRemove, onGripDown }: {
  entry: FlexEntry;
  entryTypes: EntryTypeDefinition[];
  onUpdate: (entry: FlexEntry) => void;
  onRemove: () => void;
  onGripDown: (e: React.PointerEvent) => void;
}) => {
  const typeDef = entryTypes.find((et) => et.id === entry.type);

  const updateField = (fieldId: string, value: string) =>
    onUpdate({ ...entry, fields: { ...entry.fields, [fieldId]: value } });

  return (
    <article className={`item-card${entry.hidden ? ' item-hidden' : ''}`}>
      <div className="item-card-head">
        <GripVertical className="drag-grip" aria-hidden="true" onPointerDown={onGripDown} />
        <strong>{typeDef?.label ?? entry.type}</strong>
        <button className="ghost-button item-hide" aria-label={entry.hidden ? 'Show entry' : 'Hide entry'} onClick={() => onUpdate({ ...entry, hidden: !entry.hidden })}>
          {entry.hidden ? <EyeOff /> : <Eye />}
        </button>
        <button className="ghost-button danger item-delete" aria-label="Remove entry" onClick={onRemove}><Trash2 /></button>
      </div>
      {typeDef?.fields.map((fd) => {
        const value = String(entry.fields[fd.id] ?? '');
        if (fd.multiline) {
          return <WysiwygEditor key={fd.id} label={fd.label} value={value} onChange={(v) => updateField(fd.id, v)} />;
        }
        return (
          <div key={fd.id} className="stacked-field">
            <span className="field-label">{fd.label}</span>
            <AiInput ariaLabel={fd.label} assistLabel={fd.label} value={value} onValue={(v) => updateField(fd.id, v)} />
          </div>
        );
      })}
    </article>
  );
};

// --- Shared UI primitives ---


const AiInput = ({
  ariaLabel,
  assistLabel,
  autoFocus,
  className,
  onBlur,
  onKeyDown,
  onValue,
  type = 'text',
  value
}: {
  ariaLabel: string;
  assistLabel: string;
  autoFocus?: boolean;
  className?: string;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValue: (value: string) => void;
  type?: string;
  value: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [draft, setDraft] = useState(value);
  const [selectionActive, setSelectionActive] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const updateSelectionActive = (event?: { clientX?: number; clientY?: number }) => {
    const el = inputRef.current;
    const active = Boolean(el && el.selectionStart !== el.selectionEnd);
    setSelectionActive(active);
    if (!active || !wrapRef.current) return;
    if (typeof event?.clientX === 'number' && typeof event.clientY === 'number') {
      const rect = wrapRef.current.getBoundingClientRect();
      setAnchorPosition({
        x: Math.max(8, event.clientX - rect.left),
        y: Math.max(8, event.clientY - rect.top)
      });
      return;
    }
    setAnchorPosition({ x: wrapRef.current.clientWidth - 28, y: 8 });
  };

  const update = (next: string) => {
    setDraft(next);
    onValue(next);
    requestAnimationFrame(() => updateSelectionActive());
  };

  return (
    <span className="ai-input-wrap" ref={wrapRef}>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={className}
        type={type}
        value={draft}
        onBlur={onBlur}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => { onKeyDown?.(e); requestAnimationFrame(() => updateSelectionActive()); }}
        onKeyUp={() => updateSelectionActive()}
        onMouseUp={(e) => updateSelectionActive(e)}
        onSelect={() => updateSelectionActive()}
      />
      <AiAssistButton
        anchorPosition={anchorPosition}
        fieldLabel={assistLabel}
        selectionActive={selectionActive}
        value={draft}
        onClose={() => setSelectionActive(false)}
        getValue={() => inputRef.current?.value ?? draft}
        getSelection={() => ({
          start: inputRef.current?.selectionStart ?? draft.length,
          end: inputRef.current?.selectionEnd ?? draft.length
        })}
        onApply={(next) => {
          update(next);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      />
    </span>
  );
};

type SectionEditorOnChange = (recipe: (r: ResumeRecord) => ResumeRecord) => void;

type ProfileTextFieldProps = {
  field: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>;
  hidden: boolean;
  label: string;
  onChange: SectionEditorOnChange;
  parseValue?: (value: string) => string | string[];
  type?: string;
  value: string;
};

const ProfileTextField = ({ field, hidden, label, onChange, parseValue, type = 'text', value }: ProfileTextFieldProps) => {
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`} data-field={`content.profile.${field}`}>
      <span className="field-label">{label}</span>
      <AiInput ariaLabel={label} assistLabel={label} type={type} value={value}
        onValue={(next) => onChange((r) => updateProfileField(r, field, parseValue ? parseValue(next) : next))} />
      <button className="ghost-button item-hide" aria-label={hidden ? `Show ${label}` : `Hide ${label}`} title={hidden ? `Show ${label}` : `Hide ${label}`}
        onClick={() => onChange((r) => toggleProfileField(r, field))}>
        {hidden ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
};

type ProfileNestedTextFieldProps = {
  group: 'stackoverflow' | 'googleScholar';
  hidden: boolean;
  keyName: 'id' | 'name';
  label: string;
  onChange: SectionEditorOnChange;
  value: string;
};

const ProfileNestedTextField = ({ group, hidden, keyName, label, onChange, value }: ProfileNestedTextFieldProps) => {
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`}>
      <span className="field-label">{label}</span>
      <AiInput ariaLabel={label} assistLabel={label} value={value} onValue={(next) => onChange((r) => updateNestedProfileField(r, group, keyName, next))} />
      <button className="ghost-button item-hide" aria-label={hidden ? `Show ${label}` : `Hide ${label}`} title={hidden ? `Show ${label}` : `Hide ${label}`}
        onClick={() => onChange((r) => toggleProfileField(r, group))}>
        {hidden ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
};

// --- Preview panel ---

const PreviewPanel = ({ activeTemplateName, artifact, busy, cleanCompile, pdfUrl }: {
  activeTemplateName: string; artifact?: CompileArtifact; busy: string; cleanCompile: boolean; pdfUrl: string;
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const formattedUrl = pdfUrl ? formatPdfPreviewUrl(pdfUrl) : '';
  const compileIssues = artifact?.status === 'failed' ? parseLatexDiagnostics({ diagnostics: artifact.logs, logs: artifact.logs }) : [];
  const previewIssue = compileIssues[0];

  return (
    <aside className="preview-pane" aria-label="Browser PDF preview">
      <div className="preview-status">
        <StatusPill icon={<FileCheck2 />} label="Layout" value={activeTemplateName} />
        <StatusPill icon={cleanCompile ? <CheckCircle2 /> : <Clock3 />} label="PDF" value={cleanCompile ? 'Clean' : artifact?.status ?? 'Stale'} tone={cleanCompile ? 'good' : 'warn'} />
      </div>
      {formattedUrl ? (
        <div className="preview-pdf-wrap">
          <iframe title="PDF preview" src={formattedUrl} />
          {busy && <div className="latex-recompile-overlay" aria-live="polite"><Loader2 className="latex-spin" aria-hidden="true" /><span>Recompiling…</span></div>}
        </div>
      ) : (
        <div className={previewIssue ? 'latex-paper-placeholder failed' : 'latex-paper-placeholder'} role={previewIssue ? 'alert' : undefined}>
          {previewIssue ? <AlertCircle /> : <FileCheck2 />}
          <h2>{previewIssue ? 'Compile needs attention' : busy ? 'Compiling…' : 'No preview yet'}</h2>
          {busy ? (
            <Loader2 className="latex-spin" aria-hidden="true" />
          ) : previewIssue ? (
            <>
              <p><strong>{previewIssue.title}</strong>{previewIssue.filePath ? ` in ${formatIssueLocation(previewIssue)}` : ''}</p>
              <p>{previewIssue.hint}</p>
            </>
          ) : (
            <p>Hit <strong>Compile</strong> or enable <strong>Auto</strong> to generate a live PDF preview.</p>
          )}
        </div>
      )}
      <div className={`log-drawer${showLogs ? ' open' : ''}`}>
        <div className="log-drawer-body-wrap" aria-hidden={!showLogs}>
          <div className="log-drawer-body">
            {busy ? (
              <div className="log-compiling-msg" aria-live="polite"><Loader2 className="latex-spin" aria-hidden="true" /><span>Compiling in browser…</span></div>
            ) : compileIssues.length ? (
              <>
                <div className="latex-diagnostics main-editor-diagnostics" aria-label="Compile issues">
                  {compileIssues.map((issue) => <CompileIssueCard key={issue.id} issue={issue} />)}
                </div>
                <pre>{artifact?.logs.join('\n') ?? 'No compile has run yet.'}</pre>
              </>
            ) : (
              <pre>{artifact?.logs.join('\n') ?? 'No compile has run yet.'}</pre>
            )}
          </div>
        </div>
        <button className="log-drawer-tab" onClick={() => setShowLogs((v) => !v)} aria-expanded={showLogs} aria-label={showLogs ? 'Hide compile logs' : 'Show compile logs'}>
          <Terminal className="log-drawer-tab-icon" aria-hidden="true" />
          <span>Compile Logs</span>
          {busy && <Loader2 className="latex-spin" aria-hidden="true" />}
          {!busy && cleanCompile && <CheckCircle2 className="log-status-icon good" aria-hidden="true" />}
          {!busy && !cleanCompile && artifact && <AlertCircle className="log-status-icon warn" aria-hidden="true" />}
          <span className="log-status-label">{busy ? 'Compiling…' : cleanCompile ? 'Clean' : artifact ? artifact.status : 'No output'}</span>
          <ChevronUp className="log-drawer-chevron" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

const CompileIssueCard = ({ issue }: { issue: LatexDiagnosticIssue }) => (
  <div className="latex-diagnostic-card static" role="note">
    <AlertCircle aria-hidden="true" />
    <span>
      <strong>{issue.title}</strong>
      <small>{formatIssueLocation(issue)}</small>
      <em>{issue.hint}</em>
      {issue.excerpt && <code>{issue.excerpt}</code>}
    </span>
  </div>
);

const formatIssueLocation = (issue: LatexDiagnosticIssue) => {
  const file = issue.filePath ?? 'Compiler log';
  return issue.line ? `${file}:${issue.line}` : file;
};

// --- Mini paper ---

const MiniPaper = ({ resume }: { resume: ResumeRecord }) => (
  <div className="mini-preview" aria-hidden="true">
    {resume.thumbnailDataUrl ? (
      <img src={resume.thumbnailDataUrl} alt="" className="mini-preview-thumb" />
    ) : (
      <div className="paper">
        <div className="paper-name">{resume.content.profile.fullName || resume.title}</div>
        <div className="paper-role">{resume.content.profile.headline || 'Resume'}</div>
        <div className="paper-rule" />
        {resume.content.flexSections.slice(0, 3).map((section) => (
          <div key={section.id}>
            <div className="paper-section">{section.name}</div>
            <div className="lines"><span className="line dark" /><span className="line mid" /><span className="line short" /></div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// --- Helper functions ---

const editField = (resume: ResumeRecord, field: string, update: (r: ResumeRecord) => ResumeRecord) => {
  const updated = update(resume);
  const reviewed = clearReviewMarkersForField(updated, field);
  return reviewed === updated ? touchResume(updated) : reviewed;
};

const updateProfileField = (resume: ResumeRecord, key: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>, value: string | string[]) =>
  editField(resume, `content.profile.${key}`, (next) => ({ ...next, content: { ...next.content, profile: { ...next.content.profile, [key]: value } } }));

const updateNestedProfileField = (resume: ResumeRecord, group: 'stackoverflow' | 'googleScholar', key: 'id' | 'name', value: string) =>
  editField(resume, `content.profile.${group}.${key}`, (next) => ({ ...next, content: { ...next.content, profile: { ...next.content.profile, [group]: { ...next.content.profile[group], [key]: value } } } }));

const toggleProfileField = (resume: ResumeRecord, field: ProfileFieldKey) => {
  const hiddenFields = new Set(resume.content.profile.hiddenFields ?? []);
  hiddenFields.has(field) ? hiddenFields.delete(field) : hiddenFields.add(field);
  return editField(resume, `content.profile.${field}`, (next) => ({ ...next, content: { ...next.content, profile: { ...next.content.profile, hiddenFields: [...hiddenFields] } } }));
};

const profileHighlightsForResume = (resume: ResumeRecord): ProfileHighlightItem[] => {
  if (resume.content.profileHighlights?.length) return resume.content.profileHighlights;
  return resume.content.summary.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((text, i) => ({ id: `summary-highlight-${i}`, text }));
};

const updateProfileHighlights = (resume: ResumeRecord, profileHighlights: ProfileHighlightItem[]) =>
  editField(resume, 'content.profileHighlights', (next) => ({ ...next, content: { ...next.content, summary: profileHighlights.map((item) => item.text).filter(Boolean).join('\n'), profileHighlights } }));

const updateProfileHighlight = (resume: ResumeRecord, index: number, patchValue: Partial<ProfileHighlightItem>) => {
  const profileHighlights = profileHighlightsForResume(resume).map((item, i) => i === index ? { ...item, ...patchValue } : item);
  return updateProfileHighlights(resume, profileHighlights);
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const resumeTextForReadiness = (resume: ResumeRecord) => [
  resume.title,
  resume.content.profile.fullName,
  resume.content.profile.headline,
  resume.content.profile.email,
  resume.content.profile.phone,
  resume.content.profile.location,
  (resume.content.profile.links ?? []).join(', '),
  resume.content.summary,
  ...(resume.content.profileHighlights ?? []).map((item) => item.text),
  ...resume.content.flexSections.flatMap((section) => [
    section.name,
    ...section.items.flatMap(readinessTextFromFlexItem)
  ])
].filter(Boolean).join('\n');

const readinessTextFromFlexItem = (item: FlexSection['items'][number]): string[] => {
  if (isHeading(item)) return [item.text];
  if (isSubSection(item)) return [item.environment, ...item.items.flatMap(readinessTextFromFlexItem)];
  return Object.values(item.fields).flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
};

const formatCompilerAssetState = (state: BusyTexAssetState, progress?: BusyTexAssetProgress) => {
  if (state === 'downloading' && progress?.bytesTotal) {
    return `downloading ${Math.round((progress.bytesLoaded / progress.bytesTotal) * 100)}%`;
  }
  return state.replaceAll('-', ' ');
};

const formatRelative = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};
