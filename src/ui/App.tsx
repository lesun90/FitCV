import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileCheck2,
  FilePlus2,
  FolderOpen,
  Github,
  GripVertical,
  Home,
  Layers,
  Mail,
  MapPin,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Phone,
  Plus,
  RotateCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react';
import { exportFitcvArchive, importFitcvArchive } from '../domain/archive';
import { runAtsChecks } from '../domain/checks';
import { createResume, duplicateResume, renameResume, sampleResume, switchTemplate, touchResume } from '../domain/resume';
import { analyzeTemplateCompatibility, templates } from '../domain/templates';
import type { CompileArtifact, ResumeRecord, SectionKey, TemplateId, TemplateSettings } from '../domain/types';
import { storage } from '../services/storage';

const sections: SectionKey[] = ['summary', 'experience', 'education', 'projects', 'skills', 'awards', 'customSections'];

const sectionLabels: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
  awards: 'Awards',
  customSections: 'Custom sections'
};

type ViewMode = 'dashboard' | 'editor';

const getSettings = (resume: ResumeRecord): TemplateSettings => {
  const defaults: TemplateSettings = { color: '#111111', typography: '16/1.5', spacing: 'comfortable', pagePadding: 49 };
  return { ...defaults, ...resume.templateSettings[resume.activeTemplateId] };
};

const applySettings = (resume: ResumeRecord, patch: Partial<TemplateSettings>): ResumeRecord =>
  touchResume({ ...resume, templateSettings: { ...resume.templateSettings, [resume.activeTemplateId]: { ...getSettings(resume), ...patch } } });

const parseTypo = (value: string) => {
  const [s = '16', lh = '1.5'] = value.split('/');
  return { size: parseFloat(s) || 16, lineHeight: parseFloat(lh) || 1.5 };
};

