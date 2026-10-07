# Phase 08 Review And Phase 09 Handoff

## Purpose

This file is the implementation handoff after reviewing the application through Phase 08. Follow it in order. Do not start Phase 09 until every blocking Phase 08 fix below is complete and manually verified.

The source of truth for behavior remains `REACT-OFFLINE-IMPLEMENTATION-PLAN.md`.

## Review Scope And Evidence

- Reviewed the Phase 03-04 checklist, Phase 05-08 checklist, implementation plan, and every current `src/` module.
- Ran `npm.cmd run lint`: no lint errors; one React Compiler compatibility warning remains for `useVirtualizer` in `src/features/cost-grid/CostGrid.jsx`.
- Opened the application on Vite localhost. The Projects page and a persisted Cost Load page rendered without application console errors.
- The Phase 08 performance acceptance for a persisted 10,000-row worksheet was not demonstrated. It remains required manual verification.
- Do not treat placeholder pages for Summary, Reports, Import/Export, or Settings as defects in this handoff. They belong to Phases 13, 14, and 15.
- Do not implement clipboard, rows, quantities, filters, find/replace, reports, or import/export UI during Phase 09. Those belong to later phases.

## Blocking Fixes Before Phase 09

### P0-1: Unsaved Worksheet Data Can Be Lost

**Files:** `src/stores/workspaceStore.js:36-39`, `src/app/App.jsx:36-39`, `src/database/repositories.js:106-113`

**Failure:** `mutateSheet` schedules a save after 500 ms. Before it runs, `addSheet`, `renameSheet`, `duplicateSheet`, or `deleteSheet` calls `load(project.id)`, which replaces the in-memory workbook with the older IndexedDB version. `ProjectRoute` also calls `load(projectId)` for every route inside the same project. A later mutation can then persist this stale workbook and permanently discard the first change.

**Required implementation:**

1. Add a workspace-level `flushProject(projectId)` action that asks `saveCoordinator.flushProject(projectId)` to finish all pending, queued, and active writes.
2. Before any workspace reload, flush the currently loaded project when it is dirty. If flushing fails, retain the current workspace, show an error, and abort the lifecycle action or navigation.
3. Do not reload a project merely because the route changes from Cost Load to Summary, Reports, or Import/Export. Load only when the requested project ID differs from the already loaded project ID, or when an explicit reload is necessary after a transaction.
4. Prefer applying the result returned by `createSheet`, `renameSheet`, `duplicateSheet`, and `deleteSheet` to the Zustand state. If a full reload remains necessary, flush first.
5. When `load(projectId)` is asked to replace a dirty different project, flush the old project before replacing state.
6. Add a route/navigation guard API now, even if Phase 09 has no active editor yet. It must be called before leaving Cost Load. Phase 09 will extend it to commit or reject the active cell editor.

**Manual verification:**

1. Create a project and modify a worksheet through a temporary direct store call or the completed Phase 09 editor.
2. Immediately add, rename, duplicate, and delete a sheet without waiting 500 ms. Reload the browser after each case. The original change must remain.
3. Modify a worksheet and immediately navigate to another project route. Return and reload. The change must remain.
4. Simulate a save failure if possible. Confirm the project is not replaced with stale data and the user sees an error.

### P1-2: Undo And Redo Are Not Implemented

**File:** `src/stores/workspaceStore.js:40-49`

**Failure:** The store creates `undo` and `redo` snapshot arrays, but has no `undoSheet` or `redoSheet` operation. Phase 07 claims per-sheet undo/redo history is complete, but the required feature is unusable.

**Required implementation:**

1. Add `undoSheet(sheetId)` and `redoSheet(sheetId)` to the workspace store before wiring Phase 09 shortcuts.
2. Each operation must clone the target snapshot, validate it, update only that sheet, and move the current snapshot to the opposite history stack.
3. Undo and redo must mark the sheet dirty, schedule autosave, and preserve the 20-entry and 24 MB history limits.
4. Do not create a new history entry while applying undo or redo.
5. Disable or no-op safely when the requested stack is empty.
6. Keep histories independent by sheet ID and clear them only when the project is unloaded.

**Manual verification:**

