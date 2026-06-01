# Implementation Plan — LaTeX Editor Live Edit

**Spec:** `docs/superpowers/specs/2026-05-31-latexeditor-live-edit-design.md`  
**Files to change:** `src/ui/App.tsx`, `src/ui/styles.css`

---

## Step 1 — Add `Zap` to the lucide-react import

In `src/ui/App.tsx`, add `Zap` to the existing lucide-react import block (alphabetically after `Upload`).

---

## Step 2 — Add state and refs to `LatexEditorRoute`

Inside `LatexEditorRoute` (App.tsx:243), after the existing `useState`/`useRef` declarations, add:

```ts
const [autoCompile, setAutoCompile] = useState(false);
const debounceRef = useRef<ReturnType<typeof setTimeout>>();
const compileGenRef = useRef(0);
```

---

## Step 3 — Modify `compileProject` to accept `opts` and use generation counter

Replace the existing `compileProject` function body with:

```ts
const compileProject = async (opts?: { auto?: boolean }) => {
  if (!project?.mainFile) return;
  const gen = ++compileGenRef.current;
  setBusy('Preparing browser compile');
  if (!opts?.auto) setShowLogs(true);
  setCompileResult(await compileLatexProject({ files: project.workingFiles, mainFile: project.mainFile, engine }));
  if (gen !== compileGenRef.current) return;
  setCompileResult(result);
  setBusy('');
  checkLatexCompilerCacheState().then(setCacheState);
};
```

Wait — I need to capture the result before the gen check. Correct form:

```ts
const compileProject = async (opts?: { auto?: boolean }) => {
  if (!project?.mainFile) return;
  const gen = ++compileGenRef.current;
  setBusy('Preparing browser compile');
  if (!opts?.auto) setShowLogs(true);
  const result = await compileLatexProject({ files: project.workingFiles, mainFile: project.mainFile, engine });
  if (gen !== compileGenRef.current) return;
  setCompileResult(result);
  setBusy('');
  checkLatexCompilerCacheState().then(setCacheState);
};
```

The existing `<button ... onClick={compileProject}>Compile</button>` call passes no args and is unaffected.

---

## Step 4 — Add auto-compile `useEffect`

After the existing `useEffect` that calls `checkLatexCompilerCacheState`, add:

```ts
useEffect(() => {
  if (!autoCompile || !project?.mainFile) return;
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => void compileProject({ auto: true }), 1500);
  return () => clearTimeout(debounceRef.current);
}, [project?.workingFiles, autoCompile]);
```

---

## Step 5 — Add auto-compile toggle button to the topbar

In the `.latex-topbar-actions` div (inside the `<header className="latex-topbar">` JSX), add the toggle button **before** the existing Compile button:

```tsx
<button
  className={`chrome-button${autoCompile ? ' selected' : ''}`}
  onClick={() => setAutoCompile(v => !v)}
  aria-label={autoCompile ? 'Disable auto-compile' : 'Enable auto-compile'}
>
  <Zap />Auto
</button>
```

---

## Step 6 — Wrap the PDF iframe in `.latex-pdf-wrap` and add the recompile overlay

In the JSX block that renders the PDF preview, replace:

```tsx
{latexPdfUrl ? (
  <iframe title="LaTeX PDF preview" src={formatPdfPreviewUrl(latexPdfUrl)} />
) : (
```

with:

```tsx
{latexPdfUrl ? (
  <div className="latex-pdf-wrap">
    <iframe title="LaTeX PDF preview" src={formatPdfPreviewUrl(latexPdfUrl)} />
    {busy && (
      <div className="latex-recompile-overlay" aria-label="Recompiling">
        <Loader2 className="latex-spin" />
        <span>Recompiling…</span>
      </div>
    )}
  </div>
) : (
```

---

## Step 7 — Add CSS to `styles.css`

Append to `src/ui/styles.css`:

```css
/* latex editor — live edit */
.latex-pdf-wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.chrome-button.selected {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--surface);
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

## Step 8 — Verify in browser

- Open `/latexeditor`, load a bundled project.
- Click **Auto** — button should invert (dark background).
- Edit a `.tex` file — PDF should recompile ~1.5s after typing stops, with the spinner overlay visible on the existing PDF during the compile.
- Click **Auto** again to toggle off — edits no longer trigger auto-compile.
- Click **Compile** manually in both modes — should still work and open the logs panel.
- Click **Compile** while an auto-compile is mid-flight — new result should win (gen counter), log panel should open.
