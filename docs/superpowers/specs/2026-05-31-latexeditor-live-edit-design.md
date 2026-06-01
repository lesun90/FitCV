# LaTeX Editor — Live Edit Design

**Date:** 2026-05-31  
**Route:** `/latexeditor`  
**Files changed:** `src/ui/App.tsx`, `src/ui/styles.css`

---

## Problem

The `/latexeditor` workbench requires a manual "Compile" button click to update the PDF preview. Editing a `.tex` file and seeing the result is a multi-step loop. The goal is to make edits feel live by auto-triggering compilation after the user pauses typing.

---

## Requirements

- **Auto-compile on typing pause:** Compilation fires ~1.5s after the user stops editing any file in the working set.
- **Toggle between auto and manual:** A toolbar button lets the user switch modes. Manual mode preserves the existing explicit "Compile" button workflow.
- **"Cancel & restart" on concurrent compiles:** If a new compile is triggered while one is already running, the old compile's result is discarded and the new one's result is used. (BusyTeX does not expose an abort signal, so the old compile continues in the background but its result is silently dropped via a generation counter.)
- **Recompile overlay on PDF:** While a compile is in-flight and a previous PDF already exists, the old PDF stays visible with a semi-transparent spinner overlay. The user retains reference to the last good output while the new one bakes.
- **Manual compile does not change on auto:** The existing Compile button continues to work the same way in both modes.

---

## Architecture

All changes are contained in `LatexEditorRoute` (App.tsx:243). No new files are created.

### New state and refs

```ts
// inside LatexEditorRoute
const [autoCompile, setAutoCompile] = useState(false);
const debounceRef = useRef<ReturnType<typeof setTimeout>>();
const compileGenRef = useRef(0);
```

- `autoCompile` — whether auto-compile mode is active. Defaults off.
- `debounceRef` — holds the pending setTimeout handle so it can be cleared on the next edit.
- `compileGenRef` — monotonically incremented on each compile start. The compile function checks its generation before writing results; stale completions are discarded.

### Auto-compile effect

```ts
useEffect(() => {
  if (!autoCompile || !project?.mainFile) return;
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => void compileProject({ auto: true }), 1500);
  return () => clearTimeout(debounceRef.current);
}, [project?.workingFiles, autoCompile]);
```

Dependency on `project?.workingFiles` means any file edit (via `updateActiveFile`) triggers the timer reset. `autoCompile` in deps means enabling the toggle on an already-edited project fires immediately after 1.5s.

### Modified `compileProject`

```ts
const compileProject = async (opts?: { auto?: boolean }) => {
  if (!project?.mainFile) return;
  const gen = ++compileGenRef.current;
  setBusy('Preparing browser compile');
  if (!opts?.auto) setShowLogs(true);   // manual compile opens logs panel; auto doesn't
  const result = await compileLatexProject({ files: project.workingFiles, mainFile: project.mainFile, engine });
  if (gen !== compileGenRef.current) return;  // discard stale result
  setCompileResult(result);
  setBusy('');
  checkLatexCompilerCacheState().then(setCacheState);
};
```

The existing `<button onClick={compileProject}>Compile</button>` call passes no opts and is unaffected.

### Toolbar toggle

A `<Zap>` button added to `.latex-topbar-actions` before the Compile button:

```tsx
<button
  className={`chrome-button${autoCompile ? ' active' : ''}`}
  onClick={() => setAutoCompile(v => !v)}
  aria-label={autoCompile ? 'Disable auto-compile' : 'Enable auto-compile'}
>
  <Zap />Auto
</button>
```

`Zap` is added to the existing lucide-react import list in App.tsx.

### PDF recompile overlay

The existing `<iframe>` in `.latex-preview-paper` is wrapped in a relative-positioned div. When `busy` is set and a PDF already exists, an overlay renders on top:

```tsx
<div className="latex-pdf-wrap">
  <iframe title="LaTeX PDF preview" src={formatPdfPreviewUrl(latexPdfUrl)} />
  {busy && (
    <div className="latex-recompile-overlay" aria-label="Recompiling">
      <Loader2 className="latex-spin" />
      <span>Recompiling…</span>
    </div>
  )}
</div>
```

When there is no previous PDF (first compile), the existing `.latex-paper-placeholder` shows instead — the overlay is not needed since there is nothing to preserve.

---

## CSS additions (`styles.css`)

```css
.latex-pdf-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.latex-pdf-wrap iframe {
  width: 100%;
  height: 100%;
  border: none;
}

.latex-recompile-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(2px);
  color: var(--fg-muted, #62686d);
  font-size: 0.85rem;
}
```

---

## Known limitations

- **No true cancellation:** BusyTeX does not expose an AbortController-compatible API. The generation counter achieves "discard stale" semantics — the old compile finishes in the background, consuming CPU, but its result is never rendered. This is acceptable for the current use case.
- **1.5s debounce is a constant:** It is not user-configurable. If compilation is fast (warm cache), 1.5s feels fine. If BusyTeX assets are not cached, each compile takes longer anyway. The constant can be tuned trivially.
- **Auto-compile state is not persisted:** Toggling auto on, then navigating away and back, resets to manual. This avoids surprise long compiles on load.
