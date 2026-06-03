import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  Clock3,
  Copy,
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
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  Zap
} from 'lucide-react';
import { exportFitcvArchive, importFitcvArchive } from '../domain/archive';
import { runAtsChecks } from '../domain/checks';
import { clearReviewMarkersForField, duplicateResume, ensureTemplateLayouts, renameResume, sampleResume, starterResume, switchTemplate, touchResume } from '../domain/resume';
import { templates, getTemplate } from '../domain/templates';
import type {
  CompileArtifact,
  CvSubsectionHeading,
  EntryTypeDefinition,
  FittedCvRecord,
  FlexEntry,
  FlexSection,
  FlexSubSection,
  LayoutModule,
  ProfileFieldKey,
  ProfileHighlightItem,
  ResumeRecord,
  SectionEnvDefinition,
  TemplateId,
} from '../domain/types';
import { createId } from '../domain/ids';
import { storage } from '../services/storage';
import { LatexEditorRoute } from './LatexEditorRoute';
import { formatPdfPreviewUrl, parseLatexDiagnostics, type LatexDiagnosticIssue } from './latexUtils';
import { WysiwygEditor } from './WysiwygEditor';
import { downloadBlob, StatusPill } from './shared';
import { clampSpaceValue, defaultSpaceValue, hasTemplateAdapter, MAX_SPACE_VALUE, MIN_SPACE_VALUE } from '../domain/templateAdapters';

// --- Type guards ---

const isHeading = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is CvSubsectionHeading =>
  'kind' in item && (item as CvSubsectionHeading).kind === 'subsection-heading';

const isSubSection = (item: FlexEntry | FlexSubSection | CvSubsectionHeading): item is FlexSubSection =>
  'environment' in item;

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
  if (window.location.pathname === '/latexeditor') return <LatexEditorRoute />;

  const [loaded, setLoaded] = useState(false);
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [fittedCvs, setFittedCvs] = useState<FittedCvRecord[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [artifact, setArtifact] = useState<CompileArtifact>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ViewMode>('dashboard');
  const [autoCompile, setAutoCompile] = useState(false);
  const active = resumes.find((resume) => resume.id === activeId) ?? resumes[0];

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const compileGenRef = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    void hydrate();
  }, []);

  const hydrate = async () => {
    const [stored, pref, storedFittedCvs] = await Promise.all([
      storage.listResumes(),
      storage.getPreference(),
      storage.listFittedCvs(),
    ]);
    setFittedCvs(storedFittedCvs);
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
    if (artifact?.resumeId === resume.id && artifact.resumeVersion !== resume.version) {
      setArtifact({ ...artifact, status: 'stale' });
    }
  };

  const updateActive = (recipe: (resume: ResumeRecord) => ResumeRecord) => {
    if (!active) return;
    void save(recipe(structuredClone(active)));
  };

  const checks = useMemo(() => (active ? runAtsChecks(active) : []), [active]);
  const activeTemplate = active ? templates.find((template) => template.id === active.activeTemplateId) : undefined;
  const pdfUrl = useMemo(() => (
    artifact?.pdfBlob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(artifact.pdfBlob) : ''
  ), [artifact?.pdfBlob]);
  const reviewCount = active?.reviewMarkers.filter((marker) => marker.needsReview).length ?? 0;
  const warningCount = checks.filter((check) => check.status !== 'pass').length;
  const cleanCompile = artifact?.status === 'clean' && artifact.resumeVersion === active?.version;

  const compile = async (resumeOverride?: ResumeRecord) => {
    clearTimeout(debounceRef.current);
    const target = resumeOverride ?? activeRef.current;
    if (!target) return;
    const gen = ++compileGenRef.current;
    try {
      setBusy('Compiling in browser');
      setError('');
      const { compileResumeToPdf } = await import('../services/pdf');
      const result = await compileResumeToPdf(target);
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

  const saveThumbnail = async (resumeId: string, pdfBlob: Blob) => {
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
    if (!autoCompile || !active || mode !== 'editor') return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void compile(), 500);
    return () => clearTimeout(debounceRef.current);
  }, [active?.version, autoCompile]);

  const createBlank = () => { void save(starterResume()); setMode('editor'); };
  const cloneActive = () => { if (!active) return; void save(duplicateResume(active)); setMode('editor'); };
  const openResume = (resume: ResumeRecord) => { setActiveId(resume.id); setMode('editor'); void compile(resume); };

  const deleteResume = async (id: string) => {
    const target = resumes.find((r) => r.id === id);
    if (!target || !window.confirm(`Delete "${target.title}"? This only removes browser-local data.`)) return;
    await storage.deleteResume(id);
    const remaining = resumes.filter((r) => r.id !== id);
    setResumes(remaining);
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
    const [fittedCvs, jobDescriptions, scoringReports] = await Promise.all([storage.listFittedCvs(), storage.listJobDescriptions(), storage.listScoringReports()]);
    const file = await exportFitcvArchive({ resumes, artifacts: artifact ? [artifact] : [], fittedCvs, jobDescriptions, scoringReports });
    downloadBlob(file, file.name);
  };

  const importPdf = async (file: File) => {
    try {
      setBusy('Extracting PDF text');
      const { createResumeFromPdf } = await import('../services/importer');
      const resume = await createResumeFromPdf(file);
      await save(resume);
      setMode('editor');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF import failed.');
    } finally {
      setBusy('');
    }
  };

  if (!loaded) return <main className="empty">Loading FitCV…</main>;

  if (mode === 'dashboard' || !active) {
    return (
      <Dashboard
        resumes={resumes} fittedCvs={fittedCvs} active={active} reviewCount={reviewCount} warningCount={warningCount}
        busy={busy} error={error} onCreate={createBlank} onDuplicate={cloneActive} onOpen={openResume}
        onDelete={deleteResume} onImportPdf={importPdf} onImportArchive={importArchive} onExportArchive={exportArchive}
      />
    );
  }

  return (
    <EditorWorkspace
      active={active} activeTemplate={activeTemplate} artifact={artifact} autoCompile={autoCompile}
      busy={busy} cleanCompile={cleanCompile} error={error} pdfUrl={pdfUrl} reviewCount={reviewCount}
      onBack={() => setMode('dashboard')} onChange={updateActive} onCompile={() => void compile()}
      onDelete={deleteActive} onDownloadPdf={() => artifact?.pdfBlob && downloadBlob(artifact.pdfBlob, `${active.title}.pdf`)}
      onToggleAutoCompile={() => setAutoCompile((v) => !v)}
    />
  );
};

