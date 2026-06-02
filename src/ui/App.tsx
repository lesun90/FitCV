import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronUp,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  GripVertical,
  Loader2,
  MoreHorizontal,
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
import { clearReviewMarkersForField, createResume, duplicateResume, ensureTemplateLayouts, renameResume, sampleResume, switchTemplate, touchResume } from '../domain/resume';
import { analyzeTemplateCompatibility, templates } from '../domain/templates';
import type { CompileArtifact, LayoutModule, ProfileFieldKey, ProfileHighlightItem, ResumeRecord, SectionKey, TemplateId } from '../domain/types';
import { createId } from '../domain/ids';
import { storage } from '../services/storage';
import { LatexEditorRoute } from './LatexEditorRoute';
import { formatPdfPreviewUrl } from './latexUtils';
import { downloadBlob, StatusPill } from './shared';
import { clampSpaceValue, defaultSpaceValue, getTemplateAdapter, hasTemplateAdapter, MAX_SPACE_VALUE, MIN_SPACE_VALUE } from '../domain/templateAdapters';

const sectionLabels: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
  awards: 'Awards',
  customSections: 'Custom sections'
};

const visibleLayoutTemplates = templates.filter((template) => template.id === 'awesome-cv');

const labelForLayoutModule = (module: LayoutModule) => {
  if (module.kind === 'space') return 'Space';
  if (module.kind === 'new-page') return 'New page';
  const title = typeof module.options?.title === 'string' ? module.options.title.trim() : '';
  if (title) return title;
  return sectionLabels[module.section];
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
      [resume.activeTemplateId]: layout.map((module) => (module.id === moduleId ? recipe(module) : module))
    }
  });
};

type ViewMode = 'dashboard' | 'editor';


export const App = () => {
  if (window.location.pathname === '/latexeditor') return <LatexEditorRoute />;

  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
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
    const stored = await storage.listResumes();
    if (stored.length === 0) {
      const seed = sampleResume();
      await storage.saveResume(seed);
      setResumes([seed]);
      setActiveId(seed.id);
      return;
    }
    const sorted = stored.map(ensureTemplateLayouts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setResumes(sorted);
    setActiveId((await storage.getPreference())?.activeResumeId ?? sorted[0].id);
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
  const compatibility = useMemo(() => (active ? analyzeTemplateCompatibility(active, active.activeTemplateId) : undefined), [active]);
  const activeTemplate = active ? templates.find((template) => template.id === active.activeTemplateId) : undefined;
  const pdfUrl = useMemo(() => (
    artifact?.pdfBlob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(artifact.pdfBlob) : ''
  ), [artifact?.pdfBlob]);
  const reviewCount = active?.reviewMarkers.filter((marker) => marker.needsReview).length ?? 0;
  const warningCount = checks.filter((check) => check.status !== 'pass').length;
  const cleanCompile = artifact?.status === 'clean' && artifact.resumeVersion === active?.version;

  // Takes an optional resume override so we can compile the correct resume
  // immediately when switching sessions (before React state settles).
  const compile = async (resumeOverride?: ResumeRecord) => {
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
    } catch (caught) {
      if (gen !== compileGenRef.current) return;
      setError(caught instanceof Error ? caught.message : 'PDF compile failed.');
    } finally {
      if (gen === compileGenRef.current) setBusy('');
    }
  };

  // Auto-compile for structural changes (layout, add/delete): fires immediately
  // when the version changes and no text field is focused. Text-field edits
  // are handled separately via onBlur on the editor board so compile only
  // triggers after the user finishes typing, not on every keystroke.
  useEffect(() => {
    if (!autoCompile || !active || mode !== 'editor') return;
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void compile(), 500);
    return () => clearTimeout(debounceRef.current);
  }, [active?.version, autoCompile]);

  const createBlank = () => {
    void save(createResume('Untitled Resume', 'awesome-cv'));
    setMode('editor');
  };

  const cloneActive = () => {
    if (!active) return;
    void save(duplicateResume(active));
    setMode('editor');
  };

  const openResume = (resume: ResumeRecord) => {
    setActiveId(resume.id);
    setMode('editor');
    void compile(resume);
  };

  const deleteActive = async () => {
    if (!active || !window.confirm(`Delete "${active.title}"? This only removes browser-local data.`)) return;
    await storage.deleteResume(active.id);
    const remaining = resumes.filter((resume) => resume.id !== active.id);
    setResumes(remaining);
    setActiveId(remaining[0]?.id);
    setMode('dashboard');
  };

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
    const [fittedCvs, jobDescriptions, scoringReports] = await Promise.all([
      storage.listFittedCvs(),
      storage.listJobDescriptions(),
      storage.listScoringReports()
    ]);
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

  if (!active) return <main className="empty">Loading FitCV...</main>;

  if (mode === 'dashboard') {
    return (
      <Dashboard
        resumes={resumes}
        active={active}
        reviewCount={reviewCount}
        warningCount={warningCount}
        busy={busy}
        error={error}
        onCreate={createBlank}
        onDuplicate={cloneActive}
        onOpen={openResume}
        onImportPdf={importPdf}
        onImportArchive={importArchive}
        onExportArchive={exportArchive}
      />
    );
  }

  return (
    <EditorWorkspace
      active={active}
      activeTemplate={activeTemplate}
      artifact={artifact}
      autoCompile={autoCompile}
      busy={busy}
      cleanCompile={cleanCompile}
      error={error}
      pdfUrl={pdfUrl}
      reviewCount={reviewCount}
      unsupported={compatibility?.unsupportedSections ?? []}
      onBack={() => setMode('dashboard')}
      onChange={updateActive}
      onCompile={compile}
      onDelete={deleteActive}
      onDownloadPdf={() => artifact?.pdfBlob && downloadBlob(artifact.pdfBlob, `${active.title}.pdf`)}
      onToggleAutoCompile={() => setAutoCompile((v) => !v)}
    />
  );
};

