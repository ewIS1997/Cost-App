# BOQ Cost Load - Execution Checklist

Use this document to implement the application from `REACT-OFFLINE-IMPLEMENTATION-PLAN.md`. It converts the plan into small, ordered tasks suitable for a weak implementation model. The implementation plan remains the source of truth if this checklist conflicts with it.

## Non-Negotiable Rules

- [ ] Use React 19.3, Vite 8, and JavaScript. Use `.jsx` for React components and `.js` for all other modules.
- [ ] Use JSDoc typedefs for persisted and complex runtime data. Do not add TypeScript files or TypeScript configuration.
- [ ] Use only the dependencies named in the implementation plan.
- [ ] Do not create, configure, or run any automated tests. All behavior is reviewed manually.
- [ ] Start `npm run dev` after project setup. Keep the Vite localhost server running and review each completed task in the browser.
- [ ] Do not run `npm run build` during any implementation phase.
- [ ] Do not open a `file://` artifact or inspect `dist` during implementation.
- [ ] Run exactly one production build only after every phase and all manual localhost review are complete.
- [ ] Do not use a backend, API, CDN, remote asset, service worker, PWA feature, dynamic route import, or network request.
- [ ] Use `HashRouter`, never `BrowserRouter`.
- [ ] Persist business data in IndexedDB through Dexie. Zustand and React state are UI/workspace state only.
- [ ] Route every worksheet mutation through the central mutation gateway.
- [ ] Stop and report a requirement conflict instead of inventing behavior.

## Execution Discipline

For every phase, use this exact loop:

1. Read the matching sections of the implementation plan before editing.
2. Inspect the existing files that will be changed.
3. Complete only the unchecked items in the current phase.
4. Review the result in the Vite localhost browser session.
5. Manually exercise the phase acceptance checks.
6. Fix visible defects before starting the next phase.
7. Do not mark a phase complete until every checkbox and its acceptance checks are complete.

## Modern Visual Direction

- [ ] Build a crisp, professional estimating workspace, not a generic card dashboard.
- [ ] Use a compact application shell with a restrained neutral surface, a deep ink/slate navigation area, one confident accent color, and semantic success/warning/error colors.
- [ ] Use system fonts with a clear hierarchy: prominent project title, compact metadata, dense spreadsheet labels, and tabular figures for financial values.
- [ ] Use modest corner radii, subtle borders, and short opacity/color transitions. Do not use oversized rounded containers, excessive gradients, decorative blobs, or large empty hero areas.
- [ ] Make the Cost Load view desktop-first and dense: the grid is the product, not a decorative component inside a card.
- [ ] Make Projects, Summary, Reports, Import/Export, and Settings modern and scannable with clear action hierarchy, useful empty states, compact summary metrics, and intentional spacing.
- [ ] Support light and dark themes with CSS custom properties. Preserve contrast, focus visibility, selected states, derived-cell states, override states, filter states, BOQ group colors, and find-result states.
- [ ] At widths under 900 px, keep core actions visible, move lower-priority toolbar controls to an accessible overflow menu, and allow horizontal grid scrolling.
- [ ] Respect `prefers-reduced-motion`. Never rely on color alone to show status or errors.

## Phase 0 - Confirm Scope

- [ ] Read `REACT-OFFLINE-IMPLEMENTATION-PLAN.md` completely.
- [ ] Read `PAGE-DESCRIPTION.md` completely.
- [ ] Confirm the source is currently empty or record all existing files before changing them.
- [ ] Confirm Node and npm support Vite 8.
- [ ] Write down any conflict before code is added.

Acceptance checks:

- [ ] No unresolved conflict exists.
- [ ] The implementer can state the data persistence, routing, build, no-test, localhost, and final-build rules correctly.

## Phase 1 - Create The JavaScript Foundation

- [ ] Create the Vite React JavaScript application.
- [ ] Add the approved runtime dependencies: React Router, Dexie, TanStack Table, TanStack Virtual, Zustand, Tailwind CSS, Lucide React, `xlsx`, and `vite-plugin-singlefile`.
- [ ] Pin installed versions in the lockfile.
- [ ] Configure Tailwind and global CSS entry points.
- [ ] Add linting only. Do not add test tooling, test files, or test scripts.
- [ ] Create the required source folders from the implementation plan.
- [ ] Create the base app entry point and render a simple application shell.
- [ ] Start `npm run dev` and keep it running.