1. Make three mutations on Sheet 1, switch to Sheet 2, make two mutations, and switch back.
2. Undo and redo on each sheet. Only that sheet's state may change.
3. Reload the browser. Workbook data persists, but session-only history is reset.

### P1-3: Legacy Worksheet v1/v2 Imports Reject Valid Data

**Files:** `src/database/migrations.js:5-14`, `src/domain/validation.js:12-16`

**Failure:** `migrateLegacyWorksheet` copies legacy rows almost unchanged. Older rows that lack fields introduced by later schemas, including `boqQtyOverride` and `unassignedQty`, fail current required-field validation. Quantity keys are copied without BOQ normalization, so valid lower-case or padded keys can also fail validation.

**Required implementation:**

1. Replace the generic spread-based migration with explicit adapters for schemas v1, v2, and v3.
2. For each imported row, create a current blank row and copy only recognized legacy values into it. Generate a new row ID. Use `null` for absent numeric fields and `''` for absent text fields.
3. Parse and validate legacy numeric values with the shared numeric parser. Report the legacy row number and field when invalid.
4. Normalize every BOQ code and every quantity-map key. Reject duplicate keys that normalize to the same non-empty BOQ code.
5. Ensure each non-empty imported BOQ code has a quantity before returning the completed worksheet. Do not silently invent, drop, or overwrite a quantity.
6. Validate the fully migrated schema-v3 worksheet with normal strict worksheet validation before returning it.
7. Keep the existing v4 workbook migration strict, but reuse the same row-normalization helper where its legacy shape permits it.

**Manual verification:**

1. Import valid minimal v1, v2, and v3 worksheet backups, including zero numeric values and lower-case quantity keys.
2. Confirm each imports as a new project with new project, sheet, and row IDs.
3. Import malformed data such as an invalid numeric string or conflicting normalized quantities. Confirm the error identifies the source row and IndexedDB receives no partial project.

### P1-4: Project Dashboard Does Not Validate Corrupt IndexedDB Records

**Files:** `src/database/repositories.js:13-16`, `src/pages/ProjectsPage.jsx:13-15`

**Failure:** `listProjectsWithSheetCounts` returns raw project records. A corrupt timestamp, name, or record shape can reach the dashboard and fail while formatting or rendering, rather than returning the required descriptive persistence error.

**Required implementation:**

1. Read each project and its sheets in a consistent read transaction.
2. Validate the complete project and sheets with `validateProject` before returning dashboard data.
3. If any record is corrupt, throw one descriptive error identifying that project ID and the validation failure. Do not silently skip it.
4. Keep the returned list sorted by `updatedAt` descending only after validation.

**Manual verification:**

1. With browser DevTools, corrupt one persisted project record deliberately.
2. Open Projects. Confirm a controlled error toast is shown and no React error boundary is triggered.
3. Restore valid data and confirm normal ordering and sheet counts.

### P1-5: Phase 08 Does Not Use TanStack Table

**Files:** `src/features/cost-grid/CostGrid.jsx:1-42`, `package.json:11`

**Failure:** The grid manually maps `COLUMN_DEFINITIONS`; `@tanstack/react-table` is installed but never used. This does not meet the Phase 08 requirement to define TanStack Table columns and use its core row/column model.

**Required implementation:**

1. Build stable TanStack Table column definitions from `COLUMN_DEFINITIONS`; retain column key, letter, label, editable, derived, and width metadata.
2. Create a table instance using the active sheet rows, `getCoreRowModel`, and `getRowId: (row) => row.id`.
3. Render headers from the table header groups and cells from the table row/cell model.
4. Keep TanStack Virtual responsible only for mounting vertical rows. Its count and lookup must use the table core row model.
5. Preserve fixed 28 px row height, overscan 12, hidden columns, row gutter, domain-only derived values, group indicator, and textual calculated/overridden indicators.
6. Do not add sorting or filtering state to the table yet. Phase 11 owns those interactions.

**Manual verification:**

1. Confirm the rendered grid uses row IDs as React keys.
2. Confirm Remark is absent in a blank worksheet and all other columns have the configured widths.
3. Confirm a row with `override: 0` displays `0` as Used Cost and shows the overridden text indicator.

### P1-6: Grid Headers Do Not Stay Aligned During Horizontal Scrolling

**File:** `src/features/cost-grid/CostGrid.jsx:24-28`