const Dashboard = ({
  resumes,
  active,
  reviewCount,
  warningCount,
  busy,
  error,
  onCreate,
  onDuplicate,
  onOpen,
  onImportPdf,
  onImportArchive,
  onExportArchive
}: {
  resumes: ResumeRecord[];
  active: ResumeRecord;
  reviewCount: number;
  warningCount: number;
  busy: string;
  error: string;
  onCreate: () => void;
  onDuplicate: () => void;
  onOpen: (resume: ResumeRecord) => void;
  onImportPdf: (file: File) => void;
  onImportArchive: (file: File) => void;
  onExportArchive: () => void;
}) => (
  <main className="dashboard-shell">
    <TopChrome label="Resume library">
      <label className="chrome-button">
        <Upload />PDF
        <input type="file" accept="application/pdf" onChange={(event) => event.target.files?.[0] && onImportPdf(event.target.files[0])} />
      </label>
      <label className="chrome-button">
        <FileArchive />Import
        <input type="file" accept=".fitcv,application/json" onChange={(event) => event.target.files?.[0] && onImportArchive(event.target.files[0])} />
      </label>
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
          {resumes.map((resume) => (
            <ResumeGroup
              key={resume.id}
              resume={resume}
              active={resume.id === active.id}
              onOpen={() => onOpen(resume)}
              onDuplicate={onDuplicate}
            />
          ))}
        </section>
      </div>
    </section>
  </main>
);

const EditorWorkspace = ({
  active,
  activeTemplate,
  artifact,
  autoCompile,
  busy,
  cleanCompile,
  error,
  pdfUrl,
  reviewCount,
  unsupported,
  onBack,
  onChange,
  onCompile,
  onDelete,
  onDownloadPdf,
  onToggleAutoCompile,
}: {
  active: ResumeRecord;
  activeTemplate?: (typeof templates)[number];
  artifact?: CompileArtifact;
  autoCompile: boolean;
  busy: string;
  cleanCompile: boolean;
  error: string;
  pdfUrl: string;
  reviewCount: number;
  unsupported: SectionKey[];
  onBack: () => void;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  onCompile: () => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
  onToggleAutoCompile: () => void;
}) => {
  const [selectedSection, setSelectedSection] = useState<SectionKey>('experience');
  const [selectedModuleId, setSelectedModuleId] = useState<string>();
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const selectedModule = activeLayout.find((module) => module.id === selectedModuleId) ?? activeLayout.find((module) => module.kind === 'section' && module.section === selectedSection) ?? activeLayout[0];
  const editorSection = selectedModule?.kind === 'section' ? selectedModule.section : selectedSection;

  useEffect(() => {
    if (!visibleLayoutTemplates.some((template) => template.id === active.activeTemplateId)) {
      onChange((resume) => switchTemplate(resume, 'awesome-cv'));
    }
  }, [active.activeTemplateId]);

  return (
    <main className="editor-shell">
      <header className="magic-chrome">
        <div className="magic-brand">
          <strong>FitCV</strong>
          <span>/</span>
        </div>
        <button className="ghost-button back-link" onClick={onBack}><ChevronLeft />Dashboard</button>
        <div className="resume-name-field">
          <input value={active.title} onChange={(event) => onChange((resume) => renameResume(resume, event.target.value))} aria-label="Resume title" />
          <Pencil aria-hidden="true" />
        </div>
        <label className="top-layout-select">
          <span>Layout</span>
          <select
            aria-label="Layout"
            value={visibleLayoutTemplates.some((template) => template.id === active.activeTemplateId) ? active.activeTemplateId : 'awesome-cv'}
            onChange={(event) => onChange((resume) => switchTemplate(resume, event.target.value as TemplateId))}
          >
            {visibleLayoutTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <span className={cleanCompile ? 'backup-state clean' : 'backup-state'}>
          {cleanCompile ? <CheckCircle2 /> : <Clock3 />}
          {cleanCompile ? 'PDF ready' : 'Not backed up'}
        </span>
        <button
          className={`chrome-button${autoCompile ? ' selected' : ''}`}
          onClick={onToggleAutoCompile}
          aria-label={autoCompile ? 'Disable auto-compile' : 'Enable auto-compile'}
          title={autoCompile ? 'Auto-compile on (click to disable)' : 'Auto-compile off (click to enable)'}
        >
          <Zap />Auto
        </button>
        <button className="chrome-button" onClick={onCompile} disabled={!!busy}><RotateCw />Compile</button>
        <button className="chrome-button primary" disabled={!artifact?.pdfBlob || artifact.status !== 'clean'} onClick={onDownloadPdf}><Download />Export</button>
        <button className="ghost-button danger" onClick={onDelete}><Trash2 />Delete</button>
      </header>

      {error && <div className="notice editor-notice">{error}</div>}

      <section
        className="editor-board"
        aria-label="Editor workbench"
        onBlur={(e) => {
          if (!autoCompile) return;
          const { target } = e;
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            void onCompile();
          }
        }}
      >
        <StylePanel
          active={active}
          onChange={onChange}
          unsupported={unsupported}
          selectedModule={selectedModule}
          selectedSection={editorSection}
          onSelectModule={(module) => {
            setSelectedModuleId(module.id);
            if (module.kind === 'section') setSelectedSection(module.section);
          }}
          onSelectSection={(section) => {
            setSelectedSection(section);
            setSelectedModuleId(undefined);
          }}
        />
        <EditorPanel
          active={active}
          onChange={onChange}
          reviewCount={reviewCount}
          selectedModule={selectedModule}
          selectedSection={editorSection}
        />
        <PreviewPanel
          activeTemplateName={activeTemplate?.name ?? active.activeTemplateId}
          artifact={artifact}
          busy={busy}
          cleanCompile={cleanCompile}
          pdfUrl={pdfUrl}
        />
      </section>
    </main>
  );
};

const TopChrome = ({ label, children }: { label: string; children: ReactNode }) => (
  <header className="top-chrome">
    <div className="top-chrome-inner">
      <div className="brand">
        <span className="brand-mark">CV</span>
        <strong>FitCV</strong>
      </div>
      <span className="chrome-divider" />
      <span className="chrome-label">{label}</span>
      <div className="chrome-actions">{children}</div>
    </div>
  </header>
);

const FilterItem = ({ active = false, label, value }: { active?: boolean; label: string; value: string }) => (
  <li className={active ? 'filter-item active' : 'filter-item'}>
    <span>{label}</span>
    <strong>{value}</strong>
  </li>
);

