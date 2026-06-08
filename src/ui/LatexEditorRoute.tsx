import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  LockKeyhole,
  Play,
  Trash2,
  Zap
} from 'lucide-react';
import { downloadBlob, StatusPill } from './shared';
import { AiAssistButton, AiSettingsButton } from './AiAssist';
import { buildLatexFileTree, type LatexFileTreeNode, type LatexProjectFile } from '../domain/latexProject';
import {
  busyTexLicenseReview,
  checkLatexCompilerCacheState,
  compileLatexProject,
  terminateBusyTexRunner,
  type LatexCompileResult,
  type LatexCompilerCacheState,
  type LatexCompilerEngine
} from '../services/latexCompiler';
import { clearBusyTexAssetCaches, ensureBusyTexAssetsInstalled, getBusyTexAssetStatus, type BusyTexAssetProgress, type BusyTexAssetState } from '../services/busytexAssets';
import {
  getFreshTextFiles,
  listBundledLatexProjects,
  loadBundledLatexProject,
  type BundledLatexProject,
  type BundledLatexProjectSummary
} from '../services/latexTemplates';
import { formatPdfPreviewUrl, highlightLatexSource, LATEX_COLORS, parseLatexDiagnostics, type LatexDiagnosticIssue } from './latexUtils';

type LatexProjectState = Omit<BundledLatexProject, 'readOnly'> & {
  readOnly: boolean;
  activePath: string;
  mainFile: string;
  workingFiles: LatexProjectFile[];
};

type EditorSnapshot = {
  contents: string;
  selectionStart: number;
  selectionEnd: number;
};

type EditorHistory = {
  past: EditorSnapshot[];
  future: EditorSnapshot[];
};

const MAX_EDITOR_HISTORY = 100;