**Failure:** The header is outside `.grid-scroll`. When a narrow viewport horizontally scrolls the rows, the header stays at horizontal position zero and no longer labels the visible cells.

**Required implementation:**

1. Use one horizontal scroll owner for the header and virtual rows, or synchronize the header transform/scroll position from the grid scroller.
2. Do not create a second independent horizontal scrollbar.
3. Keep the header visually fixed above the vertical virtual viewport.
4. Test after hidden columns change the total width.

**Manual verification:**

1. Reduce the viewport below the total column width.
2. Scroll all the way right and confirm every header remains directly above its cells.
3. Return left and confirm the row-number gutter remains aligned.

### P2-7: Save Failure Has No User Retry Action

**Files:** `src/database/repositories.js:110`, `src/stores/workspaceStore.js:51-55`, `src/app/AppLayout.jsx:37-40`

**Failure:** The repository exposes `retry`, but no workspace action or UI control exposes it. A failed save only changes the header text to `Save failed`; the user cannot satisfy the required retry workflow.

**Required implementation:**

1. Add a store `retryFailedSaves()` action that retries every dirty sheet with a pending save snapshot.
2. In the application header, render a labeled Retry button only while save status is `Save failed`.
3. On retry success, restore `Saved`; on failure, retain dirty state and show a descriptive toast.

**Manual verification:**

1. Cause an IndexedDB write failure if browser tools allow it.
2. Confirm `Save failed` appears, Retry is keyboard reachable, and no data is marked clean until persistence succeeds.

### P2-8: Form Validation Is Not Announced To Assistive Technology

**Files:** `src/pages/NewProjectPage.jsx:8`, `src/pages/ProjectsPage.jsx:72`

**Failure:** Both forms set `aria-invalid`, but their error text has no ID and is not connected through `aria-describedby`. New Project also does not move focus to the invalid input as required.

**Required implementation:**

1. Give each validation message a stable ID.
2. Add `aria-describedby` to the matching input only while the error exists.
3. Use an appropriate error announcement mechanism, such as `role="alert"`.
4. In New Project, keep an input ref and focus it after client-side validation fails or project creation fails.

**Manual verification:**

1. Submit blank and too-long names with keyboard only.
2. Confirm focus returns to the name input and the error is programmatically associated with it.

## Required Phase 08 Gate Review

After the fixes above, complete and record these checks before beginning Phase 09:

- [ ] `npm.cmd run lint` has no errors. Record the known TanStack Virtual React Compiler warning if it remains.
- [ ] Create a project, create/rename/duplicate/delete sheets, then reload. All persisted data is correct.
- [ ] Make an immediate worksheet mutation followed by each lifecycle action and an in-project route navigation. No mutation is lost.
- [ ] Verify per-sheet undo and redo with two sheets.
- [ ] Verify the storage notice can be dismissed and stays dismissed after reload.
- [ ] Verify unknown routes and unknown project IDs redirect to Projects with feedback.
- [ ] Verify the virtual grid mounts only the visible window plus overscan.
- [ ] Verify a real persisted worksheet with 10,000 rows scrolls without obvious blocking.
- [ ] Verify derived Cost, Used Cost, BOQ Qty, and Total Cost against known inputs, including zero override.
- [ ] Verify header and cells stay aligned while horizontally scrolling.

## Phase 09: Selection And Editing

### Scope Boundary

Implement only active-cell selection, rectangular selection, pointer and keyboard navigation, inline editing, formula-bar editing, numeric validation, derived-column protection, and automatic scrolling to the active cell. All worksheet writes must use the existing central mutation gateway.

Do not implement copy/cut/paste, fill, row insertion/deletion, quantity editing UI, filters, sorting UI, resizing, column visibility UI, find/replace, resource copy, or later-page functionality.

### Task 09.1: Define Grid Interaction State

- [ ] Add a focused grid interaction slice to `uiStore` or a new `src/features/cost-grid/` hook. Do not put selection state in persisted worksheet data.
- [ ] Store `activeCell`, `anchorCell`, and `extentCell` as `{ rowId, columnKey } | null`.
- [ ] Derive rectangular selection bounds from visible row order and visible column order. Do not store array indexes as identity.
- [ ] Clear or repair selection when the active sheet changes, rows disappear, or a selected column becomes hidden in a later phase.
- [ ] Initialize selection to the first visible editable cell when a loaded sheet has no valid selection.

