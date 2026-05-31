# Editor Redesign — Implementation Plan

**Spec:** `2026-05-31-editor-redesign-design.md`
**Files:** `src/ui/App.tsx`, `src/ui/styles.css`

---

## Step 1 — Add `selectedSection` state to `EditorWorkspace`

In `EditorWorkspace`:
- Add `const [selectedSection, setSelectedSection] = useState<SectionKey>('experience')`
- Pass `selectedSection` and `onSelectSection={setSelectedSection}` to `StylePanel`, `EditorPanel`, and `PreviewPanel`

No visual change yet. This is purely wiring state.

---

## Step 2 — Rework `StylePanel` module rows

Replace the `<label>` + checkbox pattern with a `<button>` row split into two zones:

```
[ section name text ]  [ eye toggle button ]
```

- Main button `onClick` → `onSelectSection(section)`
- Eye button `onClick` (stop propagation) → existing `hiddenSections` toggle logic
- Eye button renders `Eye` when visible, `EyeOff` when hidden
- Apply `.selected` class when `section === selectedSection`
- Apply `.hidden` class when `active.hiddenSections.includes(section)`
- Remove section icons from row text — name only

Remove the `<Trash2>` icon from the row entirely (out of scope per spec).

---

## Step 3 — Wire `templateSettings` controls

Add a helper to read settings with defaults:

```ts
const getSettings = (resume: ResumeRecord): TemplateSettings => ({
  color: '#111111',
  typography: '16/1.5',
  spacing: 'comfortable',
  pagePadding: 49,
  ...resume.templateSettings[resume.activeTemplateId],
});
```

**Theme Color swatches** — add `onClick` per swatch that calls:
```ts
onChange(resume => {
  const settings = getSettings(resume);
  return touchResume({ ...resume, templateSettings: { ...resume.templateSettings, [resume.activeTemplateId]: { ...settings, color: hexValue } } });
})
```
Apply `.selected` class to the active swatch.

**Typography card** — replace `<Metric>` rows with two stepper rows:
- Base size: `<input type="number">` bound to the first segment of `typography` string (`"16/1.5"` → `16`)
- Line height: `<input type="number">` bound to the second segment

**Spacing card** — replace `<Metric>` rows with:
- Segmented control "Compact" / "Comfortable" bound to `spacing`
- Page padding stepper bound to `pagePadding`

---

## Step 4 — Remove icons from editor panels

Strip all icon imports that are only used as label prefixes inside `StylePanel` and `EditorPanel`. Keep:
- `GripVertical` (drag handle on item cards)
- `Trash2` (delete button on item cards)
- `Eye` / `EyeOff` (visibility toggle)
- `Plus` (add button)
- `AlignLeft` / `AlignCenter` / `AlignRight` (segmented alignment control — functional icons)

Remove from `sectionIcons` record and any JSX that renders them as label decorations. Remove the `sectionIcons` constant entirely if nothing else uses it.

Update `Field` component — remove the icon prop and the `field-label` icon slot. Field label becomes plain text only.

Update panel titles and section titles — remove icon prefix, keep text.

---

## Step 5 — Rework `EditorPanel` as a section switch

Replace the stacked cards structure with:

```tsx
<section className="panel editor">
  <div className="editor-subhead">{sectionLabels[selectedSection]}</div>
  <div className="section-editor" key={selectedSection}>
    {renderSectionEditor(selectedSection)}
  </div>
</section>
```

The `key={selectedSection}` triggers the CSS enter animation on section change.

`renderSectionEditor` is a switch returning the appropriate editor component for each `SectionKey`.

---

## Step 6 — Implement missing section editors

Each follows the same item-card pattern as `ItemEditor` (the existing Experience editor).

**`SummaryEditor`** — profile field grid (name, headline, email, phone, location, links) + summary textarea. No skills here.

**`ExperienceEditor`** — existing `ItemEditor`, renamed. No changes.

