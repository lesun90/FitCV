# FitCV Readiness Command Center Design

Date: 2026-06-05
Status: Approved for planning

## Context

FitCV is a local-first resume workbench with a dashboard, editor workspace, PDF compile/export, AI-assisted CV import, fitted CV generation from job descriptions, and three readiness dimensions:

- ATS Readiness: deterministic local checks.
- CV Quality: AI review of resume quality.
- JD Match: AI review of a fitted CV against a job description.

The editor already contains compact readiness pills and a slide-in readiness drawer. This design turns that direction into the primary readiness workflow while preserving the dense editor and preview layout.

## Goal

Create an end-to-end readiness experience that lets a user see readiness status, understand issues, run checks, jump to fixable fields, review AI-proposed fitted CV changes, and export only when the fitted CV is reviewed.

## Non-Goals

- Redesign the entire FitCV visual system.
- Replace the existing editor board, layout panel, WYSIWYG editor, or PDF preview.
- Add new scoring methodologies.
- Add server-side storage or remote account state.
- Add a new dashboard-only readiness workflow in this pass.

## Chosen Approach

Use a Readiness Command Center pattern:

- Keep compact status pills in the editor chrome.
- Use a right-side drawer as the detailed readiness surface.
- Make each readiness issue actionable when it maps to an editor field.
- Treat fitted CV review status as part of readiness and export safety.

This keeps readiness close to the editing moment without taking permanent space from the editor.

## User Experience

### Editor Chrome

The editor chrome shows readiness pills for:

- ATS.
- CV Quality.
- JD Match, only when a fitted CV has a job description.

Each pill shows either a score or an unrun state. Clicking a pill opens the drawer on that dimension. Pills must have accessible labels with the dimension name and score or unrun state.

### Readiness Drawer

The drawer includes:

- Header with current dimension, score when available, and last-updated time.
- Tabs for available dimensions.
- Score visualization for the selected dimension.
- Grouped issue list.
- One primary run action for the selected dimension.

Issue groups are ordered:

1. High.
2. Medium.
3. Info.

Each issue row shows severity, message, impact when present, and a field navigation affordance when possible.

### Issue Navigation

When an issue has a supported field path:

- Selecting the issue closes the drawer.
- The editor switches to the module containing the field.
- The field scrolls into view.
- The first input or textarea in that field receives focus.

Supported navigation targets:

- `content.profile.*`.
- `content.summary`.
- `content.flexSections.<sectionId>`.

Unmapped issues remain visible but are not presented as clickable.

### Run States

Unrun states explain what will happen:

- ATS Readiness: runs locally and does not send resume content to AI.
- CV Quality: sends resume text to the configured AI provider.
- JD Match: requires a fitted CV linked to a job description and sends fitted CV text plus the job description to the configured AI provider.

Run buttons are disabled or show busy feedback while a readiness request is active. Existing error notices remain the recovery path for missing AI settings or provider failures.

### Fitted CV Review

When a fitted CV has proposed changes:

- The review panel summarizes pending, accepted, rejected, and manually reviewed changes.
- Pending changes keep export blocked.
- Accepting, rejecting, or marking manual updates the review state.
- JD Match should be considered incomplete until pending changes are reviewed or intentionally marked manual.

The review panel remains collapsible so it does not permanently displace the editor.

## Accessibility

- All readiness pills, drawer tabs, close controls, issue rows, and run buttons must be keyboard reachable.
- Drawer closes on Escape and via a visible close button.
- Icon-only controls require `aria-label`.
- Score colors must be paired with text, not used as the only signal.
- Focus styles must remain visible.
- Issue navigation must support Enter and Space.
- Error notices should use an accessible announcement pattern such as `role="alert"` where practical.
- Reduced-motion users should not receive non-essential drawer or score animations.

## Visual Direction

Use a professional productivity dashboard tone:

- Neutral surfaces.
- High-contrast text.
- Status colors limited to green, amber, red, blue, and muted gray.
- Lucide icons for structural actions.
- Compact controls with at least 44px touch targets where controls sit in primary workflows.
- Stable dimensions for score pills, tabs, and issue rows to avoid layout shifts.

The design system query recommended a flat, operations-style interface with status colors and clear information density. FitCV should keep the current calm workbench feel and avoid decorative visuals that compete with resume editing.

## Implementation Boundaries

Likely touched areas:

- `src/ui/App.tsx`: readiness pills, drawer, issue grouping, navigation behavior, run states, fitted CV review affordances.
- `src/ui/styles.css`: drawer layout, issue groups, pills, review summary, responsive behavior, reduced-motion handling.
- `src/ui/App.test.tsx`: behavioral coverage for opening drawer, navigating issues, and available JD tab state if practical.

Existing uncommitted AI import changes must be preserved. Implementation should avoid unrelated refactors.

## Verification Plan

- Run unit tests with `npm test`.
- Run production build with `npm run build`.
- Manually verify:
  - 375px mobile width.
  - Desktop editor width.
  - Keyboard tab order through pills, drawer tabs, issue rows, and close button.
  - Escape closes the drawer.
  - A navigable ATS issue moves focus to the expected editor field.
  - CV Quality and JD Match disclose AI-provider use before or during run states.
  - Export remains blocked while fitted CV changes are pending.

## Implementation Decisions

- Issue grouping uses separate severity headings with counts. Empty groups are hidden.
- The score visualization remains the current arc gauge for continuity, with reduced-motion support and no essential information conveyed by animation alone.
- The first implementation keeps the existing global `busy` string. Per-dimension busy state is deferred until multiple concurrent readiness runs are supported.
