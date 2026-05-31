# Editor Redesign — Design Spec

**Date:** 2026-05-31
**Scope:** `EditorWorkspace` and its three sub-panels (`StylePanel`, `EditorPanel`, `PreviewPanel`)

---

## Goal

Apply the style guide in `style.md` fully to the editor view. Two parallel threads: (1) fill functional gaps — missing section editors, static controls that should be interactive, visibility toggles — and (2) apply a consistent design language across all editor components with no icons in the editor view.

---

## Architecture

### Selected section state

`selectedSection: SectionKey` lives in `EditorWorkspace`, initialized to `'experience'`. It flows as a prop to:
- `StylePanel` — highlights the active module row
- `EditorPanel` — renders only that section's editor

Three sources update `selectedSection`:
1. Clicking a module row in `StylePanel`
2. Clicking a section in `ResumePaper` (preview)
3. (Future) breadcrumb nav — out of scope here

### Template settings wiring

`active.templateSettings[active.activeTemplateId]` holds `color`, `typography`, `spacing`, and `pagePadding`. The style controls read and write this record. A sensible default is applied if the key is absent for a given template.

---

## Design language

### No icons in the editor view

All panels inside `EditorWorkspace` (StylePanel, EditorPanel, PreviewPanel) use text-only headings, labels, and row titles. No Lucide icons next to section names, field labels, or panel titles. The header chrome (`magic-chrome`) retains its existing icon buttons.

### Typography hierarchy in panels

- Panel section headings: 11px uppercase, `letter-spacing: 0.1em`, `var(--muted)` — matches the existing `.strip-head h3` pattern
- Item card titles: 13px, `font-weight: 760`, `var(--ink)`
- Field labels: 12px, `font-weight: 650`, `var(--muted)`
- Control values: 13px, `var(--ink)`

### Interaction states

- Active module row: `border-left: 2px solid var(--ink)`, background `var(--surface-soft)`
- Swatch selected: `outline: 2px solid var(--ink); outline-offset: 2px`
- Preview section hover: `outline: 1.5px dashed var(--line-strong)`, cursor pointer
- Preview section active (matches `selectedSection`): `outline: 1.5px solid var(--ink)`
- Section switch transition: `opacity` + `translateY(4px)` fade-in on `selectedSection` change

---

## StylePanel

### Module rows — section navigation

Each module row changes from a `<label>` wrapping a checkbox to a `<button>` that sets `selectedSection`. The row has two zones:

- **Left/main area** (most of the row): clicking selects the section and highlights the row
- **Right end**: an eye icon button toggles section visibility (`hiddenSections`). Uses `Eye` / `EyeOff` Lucide icons. No other icons on the row.

Active row (matches `selectedSection`): `border-left: 2px solid var(--ink)`, `background: var(--surface-soft)`.
Hidden section row: text in `var(--faint)`, eye icon in `EyeOff` state.

Row text: section name only, no icon prefix.

### Theme color swatches

Swatches read/write `templateSettings.color`. The currently active color swatch shows `outline: 2px solid var(--ink); outline-offset: 2px`. No other change to the swatch grid.

### Typography controls

Replace the three static `<Metric>` rows with:
- **Base size**: `input[type=number]` stepper, 72px wide, min 10 max 18, step 0.5, unit label "px"
- **Line height**: `input[type=number]` stepper, 72px wide, min 1.2 max 2.0, step 0.05

These write to `templateSettings.typography` (treated as a serialized string `"${baseSize}/${lineHeight}"` for now — the LaTeX compiler already ignores this field, so it's safe to store freely).

### Spacing controls

Replace the three static `<Metric>` rows with:
- **Spacing**: two-option segmented control — "Compact" / "Comfortable" — writes `templateSettings.spacing`
- **Page padding**: `input[type=number]` stepper, 72px wide, min 24 max 72, step 2, unit label "px" — writes `templateSettings.pagePadding`

---

## EditorPanel

### Structure

A sticky subheader at the top of the panel shows the active section name as plain text (no icon). Below it, one section editor card fills the panel.

Section editors are rendered conditionally via a `switch` on `selectedSection`. There is no accordion, no stacked cards.

### Section editor design language

All section editors share the same component pattern:

**Scalar sections** (skills, awards): a single card with a textarea or tag input. No item cards.

**Structured sections** (experience, education, projects, customSections): a list of item cards. Each item card has:
- A drag handle (visual only, `GripVertical`)
- A plain text title summarizing the item (role name, school name, project name, etc.)
- A delete button (`Trash2`) at the top right
- A field grid below with the relevant fields from `types.ts`
- A highlights/body textarea at the bottom where applicable

An "Add" button sits below the list.

The field grid uses two columns on panel widths above 440px, one column below.

The exact fields per section follow the type definitions in `src/domain/types.ts` directly — no deviation.

### Summary section

The summary section editor shows the profile field grid (name, headline, email, phone, location, links) and below it the summary textarea and skills textarea. These are not item cards — they are stacked labeled fields.

---

## PreviewPanel

### Toolbar repositioning

`.preview-toolbar` changes from `position: fixed` to `position: sticky; top: 16px` inside the preview pane scroll container. This prevents the toolbar from overlapping other UI at narrow widths and keeps it visually anchored to the preview.

### Preview section selection

Each `<PaperSection>` in `ResumePaper` gains an `onClick` prop that calls `onSelectSection` with the matching `SectionKey`. Hover and active outline states (see Design language section) give the user a visual affordance that sections are clickable.

The paper header (profile block) maps to the `'summary'` section key.

---

## CSS additions

```
/* Active module row */
.module-row.selected {
  background: var(--surface-soft);
  border-left: 2px solid var(--ink);
}

/* Hidden section row */
.module-row.hidden .module-name {
  color: var(--faint);
}

/* Swatch selected */
.swatches span.selected {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

/* Stepper input */
.stepper {
  width: 72px;
  min-height: 32px;
  padding: 6px 8px;
  text-align: right;
}

/* Section transition */
.section-editor {
  animation: section-enter 150ms ease both;
}

@keyframes section-enter {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Preview section affordance */
.paper-content-section[data-selectable] {
  cursor: pointer;
  border-radius: 3px;
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

## Out of scope

- Functional drag-and-drop section reordering
- Panel collapse (AppPreference.panels exists but wiring it up is a separate task)
- Mobile editor layout changes
- LaTeX compiler consuming `templateSettings` values