Acceptance checks:

- [ ] The app opens at the Vite localhost URL without console errors.
- [ ] The project contains JavaScript and JSX source files only; no TypeScript or test files exist.

## Phase 2 - Configure Packaging And Routes

- [ ] Configure Vite `base` as `./`.
- [ ] Configure the React plugin and `vite-plugin-singlefile`.
- [ ] Configure one HTML output named `BOQ-Cost-Load.html`, disabled CSS splitting, inlined assets, and disabled production source maps.
- [ ] Ensure no route is dynamically imported.
- [ ] Create a static HashRouter route table for Projects, New Project, Cost Load, Summary, Reports, Import/Export, and Settings.
- [ ] Redirect `#/` and unknown routes to `#/projects`.
- [ ] Add a warning toast for unknown routes.
- [ ] Add placeholder pages that identify the route and preserve shared layout navigation.

Acceptance checks:

- [ ] Every hash route renders and browser Back/Forward works on localhost.
- [ ] No production build has been run.

## Phase 3 - Build The Domain Layer

- [ ] Create `src/domain/types.js` with JSDoc typedefs for rows, worksheets, sheets, projects, settings, filters, and backup envelopes.
- [ ] Create constants for row/sheet limits, history limits, column widths, schema versions, and recognized column keys.
- [ ] Create the fixed A-K column definitions in the exact specified order. Keep Remark hidden by default.
- [ ] Add factories for IDs, blank rows, blank worksheets, sheets, projects, and settings.
- [ ] Implement BOQ code normalization: string conversion, trim, uppercase, blank string.
- [ ] Implement strict numeric parsing: null for blank, commas allowed, reject partial parses, non-finite values, and absolute values above `1e12`.
- [ ] Implement resolved BOQ quantity using the exact override/shared/unassigned/null priority.
- [ ] Implement pure Cost, Used Cost, Total Cost, and display formatting functions.
- [ ] Implement quantity pruning and BOQ-code-change quantity transfer rules.
- [ ] Implement pure projection helpers for filters, sorting, visible row IDs, and filter-aware insertion values.
- [ ] Implement validation for rows, worksheets, sheet collections, projects, settings, backups, and Excel import staging data.
- [ ] Implement backup migration and validation for legacy worksheet v1-v3, legacy workbook v4, project backup v1, and all-projects backup v1.

Acceptance checks:

- [ ] Domain modules do not import React, Dexie, or Zustand.
- [ ] All validation errors are human-readable.
- [ ] Derived costs are never stored in an authoritative row.

## Phase 4 - Add IndexedDB Repositories

- [ ] Create the Dexie database named `boq-cost-load-react`.
- [ ] Define `projects`, `sheets`, and `settings` stores with the exact planned indexes.
- [ ] Initialize settings on first use.
- [ ] Add repository functions to list projects with sheet counts and load one project with position-ordered sheets.
- [ ] Add one transaction to create a project and its first blank sheet.
- [ ] Add transactional project metadata, sheet, sheet lifecycle, project duplication, and project deletion operations.
- [ ] Add repository functions for reading and writing settings.
- [ ] Add transactional project replacement and all-project replacement operations.
- [ ] Add export snapshot functions that flush relevant pending saves before reading a transactionally stable snapshot.
- [ ] Add legacy database discovery that offers import but never deletes legacy data.
- [ ] Implement a per-sheet autosave coordinator with 500 ms debounce, serialized writes, a single latest follow-up write, retryable failure state, and `pagehide` best-effort flush.

Acceptance checks:

- [ ] Create a project, reload localhost, and verify it reloads from IndexedDB.
- [ ] A save state is visibly `Saving...`, `Saved`, or `Save failed`.
- [ ] Multi-record operations use transactions.

## Phase 5 - Application Shell And Shared UI

- [ ] Build `App`, `AppLayout`, router integration, app version, and top-level error boundary.
- [ ] The error boundary must provide a safe route back to Projects and never clear data.
- [ ] Create reusable modal, confirmation dialog, toast region, empty state, and toolbar primitives.
- [ ] Build a responsive shared navigation/header with project context and save status.
- [ ] Add theme tokens and apply project dark mode to the application shell.
- [ ] Add the first-run IndexedDB/storage notice with a dismiss action persisted to settings.
- [ ] Ensure dialogs trap focus, restore focus on close, and close on Escape when safe.
- [ ] Add explicit error feedback for blocked IndexedDB, write failure, quota failure, invalid route, clipboard failure, download failure, and limits.