**`EducationEditor`** — item cards with fields: school, degree, location, start date, end date, highlights textarea. Add/delete buttons.

**`ProjectsEditor`** — item cards with fields: name, description, links (comma-separated input), highlights textarea. Add/delete buttons.

**`SkillsEditor`** — single card, comma-separated textarea rendering as a plain list. (Tag chip UI is a nice-to-have, textarea is acceptable and matches the existing pattern.)

**`AwardsEditor`** — single card, one award per line textarea.

**`CustomSectionsEditor`** — item cards with fields: title input + body textarea. Add/delete buttons.

All update handlers follow the same pattern as `updateExperience` — derive index, spread update, call `touchResume`.

---

## Step 7 — Reposition preview toolbar + add section click

**Toolbar:** Remove `position: fixed; right: 16px; top: 92px` from `.preview-toolbar`. Replace with `position: sticky; top: 16px; align-self: start`. The toolbar is already inside the `.preview-pane` grid so sticky works correctly.

**Section click:** Add `onSelectSection` prop to `PreviewPanel` and pass it to `ResumePaper`. Each `<PaperSection>` gets:
```tsx
onClick={() => onSelectSection(sectionKey)}
data-selectable
className={selectedSection === sectionKey ? 'active' : ''}
```
The paper header block gets `onClick={() => onSelectSection('summary')}`.

---

## Step 8 — CSS additions

Add to `styles.css`:

```css
/* Module row states */
.module-row.selected {
  background: var(--surface-soft);
  border-left: 2px solid var(--ink);
}
.module-row.hidden .module-name {
  color: var(--faint);
}

/* Visibility toggle button */
.visibility-toggle {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  color: var(--faint);
  min-height: auto;
  padding: 4px;
  width: 24px;
}
.visibility-toggle:hover {
  color: var(--ink);
  transform: none;
}

/* Swatch selected */
.swatches span.selected {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

/* Stepper */
.stepper {
  width: 72px;
  min-height: 32px;
  padding: 6px 8px;
  text-align: right;
}

/* Control row (label + stepper side by side) */
.control-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
}
.control-row > span {
  color: var(--muted);
  font-size: 12px;
}

/* Editor subhead */
.editor-subhead {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  margin-bottom: 12px;
  text-transform: uppercase;
}

/* Section enter animation */
.section-editor {
  animation: section-enter 150ms ease both;
}
@keyframes section-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Two-column field grid at desktop */
@media (min-width: 821px) {
  .field-grid.two-col {
    grid-template-columns: 1fr 1fr;
  }
}

/* Preview section affordance */
.paper-content-section[data-selectable] {
  border-radius: 3px;
  cursor: pointer;
  outline: 1.5px solid transparent;
  transition: outline-color 120ms ease;
}
.paper-content-section[data-selectable]:hover {
  outline-color: var(--line-strong);
  outline-style: dashed;
}
.paper-content-section[data-selectable].active {
  outline-color: var(--ink);
  outline-style: solid;
}
```

---

## Step 9 — Cleanup

- Remove unused imports from `App.tsx` (icons no longer referenced)
- Remove `sectionIcons` constant if unused
- Remove `Metric` component if no longer used
- Verify `Field` component still works after icon prop removal (or remove the component entirely and inline the field rows since they'll be simpler)

---

## Order of execution

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

Steps 1–4 can be done in a single pass through `App.tsx`. Step 5–6 follow immediately after. Step 7–8 are independent of 5–6 but easiest to do after the component shape is stable. Step 9 is final cleanup.

---

## Risk notes

- **`templateSettings` defaults** — `getSettings` must never throw on a fresh resume that has an empty `templateSettings` record. The spread defaults handle this.
- **`key={selectedSection}` animation** — this remounts the section editor on every switch. If an editor has local state (e.g. a focused input), it'll reset. Acceptable for this redesign; the data is always in `active`.
- **Toolbar sticky** — works only if `.preview-pane` has `overflow: auto` (it does). No change needed to the container.
