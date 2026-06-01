# FitCV Awesome CV Layout Foundation Design

**Date:** 2026-06-01  
**Primary area:** FitCV editor, template model, resume compile pipeline  
**Source template:** `src/latex-templates/awesome-resume`

---

## Problem

FitCV currently has structured resume content and a simple template registry, but its layouts are still fixed around section order and a basic browser PDF renderer. The next feature should make Awesome CV the first real FitCV layout while setting a foundation that scales to more LaTeX templates and future user-uploaded templates.

The foundation must preserve user content when switching layouts. Layout decisions such as section order, spacing, and page breaks should belong to the active template without mutating the underlying resume content.

---

## Goals

- Add Awesome CV as the first adapter-backed FitCV layout.
- Keep resume content template-neutral and reusable across layouts.
- Store layout modules per template so switching layouts preserves both content and each template's layout choices.
- Model the editor layout as ordered modules: content sections plus layout controls.
- Keep the Layout section focused on structure and selection, not data entry.
- Render Awesome CV through the real browser LaTeX compiler path using BusyTeX.
- Preserve the current `pdf-lib` renderer as a fallback for templates without a LaTeX adapter.
- Create a foundation that can later support additional curated templates and LLM-assisted user template adapters.

---

## Non-Goals

- Do not implement arbitrary uploaded LaTeX template support in this feature.
- Do not expose raw LaTeX controls for spacing or page breaks.
- Do not require users to understand Awesome CV macro names.
- Do not remove existing content when a template does not support it.
- Do not make `/latexeditor` the primary workflow for this feature. The focus is the main FitCV editor.

---

## Data Model

Resume content remains in `resume.content`. Layout becomes template-specific.

```ts
type ResumeRecord = {
  content: ResumeContent;
  activeTemplateId: TemplateId;
  templateLayouts: Record<string, LayoutModule[]>;
};
```

Existing `sectionOrder` can remain during migration and fallback rendering, but the module list should become the source of truth for adapter-backed layouts.

### Layout Modules

```ts
type LayoutModule =
  | {
      id: string;
      kind: 'section';
      section: SectionKey;
      sectionType: string;
      enabled: boolean;
      options?: Record<string, unknown>;
    }
  | {
      id: string;
      kind: 'space';
      enabled: boolean;
      size: 'small' | 'medium' | 'large';
    }
  | {
      id: string;
      kind: 'new-page';
      enabled: boolean;
    };
```

Section modules reference existing content by section key. They do not copy section data. Layout controls are global FitCV concepts, not Awesome CV-specific concepts. Each template renderer decides how to render or ignore them.

`enabled` lets users temporarily turn modules or layout controls off without deleting their placement.

### Default Layouts

When a resume has no saved layout for the active template, FitCV asks the template adapter for a default layout.

For Awesome CV, the first default layout should be:

1. Summary
2. Education
3. Experience
4. New page
5. Projects
6. Skills
7. Awards

Only modules with content need to render. Empty section modules can remain in the layout outline and be skipped during compile.

---

## Template Adapter Architecture

FitCV should introduce a template adapter layer. The existing template registry remains the user-facing catalog, while adapters provide rendering behavior and section-type metadata.

```ts
type TemplateAdapter = {
  id: TemplateId;
  defaultLayout: (resume: ResumeRecord) => LayoutModule[];
  sectionTypes: TemplateSectionType[];
  renderLatexProject?: (resume: ResumeRecord, modules: LayoutModule[]) => LatexProjectFile[];
};

type TemplateSectionType = {
  id: string;
  templateId: TemplateId;
  label: string;
  section: SectionKey;
  description: string;
};
```

Awesome CV's first section-types:

- `awesome-highlight` for summary
- `awesome-education` for education
- `awesome-experience` for experience
- `awesome-projects` for projects
- `awesome-skills` for skills
- `awesome-honors` for awards

The editor does not need to show these names when there is only one available section-type for a section. They are stored so future templates can offer multiple section variants.

---

## Awesome CV Rendering

The Awesome CV adapter generates a full BusyTeX project, not only a single LaTeX string.

Generated project files include:

- `resume.tex`
- generated section files under `resume/`
- copied support files from `src/latex-templates/awesome-resume`, including `awesome-cv.cls`, `fontawesome.sty`, and fonts

Module rendering rules:

- `section` renders through its `sectionType` if enabled, supported, and populated.
- `space` renders as a controlled vertical skip when enabled.
- `new-page` renders as `\newpage` when enabled.
- Unsupported modules are skipped with compile logs.
- Unsupported content remains stored in `resume.content`.

Spacing values should be constrained:

```ts
const spaceSizes = {
  small: '6pt',
  medium: '12pt',
  large: '18pt'
};
```

The adapter must escape LaTeX-sensitive user content before inserting it into generated files.

---

## Compile Pipeline

The main FitCV compile action should choose the compile path by template capability:

1. If the active template has `renderLatexProject`, generate the LaTeX project and compile with BusyTeX.
2. If the active template has no LaTeX adapter, use the current `pdf-lib` renderer.

The compile artifact shape stays compatible:

- `latexSource` stores the generated root source or a useful combined source view.
- `pdfBlob` stores the compiled PDF.
- `logs` include renderer selection, skipped modules, warnings, and compiler output.
- `generatedText` remains available for checks and tests.

Compile failures should preserve user data and report logs. If an older clean preview exists, the UI can continue showing it while marking the current compile as failed or stale.

---

## Editor UX

The FitCV editor Layout section becomes an outline. It is for module order and selection only.

Rows use simple user-facing labels:

```text
Summary
Experience
Space
New page
Education
Projects
Skills
```

The Layout section supports:

- selecting a module
- dragging to reorder modules
- adding content modules
- adding layout control modules
- toggling enabled state where appropriate
- removing inserted layout control modules

The Layout section should not contain section data editing, spacing settings, or new-page settings.

All editing happens in the second column:

- Selecting `Summary` shows the summary editor.
- Selecting `Experience` shows the experience editor.
- Selecting `Space` shows its enabled state and size control.
- Selecting `New page` shows a simple on/off control and status.

For the first version, section-type selectors can remain hidden when a section has only one available section-type for the active template. When a section later has multiple section-types, the selector can appear in the second column.

---

## Template Switching

Switching templates must never delete or rewrite content.

When the user selects a different template:

1. FitCV updates `activeTemplateId`.
2. FitCV loads `templateLayouts[activeTemplateId]`.
3. If there is no saved layout for that template, FitCV creates one from the adapter default.
4. The previous template's layout remains saved.
5. Unsupported content is preserved and reported through compatibility warnings.

This means a user can tune Awesome CV with spaces and page breaks, switch to another template, then switch back and recover the Awesome CV layout exactly.

---

## Future User-Uploaded Templates

The foundation should support user-uploaded templates later through adapters, not one-off hidden generated LaTeX.

Future phases:

1. Curated adapters for known templates.
2. User template import with manual mapping to commands or placeholders.
3. LLM-assisted adapter creation that proposes section-types, required files, compile engine, and render mappings.

Even with LLM help, the saved output should be a structured adapter that FitCV can inspect, validate, and render consistently.

---

## Validation And Error Handling

- Empty section modules remain in the layout and are skipped during rendering.
- Disabled modules remain in the layout and are skipped during rendering.
- Unsupported section-types are skipped with warnings.
- Missing required profile fields keep existing validation behavior.
- Compile errors surface BusyTeX logs without changing resume content.
- Template compatibility warnings should name preserved but unsupported content.

No validation path should delete content or layout modules automatically.

---

## Testing

Tests should cover:

- Creating a default Awesome CV per-template layout.
- Switching templates without losing content.
- Preserving separate layouts for separate templates.
- Rendering `space` and `new-page` modules into Awesome CV LaTeX.
- Skipping disabled layout controls.
- Generating a BusyTeX project with required Awesome CV support files.
- Escaping LaTeX-sensitive user content.
- Validating adapter-backed section-types in the template registry.
- Keeping existing `pdf-lib` templates on the fallback compile path.

---

## Implementation Notes

This design changes FitCV's foundation. The implementation should be incremental:

1. Add types, default layout helpers, and migration/fallback behavior.
2. Add the Awesome CV adapter and renderer tests.
3. Update compile selection to call BusyTeX for adapter-backed templates.
4. Update the Layout section to show module rows.
5. Move layout-control editing into the second column.
6. Keep existing resume content editors working with selected section modules.

The first user-visible win should be a selectable Awesome CV layout in the main FitCV editor that compiles through BusyTeX and preserves content across template switches.
