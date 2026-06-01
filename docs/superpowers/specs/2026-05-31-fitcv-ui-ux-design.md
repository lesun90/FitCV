# FitCV UI/UX Design

## Direction

FitCV should feel like a serious local productivity tool for resume editing: quiet, dense, trustworthy, and fast. The provided dashboard mockup is the visual reference. The app uses a soft off-white workspace, crisp white panels, a restrained green accent, 8px radii, clear status chips, and icon-led actions.

## Dashboard And Library

The first screen should make local ownership obvious without feeling like a landing page. The library area includes compact create, duplicate, PDF upload, `.fitcv` import, and backup export actions. Resume cards show title, template, updated time, compile/review status, and primary open context.

## Editor Workbench

The editor keeps the milestone layout: left style/layout controls, center content editor, and right browser PDF preview. The pass improves hierarchy, topbar status, action clarity, panel density, template switching, section visibility controls, review markers, compile logs, and ATS warnings. Mobile collapses the layout into a single-column flow while keeping actions reachable.

## Magic Resume Design Language Reference

Reference: Magic Resume workbench at https://magicv.art/app/workbench/546e2586-2b08-48ca-9c39-a8a98362d0b6 and source at https://github.com/JOYCEQL/magic-resume.

Research notes:

- The workbench composition is a full-screen document editor: sticky top header, left layout/theme/typography sidebar, center structured editor, right A4 resume preview, and a compact floating utility dock.
- The source uses a warm neutral theme: `#F9F9F7` background, `#F2F0E9` secondary surface, `#E6E6E3` border, and `#1B1B18` charcoal primary text/action color.
- The UI language is calm, precise, and document-first. It relies on thin borders, soft card surfaces, compact controls, Lucide-style icons, drag handles, visibility toggles, color swatches, sliders, and subtle Motion/Framer Motion transitions.
- The resume preview is the visual anchor: a white A4 page on a pale gray canvas, with realistic shadow and print-oriented typography.

Style prompt:

```text
Design a polished resume-editor workbench inspired by Magic Resume's product language: calm, precise, document-first, and quietly premium.

Create a full-screen web app UI for an AI resume editor. The layout should feel like a professional desktop design tool: a top header, a left configuration sidebar, a central structured editing panel, and a right live A4 resume preview. Prioritize usability, scanability, and editing flow over marketing polish.

Visual direction:
- Warm off-white workspace, not pure white. Use parchment-neutral surfaces: #F9F9F7 background, #F2F0E9 secondary, #E6E6E3 borders, #1B1B18 charcoal text.
- The interface should feel soft but exact: thin borders, subtle dividers, low shadows, quiet cards, restrained contrast.
- Use a dark charcoal primary action style for active controls, selected sections, and export buttons.
- Avoid bright SaaS gradients, oversized hero styling, glassmorphism, neon, or decorative blobs.
- Keep the product feeling like a refined editor wrapped around a printable document.

Layout:
- Header height around 64px, sticky at top, with app name on the left, editable resume title, theme/settings controls, and an export button on the right.
- Main area uses three resizable vertical panels:
  1. Left sidebar: layout sections, theme color swatches, typography controls, spacing controls.
  2. Middle editor: selected section form with rows, icon pickers, drag handles, visibility toggles, delete actions.
  3. Right preview: gray canvas with centered white A4 resume sheet, realistic shadow, scale-to-fit behavior.
- Add a compact floating vertical dock on the right side of the preview with icon-only actions: template, grammar check, download/export, duplicate, collapse panels, home, GitHub/help.
- On smaller desktop widths, allow side panels to collapse; on mobile, switch to a simplified editor/preview mode.

Components:
- Cards: 8-12px radius, 1px neutral border, almost-flat shadow.
- Inputs: compact 32-40px height, rounded 6-8px, neutral border, focus ring in charcoal.
- Buttons: icon-first; primary buttons are charcoal with off-white text; ghost buttons hover with pale neutral fill.
- Section items: draggable rows with grip icons, emoji or Lucide-style section icons, eye visibility toggles, red delete icons.
- Theme picker: small circular swatches, mostly grayscale plus restrained accent colors like royal blue, deep red, orange-red, indigo, and green.
- Sliders and numeric steppers should feel utilitarian and dense, not playful.
- Tooltips should be small, direct, and appear near icon-only controls.

Typography:
- Use a refined serif such as Newsreader for app headings and section titles.
- Use a clean sans for UI body text; keep it compact and readable.
- Resume preview typography can differ from app chrome and should feel print-oriented.
- Use 12-14px body text in controls, 16-18px panel headings, no giant display type.

Motion and UX:
- Motion should be subtle and functional: fade/scale entry, small hover scale on draggable cards, smooth panel collapse, gentle dock hover states.
- Use spring-like reorder animations for draggable sections and fields.
- Keep interactions immediate and editor-like: click a resume section in preview to select its editor section; edits update the preview live.
- Show active state with black border/ring, not loud color.
- Preserve a sense of "paper craft": the resume preview is the hero, not the controls.

Overall feeling:
A calm AI-powered resume workbench for serious job seekers: precise, private, local-first, elegant, minimal, and slightly tactile. It should look like a modern document-design tool, not a generic dashboard.
```

## Accessibility And Performance

The implementation stays CSS-first and uses the existing React and lucide dependencies. Interactive targets remain at least 40px high, focus states are visible, regions have accessible labels, iframe space is reserved to reduce layout shift, and no heavy UI framework is added.

## Verification

Add a UI smoke test for the library/workbench shell. Verify with the focused UI test, full test suite, and production build.