**Acceptance:** State uses stable row IDs and column keys; changing the physical row array does not select the wrong row.

### Task 09.2: Add Grid Accessibility Semantics And Focus Ownership

- [ ] Make the grid focusable with one clear keyboard focus owner.
- [ ] Add appropriate spreadsheet/grid semantics without creating a focusable DOM node for every virtual cell.
- [ ] Expose active-cell coordinates and value to assistive technology through a concise label or live status.
- [ ] Add selected and active visual states that remain visible in both light and dark themes. Color cannot be the only indicator.
- [ ] Ensure unmounted virtual rows never hold DOM focus. Focus stays on the grid container or editor overlay.

**Acceptance:** A keyboard-only user can see and understand the active cell, and virtual scrolling does not lose browser focus.

### Task 09.3: Implement Pointer Selection

- [ ] Single-click a cell: make it active and reset selection to that one cell.
- [ ] Shift-click a cell: preserve the anchor and extend the rectangular selection to the clicked cell.
- [ ] Clicking the already active editable cell starts replace-mode editing.
- [ ] Double-click an editable cell starts editing. Place the caret reasonably near the click position when practical; otherwise place it at the end without losing text.
- [ ] Clicking a derived cell may select it but must never start editing.
- [ ] Prevent text selection and accidental drag behavior while selecting cells.
- [ ] Ignore pointer editing actions while a modal dialog is open.

**Acceptance:** Pointer selection works for mounted rows and does not modify worksheet data until an editor commits.

### Task 09.4: Implement Keyboard Navigation

- [ ] Arrow keys move the active cell one visible row or visible column.
- [ ] Shift+Arrow extends the rectangle from its anchor.
- [ ] Home moves to column A, or the first visible column if A is hidden in a future phase.
- [ ] Ctrl+Home moves to first visible row and first visible column.
- [ ] Ctrl+End moves to last visible row and last visible column.
- [ ] Enter moves down; Shift+Enter moves up when no editor is open.
- [ ] Tab and Shift+Tab move among editable visible columns only. Do not implement row append at this phase.
- [ ] Never hijack keys from normal text fields, modal dialogs, or the active cell editor except for editor-specific keys.
- [ ] Stop at sheet edges without throwing or moving to an invalid row/column.

**Acceptance:** Movement uses visible order and does not modify data.

### Task 09.5: Scroll Active Cells Into View

- [ ] Add one `scrollToCell(rowId, columnKey)` helper inside the grid feature.
- [ ] Resolve row index from a row-ID lookup map rebuilt only when the row list changes.
- [ ] Use the virtualizer's scrolling API to bring an offscreen active row into view.
- [ ] Scroll horizontally only enough to reveal the active column; preserve the header/cell alignment fix from P1-6.
- [ ] Invoke this helper after keyboard navigation, pointer selection on an offscreen target if applicable, and editing movement.

**Acceptance:** Moving from the first to last row with Ctrl+End reveals the active row without a full non-virtual render.

### Task 09.6: Build One Reusable Cell Value Contract

- [ ] Add helpers that convert a row field to edit text and parse an edit value before mutation.
- [ ] Text columns: `boqCode`, `resource`, and `remark` use the existing normalizers and their exact length limits.
- [ ] Numeric columns: `cqbi`, `cr`, `rate`, `override`, and the Phase 09 behavior for `boqQty` use `parseNumeric`.
- [ ] Blank numeric input becomes `null`; numeric zero remains `0`.
- [ ] Reject malformed input, non-finite input, and absolute values greater than `1e12` with a field-specific message.
- [ ] For BOQ code changes, call `prepareBoqCodeChange` in the mutation gateway. Do not reimplement quantity transfer in the component.
- [ ] Do not write derived fields `cost`, `usedCost`, or `totalCost` under any path.

**Acceptance:** Parsing and normalization are shared and no component uses `Number()`, `parseFloat()`, or truthiness to decide numeric validity.

### Task 09.7: Implement Inline Editor

