# BOQ Cost Load: Phase 05-08 Execution Tasks

## Scope And Baseline

- [x] Correct the Phase 4 project-creation ID mismatch in `createProjectWithFirstSheet`.
- [x] Verify the repository can create, load, list, and delete a project in IndexedDB.
- [x] Keep all persisted business data in Dexie only; Zustand holds loaded-session and UI state only.
- [x] Keep formula, validation, normalization, and projection logic in `src/domain/`.

## Phase 05: Application Shell

- [x] Add an application error boundary with a recovery link to Projects. It must not clear IndexedDB.
- [x] Add a global toast region with success, warning, and error messages.
- [x] Add reusable modal and confirmation-dialog primitives with Escape close, focus capture, and focus restoration.
- [x] Load settings on startup and display a dismissible browser-storage notice until persisted dismissal.
- [x] Add light/dark theme tokens and use the current project theme when a project is loaded.
- [x] Show project context and autosave status in the shared header.
- [x] Validate project routes before rendering project pages; redirect unknown IDs to Projects with an error toast.
- [x] Make sidebar navigation responsive and retain visible keyboard focus.

Acceptance:

- [x] Every route renders on Vite localhost without console errors.
- [ ] Unknown routes and unknown project IDs recover to Projects with feedback.
- [ ] The storage notice can be dismissed and remains dismissed after reload.

## Phase 06: Projects Dashboard

- [x] Replace the Projects placeholder with a repository-backed project list ordered by latest update.
- [x] Show name, sheet count, created time, updated time, and Open/Rename/Duplicate/Delete actions for each project.
- [x] Add per-project Export and top-level Import Project actions; imports are additive and support valid project backups plus supported legacy worksheet/workbook shapes.
- [x] Build an empty state with a Create Project action.
- [x] Replace the New Project placeholder with a labelled name field, inline validation, Cancel, and Create actions.
- [x] Create a project with one blank `Sheet 1`, then navigate to its Cost Load route.
- [x] Implement rename and duplicate dialogs; duplicate names use a readable `Copy` suffix.
- [x] Implement named deletion confirmation and navigate to Projects if the deleted project was open.

Acceptance:

- [ ] A newly created project survives reload and opens its active sheet.
- [ ] Two duplicated projects have distinct project, sheet, and row IDs.
- [ ] All dashboard actions are keyboard accessible.

## Phase 07: Workspace And Sheets

- [x] Add a focused workspace Zustand store for loaded project/sheets, active sheet, dirty state, save status, and per-sheet history.
- [x] Load sheets in persisted position order and restore `activeSheetId`.
- [x] Implement the worksheet mutation gateway: clone, mutate, normalize, prune, validate, history, replace, dirty, autosave.
- [x] Limit per-sheet undo history to 20 snapshots and 24 MB serialized data.
- [x] Implement add, activate, rename, duplicate, and delete sheet operations through repository transactions.
- [x] Enforce unique trimmed names, 60-character names, 100-sheet limit, and one-sheet minimum.
- [x] Build accessible tabs with roving Arrow/Home/End keyboard focus, activation, double-click rename, and a context menu.
- [x] Surface `Saving...`, `Saved`, and `Save failed` status from the autosave coordinator.

Acceptance:

- [ ] Sheet tabs preserve per-sheet undo/redo histories during the session.
- [ ] Changing worksheet data schedules persistence and survives reload.
- [ ] Deleting the active sheet selects its nearest neighbour.

## Phase 08: Read-Only Virtual Grid

- [x] Create grid columns from `COLUMN_DEFINITIONS` and use stable row IDs as React keys.
- [x] Use TanStack Virtual with fixed 28 px rows and `overscan: 12`.
- [x] Render row-number gutter, headers, formula bar, virtual grid, sheet tabs, and a status bar.
- [x] Show `cost`, `usedCost`, `boqQty`, and `totalCost` only through domain calculations and `formatNumber`.
- [x] Respect column widths and hidden columns; Remark remains hidden in a blank worksheet.
- [x] Add deterministic BOQ group colouring and textual indicators for calculated and overridden values.
- [x] Keep the grid read-only. Selection and editing are deferred to Phase 09.

Acceptance:

- [ ] Grid mounts only visible rows plus overscan.
- [ ] Derived values display correctly for persisted rows.
- [ ] A generated 10,000-row worksheet remains scrollable without obvious blocking.

## Verification

- [x] Run `npm.cmd run lint`.
- [x] Review the browser console for application errors.
- [ ] Create a project, add/duplicate/rename/delete sheets, reload, and confirm persistence.
- [ ] Confirm a second project remains independent after the first project changes.
