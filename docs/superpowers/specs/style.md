Design a polished resume-editor workbench inspired by Magic Resume’s product language: calm, precise, document-first, and quietly premium.

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
- Preserve a sense of “paper craft”: the resume preview is the hero, not the controls.

Overall feeling:
A calm AI-powered resume workbench for serious job seekers: precise, private, local-first, elegant, minimal, and slightly tactile. It should look like a modern document-design tool, not a generic dashboard.