const ResumeGroup = ({ resume, active, onOpen, onDuplicate }: { resume: ResumeRecord; active: boolean; onOpen: () => void; onDuplicate: () => void }) => {
  const template = templates.find((item) => item.id === resume.activeTemplateId);
  const checks = runAtsChecks(resume);
  const warnings = checks.filter((check) => check.status !== 'pass').length;

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
            <span>{resume.content.experience.length} roles</span>
            <span>{resume.content.skills.length} skills</span>
            <span>{warnings ? `${warnings} ATS warnings` : 'ATS clear'}</span>
          </div>
          <p className="summary">{resume.content.summary || 'No summary yet. Open the editor to add a focused positioning statement.'}</p>
          <div className="actions">
            <button className="button green" onClick={onOpen}><FolderOpen />Open Editor</button>
            <button className="button" onClick={onDuplicate}><Copy />Duplicate</button>
            <button className="button ghost"><MoreHorizontal />More</button>
          </div>
        </div>
      </div>

      <div className="fit-strip">
        <div className="strip-head">
          <h3>Resume status</h3>
          <p>Quick signals before opening</p>
        </div>
        <div className="fit-grid">
          <FitCard title="Profile completeness" value={resume.content.profile.email && resume.content.profile.phone ? 'Ready' : 'Needs contact'} tone={resume.content.profile.email && resume.content.profile.phone ? 'high' : 'mid'} />
          <FitCard title="Template coverage" value={template?.name ?? 'Template'} tone="high" />
          <FitCard title="Review markers" value={resume.reviewMarkers.filter((marker) => marker.needsReview).length ? 'Open' : 'Clear'} tone={resume.reviewMarkers.some((marker) => marker.needsReview) ? 'mid' : 'high'} />
        </div>
      </div>
    </article>
  );
};

const FitCard = ({ title, value, tone }: { title: string; value: string; tone: 'high' | 'mid' | 'low' }) => (
  <article className="fit-card">
    <div className="fit-top">
      <div className="doc-mini"><span /><span /><span /><span /></div>
      <div className="fit-title">
        <div className="company">{title}</div>
        <div className="role">{value}</div>
      </div>
    </div>
    <div className="fit-footer">
      <span className={`score ${tone}`}>{tone === 'high' ? 'OK' : tone === 'mid' ? '!' : 'Fix'}</span>
      <span className="compile">local</span>
      <span className="date">now</span>
    </div>
  </article>
);