export const App = () => {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [activeId, setActiveId] = useState<string>();
  const [artifact, setArtifact] = useState<CompileArtifact>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ViewMode>('dashboard');
  const active = resumes.find((resume) => resume.id === activeId) ?? resumes[0];

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
    const sorted = stored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setResumes(sorted);
    setActiveId((await storage.getPreference())?.activeResumeId ?? sorted[0].id);
  };

  const save = async (resume: ResumeRecord) => {
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
  const pdfUrl = useMemo(() => (artifact?.pdfBlob ? URL.createObjectURL(artifact.pdfBlob) : ''), [artifact]);
  const reviewCount = active?.reviewMarkers.filter((marker) => marker.needsReview).length ?? 0;
  const warningCount = checks.filter((check) => check.status !== 'pass').length;
  const cleanCompile = artifact?.status === 'clean' && artifact.resumeVersion === active?.version;

  const compile = async () => {
    if (!active) return;
    setBusy('Compiling in browser');
    setError('');
    const { compileResumeToPdf } = await import('../services/pdf');
    const result = await compileResumeToPdf(active);
    await storage.saveArtifact(result);
    setArtifact(result);
    setBusy('');
  };

  const createBlank = () => {
    void save(createResume('Untitled Resume', 'classic-ats'));
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
    setBusy('Importing archive');
    const archive = await importFitcvArchive(file);
    for (const resume of archive.resumes) await storage.saveResume(resume);
    await hydrate();
    setBusy('');
  };

  const exportArchive = async () => {
    const file = await exportFitcvArchive({ resumes, artifacts: artifact ? [artifact] : [] });
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
      busy={busy}
      checks={checks}
      cleanCompile={cleanCompile}
      error={error}
      pdfUrl={pdfUrl}
      reviewCount={reviewCount}
      unsupported={compatibility?.unsupportedSections ?? []}
      warningCount={warningCount}
      onBack={() => setMode('dashboard')}
      onChange={updateActive}
      onCompile={compile}
      onDelete={deleteActive}
      onDuplicate={cloneActive}
      onDownloadPdf={() => artifact?.pdfBlob && downloadBlob(artifact.pdfBlob, `${active.title}.pdf`)}
      onExportArchive={exportArchive}
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
            <FilterItem active label="All resumes" value={resumes.length.toString()} />
            <FilterItem label="Base resumes" value={resumes.length.toString()} />
            <FilterItem label="Needs review" value={reviewCount.toString()} />
            <FilterItem label="ATS warnings" value={warningCount.toString()} />
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
  busy,
  checks,
  cleanCompile,
  error,
  pdfUrl,
  reviewCount,
  unsupported,
  warningCount,
  onBack,
  onChange,
  onCompile,
  onDelete,
  onDuplicate,
  onDownloadPdf,
  onExportArchive
}: {
  active: ResumeRecord;
  activeTemplate?: (typeof templates)[number];
  artifact?: CompileArtifact;
  busy: string;
  checks: ReturnType<typeof runAtsChecks>;
  cleanCompile: boolean;
  error: string;
  pdfUrl: string;
  reviewCount: number;
  unsupported: SectionKey[];
  warningCount: number;
  onBack: () => void;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  onCompile: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onDownloadPdf: () => void;
  onExportArchive: () => void;
}) => {
  const [selectedSection, setSelectedSection] = useState<SectionKey>('experience');

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
        <span className={cleanCompile ? 'backup-state clean' : 'backup-state'}>
          {cleanCompile ? <CheckCircle2 /> : <Clock3 />}
          {cleanCompile ? 'PDF ready' : 'Not backed up'}
        </span>
        <button className="chrome-icon" aria-label="Editor settings"><Settings /></button>
        <button className="chrome-button" onClick={onCompile}><RotateCw />Compile</button>
        <button className="chrome-button primary" disabled={!artifact?.pdfBlob || artifact.status !== 'clean'} onClick={onDownloadPdf}><Download />Export</button>
        <button className="ghost-button danger" onClick={onDelete}><Trash2 />Delete</button>
      </header>

      {busy && <div className="notice editor-notice">{busy}</div>}
      {error && <div className="notice error editor-notice">{error}</div>}

      <section className="editor-board" aria-label="Editor workbench">
        <StylePanel
          active={active}
          onChange={onChange}
          unsupported={unsupported}
          selectedSection={selectedSection}
          onSelectSection={setSelectedSection}
        />
        <EditorPanel
          active={active}
          onChange={onChange}
          reviewCount={reviewCount}
          selectedSection={selectedSection}
        />
        <PreviewPanel
          active={active}
          activeTemplateName={activeTemplate?.name ?? active.activeTemplateId}
          artifact={artifact}
          checks={checks}
          cleanCompile={cleanCompile}
          pdfUrl={pdfUrl}
          selectedSection={selectedSection}
          warningCount={warningCount}
          onBack={onBack}
          onCompile={onCompile}
          onDownloadPdf={onDownloadPdf}
          onDuplicate={onDuplicate}
          onExportArchive={onExportArchive}
          onSelectSection={setSelectedSection}
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
  <button className={active ? 'filter-item active' : 'filter-item'}>
    <span>{label}</span>
    <strong>{value}</strong>
  </button>
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

const StatusPill = ({ icon, label, value, tone = 'neutral' }: { icon: ReactNode; label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) => (
  <span className={`status-pill ${tone}`}>
    {icon}
    <span>{label}</span>
    <strong>{value}</strong>
  </span>
);

const StylePanel = ({
  active,
  onChange,
  unsupported,
  selectedSection,
  onSelectSection
}: {
  active: ResumeRecord;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  unsupported: SectionKey[];
  selectedSection: SectionKey;
  onSelectSection: (section: SectionKey) => void;
}) => {
  const settings = getSettings(active);
  const { size: baseSize, lineHeight } = parseTypo(settings.typography);

  return (
    <aside className="panel style-panel" aria-label="Layout and template controls">
      <div className="design-card module-card">
        <div className="panel-title">Layout</div>
        <div className="module-list">
          {sections.map((section) => {
            const isHidden = active.hiddenSections.includes(section);
            return (
              <div
                key={section}
                className={`module-row${section === selectedSection ? ' selected' : ''}${isHidden ? ' hidden' : ''}`}
              >
                <GripVertical aria-hidden="true" />
                <button className="module-select-btn" onClick={() => onSelectSection(section)}>
                  {sectionLabels[section]}
                </button>
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
          <button className="add-module"><Plus />Add Module</button>
        </div>
      </div>

      <div className="design-card">
        <div className="panel-title">Template</div>
        <div className="template-switcher">
          {templates.map((template) => (
            <button
              key={template.id}
              className={active.activeTemplateId === template.id ? 'selected' : ''}
              onClick={() => onChange((resume) => switchTemplate(resume, template.id as TemplateId))}
            >
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="design-card">
        <div className="design-card-head">
          <span>Theme Color</span>
          <button>Custom</button>
        </div>
        <div className="swatches" aria-label="Theme colors">
          {['#111111', '#2f3437', '#62686d', '#8a8f93', '#2457c5', '#b42318', '#ff4b14', '#4f168f', '#16765a'].map((color) => (
            <span
              key={color}
              role="button"
              tabIndex={0}
              aria-label={`Theme color ${color}`}
              style={{ background: color }}
              className={settings.color === color ? 'selected' : ''}
              onClick={() => onChange((r) => applySettings(r, { color }))}
              onKeyDown={(e) => e.key === 'Enter' && onChange((r) => applySettings(r, { color }))}
            />
          ))}
        </div>
      </div>

      <div className="design-card">
        <div className="design-card-head"><span>Typography</span></div>
        <div className="control-row">
          <span>Base size</span>
          <div className="stepper-unit">
            <input
              type="number"
              className="stepper"
              min={10}
              max={18}
              step={0.5}
              value={baseSize}
              onChange={(e) => onChange((r) => applySettings(r, { typography: `${e.target.value}/${lineHeight}` }))}
            />
            <span className="unit">px</span>
          </div>
        </div>
        <div className="control-row">
          <span>Line height</span>
          <input
            type="number"
            className="stepper"
            min={1.2}
            max={2.0}
            step={0.05}
            value={lineHeight}
            onChange={(e) => onChange((r) => applySettings(r, { typography: `${baseSize}/${e.target.value}` }))}
          />
        </div>
      </div>

      <div className="design-card">
        <div className="design-card-head"><span>Spacing</span></div>
        <div className="segmented">
          <button
            className={settings.spacing === 'compact' ? 'selected' : ''}
            onClick={() => onChange((r) => applySettings(r, { spacing: 'compact' }))}
          >
            Compact
          </button>
          <button
            className={settings.spacing === 'comfortable' ? 'selected' : ''}
            onClick={() => onChange((r) => applySettings(r, { spacing: 'comfortable' }))}
          >
            Comfortable
          </button>
        </div>
        <div className="control-row">
          <span>Page padding</span>
          <div className="stepper-unit">
            <input
              type="number"
              className="stepper"
              min={24}
              max={72}
              step={2}
              value={settings.pagePadding}
              onChange={(e) => onChange((r) => applySettings(r, { pagePadding: parseInt(e.target.value) }))}
            />
            <span className="unit">px</span>
          </div>
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
  selectedSection
}: {
  active: ResumeRecord;
  onChange: (recipe: (resume: ResumeRecord) => ResumeRecord) => void;
  reviewCount: number;
  selectedSection: SectionKey;
}) => (
  <section className="panel editor" aria-label="Section editor">
    <div className="editor-subhead">{sectionLabels[selectedSection]}</div>
    <div className="section-editor" key={selectedSection}>
      {renderSectionEditor(selectedSection, active, onChange)}
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

const SummaryEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card">
    <div className="align-card" aria-label="Resume alignment">
      <span>Align</span>
      <div className="segmented">
        <button className="selected" aria-label="Align left"><AlignLeft /></button>
        <button aria-label="Align center"><AlignCenter /></button>
        <button aria-label="Align right"><AlignRight /></button>
      </div>
    </div>
    <div className="field-grid two-col">
      <Field label="Name"><input value={active.content.profile.fullName} onChange={(e) => onChange((r) => patch(r, 'fullName', e.target.value))} /></Field>
      <Field label="Title"><input value={active.content.profile.headline} onChange={(e) => onChange((r) => patch(r, 'headline', e.target.value))} /></Field>
      <Field label="Email"><input type="email" value={active.content.profile.email} onChange={(e) => onChange((r) => patch(r, 'email', e.target.value))} /></Field>
      <Field label="Phone"><input type="tel" value={active.content.profile.phone} onChange={(e) => onChange((r) => patch(r, 'phone', e.target.value))} /></Field>
      <Field label="Location"><input value={active.content.profile.location} onChange={(e) => onChange((r) => patch(r, 'location', e.target.value))} /></Field>
      <Field label="Links"><input value={active.content.profile.links.join(', ')} onChange={(e) => onChange((r) => touchResume({ ...r, content: { ...r.content, profile: { ...r.content.profile, links: splitList(e.target.value) } } }))} /></Field>
    </div>
    <label className="stacked-field">Profile summary<textarea value={active.content.summary} onChange={(e) => onChange((r) => touchResume({ ...r, content: { ...r.content, summary: e.target.value } }))} /></label>
  </div>
);

const ExperienceEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Experience</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, experience: [...r.content.experience, { id: crypto.randomUUID(), company: '', role: '', location: '', startDate: '', endDate: '', highlights: [''] }] } }))}><Plus />Add</button>
    </div>
    {active.content.experience.map((item, index) => (
      <article className="item-card" key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.role || 'Untitled role'}</strong>
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
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, education: [...r.content.education, { id: crypto.randomUUID(), school: '', degree: '', location: '', startDate: '', endDate: '', highlights: [''] }] } }))}><Plus />Add</button>
    </div>
    {active.content.education.map((item, index) => (
      <article className="item-card" key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.school || 'Untitled school'}</strong>
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
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, projects: [...r.content.projects, { id: crypto.randomUUID(), name: '', description: '', highlights: [''], links: [] }] } }))}><Plus />Add</button>
    </div>
    {active.content.projects.map((item, index) => (
      <article className="item-card" key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.name || 'Untitled project'}</strong>
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
        onChange={(e) => onChange((r) => touchResume({ ...r, content: { ...r.content, skills: splitList(e.target.value) } }))}
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
        onChange={(e) => onChange((r) => touchResume({ ...r, content: { ...r.content, awards: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } }))}
      />
    </label>
  </div>
);

const CustomSectionsEditor = ({ active, onChange }: SectionEditorProps) => (
  <div className="section-card items">
    <div className="subhead">
      <h3>Custom sections</h3>
      <button onClick={() => onChange((r) => touchResume({ ...r, content: { ...r.content, customSections: [...r.content.customSections, { id: crypto.randomUUID(), title: '', body: '' }] } }))}><Plus />Add</button>
    </div>
    {active.content.customSections.map((item, index) => (
      <article className="item-card" key={item.id}>
        <div className="item-card-head">
          <GripVertical aria-hidden="true" />
          <strong>{item.title || 'Untitled section'}</strong>
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

const PreviewPanel = ({
  active,
  activeTemplateName,
  artifact,
  checks,
  cleanCompile,
  pdfUrl,
  selectedSection,
  warningCount,
  onBack,
  onCompile,
  onDownloadPdf,
  onDuplicate,
  onExportArchive,
  onSelectSection
}: {
  active: ResumeRecord;
  activeTemplateName: string;
  artifact?: CompileArtifact;
  checks: ReturnType<typeof runAtsChecks>;
  cleanCompile: boolean;
  pdfUrl: string;
  selectedSection: SectionKey;
  warningCount: number;
  onBack: () => void;
  onCompile: () => void;
  onDownloadPdf: () => void;
  onDuplicate: () => void;
  onExportArchive: () => void;
  onSelectSection: (section: SectionKey) => void;
}) => (
  <aside className="preview-pane" aria-label="Browser PDF preview">
    <div className="preview-toolbar" role="toolbar" aria-label="Preview actions">
      <button aria-label="Template" title="Template"><Layers /></button>
      <button aria-label="Grammar check" title="Grammar check"><Sparkles /></button>
      <button aria-label="Download PDF" title="Download PDF" disabled={!artifact?.pdfBlob || artifact.status !== 'clean'} onClick={onDownloadPdf}><Download /></button>
      <button aria-label="Duplicate resume" title="Duplicate resume" onClick={onDuplicate}><Copy /></button>
      <button aria-label="Collapse panels" title="Collapse panels"><PanelLeftClose /></button>
      <button aria-label="Home" title="Home" onClick={onBack}><Home /></button>
      <button aria-label="GitHub help" title="GitHub help"><Github /></button>
    </div>
    <div className="preview-head">
      <div>
        <span>Live document</span>
        <strong>{activeTemplateName}</strong>
      </div>
      <button className="compile-action" onClick={onCompile}><RotateCw />Compile</button>
    </div>
    <ResumePaper active={active} selectedSection={selectedSection} onSelectSection={onSelectSection} />
    <div className="preview-status">
      <StatusPill icon={<FileCheck2 />} label="Template" value={activeTemplateName} />
      <StatusPill icon={<ShieldCheck />} label="ATS" value={warningCount ? `${warningCount} warnings` : 'Clear'} tone={warningCount ? 'warn' : 'good'} />
      <StatusPill icon={cleanCompile ? <CheckCircle2 /> : <Clock3 />} label="PDF" value={cleanCompile ? 'Clean' : artifact?.status ?? 'Stale'} tone={cleanCompile ? 'good' : 'warn'} />
    </div>
    {pdfUrl && <iframe title="PDF preview" src={pdfUrl} />}
    <section className="log-block" aria-label="Compile logs">
      <h3>Compile logs</h3>
      <pre>{artifact?.logs.join('\n') ?? 'No compile has run yet.'}</pre>
    </section>
    <section className="checks" aria-label="ATS checks">
      <h3>ATS checks</h3>
      {checks.map((check) => <p key={check.id} className={check.status}>{check.field}: {check.message}</p>)}
    </section>
  </aside>
);

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

const ResumePaper = ({
  active,
  selectedSection,
  onSelectSection
}: {
  active: ResumeRecord;
  selectedSection: SectionKey;
  onSelectSection: (section: SectionKey) => void;
}) => (
  <article className="resume-paper" aria-label="Live resume preview">
    <header
      className={`paper-header selectable${selectedSection === 'summary' ? ' active' : ''}`}
      onClick={() => onSelectSection('summary')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelectSection('summary')}
      aria-label="Edit summary and profile"
    >
      <div>
        <h2>{active.content.profile.fullName || active.title}</h2>
        <p>{active.content.profile.headline}</p>
      </div>
      <div className="paper-contact">
        {active.content.profile.email && <span><Mail />{active.content.profile.email}</span>}
        {active.content.profile.phone && <span><Phone />{active.content.profile.phone}</span>}
        {active.content.profile.location && <span><MapPin />{active.content.profile.location}</span>}
      </div>
    </header>

    {!active.hiddenSections.includes('summary') && active.content.summary && (
      <PaperSection title="Summary" sectionKey="summary" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        <p>{active.content.summary}</p>
      </PaperSection>
    )}
    {!active.hiddenSections.includes('skills') && active.content.skills.length > 0 && (
      <PaperSection title="Skills" sectionKey="skills" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        <ul className="paper-list compact-list">{active.content.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
      </PaperSection>
    )}
    {!active.hiddenSections.includes('experience') && (
      <PaperSection title="Experience" sectionKey="experience" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        {active.content.experience.map((item) => (
          <div className="paper-role-block" key={item.id}>
            <div className="paper-role-head">
              <strong>{item.company || 'Company'}</strong>
              <span>{[item.startDate, item.endDate].filter(Boolean).join(' - ')}</span>
            </div>
            <div className="paper-role-sub">{item.role}{item.location ? ` · ${item.location}` : ''}</div>
            <ul className="paper-list">{item.highlights.filter(Boolean).map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
          </div>
        ))}
      </PaperSection>
    )}
    {!active.hiddenSections.includes('education') && active.content.education.length > 0 && (
      <PaperSection title="Education" sectionKey="education" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        {active.content.education.map((item) => (
          <div className="paper-role-block" key={item.id}>
            <div className="paper-role-head">
              <strong>{item.school || 'School'}</strong>
              <span>{[item.startDate, item.endDate].filter(Boolean).join(' - ')}</span>
            </div>
            <div className="paper-role-sub">{item.degree}{item.location ? ` · ${item.location}` : ''}</div>
            <ul className="paper-list">{item.highlights.filter(Boolean).map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
        ))}
      </PaperSection>
    )}
    {!active.hiddenSections.includes('projects') && active.content.projects.length > 0 && (
      <PaperSection title="Projects" sectionKey="projects" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        {active.content.projects.map((item) => (
          <div className="paper-role-block" key={item.id}>
            <strong>{item.name}</strong>
            <p>{item.description}</p>
          </div>
        ))}
      </PaperSection>
    )}
    {!active.hiddenSections.includes('awards') && active.content.awards.length > 0 && (
      <PaperSection title="Awards" sectionKey="awards" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        <ul className="paper-list">{active.content.awards.map((a) => <li key={a}>{a}</li>)}</ul>
      </PaperSection>
    )}
    {!active.hiddenSections.includes('customSections') && active.content.customSections.length > 0 && (
      <PaperSection title="Additional" sectionKey="customSections" selectedSection={selectedSection} onSelectSection={onSelectSection}>
        {active.content.customSections.map((item) => (
          <div className="paper-role-block" key={item.id}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </div>
        ))}
      </PaperSection>
    )}
  </article>
);

const PaperSection = ({
  title,
  children,
  sectionKey,
  selectedSection,
  onSelectSection
}: {
  title: string;
  children: ReactNode;
  sectionKey: SectionKey;
  selectedSection: SectionKey;
  onSelectSection: (section: SectionKey) => void;
}) => (
  <section
    className={`paper-content-section selectable${selectedSection === sectionKey ? ' active' : ''}`}
    onClick={() => onSelectSection(sectionKey)}
    role="button"
    tabIndex={0}
    onKeyDown={(e) => e.key === 'Enter' && onSelectSection(sectionKey)}
    aria-label={`Edit ${title}`}
  >
    <h3>{title}</h3>
    {children}
  </section>
);

const patch = (resume: ResumeRecord, key: keyof ResumeRecord['content']['profile'], value: string) =>
  touchResume({ ...resume, content: { ...resume.content, profile: { ...resume.content.profile, [key]: value } } });

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

const updateExperience = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['experience'][number]>) => {
  const experience = [...resume.content.experience];
  experience[index] = { ...experience[index], ...patchValue };
  return touchResume({ ...resume, content: { ...resume.content, experience } });
};

const updateDates = (resume: ResumeRecord, index: number, value: string) => {
  const [startDate = '', endDate = ''] = value.split(' - ');
  return updateExperience(resume, index, { startDate, endDate });
};

const updateEducation = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['education'][number]>) => {
  const education = [...resume.content.education];
  education[index] = { ...education[index], ...patchValue };
  return touchResume({ ...resume, content: { ...resume.content, education } });
};

const updateEducationDates = (resume: ResumeRecord, index: number, value: string) => {
  const [startDate = '', endDate = ''] = value.split(' - ');
  return updateEducation(resume, index, { startDate, endDate });
};

const updateProjects = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['projects'][number]>) => {
  const projects = [...resume.content.projects];
  projects[index] = { ...projects[index], ...patchValue };
  return touchResume({ ...resume, content: { ...resume.content, projects } });
};

const updateCustomSections = (resume: ResumeRecord, index: number, patchValue: Partial<ResumeRecord['content']['customSections'][number]>) => {
  const customSections = [...resume.content.customSections];
  customSections[index] = { ...customSections[index], ...patchValue };
  return touchResume({ ...resume, content: { ...resume.content, customSections } });
};

const formatRelative = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const days = Math.max(0, Math.floor(diff / 86_400_000));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};