Acceptance checks:

- [ ] Every route has consistent modern navigation, visible focus states, and a toast region.
- [ ] Storage notice clearly states that projects are not inside the HTML and recommends JSON backups.

## Phase 6 - Projects Dashboard

- [ ] Build a polished Projects dashboard sorted by `updatedAt` descending.
- [ ] Show each project name, sheet count, created time, updated time, and clear Open/Rename/Duplicate/Export/Delete actions.
- [ ] Build the empty state with a useful explanation and primary Create Project action.
- [ ] Build the New Project page with labeled input, validation, focused error state, Create, and Cancel.
- [ ] Create projects with one blank `Sheet 1` and one blank row.
- [ ] Open a project at its persisted active sheet.
- [ ] Rename projects after trim/required/100-character validation.
- [ ] Duplicate a project with new project, sheet, and row IDs and a sensible Copy name.
- [ ] Require deletion confirmation that includes the project name.
- [ ] Add top-level project import that always creates a new project and never replaces one.

Acceptance checks:

- [ ] Multiple projects remain independent after reload.
- [ ] Deleting the currently open project routes to Projects.
- [ ] Dashboard actions are keyboard accessible and visually clear in both themes.

## Phase 7 - Workspace State, Sheets, And Mutation Gateway

- [ ] Create focused Zustand stores for UI state and loaded workspace state. Do not persist business data with Zustand middleware.
- [ ] Load sheets in position order and restore the project active sheet.
- [ ] Create per-sheet undo/redo stacks limited to 20 snapshots and 24 MB serialized history.
- [ ] Implement the single worksheet mutation gateway in the exact planned order: clone, mutate, normalize, prune, validate, history, replace, recalculate, dirty, autosave.
- [ ] Ensure view mutations for filter/sort/resize/visibility also pass through the gateway.
- [ ] Implement add, activate, rename, duplicate, and delete sheet actions.
- [ ] Enforce unique trimmed names, 60-character limit, 100-sheet limit, and minimum one sheet.
- [ ] Make duplicate sheets create new sheet and row IDs immediately after the source sheet.
- [ ] Make active-sheet deletion select the nearest adjacent remaining sheet.
- [ ] Build accessible sheet tabs with roving focus, keyboard navigation, rename on double-click, and context menu behavior.

Acceptance checks:

- [ ] Undo history is isolated by sheet during the session.
- [ ] Every worksheet change becomes dirty and saves through the autosave coordinator.

## Phase 8 - Read-Only Cost Grid

- [ ] Create TanStack Table column metadata from the domain column definitions.
- [ ] Create a fixed-height 28 px virtualized row renderer using TanStack Virtual with twelve rows of overscan.
- [ ] Use stable row IDs as React keys and maintain row ID lookup maps when rows change.
- [ ] Render the gutter, headers, formula bar, grid, sheet tabs, and status bar as one dense workspace.
- [ ] Render derived Cost, Used Cost, and Total Cost through shared domain functions only.
- [ ] Add deterministic BOQ group colors with readable contrast.
- [ ] Render derived cells and overridden values with non-color indicators.
- [ ] Respect hidden columns and hide Remark initially.
- [ ] Use deferred or transition-based updates only for expensive non-urgent filtering/search work.

Acceptance checks:

- [ ] A 10,000-row worksheet remains responsive during scroll on localhost.
- [ ] Only virtualized visible rows plus overscan are mounted.

## Phase 9 - Selection, Editing, And Formula Bar

- [ ] Model active cell, anchor, extent, rectangular bounds, and whole-row/whole-column selection by visible row order.
- [ ] Implement pointer selection, Shift extension, Ctrl+A, Shift+Space, and Ctrl+Space.
- [ ] Implement automatic scroll-to-active-cell behavior.
- [ ] Build inline editable-cell overlay and formula-bar editing.
- [ ] Allow editing only A, B, C, D, E, G, I, and K. Protect F, H, and J everywhere.
- [ ] Implement single-click select, active-cell click replace edit, double-click edit, F2 edit, and printable-character replace edit.
- [ ] Implement Enter, Shift+Enter, Tab, Shift+Tab, and Escape editor behavior.
- [ ] Keep invalid numeric input open with a specific validation error.
- [ ] Show raw numeric text while editing and formatted values otherwise.
- [ ] Calculate exact status count/sum/average for up to 2,000 cells; over that, show only exact count and neutral placeholders for aggregates.
- [ ] Add a navigation guard that commits or cancels the active edit before leaving Cost Load.