// --- Dashboard ---

const Dashboard = ({ resumes, fittedCvs, active, reviewCount, warningCount, busy, error, onCreate, onDuplicate, onOpen, onDelete, onImportPdf, onImportArchive, onExportArchive }: {
  resumes: ResumeRecord[]; fittedCvs: FittedCvRecord[]; active?: ResumeRecord; reviewCount: number; warningCount: number;
  busy: string; error: string; onCreate: () => void; onDuplicate: () => void; onOpen: (resume: ResumeRecord) => void;
  onDelete: (id: string) => void; onImportPdf: (file: File) => void; onImportArchive: (file: File) => void; onExportArchive: () => void;
}) => (
  <main className="dashboard-shell">
    <TopChrome label="Resume library">
      <label className="chrome-button"><Upload />PDF<input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && onImportPdf(e.target.files[0])} /></label>
      <label className="chrome-button"><FileArchive />Import<input type="file" accept=".fitcv,application/json" onChange={(e) => e.target.files?.[0] && onImportArchive(e.target.files[0])} /></label>
      <button className="chrome-button primary" onClick={onCreate}><FilePlus2 />New Resume</button>
    </TopChrome>
    <section className="dashboard-page" aria-labelledby="dashboard-heading">
      <div className="dashboard-head">
        <div>
          <h1 id="dashboard-heading">My Resumes</h1>
          <p>Base resumes stay canonical. Open one to edit content, tune layout, compile a local PDF, or duplicate it for a job-specific fit.</p>
        </div>
        <div className="status-row" aria-label="System status">
          <StatusPill icon={<CheckCircle2 />} label="Local first" value="Browser storage" tone="good" />
          <StatusPill icon={<ShieldCheck />} label="ATS" value={warningCount ? `${warningCount} warnings` : 'Clear'} tone={warningCount ? 'warn' : 'good'} />
          <StatusPill icon={<Eye />} label="Review" value={reviewCount ? `${reviewCount} fields` : 'Clear'} tone={reviewCount ? 'warn' : 'good'} />
        </div>
      </div>
      {busy && <div className="notice">{busy}</div>}
      {error && <div className="notice error">{error}</div>}
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
              <FilterItem label="ATS warnings" value={warningCount.toString()} />
            </ul>
          </section>
          <section className="filter-card" aria-label="Library actions">
            <h2>Actions</h2>
            <button className="filter-action" onClick={onDuplicate}><Copy />Duplicate active</button>
            <button className="filter-action" onClick={onExportArchive}><Download />Export backup</button>
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
              active={resume.id === active?.id} onOpen={() => onOpen(resume)} onDelete={() => onDelete(resume.id)} />
          ))}
        </section>
      </div>
    </section>
  </main>
);

// --- Editor workspace ---