export const LatexEditorRoute = () => {
  const [project, setProject] = useState<LatexProjectState>();
  const [compileResult, setCompileResult] = useState<LatexCompileResult>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [engine, setEngine] = useState<LatexCompilerEngine>('xelatex');
  const [cacheState, setCacheState] = useState<LatexCompilerCacheState>('not-ready');
  const [assetState, setAssetState] = useState<BusyTexAssetState>('not-installed');
  const [assetProgress, setAssetProgress] = useState<BusyTexAssetProgress>();
  const [showLogs, setShowLogs] = useState(false);
  const [autoCompile, setAutoCompile] = useState(false);
  const [focusLine, setFocusLine] = useState<number>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const compileGenRef = useRef(0);
  const bundledProjects = useMemo(() => listBundledLatexProjects(), []);

  useEffect(() => {
    checkLatexCompilerCacheState().then(setCacheState);
    getBusyTexAssetStatus().then((status) => setAssetState(status.state));
  }, []);

  const activeFile = project?.workingFiles.find((file) => file.path === project.activePath);
  const textFiles = project?.workingFiles.filter((file): file is Extract<LatexProjectFile, { kind: 'text' }> => file.kind === 'text') ?? [];
  const tree = useMemo(() => buildLatexFileTree(project?.workingFiles ?? []), [project?.workingFiles]);
  const latexPdfUrl = useMemo(() => (compileResult?.pdfBlob ? URL.createObjectURL(compileResult.pdfBlob) : ''), [compileResult?.pdfBlob]);
  const previewIssue = compileResult?.status === 'failed'
    ? parseLatexDiagnostics({ diagnostics: compileResult.diagnostics, logs: compileResult.logs })[0]
    : undefined;

  const openBundledProject = async (id: string) => {
    try {
      setBusy('Loading bundled template');
      setError('');
      const template = await loadBundledLatexProject(id);
      const firstMain = template.mainFileCandidates[0] ?? template.files.find((file) => file.kind === 'text' && file.path.endsWith('.tex'))?.path ?? '';
      setProject({
        ...template,
        readOnly: false,
        workingFiles: template.files,
        activePath: firstMain,
        mainFile: firstMain
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load bundled LaTeX project.');
    } finally {
      setBusy('');
    }
  };

  const updateActiveFile = (contents: string) => {
    if (!project || activeFile?.kind !== 'text') return;
    setProject({
      ...project,
      workingFiles: project.workingFiles.map((file) => (file.path === activeFile.path && file.kind === 'text' ? { ...file, contents } : file))
    });
  };

  const compileProject = async (opts?: { auto?: boolean }) => {
    if (!project?.mainFile) return;
    const gen = ++compileGenRef.current;
    try {
      setBusy('Preparing browser compile');
      setError('');
      if (!opts?.auto) setShowLogs(true);
      await prepareCompilerAssets();
      if (gen !== compileGenRef.current) return;
      setBusy('Running LaTeX in browser');
      const result = await compileLatexProject({ files: project.workingFiles, mainFile: project.mainFile, engine, fast: opts?.auto });
      if (gen !== compileGenRef.current) return;
      setCompileResult(result);
      checkLatexCompilerCacheState().then(setCacheState);
      getBusyTexAssetStatus().then((status) => setAssetState(status.state));
    } catch (caught) {
      if (gen === compileGenRef.current) setError(caught instanceof Error ? caught.message : 'LaTeX compile failed.');
    } finally {
      if (gen === compileGenRef.current) setBusy('');
    }
  };

  const prepareCompilerAssets = async (force = false) => {
    setAssetState('downloading');
    const status = await ensureBusyTexAssetsInstalled((progress) => {
      setAssetProgress(progress);
      if (progress.phase === 'downloading' && progress.bytesTotal > 0) {
        const percent = Math.round((progress.bytesLoaded / progress.bytesTotal) * 100);
        setBusy(`Downloading compiler assets ${percent}%`);
      } else if (progress.phase === 'service-worker') {
        setBusy('Preparing compiler cache');
      } else if (progress.phase === 'validating') {
        setBusy('Validating compiler assets');
      }
    }, { full: true, force });
    setAssetState(status.state);
    setAssetProgress(undefined);
  };

  const clearCompilerAssets = async () => {
    terminateBusyTexRunner();
    setAssetState('clearing-cache');
    setBusy('Clearing compiler cache');
    await clearBusyTexAssetCaches(setAssetProgress);
    setAssetProgress(undefined);
    setAssetState('not-installed');
    setBusy('');
    checkLatexCompilerCacheState().then(setCacheState);
  };

  useEffect(() => {
    if (!autoCompile || !project?.mainFile) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void compileProject({ auto: true }), 1500);
    return () => clearTimeout(debounceRef.current);
  }, [project?.workingFiles, autoCompile]);

  useEffect(() => {
    if (!project?.id) return;
    const id = project.id;
    const handler = () => {
      const freshByPath = new Map(getFreshTextFiles(id).map((f) => [f.path, f]));
      setProject((prev) => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          workingFiles: prev.workingFiles.map((file) =>
            file.kind === 'text' ? (freshByPath.get(file.path) ?? file) : file
          )
        };
      });
    };
    window.addEventListener('latex-templates-updated', handler);
    return () => window.removeEventListener('latex-templates-updated', handler);
  }, [project?.id]);

  return (
    <main className="latex-shell">
      <header className="latex-topbar">
        <div className="latex-title-cluster">
          <div className="magic-brand">
            <strong>FitCV</strong>
            <span>/</span>
            <em>LaTeX</em>
          </div>
          <div className="latex-route-note">Studio route</div>
        </div>
        <div className="latex-topbar-actions">
          <label className="latex-select-label">
            Main
            <select
              value={project?.mainFile ?? ''}
              onChange={(event) => project && setProject({ ...project, mainFile: event.target.value, activePath: event.target.value })}
              disabled={!project}
              aria-label="Main LaTeX file"
            >
              {(project?.mainFileCandidates.length ? project.mainFileCandidates : textFiles.map((file) => file.path)).map((path) => (
                <option key={path} value={path}>{path}</option>
              ))}
            </select>
          </label>
          <label className="latex-select-label">
            Engine
            <select value={engine} onChange={(event) => setEngine(event.target.value as LatexCompilerEngine)} aria-label="LaTeX engine">
              <option value="xelatex">XeTeX</option>
              <option value="pdflatex">pdfTeX</option>
              <option value="lualatex">LuaTeX</option>
            </select>
          </label>
          <StatusPill icon={<LockKeyhole />} label="Compiler" value={formatCacheState(cacheState)} tone="warn" />
          <StatusPill icon={<LockKeyhole />} label="Assets" value={formatAssetState(assetState, assetProgress)} tone={assetState === 'ready-offline' ? 'good' : 'warn'} />
          <button className="chrome-button" disabled={Boolean(busy)} onClick={() => void prepareCompilerAssets()}><Download />Prepare</button>
          <button className="chrome-button" disabled={Boolean(busy)} onClick={() => void prepareCompilerAssets(true)}><Play />Repair</button>
          <button className="chrome-button icon-only" disabled={Boolean(busy)} onClick={() => window.confirm('Remove offline PDF compiler files from this browser?') && void clearCompilerAssets()} aria-label="Clear compiler cache"><Trash2 /></button>
          <button
            className={`chrome-button${autoCompile ? ' selected' : ''}`}
            disabled={!project}
            onClick={() => setAutoCompile((v) => !v)}
            aria-label={autoCompile ? 'Disable auto-compile' : 'Enable auto-compile'}
          ><Zap />Auto</button>
          <AiSettingsButton />
          <button className="chrome-button" disabled={!project || Boolean(busy)} onClick={() => compileProject()}><Play />Compile</button>
          <button className="chrome-button primary" disabled={!compileResult?.pdfBlob} onClick={() => compileResult?.pdfBlob && downloadBlob(compileResult.pdfBlob, `${project?.displayName ?? 'latex-project'}.pdf`)}><Download />PDF</button>
        </div>
      </header>

      {!project ? (
        <LatexLauncher busy={busy} error={error} projects={bundledProjects} cacheState={cacheState} onOpenProject={openBundledProject} />
      ) : (
        <section className="latex-workbench" aria-label="LaTeX editor workbench">
          <aside className="latex-file-panel" aria-label="Template files">
            <div className="latex-panel-head">
              <div>
                <span>Template files</span>
                <strong>{project.displayName}</strong>
              </div>
              {project.readOnly && <span className="readonly-badge"><LockKeyhole />Read-only</span>}
            </div>
            <LatexFileTree nodes={tree} activePath={project.activePath} onOpen={(path) => setProject({ ...project, activePath: path })} />
            <div className="latex-load-report">
              <strong>{project.workingFiles.length} files loaded</strong>
              <span>{project.rootPath}</span>
            </div>
          </aside>

          <section className="latex-editor-pane" aria-label="Source workspace">
            <div className="latex-editor-tabs">
              <button className="selected"><FileText />{project.activePath || 'No file selected'}</button>
              <span>{activeFile?.kind === 'text' ? 'Editable source' : 'Compile asset'}</span>
            </div>
            {activeFile?.kind === 'text' ? (
              <LatexCodeEditor
                contents={activeFile.contents}
                readOnly={project.readOnly}
                activePath={activeFile.path}
                focusLine={focusLine}
                onChange={updateActiveFile}
              />
            ) : (
              <div className="latex-empty-editor">
                <FileText />
                <strong>Binary files are included for compile only.</strong>
                <span>Select a text source file to inspect it.</span>
              </div>
            )}
          </section>

          <aside className="latex-preview-pane" aria-label="PDF output and compiler drawer">
            <div className="latex-preview-paper">
              {latexPdfUrl ? (
                <div className="latex-pdf-wrap">
                  <iframe key={latexPdfUrl} title="LaTeX PDF preview" src={formatPdfPreviewUrl(latexPdfUrl)} />
                  {busy && (
                    <div className="latex-recompile-overlay" aria-label="Recompiling">
                      <Loader2 className="latex-spin" />
                      <span>Recompiling...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className={previewIssue ? 'latex-paper-placeholder failed' : 'latex-paper-placeholder'} role={previewIssue ? 'alert' : undefined}>
                  {previewIssue ? <AlertTriangle /> : <Braces />}
                  <h2>{previewIssue ? 'Compile needs attention' : 'Ready for first compile'}</h2>
                  {previewIssue ? (
                    <>
                      <p><strong>{previewIssue.title}</strong>{previewIssue.filePath ? ` in ${formatIssueLocation(previewIssue)}` : ''}</p>
                      <p>{previewIssue.hint}</p>
                    </>
                  ) : (
                    <p>Compile runs through BusyTeX with the current in-memory project map. If runtime assets are missing, the logs will show the asset path to configure.</p>
                  )}
                </div>
              )}
            </div>
            <CompilerStatusPanel
              result={compileResult}
              busy={busy}
              cacheState={cacheState}
              showLogs={showLogs}
              onToggleLogs={() => setShowLogs((v) => !v)}
              onOpenIssue={(issue) => {
                if (!issue.filePath) return;
                setProject((prev) => {
                  if (!prev || !prev.workingFiles.some((file) => file.path === issue.filePath)) return prev;
                  return { ...prev, activePath: issue.filePath! };
                });
                setFocusLine(issue.line);
              }}
            />
          </aside>
        </section>
      )}
    </main>
  );
};

const LatexCodeEditor = ({
  activePath,
  contents,
  focusLine,
  readOnly,
  onChange
}: {
  activePath: string;
  contents: string;
  focusLine?: number;
  readOnly: boolean;
  onChange: (contents: string) => void;
}) => {
  const highlightRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<EditorHistory>({ past: [], future: [] });
  const [selectionActive, setSelectionActive] = useState(false);
  const [anchorPosition, setAnchorPosition] = useState({ x: 12, y: 12 });

  useEffect(() => {
    setHistory({ past: [], future: [] });
  }, [activePath]);

  useEffect(() => {
    if (!focusLine || focusLine < 1) return;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const lines = contents.split('\n');
      const targetLine = Math.min(focusLine, lines.length);
      const position = lines.slice(0, targetLine - 1).reduce((sum, line) => sum + line.length + 1, 0);
      el.focus();
      el.setSelectionRange(position, Math.min(position + lines[targetLine - 1].length, contents.length));
      el.scrollTop = Math.max(0, (targetLine - 4) * 18);
    });
  }, [activePath, contents, focusLine]);

  const restoreSelection = (snapshot: EditorSnapshot) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const start = Math.min(snapshot.selectionStart, el.value.length);
      const end = Math.min(snapshot.selectionEnd, el.value.length);
      el.setSelectionRange(start, end);
      el.focus();
    });
  };

  const snapshot = (sourceContents = contents): EditorSnapshot => {
    const el = textareaRef.current;
    if (!el) {
      return {
        contents: sourceContents,
        selectionStart: sourceContents.length,
        selectionEnd: sourceContents.length
      };
    }
    return {
      contents: sourceContents,
      selectionStart: Math.min(el.selectionStart, sourceContents.length),
      selectionEnd: Math.min(el.selectionEnd, sourceContents.length)
    };
  };

  const updateSelectionActive = (event?: { clientX?: number; clientY?: number }) => {
    const el = textareaRef.current;
    const active = Boolean(el && el.selectionStart !== el.selectionEnd);
    setSelectionActive(active);
    if (!active || !el) return;
    const rect = el.getBoundingClientRect();
    if (typeof event?.clientX === 'number' && typeof event.clientY === 'number') {
      setAnchorPosition({
        x: Math.max(12, event.clientX - rect.left + el.scrollLeft),
        y: Math.max(12, event.clientY - rect.top + el.scrollTop)
      });
      return;
    }
    setAnchorPosition({ x: Math.max(12, el.clientWidth - 48), y: Math.max(12, el.scrollTop + 12) });
  };

  const recordUndo = (previous: EditorSnapshot) => {
    setHistory((current) => ({
      past: [...current.past.slice(-(MAX_EDITOR_HISTORY - 1)), previous],
      future: []
    }));
  };

  const applyHistorySnapshot = (next: EditorSnapshot) => {
    onChange(next.contents);
    restoreSelection(next);
  };

  const undo = () => {
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({
      past: history.past.slice(0, -1),
      future: [snapshot(), ...history.future].slice(0, MAX_EDITOR_HISTORY)
    });
    applyHistorySnapshot(previous);
  };

  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({
      past: [...history.past.slice(-(MAX_EDITOR_HISTORY - 1)), snapshot()],
      future: history.future.slice(1)
    });
    applyHistorySnapshot(next);
  };

  const changeContents = (next: string, previous = snapshot()) => {
    if (readOnly) return;
    recordUndo(previous);
    onChange(next);
  };

  const wrapSelection = (open: string, close: string) => {
    const el = textareaRef.current;
    if (!el || readOnly) return;
    const { selectionStart: start, selectionEnd: end, value: cur } = el;
    const selected = cur.slice(start, end);
    const next = cur.slice(0, start) + open + selected + close + cur.slice(end);
    changeContents(next, { contents, selectionStart: start, selectionEnd: end });
    requestAnimationFrame(() => {
      const cursor = selected
        ? start + open.length + selected.length + close.length
        : start + open.length;
      el.setSelectionRange(cursor, cursor);
      el.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    const isUndo = key === 'z' && !event.shiftKey;
    const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
    const isFormatting = key === 'b' || key === 'i' || key === 'u';
    if (!isUndo && !isRedo && !isFormatting) return;
    event.preventDefault();
    if (isUndo) {
      undo();
    } else if (isRedo) {
      redo();
    } else if (key === 'b') {
      wrapSelection('\\textbf{', '}');
    } else if (key === 'i') {
      wrapSelection('\\textit{', '}');
    } else if (key === 'u') {
      wrapSelection('\\underline{', '}');
    } else {
      return;
    }
  };

  return (
    <div className="latex-code-editor-wrap">
      <div className="rich-toolbar" role="toolbar" aria-label="LaTeX formatting">
        <button type="button" className="rich-btn rich-bold" disabled={readOnly} onMouseDown={(e) => { e.preventDefault(); wrapSelection('\\textbf{', '}'); }} title="Bold (\\textbf)"><strong>B</strong></button>
        <button type="button" className="rich-btn rich-italic" disabled={readOnly} onMouseDown={(e) => { e.preventDefault(); wrapSelection('\\textit{', '}'); }} title="Italic (\\textit)"><em>I</em></button>
        <button type="button" className="rich-btn rich-underline" disabled={readOnly} onMouseDown={(e) => { e.preventDefault(); wrapSelection('\\underline{', '}'); }} title="Underline (\\underline)"><u>U</u></button>
        <span className="rich-sep" />
        {LATEX_COLORS.map((color) => (
          <button
            key={color.name}
            type="button"
            className="rich-color-swatch"
            disabled={readOnly}
            style={{ background: color.hex }}
            onMouseDown={(e) => { e.preventDefault(); wrapSelection(`\\textcolor{${color.name}}{`, '}'); }}
            title={`${color.label} (\\textcolor{${color.name}})`}
          />
        ))}
      </div>
      <div className="latex-code-frame">
        <pre className="latex-code-highlight" ref={highlightRef} aria-hidden="true">
          {highlightLatexSource(contents)}
        </pre>
        <textarea
          ref={textareaRef}
          className="latex-code-editor"
          value={contents}
          readOnly={readOnly}
          spellCheck={false}
          onScroll={(event) => {
            if (!highlightRef.current) return;
            const { scrollTop, scrollLeft } = event.currentTarget;
            highlightRef.current.style.transform = `translate(-${scrollLeft}px, -${scrollTop}px)`;
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={() => updateSelectionActive()}
          onMouseUp={(e) => updateSelectionActive(e)}
          onSelect={() => updateSelectionActive()}
          onChange={(event) => changeContents(event.target.value, snapshot(contents))}
          aria-label={`Editing ${activePath}`}
        />
        <AiAssistButton
          anchorPosition={anchorPosition}
          disabled={readOnly}
          fieldLabel="LaTeX source"
          selectionActive={selectionActive}
          value={contents}
          onClose={() => setSelectionActive(false)}
          getValue={() => textareaRef.current?.value ?? contents}
          getSelection={() => ({
            start: textareaRef.current?.selectionStart ?? contents.length,
            end: textareaRef.current?.selectionEnd ?? contents.length
          })}
          onApply={(next) => changeContents(next, snapshot(contents))}
        />
      </div>
    </div>
  );
};

const LatexLauncher = ({
  busy,
  cacheState,
  error,
  projects,
  onOpenProject
}: {
  busy: string;
  cacheState: LatexCompilerCacheState;
  error: string;
  projects: BundledLatexProjectSummary[];
  onOpenProject: (id: string) => void;
}) => (
  <section className="latex-launcher" aria-labelledby="latex-heading">
    <div className="latex-launcher-copy">
      <span className="eyebrow">Private browser workbench</span>
      <h1 id="latex-heading">LaTeX Workbench</h1>
      <p>Open a bundled resume template, inspect source files, select a main document, and prepare for local browser compilation without linking this route from the main FitCV navigation.</p>
      <section className="latex-project-list" aria-label="Bundled LaTeX projects">
        {projects.map((project) => (
          <button key={project.id} className="latex-project-card" onClick={() => onOpenProject(project.id)} disabled={Boolean(busy)}>
            <FolderOpen />
            <span>
              <strong>Open {project.displayName}</strong>
              <small>{project.textFileCount} sources, {project.assetFileCount} assets</small>
            </span>
          </button>
        ))}
        {projects.length === 0 && <p>No bundled LaTeX projects were found under src/latex-templates.</p>}
      </section>
      <div className="latex-launch-actions">
        <button className="chrome-button" disabled><Folder />Open local folder</button>
      </div>
      {busy && <div className="notice">{busy}</div>}
      {error && <div className="notice error">{error}</div>}
    </div>
    <aside className="latex-license-card" aria-label="Compiler license status">
      <AlertTriangle />
      <strong>AGPL obligations accepted.</strong>
      <p>{busyTexLicenseReview.packageName}@{busyTexLicenseReview.version} is enabled under {busyTexLicenseReview.license}. BusyTeX runtime assets are expected at the configured asset base path and project source still stays in the browser.</p>
      <dl>
        <div><dt>Source privacy</dt><dd>User project files stay in the browser.</dd></div>
        <div><dt>Asset cache</dt><dd>{formatCacheState(cacheState)}</dd></div>
        <div><dt>Default engine</dt><dd>XeTeX-ready boundary</dd></div>
      </dl>
    </aside>
  </section>
);

const LatexFileTree = ({
  nodes,
  activePath,
  onOpen
}: {
  nodes: LatexFileTreeNode[];
  activePath: string;
  onOpen: (path: string) => void;
}) => (
  <div className="latex-file-tree">
    {nodes.map((node) => (
      <LatexFileTreeItem key={node.path} node={node} activePath={activePath} onOpen={onOpen} />
    ))}
  </div>
);

const LatexFileTreeItem = ({ node, activePath, onOpen }: { node: LatexFileTreeNode; activePath: string; onOpen: (path: string) => void }) => {
  if (node.type === 'folder') {
    return (
      <details open>
        <summary><Folder />{node.name}</summary>
        <div className="latex-folder-children">
          {node.children?.map((child) => <LatexFileTreeItem key={child.path} node={child} activePath={activePath} onOpen={onOpen} />)}
        </div>
      </details>
    );
  }

  return (
    <button className={node.path === activePath ? 'latex-file active' : 'latex-file'} onClick={() => onOpen(node.path)}>
      <FileText />
      <span>{node.name}</span>
    </button>
  );
};

const CompilerStatusPanel = ({
  result,
  busy,
  cacheState,
  showLogs,
  onOpenIssue,
  onToggleLogs
}: {
  result?: LatexCompileResult;
  busy: string;
  cacheState: LatexCompilerCacheState;
  showLogs: boolean;
  onOpenIssue: (issue: LatexDiagnosticIssue) => void;
  onToggleLogs: () => void;
}) => {
  const [showFullLog, setShowFullLog] = useState(false);
  const hasDiagnostics = (result?.diagnostics.length ?? 0) > 0;
  const issues = result ? parseLatexDiagnostics({ diagnostics: result.diagnostics, logs: result.logs }) : [];
  const statusLabel = busy
    ? 'Compiling...'
    : result
      ? `${result.status} - ${result.elapsedMs}ms`
      : 'Not run';
  const panelClass = [
    'latex-compiler-panel',
    showLogs ? 'expanded' : '',
    busy ? 'busy' : result?.status === 'success' ? 'status-success' : result?.status === 'failed' ? 'status-failed' : ''
  ].filter(Boolean).join(' ');

  return (
    <section className={panelClass} aria-label="Compiler and logs">
      <div className="latex-panel-head">
        <div className="latex-panel-status-group">
          {busy ? (
            <Loader2 className="latex-spin" aria-hidden="true" />
          ) : result?.status === 'success' ? (
            <CheckCircle2 className="latex-status-icon good" aria-hidden="true" />
          ) : result?.status === 'failed' ? (
            <AlertTriangle className="latex-status-icon error" aria-hidden="true" />
          ) : null}
          <div>
            <span>Compile logs</span>
            <strong>{statusLabel}</strong>
          </div>
        </div>
        <div className="latex-panel-head-actions">
          <StatusPill icon={<Clock3 />} label="Cache" value={formatCacheState(result?.cacheState ?? cacheState)} tone="warn" />
          <button className="chrome-button icon-only" onClick={onToggleLogs} aria-label={showLogs ? 'Hide logs' : 'Show logs'}>
            {showLogs ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </div>

      {busy && <div className="latex-compile-progress-bar" role="progressbar" aria-label="Compiling" />}

      <div className={`latex-log-body${showLogs ? ' expanded' : ''}`}>
        <div className="latex-log-body-inner">
          {busy ? (
            <div className="latex-log-compiling" aria-live="polite">
              <Loader2 className="latex-spin" aria-hidden="true" />
              <span>Compiler running in browser...</span>
            </div>
          ) : (
            <>
              {hasDiagnostics && !showFullLog ? (
                <div className="latex-diagnostics" aria-label="Compile issues">
                  {issues.length ? (
                    issues.map((issue) => (
                      <button
                        key={issue.id}
                        className="latex-diagnostic-card"
                        type="button"
                        disabled={!issue.filePath}
                        onClick={() => onOpenIssue(issue)}
                        aria-label={issue.filePath ? `Open ${issue.filePath}${issue.line ? ` line ${issue.line}` : ''}` : `Review ${issue.title}`}
                      >
                        <AlertTriangle aria-hidden="true" />
                        <span>
                          <strong>{issue.title}</strong>
                          <small>{formatIssueLocation(issue)}</small>
                          <em>{issue.hint}</em>
                          {issue.excerpt && <code>{issue.excerpt}</code>}
                        </span>
                      </button>
                    ))
                  ) : (
                    result!.diagnostics.map((d) => <p key={d}>{d}</p>)
                  )}
                </div>
              ) : (
                <pre className="latex-log-output">{result?.logs.join('\n') ?? 'No compile has run yet.'}</pre>
              )}
              {hasDiagnostics && (
                <button className="latex-log-toggle" onClick={() => setShowFullLog((v) => !v)}>
                  {showFullLog ? 'Show errors only' : 'Show full log'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};

const formatCacheState = (state: string) => state.replaceAll('-', ' ');

const formatAssetState = (state: BusyTexAssetState, progress?: BusyTexAssetProgress) => {
  if (state === 'downloading' && progress?.bytesTotal) {
    return `downloading ${Math.round((progress.bytesLoaded / progress.bytesTotal) * 100)}%`;
  }
  return state.replaceAll('-', ' ');
};

const formatIssueLocation = (issue: LatexDiagnosticIssue) => {
  const file = issue.filePath ?? 'Compiler log';
  return issue.line ? `${file}:${issue.line}` : file;
};