Acceptance checks:

- [ ] A user cannot edit derived columns through the cell, formula bar, keyboard, paste, or any other path.
- [ ] Invalid input cannot reach persisted data.

## Phase 10 - Rows, Clipboard, And Quantities

- [ ] Implement copy, cut, paste, and clear as one gateway mutation each.
- [x] Implement drag-only cell fill down, up, left, and right with a preview, range-pattern extension, validation, and one undoable mutation.
- [ ] Use tab-separated values and retain an internal clipboard fallback matrix.
- [ ] Enforce 50,000-cell copy/clear/fill and 100,000-cell paste limits.
- [ ] Ignore derived-cell targets during paste; never overwrite F, H, or J.
- [ ] Make a one-cell paste fill a larger selection.
- [ ] Allow paste to append rows only up to the 10,000-row maximum.
- [ ] Implement append row, insert row before selection, and delete selected rows.
- [ ] Make insertion filter-aware without clearing filters; copy sufficient active visible source values or show an explanatory error.
- [ ] Implement direct per-resource BOQ Qty editing and copy the source quantity when inserting a resource under the same BOQ item.
- [ ] Apply all BOQ-code-change quantity transfer/pruning rules exactly.
- [ ] Add Ctrl++/Ctrl+-, Delete/Backspace, Ctrl+C/X/V, and Ctrl+S behavior.

Acceptance checks:

- [ ] All row, quantity, clipboard, and fill changes are undoable.
- [ ] Quantities contain no orphaned BOQ keys after a completed mutation.

## Phase 11 - Filters, Sorting, Columns, And Find

- [ ] Build a column filter popup with search, selected-value whitelist, condition controls, Apply, Clear, and Cancel.
- [ ] Implement every required condition exactly: equals, notEquals, contains, notContains, startsWith, endsWith, gt, gte, lt, lte, between, isBlank, isNotBlank.
- [ ] Use shared numeric parsing for numeric filter conditions and block Apply for invalid values.
- [ ] Normalize reverse between bounds before applying.
- [ ] Limit matching-value checkbox rendering to 200 while preserving hidden selected values.
- [ ] Implement text and numeric sort rules, derived numeric sort, blank-last behavior, and Restore Original Order without mutating physical row order.
- [ ] Implement column width resize committed once on pointer release or keyboard confirmation.
- [ ] Implement column visibility and Ctrl+Shift+R Remark toggle through the gateway.
- [ ] Build Find and Replace with visible-cell or selection scope, case and entire-cell toggles, next/previous, Replace Current, and Replace All.
- [ ] Count all matches, retain at most 500 navigable display records, and highlight only mounted virtual rows.
- [ ] Allow find in derived columns but never replace derived values.

Acceptance checks:

- [ ] Canceling a filter popup or intermediate resize creates no history entry.
- [ ] Filtering and sorting visibly update rows without changing source-row order.

## Phase 12 - Resource Copy, Shortcuts, And Toolbar Parity

- [ ] Build the Copy Resources dialog and Ctrl+Alt+C shortcut.
- [ ] Build gutter hover tracking and the 450 ms CC/VV double-key workflow.
- [ ] Clear transient resource clipboard data when the project changes.
- [ ] Implement exact resource cloning/replacement rules, including destination quantity preservation and new row IDs.
- [ ] Add grid keyboard handlers for every shortcut in the implementation plan.
- [ ] Ensure grid shortcuts do not capture typing in regular controls, dialogs, selects, or active text editors except editor-specific keys.
- [ ] Add clear context menus and a responsive overflow menu for lower-priority toolbar actions.

Acceptance checks:

- [ ] Manually exercise each documented keyboard shortcut on localhost.
- [ ] Resource replacement is one undoable mutation and preserves each copied row's BOQ Qty.

## Phase 13 - Summary And Reports