const EditorWorkspace = ({ active, activeTemplate, artifact, autoCompile, busy, cleanCompile, error, pdfUrl, reviewCount, onBack, onChange, onCompile, onDelete, onDownloadPdf, onToggleAutoCompile }: {
  active: ResumeRecord; activeTemplate?: (typeof templates)[number]; artifact?: CompileArtifact; autoCompile: boolean;
  busy: string; cleanCompile: boolean; error: string; pdfUrl: string; reviewCount: number;
  onBack: () => void; onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void; onCompile: () => void; onDelete: () => void;
  onDownloadPdf: () => void; onToggleAutoCompile: () => void;
}) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string>();
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const selectedModule = activeLayout.find((m) => m.id === selectedModuleId) ?? activeLayout[0];

  useEffect(() => {
    if (!visibleLayoutTemplates.some((template) => template.id === active.activeTemplateId)) {
      onChange((resume) => switchTemplate(resume, 'awesome-cv'));
    }
  }, [active.activeTemplateId]);

  return (
    <main className="editor-shell">
      <header className="magic-chrome">
        <div className="magic-brand"><strong>FitCV</strong><span>/</span></div>
        <button className="ghost-button back-link" onClick={onBack}><ChevronLeft />Dashboard</button>
        <div className="resume-name-field">
          <input value={active.title} onChange={(e) => onChange((resume) => renameResume(resume, e.target.value))} aria-label="Resume title" />
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
        <div className="chrome-end-actions">
          <span className={cleanCompile ? 'backup-state clean' : 'backup-state'}>
            {cleanCompile ? <CheckCircle2 /> : <Clock3 />}{cleanCompile ? 'PDF ready' : 'Not backed up'}
          </span>
          <div className="chrome-action-group">
            <button className={`chrome-button${autoCompile ? ' selected' : ''}`} onClick={onToggleAutoCompile} title={autoCompile ? 'Auto-compile on' : 'Auto-compile off'}><Zap />Auto</button>
            <button className="chrome-button" onClick={onCompile} disabled={!!busy}><RotateCw />Compile</button>
            <button className="chrome-button primary" disabled={!artifact?.pdfBlob || artifact.status !== 'clean'} onClick={onDownloadPdf}><Download />Export</button>
          </div>
          <button className="ghost-button danger" onClick={onDelete}><Trash2 /></button>
        </div>
      </header>
      {error && <div className="notice editor-notice">{error}</div>}
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
    </main>
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

const ResumeGroup = ({ resume, fittedCvs, active, onOpen, onDelete }: { resume: ResumeRecord; fittedCvs: FittedCvRecord[]; active: boolean; onOpen: () => void; onDelete: () => void }) => {
  const template = templates.find((item) => item.id === resume.activeTemplateId);
  const checks = runAtsChecks(resume);
  const warnings = checks.filter((check) => check.status !== 'pass').length;
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
            <span>{warnings ? `${warnings} ATS warnings` : 'ATS clear'}</span>
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
          {fittedCvs.length > 0 ? fittedCvs.map((cv) => <FittedCvCard key={cv.id} fittedCv={cv} />) : <FitCardCta />}
        </div>
      </div>
    </article>
  );
};

const FittedCvCard = ({ fittedCv }: { fittedCv: FittedCvRecord }) => (
  <article className="fit-card">
    <div className="fit-top">
      <div className="doc-mini"><span /><span /><span /><span /></div>
      <div className="fit-title"><div className="company">Fitted CV</div><div className="role">{fittedCv.title}</div></div>
    </div>
    <div className="fit-footer">
      <span className="score high">{fittedCv.acceptedChangeIds.length} changes</span>
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
          <input
            aria-label="Section name"
            className="editor-subhead-input"
            value={label}
            onChange={(e) => renameSelectedModule(e.target.value)}
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
        <strong>{envDef?.label ?? sub.environment}</strong>
        <button className="ghost-button item-hide" aria-label={sub.hidden ? 'Show sub-section' : 'Hide sub-section'} onClick={() => onUpdate({ ...sub, hidden: !sub.hidden })}>
          {sub.hidden ? <EyeOff /> : <Eye />}
        </button>
        <button className="ghost-button danger item-delete" aria-label="Remove sub-section" onClick={onRemove}><Trash2 /></button>
      </div>

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
              {envDef?.allowsSubsectionHeading && (
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
            {envDef?.allowsSubsectionHeading && (
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
        return <WysiwygEditor key={fd.id} label={fd.label} value={value} onChange={(v) => updateField(fd.id, v)}
          showToolbar={fd.multiline} singleLine={!fd.multiline} />;
      })}
    </article>
  );
};

// --- Shared UI primitives ---


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
  const inputId = `profile-${field}`;
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`}>
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input id={inputId} type={type} value={value}
        onChange={(e) => onChange((r) => updateProfileField(r, field, parseValue ? parseValue(e.target.value) : e.target.value))} />
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
  const inputId = `profile-${group}-${keyName}`;
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`}>
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input id={inputId} value={value} onChange={(e) => onChange((r) => updateNestedProfileField(r, group, keyName, e.target.value))} />
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

const formatRelative = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};