const StylePanel = ({
  active,
  onChange,
  unsupported,
  selectedModule,
  selectedSection,
  onSelectModule,
  onSelectSection
}: {
  active: ResumeRecord;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  unsupported: SectionKey[];
  selectedModule?: LayoutModule;
  selectedSection: SectionKey;
  onSelectModule: (module: LayoutModule) => void;
  onSelectSection: (section: SectionKey) => void;
}) => {
  const usesLayoutModules = hasTemplateAdapter(active.activeTemplateId);
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const activeAdapter = getTemplateAdapter(active.activeTemplateId);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [pointerY, setPointerY] = useState<number>(0);
  const [showAddModule, setShowAddModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string>();
  const listRef = useRef<HTMLDivElement>(null);
  const rowHeights = useRef<number[]>([]);
  const rowTops = useRef<number[]>([]);
  const grabOffset = useRef<number>(0);

  const reorder = (from: SectionKey, to: SectionKey) => {
    onChange((resume) => {
      const order = [...resume.sectionOrder];
      const fi = order.indexOf(from);
      const ti = order.indexOf(to);
      if (fi === -1 || ti === -1) return resume;
      order.splice(fi, 1);
      order.splice(ti, 0, from);
      return touchResume({ ...resume, sectionOrder: order });
    });
  };

  const removeModule = (moduleId: string) => {
    onChange((resume) => {
      const layout = (resume.templateLayouts[resume.activeTemplateId] ?? []).filter((m) => m.id !== moduleId);
      return touchResume({ ...resume, templateLayouts: { ...resume.templateLayouts, [resume.activeTemplateId]: layout } });
    });
  };

  const renameSectionModule = (moduleId: string, title: string) => {
    onChange((resume) => updateLayoutModule(resume, moduleId, (module) => {
      if (module.kind !== 'section') return module;
      return {
        ...module,
        options: {
          ...(module.options ?? {}),
          title
        }
      };
    }));
  };

  const addLayoutControlModule = (kind: 'space' | 'new-page') => {
    const newModule: LayoutModule = kind === 'space'
      ? { id: createId('module-space'), kind: 'space', enabled: true, value: defaultSpaceValue }
      : { id: createId('module-new-page'), kind: 'new-page', enabled: true };
    onChange((resume) => {
      const layout = [...(resume.templateLayouts[resume.activeTemplateId] ?? [])];
      return touchResume({ ...resume, templateLayouts: { ...resume.templateLayouts, [resume.activeTemplateId]: [...layout, newModule] } });
    });
    onSelectModule(newModule);
    setShowAddModule(false);
  };

  const addSectionModule = (sectionType: NonNullable<typeof activeAdapter>['sectionTypes'][number]) => {
    const customSectionId = sectionType.section === 'customSections' ? createId('custom') : undefined;
    const newModule: LayoutModule = {
      id: createId(`module-${sectionType.section}`),
      kind: 'section',
      section: sectionType.section,
      sectionType: sectionType.id,
      enabled: true,
      ...(customSectionId ? { options: { customSectionId } } : {})
    };
    onChange((resume) => {
      const layout = [...(resume.templateLayouts[resume.activeTemplateId] ?? [])];
      const content = customSectionId
        ? { ...resume.content, customSections: [...resume.content.customSections, { id: customSectionId, title: '', body: '' }] }
        : resume.content;
      return touchResume({
        ...resume,
        content,
        templateLayouts: { ...resume.templateLayouts, [resume.activeTemplateId]: [...layout, newModule] }
      });
    });
    onSelectModule(newModule);
    setShowAddModule(false);
  };

  const reorderModule = (fromId: string, toId: string) => {
    onChange((resume) => {
      const layout = [...(resume.templateLayouts[resume.activeTemplateId] ?? [])];
      const fi = layout.findIndex((module) => module.id === fromId);
      const ti = layout.findIndex((module) => module.id === toId);
      if (fi === -1 || ti === -1) return resume;
      const [moved] = layout.splice(fi, 1);
      layout.splice(ti, 0, moved);
      return touchResume({ ...resume, templateLayouts: { ...resume.templateLayouts, [resume.activeTemplateId]: layout } });
    });
  };

  const moveModule = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= activeLayout.length) return;
    reorderModule(activeLayout[index].id, activeLayout[nextIndex].id);
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= active.sectionOrder.length) return;
    reorder(active.sectionOrder[index], active.sectionOrder[nextIndex]);
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
    const n = usesLayoutModules ? activeLayout.length : active.sectionOrder.length;
    let newOver = n - 1;
    for (let i = 0; i < n; i++) {
      if (rowTops.current[i] + rowHeights.current[i] / 2 > e.clientY) {
        newOver = i;
        break;
      }
    }
    if (newOver !== overIndex) setOverIndex(newOver);
  };

  const handleListPointerUp = () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      if (usesLayoutModules) {
        reorderModule(activeLayout[dragIndex].id, activeLayout[overIndex].id);
      } else {
        reorder(active.sectionOrder[dragIndex], active.sectionOrder[overIndex]);
      }
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  const getItemStyle = (index: number): React.CSSProperties => {
    if (dragIndex === null || overIndex === null) return {};
    if (index === dragIndex) {
      const dy = pointerY - grabOffset.current - rowTops.current[index];
      return {
        transform: `translateY(${dy}px) scale(1.02)`,
        transition: 'box-shadow 150ms ease',
        position: 'relative',
        zIndex: 100,
        boxShadow: '0 8px 24px rgba(27,27,24,0.14)',
      };
    }
    const gap = 8;
    const h = (rowHeights.current[dragIndex] ?? 42) + gap;
    if (dragIndex < overIndex && index > dragIndex && index <= overIndex) {
      return { transform: `translateY(-${h}px)` };
    }
    if (dragIndex > overIndex && index >= overIndex && index < dragIndex) {
      return { transform: `translateY(${h}px)` };
    }
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
            const label = labelForLayoutModule(module);
            const isHidden = !module.enabled;
            return (
              <div
                key={module.id}
                style={getItemStyle(index)}
                className={[
                  'module-row',
                  module.id === selectedModule?.id ? 'selected' : '',
                  isHidden ? 'hidden' : '',
                  dragIndex === index ? 'dragging' : '',
                ].filter(Boolean).join(' ')}
              >
                <GripVertical
                  aria-hidden="true"
                  onPointerDown={(e) => handleGripPointerDown(e, index)}
                />
                {module.kind === 'section' && editingModuleId === module.id ? (
                  <input
                    aria-label={`Section name for ${label}`}
                    className="module-name-input"
                    value={label}
                    onChange={(e) => renameSectionModule(module.id, e.target.value)}
                    onBlur={() => setEditingModuleId(undefined)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.currentTarget.blur();
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <button className="module-select-btn" onClick={() => onSelectModule(module)}>
                    {label}
                  </button>
                )}
                <div className="reorder-controls" aria-label={`Reorder ${label}`}>
                  <button
                    className="reorder-button"
                    disabled={index === 0}
                    onClick={() => moveModule(index, -1)}
                    aria-label={`Move ${label} up`}
                    title={`Move ${label} up`}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    className="reorder-button"
                    disabled={index === activeLayout.length - 1}
                    onClick={() => moveModule(index, 1)}
                    aria-label={`Move ${label} down`}
                    title={`Move ${label} down`}
                  >
                    <ArrowDown />
                  </button>
                </div>
                {module.kind === 'section' && (
                  <button
                    className="visibility-toggle"
                    onClick={() => setEditingModuleId(module.id)}
                    aria-label={`Edit ${label}`}
                  >
                    <Pencil />
                  </button>
                )}
                <button
                  className="visibility-toggle"
                  onClick={() =>
                    onChange((resume) => updateLayoutModule(resume, module.id, (item) => ({ ...item, enabled: !item.enabled })))
                  }
                  aria-label={`${module.enabled ? 'Disable' : 'Enable'} ${label}`}
                >
                  {module.enabled ? <Eye /> : <EyeOff />}
                </button>
                <button
                  className="visibility-toggle"
                  onClick={() => removeModule(module.id)}
                  aria-label={`Remove ${label}`}
                >
                  <Trash2 />
                </button>
              </div>
            );
          }) : active.sectionOrder.map((section, index) => {
            const isHidden = active.hiddenSections.includes(section);
            return (
              <div
                key={section}
                style={getItemStyle(index)}
                className={[
                  'module-row',
                  section === selectedSection ? 'selected' : '',
                  isHidden ? 'hidden' : '',
                  dragIndex === index ? 'dragging' : '',
                ].filter(Boolean).join(' ')}
              >
                <GripVertical
                  aria-hidden="true"
                  onPointerDown={(e) => handleGripPointerDown(e, index)}
                />
                <button className="module-select-btn" onClick={() => onSelectSection(section)}>
                  {sectionLabels[section]}
                </button>
                <div className="reorder-controls" aria-label={`Reorder ${sectionLabels[section]}`}>
                  <button
                    className="reorder-button"
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                    aria-label={`Move ${sectionLabels[section]} up`}
                    title={`Move ${sectionLabels[section]} up`}
                  >
                    <ArrowUp />
                  </button>
                  <button
                    className="reorder-button"
                    disabled={index === active.sectionOrder.length - 1}
                    onClick={() => moveSection(index, 1)}
                    aria-label={`Move ${sectionLabels[section]} down`}
                    title={`Move ${sectionLabels[section]} down`}
                  >
                    <ArrowDown />
                  </button>
                </div>
                <button
                  className="visibility-toggle"
                  onClick={() =>
                    onChange((resume) => {
                      const hidden = new Set(resume.hiddenSections);
                      hidden.has(section) ? hidden.delete(section) : hidden.add(section);
                      return touchResume({ ...resume, hiddenSections: [...hidden] });
                    })
                  }
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${sectionLabels[section]}`}
                >
                  {isHidden ? <EyeOff /> : <Eye />}
                </button>
              </div>
            );
          })}
          {showAddModule ? (
            <div className="add-module-picker">
              <div className="add-module-group">
                <span>Sections</span>
                {activeAdapter?.sectionTypes.map((sectionType) => (
                  <button
                    className="add-module-option"
                    key={sectionType.id}
                    onClick={() => addSectionModule(sectionType)}
                  >
                    <Plus />{sectionType.label}
                  </button>
                ))}
              </div>
              <div className="add-module-group">
                <span>Layout controls</span>
                <button className="add-module-option" onClick={() => addLayoutControlModule('space')}><Plus />Space</button>
                <button className="add-module-option" onClick={() => addLayoutControlModule('new-page')}><Plus />New page</button>
              </div>
              <button className="add-module-cancel" onClick={() => setShowAddModule(false)}>Cancel</button>
            </div>
          ) : (
            <button className="add-module" onClick={() => setShowAddModule(true)}><Plus />Add Module</button>
          )}
        </div>
      </div>

      {unsupported.length > 0 && (
        <p className="unsupported">
          Not shown in this template: {unsupported.map((s) => sectionLabels[s]).join(', ')}. Data is preserved.
        </p>
      )}
    </aside>
  );
};

const EditorPanel = ({
  active,
  onChange,
  reviewCount,
  selectedModule,
  selectedSection
}: {
  active: ResumeRecord;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  reviewCount: number;
  selectedModule?: LayoutModule;
  selectedSection: SectionKey;
}) => (
  <section className="panel editor" aria-label="Section editor">
    <div className="editor-subhead">{selectedModule ? labelForLayoutModule(selectedModule) : sectionLabels[selectedSection]}</div>
    <div className="section-editor" key={selectedModule?.id ?? selectedSection}>
      {selectedModule && selectedModule.kind !== 'section'
        ? renderLayoutControlEditor(selectedModule, onChange)
        : renderSectionEditor(selectedSection, active, onChange)}
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

const renderLayoutControlEditor = (
  module: Exclude<LayoutModule, { kind: 'section' }>,
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void
) => {
  if (module.kind === 'space') {
    const value = Number.isFinite(module.value) ? module.value : defaultSpaceValue;
    const updateSpaceValue = (rawValue: number) => {
      const nextValue = clampSpaceValue(rawValue);
      onChange((resume) => updateLayoutModule(resume, module.id, (item) => item.kind === 'space' ? { ...item, value: nextValue } : item));
    };
    return (
      <div className="section-card">
        <div className="subhead">
          <h3>Space</h3>
          <span className="template-chip">{module.enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div className="space-value-control">
          <label className="space-slider-label">
            <span>Space value: {value}pt</span>
            <input
              type="range"
              min={MIN_SPACE_VALUE}
              max={MAX_SPACE_VALUE}
              step={1}
              value={value}
              onChange={(e) => updateSpaceValue(Number(e.target.value))}
            />
          </label>
          <label className="space-number-field">
            <span>Value</span>
            <div>
              <input
                aria-label="Space value in points"
                type="number"
                min={MIN_SPACE_VALUE}
                max={MAX_SPACE_VALUE}
                step={1}
                value={value}
                onChange={(e) => updateSpaceValue(Number(e.target.value))}
              />
              <span>pt</span>
            </div>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card">
      <div className="subhead">
        <h3>New page</h3>
        <span className="template-chip">{module.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div className="segmented">
        <button
          className={module.enabled ? 'selected' : ''}
          onClick={() => onChange((resume) => updateLayoutModule(resume, module.id, (item) => ({ ...item, enabled: true })))}
        >
          Enable
        </button>
        <button
          className={!module.enabled ? 'selected' : ''}
          onClick={() => onChange((resume) => updateLayoutModule(resume, module.id, (item) => ({ ...item, enabled: false })))}
        >
          Disable
        </button>
      </div>
    </div>
  );
};

const renderSectionEditor = (
  section: SectionKey,
  active: ResumeRecord,
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void
): ReactNode => {
  switch (section) {
    case 'summary':     return <SummaryEditor active={active} onChange={onChange} />;
    case 'experience':  return <ExperienceEditor active={active} onChange={onChange} />;
    case 'education':   return <EducationEditor active={active} onChange={onChange} />;
    case 'projects':    return <ProjectsEditor active={active} onChange={onChange} />;
    case 'skills':      return <SkillsEditor active={active} onChange={onChange} />;
    case 'awards':      return <AwardsEditor active={active} onChange={onChange} />;
    case 'customSections': return <CustomSectionsEditor active={active} onChange={onChange} />;
  }
};

type SectionEditorProps = {
  active: ResumeRecord;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
};

const SummaryEditor = ({ active, onChange }: SectionEditorProps) => {
  const profile = active.content.profile;
  const highlights = profileHighlightsForResume(active);
  const hiddenFields = profile.hiddenFields ?? [];
  const activeLayout = active.templateLayouts[active.activeTemplateId] ?? [];
  const summaryModule = activeLayout.find((module) => module.kind === 'section' && module.section === 'summary');
  const usesLayoutModules = hasTemplateAdapter(active.activeTemplateId);
  const highlightsWillCompile = usesLayoutModules ? summaryModule?.enabled === true : !active.hiddenSections.includes('summary');
  const visibleHighlightCount = highlightsWillCompile
    ? highlights.filter((item) => !item.hidden && item.text.trim()).length
    : 0;
  const enableSummaryHighlights = () => onChange((resume) => {
    const layout = resume.templateLayouts[resume.activeTemplateId] ?? [];
    const existing = layout.find((module) => module.kind === 'section' && module.section === 'summary');
    if (existing) return updateLayoutModule(resume, existing.id, (module) => ({ ...module, enabled: true }));

    const sectionType = getTemplateAdapter(resume.activeTemplateId)?.sectionTypes.find((item) => item.section === 'summary');
    if (!sectionType) return resume;
    return touchResume({
      ...resume,
      templateLayouts: {
        ...resume.templateLayouts,
        [resume.activeTemplateId]: [
          {
            id: createId('module-summary'),
            kind: 'section',
            section: 'summary',
            sectionType: sectionType.id,
            enabled: true
          },
          ...layout
        ]
      }
    });
  });
  const textField = (
    field: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>,
    label: string,
    value: string,
    options: { type?: string; parseValue?: (value: string) => string | string[] } = {}
  ) => (
    <ProfileTextField
      field={field}
      hidden={hiddenFields.includes(field)}
      label={label}
      onChange={onChange}
      value={value}
      {...options}
    />
  );
  const nestedField = (
    group: 'stackoverflow' | 'googleScholar',
    keyName: 'id' | 'name',
    label: string,
    value: string
  ) => (
    <ProfileNestedTextField
      group={group}
      hidden={hiddenFields.includes(group)}
      keyName={keyName}
      label={label}
      onChange={onChange}
      value={value}
    />
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
            <span className="subhead-meta">
              {visibleHighlightCount} visible on resume
            </span>
          </div>
          <button
            aria-label="Add profile highlight"
            onClick={() => onChange((r) => updateProfileHighlights(r, [...profileHighlightsForResume(r), { id: createId('highlight'), text: '' }]))}
          >
            <Plus />Add highlight
          </button>
        </div>
        {!highlightsWillCompile && highlights.length > 0 && (
          <div className="profile-highlight-warning">
            <div>
              <strong>Summary disabled</strong>
              <span>Profile highlights are saved, but they will not compile until the Summary module is enabled.</span>
            </div>
            <button className="ghost-button" aria-label="Enable Summary highlights" onClick={enableSummaryHighlights}>
              <Eye />Enable
            </button>
          </div>
        )}
        {!highlights.length && (
          <div className="profile-highlight-empty">
            <strong>No highlights yet</strong>
            <span>Add short, outcome-focused bullets for the top profile block.</span>
          </div>
        )}
        {highlights.map((item, index) => (
          <article className={`profile-highlight-row${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
            <div className="profile-highlight-index" aria-hidden="true">{index + 1}</div>
            <div className="profile-highlight-body">
              <div className="profile-highlight-head">
                <div>
                  <strong>Highlight {index + 1}</strong>
                  <span>{item.hidden ? 'Hidden from resume' : highlightsWillCompile ? 'Visible on resume' : 'Not compiling'}</span>
                </div>
                <div className="profile-highlight-actions">
                  <button
                    className="ghost-button item-hide"
                    aria-label={item.hidden ? `Show profile highlight ${index + 1}` : `Hide profile highlight ${index + 1}`}
                    title={item.hidden ? 'Show highlight' : 'Hide highlight'}
                    onClick={() => onChange((r) => updateProfileHighlight(r, index, { hidden: !item.hidden }))}
                  >
                    {item.hidden ? <EyeOff /> : <Eye />}
                  </button>
                  <button
                    className="ghost-button danger item-delete"
                    aria-label={`Remove profile highlight ${index + 1}`}
                    title="Remove highlight"
                    onClick={() => onChange((r) => updateProfileHighlights(r, profileHighlightsForResume(r).filter((_, i) => i !== index)))}
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
              <label className="stacked-field profile-highlight-field">
                Profile highlight item
                <textarea
                  value={item.text}
                  rows={3}
                  placeholder="Led a 4-person migration that reduced report generation time by 38%."
                  onChange={(e) => onChange((r) => updateProfileHighlight(r, index, { text: e.target.value }))}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

const ExperienceEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Experience</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, experience: [...r.content.experience, { id: createId('exp'), company: '', role: '', location: '', startDate: '', endDate: '', highlights: [''] }] } }))}><Plus />Add</button>
    </div>
    {active.content.experience.map((item, index) => (
      <article className={`item-card${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.role || 'Untitled role'}</strong>
          <button
            className="ghost-button item-hide"
            aria-label={item.hidden ? 'Show entry' : 'Hide entry'}
            onClick={() => onChange((r) => updateExperience(r, index, { hidden: !item.hidden }))}
          >
            {item.hidden ? <EyeOff /> : <Eye />}
          </button>
          <button
            className="ghost-button danger item-delete"
            aria-label="Delete entry"
            onClick={() => onChange((r) => {
              const experience = r.content.experience.filter((_, i) => i !== index);
              return touchResume({ ...r, content: { ...r.content, experience } });
            })}
          >
            <Trash2 />
          </button>
        </div>
        <div className="field-grid two-col">
          <Field label="Role"><input value={item.role} onChange={(e) => onChange((r) => updateExperience(r, index, { role: e.target.value }))} /></Field>
          <Field label="Company"><input value={item.company} onChange={(e) => onChange((r) => updateExperience(r, index, { company: e.target.value }))} /></Field>
          <Field label="Location"><input value={item.location} onChange={(e) => onChange((r) => updateExperience(r, index, { location: e.target.value }))} /></Field>
          <Field label="Dates"><input value={[item.startDate, item.endDate].filter(Boolean).join(' - ')} onChange={(e) => onChange((r) => updateDates(r, index, e.target.value))} /></Field>
        </div>
        <label className="stacked-field">Highlights<textarea placeholder="One highlight per line" value={item.highlights.join('\n')} onChange={(e) => onChange((r) => updateExperience(r, index, { highlights: e.target.value.split('\n') }))} /></label>
      </article>
    ))}
  </div>
);

const EducationEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Education</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, education: [...r.content.education, { id: createId('edu'), school: '', degree: '', location: '', startDate: '', endDate: '', highlights: [''] }] } }))}><Plus />Add</button>
    </div>
    {active.content.education.map((item, index) => (
      <article className={`item-card${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.school || 'Untitled school'}</strong>
          <button
            className="ghost-button item-hide"
            aria-label={item.hidden ? 'Show entry' : 'Hide entry'}
            onClick={() => onChange((r) => updateEducation(r, index, { hidden: !item.hidden }))}
          >
            {item.hidden ? <EyeOff /> : <Eye />}
          </button>
          <button
            className="ghost-button danger item-delete"
            aria-label="Delete entry"
            onClick={() => onChange((r) => {
              const education = r.content.education.filter((_, i) => i !== index);
              return touchResume({ ...r, content: { ...r.content, education } });
            })}
          >
            <Trash2 />
          </button>
        </div>
        <div className="field-grid two-col">
          <Field label="School"><input value={item.school} onChange={(e) => onChange((r) => updateEducation(r, index, { school: e.target.value }))} /></Field>
          <Field label="Degree"><input value={item.degree} onChange={(e) => onChange((r) => updateEducation(r, index, { degree: e.target.value }))} /></Field>
          <Field label="Location"><input value={item.location} onChange={(e) => onChange((r) => updateEducation(r, index, { location: e.target.value }))} /></Field>
          <Field label="Dates"><input value={[item.startDate, item.endDate].filter(Boolean).join(' - ')} onChange={(e) => onChange((r) => updateEducationDates(r, index, e.target.value))} /></Field>
        </div>
        <label className="stacked-field">Highlights<textarea placeholder="One highlight per line" value={item.highlights.join('\n')} onChange={(e) => onChange((r) => updateEducation(r, index, { highlights: e.target.value.split('\n') }))} /></label>
      </article>
    ))}
  </div>
);

const ProjectsEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Projects</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, projects: [...r.content.projects, { id: createId('project'), name: '', description: '', highlights: [''], links: [] }] } }))}><Plus />Add</button>
    </div>
    {active.content.projects.map((item, index) => (
      <article className={`item-card${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.name || 'Untitled project'}</strong>
          <button
            className="ghost-button item-hide"
            aria-label={item.hidden ? 'Show entry' : 'Hide entry'}
            onClick={() => onChange((r) => updateProjects(r, index, { hidden: !item.hidden }))}
          >
            {item.hidden ? <EyeOff /> : <Eye />}
          </button>
          <button
            className="ghost-button danger item-delete"
            aria-label="Delete entry"
            onClick={() => onChange((r) => {
              const projects = r.content.projects.filter((_, i) => i !== index);
              return touchResume({ ...r, content: { ...r.content, projects } });
            })}
          >
            <Trash2 />
          </button>
        </div>
        <div className="field-grid two-col">
          <Field label="Name"><input value={item.name} onChange={(e) => onChange((r) => updateProjects(r, index, { name: e.target.value }))} /></Field>
          <Field label="Links"><input value={item.links.join(', ')} onChange={(e) => onChange((r) => updateProjects(r, index, { links: splitList(e.target.value) }))} /></Field>
        </div>
        <label className="stacked-field">Description<textarea value={item.description} onChange={(e) => onChange((r) => updateProjects(r, index, { description: e.target.value }))} /></label>
        <label className="stacked-field">Highlights<textarea placeholder="One highlight per line" value={item.highlights.join('\n')} onChange={(e) => onChange((r) => updateProjects(r, index, { highlights: e.target.value.split('\n') }))} /></label>
      </article>
    ))}
  </div>
);

const SkillsEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card">
    <label className="stacked-field">
      Skills
      <textarea
        placeholder="Comma-separated: React, TypeScript, Node.js"
        value={active.content.skills.join(', ')}
        onChange={(e) => onChange((r) => editField(r, 'content.skills', (resume) => ({ ...resume, content: { ...resume.content, skills: splitList(e.target.value) } })))}
      />
    </label>
  </div>
);

const AwardsEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card">
    <label className="stacked-field">
      Awards
      <textarea
        placeholder="One award per line"
        value={active.content.awards.join('\n')}
        onChange={(e) => onChange((r) => editField(r, 'content.awards', (resume) => ({ ...resume, content: { ...resume.content, awards: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })))}
      />
    </label>
  </div>
);

const CustomSectionsEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Custom sections</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, customSections: [...r.content.customSections, { id: createId('custom'), title: '', body: '' }] } }))}><Plus />Add</button>
    </div>
    {active.content.customSections.map((item, index) => (
      <article className={`item-card${item.hidden ? ' item-hidden' : ''}`} key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.title || 'Untitled section'}</strong>
          <button
            className="ghost-button item-hide"
            aria-label={item.hidden ? 'Show entry' : 'Hide entry'}
            onClick={() => onChange((r) => updateCustomSections(r, index, { hidden: !item.hidden }))}
          >
            {item.hidden ? <EyeOff /> : <Eye />}
          </button>
          <button
            className="ghost-button danger item-delete"
            aria-label="Delete entry"
            onClick={() => onChange((r) => {
              const customSections = r.content.customSections.filter((_, i) => i !== index);
              return touchResume({ ...r, content: { ...r.content, customSections } });
            })}
          >
            <Trash2 />
          </button>
        </div>
        <Field label="Title"><input value={item.title} onChange={(e) => onChange((r) => updateCustomSections(r, index, { title: e.target.value }))} /></Field>
        <label className="stacked-field">Body<textarea value={item.body} onChange={(e) => onChange((r) => updateCustomSections(r, index, { body: e.target.value }))} /></label>
      </article>
    ))}
  </div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="field-row">
    <span className="field-label">{label}</span>
    {children}
  </label>
);

type ProfileTextFieldProps = {
  field: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>;
  hidden: boolean;
  label: string;
  onChange: SectionEditorProps['onChange'];
  parseValue?: (value: string) => string | string[];
  type?: string;
  value: string;
};

const ProfileTextField = ({ field, hidden, label, onChange, parseValue, type = 'text', value }: ProfileTextFieldProps) => {
  const inputId = `profile-${field}`;
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`}>
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange((r) => updateProfileField(r, field, parseValue ? parseValue(e.target.value) : e.target.value))}
      />
      <button
        className="ghost-button item-hide"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        title={hidden ? `Show ${label}` : `Hide ${label}`}
        onClick={() => onChange((r) => toggleProfileField(r, field))}
      >
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
  onChange: SectionEditorProps['onChange'];
  value: string;
};

const ProfileNestedTextField = ({ group, hidden, keyName, label, onChange, value }: ProfileNestedTextFieldProps) => {
  const inputId = `profile-${group}-${keyName}`;
  return (
    <div className={`profile-field-row${hidden ? ' profile-field-hidden' : ''}`}>
      <label className="field-label" htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        value={value}
        onChange={(e) => onChange((r) => updateNestedProfileField(r, group, keyName, e.target.value))}
      />
      <button
        className="ghost-button item-hide"
        aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
        title={hidden ? `Show ${label}` : `Hide ${label}`}
        onClick={() => onChange((r) => toggleProfileField(r, group))}
      >
        {hidden ? <EyeOff /> : <Eye />}
      </button>
    </div>
  );
};

const PreviewPanel = ({
  activeTemplateName,
  artifact,
  busy,
  cleanCompile,
  pdfUrl,
}: {
  activeTemplateName: string;
  artifact?: CompileArtifact;
  busy: string;
  cleanCompile: boolean;
  pdfUrl: string;
}) => {
  const [showLogs, setShowLogs] = useState(false);
  const formattedUrl = pdfUrl ? formatPdfPreviewUrl(pdfUrl) : '';

  return (
    <aside className="preview-pane" aria-label="Browser PDF preview">
      <div className="preview-status">
        <StatusPill icon={<FileCheck2 />} label="Layout" value={activeTemplateName} />
        <StatusPill icon={cleanCompile ? <CheckCircle2 /> : <Clock3 />} label="PDF" value={cleanCompile ? 'Clean' : artifact?.status ?? 'Stale'} tone={cleanCompile ? 'good' : 'warn'} />
      </div>

      {formattedUrl ? (
        <div className="preview-pdf-wrap">
          <iframe title="PDF preview" src={formattedUrl} />
          {busy && (
            <div className="latex-recompile-overlay" aria-live="polite">
              <Loader2 className="latex-spin" aria-hidden="true" />
              <span>Recompiling…</span>
            </div>
          )}
        </div>
      ) : (
        <div className="latex-paper-placeholder">
          <FileCheck2 />
          <h2>{busy ? 'Compiling…' : 'No preview yet'}</h2>
          {busy ? (
            <Loader2 className="latex-spin" aria-hidden="true" />
          ) : (
            <p>Hit <strong>Compile</strong> or enable <strong>Auto</strong> to generate a live PDF preview.</p>
          )}
        </div>
      )}

      <div className={`log-drawer${showLogs ? ' open' : ''}`}>
        <div className="log-drawer-body-wrap" aria-hidden={!showLogs}>
          <div className="log-drawer-body">
            {busy ? (
              <div className="log-compiling-msg" aria-live="polite">
                <Loader2 className="latex-spin" aria-hidden="true" />
                <span>Compiling in browser…</span>
              </div>
            ) : (
              <pre>{artifact?.logs.join('\n') ?? 'No compile has run yet.'}</pre>
            )}
          </div>
        </div>
        <button
          className="log-drawer-tab"
          onClick={() => setShowLogs((v) => !v)}
          aria-expanded={showLogs}
          aria-label={showLogs ? 'Hide compile logs' : 'Show compile logs'}
        >
          <Terminal className="log-drawer-tab-icon" aria-hidden="true" />
          <span>Compile Logs</span>
          {busy && <Loader2 className="latex-spin" aria-hidden="true" />}
          {!busy && cleanCompile && <CheckCircle2 className="log-status-icon good" aria-hidden="true" />}
          {!busy && !cleanCompile && artifact && <AlertCircle className="log-status-icon warn" aria-hidden="true" />}
          <span className="log-status-label">
            {busy ? 'Compiling…' : cleanCompile ? 'Clean' : artifact ? artifact.status : 'No output'}
          </span>
          <ChevronUp className="log-drawer-chevron" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};

const MiniPaper = ({ resume }: { resume: ResumeRecord }) => (
  <div className="mini-preview" aria-hidden="true">
    <div className="paper">
      <div className="paper-name">{resume.content.profile.fullName || resume.title}</div>
      <div className="paper-role">{resume.content.profile.headline || 'Resume'}</div>
      <div className="paper-rule" />
      <div className="paper-section">Summary</div>
      <div className="lines"><span className="line dark" /><span className="line mid" /><span className="line short" /></div>
      <div className="paper-section">Experience</div>
      <div className="lines"><span className="line dark short" /><span className="line" /><span className="line mid" /><span className="line tiny" /></div>
      <div className="paper-section">Skills</div>
      <div className="lines"><span className="line mid" /><span className="line short" /></div>
    </div>
  </div>
);


const editField = (resume: ResumeRecord, field: string, update: (resume: ResumeRecord) => ResumeRecord) => {
  const updated = update(resume);
  const reviewed = clearReviewMarkersForField(updated, field);
  return reviewed === updated ? touchResume(updated) : reviewed;
};

const updateProfileField = (
  resume: ResumeRecord,
  key: Exclude<ProfileFieldKey, 'stackoverflow' | 'googleScholar'>,
  value: string | string[]
) =>
  editField(resume, `content.profile.${key}`, (next) => ({
    ...next,
    content: {
      ...next.content,
      profile: {
        ...next.content.profile,
        [key]: value
      }
    }
  }));

const updateNestedProfileField = (
  resume: ResumeRecord,
  group: 'stackoverflow' | 'googleScholar',
  key: 'id' | 'name',
  value: string
) =>
  editField(resume, `content.profile.${group}.${key}`, (next) => ({
    ...next,
    content: {
      ...next.content,
      profile: {
        ...next.content.profile,
        [group]: {
          ...next.content.profile[group],
          [key]: value
        }
      }
    }
  }));

const toggleProfileField = (resume: ResumeRecord, field: ProfileFieldKey) => {
  const hiddenFields = new Set(resume.content.profile.hiddenFields ?? []);
  hiddenFields.has(field) ? hiddenFields.delete(field) : hiddenFields.add(field);
  return editField(resume, `content.profile.${field}`, (next) => ({
    ...next,
    content: {
      ...next.content,
      profile: {
        ...next.content.profile,
        hiddenFields: [...hiddenFields]
      }
    }
  }));
};

const profileHighlightsForResume = (resume: ResumeRecord): ProfileHighlightItem[] => {
  if (resume.content.profileHighlights?.length) return resume.content.profileHighlights;
  return resume.content.summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({ id: `summary-highlight-${index}`, text }));
};

const updateProfileHighlights = (resume: ResumeRecord, profileHighlights: ProfileHighlightItem[]) =>
  editField(resume, 'content.profileHighlights', (next) => ({
    ...next,
    content: {
      ...next.content,
      summary: profileHighlights.map((item) => item.text).filter(Boolean).join('\n'),
      profileHighlights
    }
  }));

const updateProfileHighlight = (
  resume: ResumeRecord,
  index: number,
  patchValue: Partial<ProfileHighlightItem>
) => {
  const profileHighlights = profileHighlightsForResume(resume).map((item, itemIndex) => (
    itemIndex === index ? { ...item, ...patchValue } : item
  ));
  return updateProfileHighlights(resume, profileHighlights);
};

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const updateExperience = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['experience'][number]>) => {
  const experience = [...resume.content.experience];
  experience[index] = { ...experience[index], ...patchValue };
  return editField(resume, 'content.experience', (next) => ({ ...next, content: { ...next.content, experience } }));
};

const updateDates = (resume: ResumeRecord, index: number, value: string) => {
  const [startDate = '', endDate = ''] = value.split(' - ');
  return updateExperience(resume, index, { startDate, endDate });
};

const updateEducation = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['education'][number]>) => {
  const education = [...resume.content.education];
  education[index] = { ...education[index], ...patchValue };
  return editField(resume, 'content.education', (next) => ({ ...next, content: { ...next.content, education } }));
};

const updateEducationDates = (resume: ResumeRecord, index: number, value: string) => {
  const [startDate = '', endDate = ''] = value.split(' - ');
  return updateEducation(resume, index, { startDate, endDate });
};

const updateProjects = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['projects'][number]>) => {
  const projects = [...resume.content.projects];
  projects[index] = { ...projects[index], ...patchValue };
  return editField(resume, 'content.projects', (next) => ({ ...next, content: { ...next.content, projects } }));
};

const updateCustomSections = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['customSections'][number]>) => {
  const customSections = [...resume.content.customSections];
  customSections[index] = { ...customSections[index], ...patchValue };
  return editField(resume, 'content.customSections', (next) => ({ ...next, content: { ...next.content, customSections } }));
};

const formatRelative = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};