- [ ] Create shared project aggregation functions using the same calculation and quantity-resolution functions as the grid.
- [ ] Build a modern Summary page with grand total, sheet count, source-row count, unique BOQ code count, grouped rows, and grand-total row.
- [ ] Apply the `Unassigned`, `Mixed`, and blank BOQ quantity display rules exactly.
- [ ] Build a Reports page with Project Summary and Resource Detail report types.
- [ ] Add all-sheets/one-sheet scope selection.
- [ ] Include every required metadata and cost column in the reports.
- [ ] Add browser print action and print CSS that hides navigation and controls.

Acceptance checks:

- [ ] Summary, report, and grid values agree for manually entered data.
- [ ] Print preview is legible and excludes interactive controls.

## Phase 14 - JSON, Excel, And CSV Exchange

- [ ] Implement project JSON export after navigation guard resolution and pending-save flush.
- [ ] Implement project JSON import-as-new with full validation, new IDs, new timestamps, and no overwrite.
- [ ] Implement replace-current-project with confirmation, target project ID preservation, new sheet/row IDs, remapped active sheet, preserved creation time, and one transaction.
- [ ] Implement all-project export after all pending saves flush.
- [ ] Implement all-project import with full validation, confirmation, exact ID/timestamp preservation, one transaction, and safe workspace reset.
- [ ] Enforce the 100 MB JSON backup limit before parsing and never partially apply invalid data.
- [ ] Implement active-sheet Excel export with an empty-sheet template, one BOQ Qty value per resource row, derived formulas, widths, supported freeze panes/autofilter, and safe filename.
- [ ] Implement Excel import with a 25 MB limit, `BOQ Template` preference, header-mapped editable columns, empty-row removal, row-level quantity handling, full validation, confirmation, and one undoable replacement mutation.
- [ ] Implement visible sorted-row CSV export with headers, derived values, correct escaping, and formula-injection protection for text beginning `=`, `+`, `-`, or `@`.
- [ ] Show clear success and error toasts for every file operation.

Acceptance checks:

- [ ] Invalid import data causes zero IndexedDB changes.
- [ ] Exported values use the same calculation functions as the grid.

## Phase 15 - Settings And Final UX Polish

- [ ] Build Settings with only the planned settings and maintenance actions.
- [ ] Add default theme control for newly created projects.
- [ ] Add a control to show the storage notice again.
- [ ] Add all-project JSON export/import controls.
- [ ] Add two-step confirmation before deleting all local data.
- [ ] Show application and database schema versions.
- [ ] Complete light/dark token coverage for every page, menu, dialog, table, and grid state.
- [ ] Complete compact responsive layouts, toolbar overflow, touch-safe control targets, and narrow-width grid behavior.
- [ ] Complete dialog labeling, focus restoration, keyboard access, live-region toasts, tab roles, and visible focus indicators.
- [ ] Check reduced-motion behavior and print layouts manually.

Acceptance checks:

- [ ] Keyboard-only use succeeds for navigation, dialogs, sheet tabs, and primary actions.
- [ ] The application looks intentional and modern in both themes without reducing spreadsheet density.

## Phase 16 - Final Review And One Build

Do not start this phase until every prior checkbox is complete and reviewed through Vite localhost.

- [ ] Review every feature in the implementation plan item by item on localhost.
- [ ] Confirm no test files, test dependencies, test scripts, or automated test commands were added or run. Confirm manual review covered the completed application.
- [ ] Confirm no remote URLs, network calls, dynamic page imports, workers, service workers, or PWA behavior were introduced.
- [ ] Confirm no production build has been run yet.
- [ ] Run `npm run lint` and resolve lint errors.
- [ ] Stop the development-only workflow only after the project is fully complete.
- [ ] Run `npm run build` exactly once.
- [ ] Inspect `dist` and confirm it contains only `BOQ-Cost-Load.html`.
- [ ] Open the final HTML through `file://` in current Edge and Chrome.
- [ ] Verify hash navigation, project creation, workbook editing, persistence, import/export, reports, dark mode, and printing in the final artifact.
- [ ] Inspect browser network while offline and confirm the final artifact makes no external requests.
- [ ] Record any approved deviation from the implementation plan.

Final acceptance checks:

- [ ] `dist/BOQ-Cost-Load.html` is the only distributable file.
- [ ] The application works offline after double-clicking the final HTML.
- [ ] The final artifact has been built once, after all development work was completed.