- [ ] Render one editor overlay for the active editable cell, not an input in every cell.
- [ ] Support editor entry modes: replace mode from typing/clicking active cell, edit-existing mode from F2/double-click, and formula-bar mode.
- [ ] F2 selects existing edit text.
- [ ] A printable character starts replace-mode editing with that character.
- [ ] Escape cancels and restores the prior cell value without mutation.
- [ ] Enter commits then moves down; Shift+Enter commits then moves up.
- [ ] Tab commits then moves to the next editable visible column; Shift+Tab moves backwards.
- [ ] Invalid input stays open, keeps its user-entered text, displays an accessible error, and does not mutate the worksheet.
- [ ] On valid commit, call exactly one `mutateSheet` operation. The operation must be atomic and undoable.

**Acceptance:** A valid edit creates one history entry and one autosave request. An invalid edit creates neither.

### Task 09.8: Implement Formula Bar Editing

- [ ] Replace the read-only placeholder formula-bar input with a controlled editor bound to the active cell.
- [ ] Display the active-cell address in the name box, such as `A1`.
- [ ] Display raw unformatted text for numeric values, not `formatNumber` output.
- [ ] Disable formula-bar edits when the active cell is derived or no cell is active.
- [ ] Formula-bar commit and validation must call the same editor value contract as inline editing.
- [ ] Sync changes from inline editing to the formula bar and selection changes to the formula bar without overwriting an in-progress invalid edit.

**Acceptance:** Editing a cell inline and in the formula bar produces identical persisted data and identical validation messages.

### Task 09.9: Add Navigation Guard Integration

- [ ] Before any route change from Cost Load, ask the active editor to commit or reject its current value.
- [ ] If the editor is invalid, block navigation, retain focus in the editor, and show its error.
- [ ] If the editor is valid, commit it, await the mutation/autosave handoff, then allow navigation.
- [ ] Before project/sheet lifecycle actions, resolve the active editor using the same contract.
- [ ] Combine this with P0-1 so committed data is flushed before workspace replacement.

**Acceptance:** A user cannot silently lose a valid or invalid in-progress edit by changing a sheet or route.

### Task 09.10: Add Undo/Redo Controls Needed For Phase 09

- [ ] Add visible Undo and Redo buttons near the grid or status bar with accessible names.
- [ ] Wire Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y only when the grid owns focus and no text editor is handling text.
- [ ] After undo or redo, keep a valid active-cell selection and scroll it into view if necessary.
- [ ] Do not introduce clipboard shortcuts yet.

**Acceptance:** Undo and redo work by button and shortcut for Phase 09 edits.

## Phase 09 Manual Verification Checklist

- [ ] Start with a blank project and verify the first editable cell can be selected using mouse and keyboard.
- [ ] Verify Arrow, Shift+Arrow, Home, Ctrl+Home, Ctrl+End, Enter, Shift+Enter, Tab, and Shift+Tab at normal and boundary positions.
- [ ] Verify selection uses stable row IDs after switching sheets and after reload.
- [ ] Verify single click, Shift-click, click-active-cell, double-click, F2, and printable-character editor entry modes.
- [ ] Edit every editable column once. Confirm normalization, limits, null handling, and numeric zero handling.
- [ ] Attempt to edit Cost, Used Cost, and Total Cost through pointer, keyboard, and formula bar. All must remain read-only.
- [ ] Enter malformed numeric input. Confirm it stays in edit mode with a visible, announced error and no history/autosave mutation.
- [ ] Change a BOQ code and verify the domain quantity-transfer rule; do not test quantity UI not yet implemented.
- [ ] Verify inline and formula-bar edits produce the same value.
- [ ] Make edits, undo all, redo all, switch sheets, and confirm histories stay isolated.
- [ ] Edit a cell and attempt navigation, sheet actions, and project actions. Confirm valid data commits and invalid data blocks the action.
- [ ] With a large persisted sheet, navigate to a far row and confirm it scrolls into view while virtual rendering remains active.
- [ ] Run `npm.cmd run lint` and review the Vite browser console for application errors.

## Phase 09 Completion Report

Report only the following after all checks pass:

```text
Phase 08 blocking fixes: complete or blocked
Phase 09: complete or blocked
Files created or changed: <list>
Manual localhost review: <completed checklist items>
Lint: <result and any warnings>
Blockers or deviations: <list or none>
Deferred work: Phase 10 and later only
```
