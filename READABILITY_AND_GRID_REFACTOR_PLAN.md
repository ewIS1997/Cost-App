# Readability and CostGrid Responsibility Plan

**Status:** Planning only. No application code is changed by this document.

## 1. Target and non-negotiable contract

Improve only these two aspects of the current React cost-estimating app:

1. Make critical save, undo/redo, settings, repository, and grid control-flow readable.
2. Reduce the responsibilities of `src/features/cost-grid/CostGrid.jsx` through small, cohesive, behavior-preserving extractions.

**Success means the application behaves exactly as it does before implementation.** No feature additions, removals, fixes, changed copy, visual redesign, data/schema migrations, dependency changes, keyboard shortcut changes, or changes to business calculations. Retain the same routes, data, local/session storage keys, event names, Excel/JSON formats, undo boundaries, saves, import/export output, DOM behavior, accessibility labels, keyboard/mouse/focus interactions, error messages, and styles. Readability is not permission to alter a known quirk or to make a different behavior seem more desirable. Smaller files are not themselves a success criterion.

The earlier `CODEBASE_CLEANUP_PLAN.md` is useful background, but this plan starts from **current source**, after its first extractions: `FilterMenu.jsx`, `gridFind.js`, `gridEdit.js`, and `saveCoordinator.js` already exist. Do not repeat those extractions or treat the old line numbers/test count as current.

## 2. Current ownership map

| Current owner | What it actually does | Proposed boundary |
| --- | --- | --- |
| `src/database/saveCoordinator.js` | Pending snapshots by sheet, project-serialized queues, 500 ms scheduling, group flush/retry and status listeners; repository injects transaction writers. | Keep ownership and public `createSaveCoordinator` contract. Expand dense functions *in place*; no new persistence abstraction. |
| `src/database/repositories.js` | Dexie transactions, record/attachment validation and remapping, route identity materialization on project listing, backup/restore, save callbacks; exports the coordinator and installs `pagehide`. | Format only individually selected transactional functions; keep facade, transaction table lists and event order intact. |
| `src/stores/workspaceStore.js` | Loaded project, sheet histories, cross-sheet grouped rate/assembly history, dirty/failed status, navigation guard. | Readable private functions/blocks within the store; keep grouped and single-sheet pipelines distinct. |
| `src/pages/SettingsPage.jsx` | Ordered optimistic preference writes, rollback, backup export/restore/delete and confirmations. | Format existing handlers in place; keep queue, refs, state, dialog ownership, and order of awaits/callbacks. |
| `src/features/cost-grid/CostGrid.jsx` (~1,756 lines at plan creation) | Selection, keyboard capture, session position, virtualization, drag/fill, editing, find UI, clipboard transport, row actions, images and rendering. | Extract only isolated pure projections and a small view-only dialog first. Keep lifecycle-heavy handlers/refs in grid unless a separate baseline proves moving them safe. |
| `src/features/cost-grid/{useGridInteraction,gridEdit,gridFind,clipboard,BoqImageGallery}.*`, `src/features/filtering/FilterMenu.jsx` | Existing selection, edit, search, TSV, image display and filter components. | Reuse these; do not duplicate their responsibilities. |

### Contracts that constrain refactoring

- The repository's `saveSheetAndProjectTimestamp`/`saveSheetsAndProjectTimestamp` validate before writing, transition image ownership inside transactions and emit attachment events **after** transaction completion. Project listing can write route slugs and aliases. Exports flush pending work before reading.
- The save coordinator serializes by project, stores the latest structured-cloned sheet, reports `Saving...`, `Saved`, or `Save failed`, handles grouped snapshots and retry, and is flushed on `pagehide` through the repository facade. Group save accepts either an array or a supplier read **again after flush**.
- The workspace stores per-sheet history with existing entry/byte limits and separate grouped operation boundaries. Navigation calls the editor guard before flushing. Save callbacks affect dirty/failed state.
- Settings writes are optimistic and serialized. Revision-checked rollback, `boq-settings-updated`, queue idle before backup/restore/delete, confirmation sequence and notification text remain identical.
- The grid's capture-phase resource shortcut, document/window listeners, `commitRef` navigation guard, reload-only session restoration, virtual row measurement, focus recovery, editor blur, clipboard events, fill auto-scroll and image blob URL cleanup are observable timing contracts. React hook dependencies and effect order are part of this contract; do **not** mechanically “fix” the existing hook warnings.
- CSS remains in `src/styles/index.css` in the same declaration order. Moving JSX into a component must preserve the resulting DOM hierarchy, element types, attributes, classes, event handlers and portal placement.

## 3. Baseline before any implementation

Capture a **before** record from the unchanged code and an isolated browser profile (no real user's projects). Store comparison artifacts outside application source unless the implementation session explicitly chooses a test fixture. The baseline is a prerequisite for high-risk changes, not a checkbox to infer from a green unit suite.

1. Run and record `node --test "src/database/*.test.js" "src/domain/*.test.js" "src/features/cost-grid/*.test.js" "src/features/import-export/*.test.js"`, `npm.cmd run lint`, and `npm.cmd run build`. Record test names/count and warning categories, not just pass/fail. A prior session saw eight existing grid warnings; recheck the actual current baseline. Do not ship a new lint error or warning.
2. Create an isolated sample and export **before** project and full-workspace JSON backups. Keep the underlying records, row IDs, expressions, filters/sort/widths, attachment metadata and blobs for comparison. Export an Excel workbook containing a formula and an image if available; compare semantic workbook content, not timestamps/ZIP binary bytes.
3. Record light/warm/dark and narrow/wide viewport screenshots and computed styles for grid header, rows, editor, find modal, filter portal, image/gallery and print view. Record the accessible tree around editor and modal.
4. Record repeatable input → observation traces for: edit via cell and formula bar (valid/invalid formula, zero/null, multiline resource), paste/cut/copy and row paste, filtered/sorted insert/delete, undo/redo and cross-sheet grouped rate/assembly action, find/replace on visible and selected cells, 500+ hits, fill drag and auto-scroll, keyboard shortcuts, resize, scroll/reload restoration, image add/view/delete, guard on invalid edit, save/retry, immediate export after edit, route/project switch and `pagehide` where reproducible.
5. Simulate delayed/failing writes in an isolated harness around injected coordinator callbacks and, where practical, IndexedDB for the browser save/guard path. Record status text, callback/error order, queued snapshot content, retry and group boundaries. Existing coordinator tests are a starting point, not sufficient proof of all browser behavior.

If a scenario cannot be reproduced before editing the relevant high-risk code, **leave that code in place**; record the blocked task rather than guessing about parity.

## 4. Ordered atomic implementation tasks

Each task is one reviewable change with its own before/after comparison. Avoid combining a persistence edit with a grid edit. Re-run targeted tests and compare the recorded scenario immediately after each task; continue only when equivalent.

### R-01 — Make coordinator logic readable in place

- **Files:** `src/database/saveCoordinator.js`; existing `src/database/saveCoordinator.test.js` only for meaningful missing behavior cases.
- **Change:** Expand `persistLatest`, `subscribe`, `schedule`, `saveNow`, `saveGroup`, `retry`, `flushProject` and `flushAll` into consistently indented statements with named local values where evaluation order is unchanged. Document why a group supplier is reevaluated after flush. Keep the existing injected writers, map lifetimes, API object, callbacks and `this.flushProject` invocation semantics.
- **Do not:** Change the 500 ms delay, timer cancellation, `entry.active`/`entry.latest` loop, status order, project queues, groupPending bookkeeping, catch/rethrow/finally behavior, `pagehide` registration location, or substitute a debounce library.
- **Proof:** Compare delayed concurrent edits to the same sheet and to two sheets in one project, group save with supplier, write failure + retry, `flushProject`, `flushAll`, and exported snapshot immediately after edits. Assert exact status/error sequence and most recent saved data.
- **Gate:** Same callback ordering and tests; otherwise revert this task independently.

### R-02 — Make workspace history/status paths readable

- **Files:** `src/stores/workspaceStore.js`; grouped-history tests only where the baseline exposes missing cases.
- **Change:** Format `commitSheetGroup`, `applyGroupedRateHistory`, `mutateSheet`, `applyHistory`, subscription handling, and navigation/flush methods individually. If duplication is demonstrably identical, consider a *local* stack-size pruning or dirty/failed status helper; first compare both original call sites and preserve array insertion order. It is acceptable to stop at formatting.
- **Do not:** Merge group and single-sheet mutations, change `rateOperations` closure ownership, validation/clone/JSON comparison order, entry/byte limits, redo invalidation, save schedule vs group save, or guard-before-flush order.
- **Proof:** Single-sheet edit/undo/redo; group edit/undo/redo across sheets; change another sheet before grouped undo; deleted sheet; failed save/retry; project switch and navigation with an invalid editor. Compare snapshots, history stacks, status and notifications.
- **Gate:** Require the browser/history baseline; if absent, restrict this task to transparent formatting/comments.

### R-03 — Make repository transaction and backup flows readable

- **Files:** `src/database/repositories.js` only; use existing validation/backup tests for verification, not a transaction redesign.
- **Change:** Reformat **one function per patch**, prioritizing `listProjectsWithSheetCounts`, `saveSheetAndProjectTimestamp`, `saveSheetsAndProjectTimestamp`, `importProjectAsNew`, `replaceAllProjects`, and `exportAllProjectsSnapshot`. Give pre-existing intermediate values descriptive local names only if the exact values and evaluation timing remain the same. Comment why route listing writes and why attachment events follow commits.
- **Do not:** Change any Dexie schema, transaction mode/table list, query/index, timestamp comparison, ID remap, validation, route alias selection, attachment ownership, clearing order, backup serialization or error message. Do not hoist asynchronous reads outside their current transaction.
- **Proof:** Compare project listing before/after with old slug and aliases; new/duplicate/import/restore project backups; image ownership on code rename/undo; atomic multi-sheet save and restore; attachment event order; snapshot immediately after pending edits.
- **Gate:** A formatting change that makes a transaction boundary ambiguous should be withdrawn rather than generalized.

### R-04 — Make settings flows readable without changing ownership

- **Files:** `src/pages/SettingsPage.jsx` only.
- **Change:** Format the existing initial state/effect, `exportBackup`, `chooseRestore`, `confirmRestore`, `confirmDelete` and related JSX handlers into readable blocks. Keep `update`'s revision/rollback and write queue locally owned. Small descriptive locals are fine when value and timing are identical.
- **Do not:** Change confirmation UI, backup filename/MIME/limit, optimistic preferences, dispatch timing, idle barriers, failure notifications, dialogs, navigation or appearance settings. No preference service or state rewrite.
- **Proof:** Rapid preference toggles including delayed/failing writes, reload, backup while a write is pending, invalid/valid restore preview and cancel, isolated full restore and delete confirmation. Compare exported settings, `boq-settings-updated` count/timing, rollback and visible messages.
- **Gate:** Preserve the complete before/after data and event trace; otherwise leave the handler as-is.

### G-01 — Extract only pure grid presentation projections

- **Files:** `src/features/cost-grid/CostGrid.jsx`; optionally one new `src/features/cost-grid/gridViewModel.js` with colocated tests.
- **Candidates:** Pure construction of `lastVisibleIndexByCode`, `imageAttachmentsByCode`, `rowLayoutSignatures` and `visibleBoqGroups` from explicit input arrays/maps. Consider `findDirectionalEdge` separately if needed; it has no React dependencies. Existing `gridFind.js`, `gridEdit.js`, `clipboard.js` remain authoritative.
- **Change:** Move only deterministic computations. Keep the same `useMemo` positions and dependencies in `CostGrid`; call pure functions from their current memo callbacks. Preserve `Map` insertion order, repeated noncontiguous BOQ grouping, empty codes and image placement after each code's last visible row.
- **Do not:** Move selection state, refs, virtualizer instance, layout/measurement effects, listener registration, or rendering. No new generic grid model.
- **Proof:** Pure input/output parity for filtered rows, repeated codes and gallery counts; browser screenshot and computed-style comparison after filtering, sorting, images and density change.
- **Gate:** If dependency identity causes different renders/measurement, keep the calculation in `CostGrid`.

### G-02 — Extract find/replace dialog markup as a controlled view

- **Files:** `src/features/cost-grid/CostGrid.jsx`; optional new `src/features/cost-grid/FindReplaceDialog.jsx`.
- **Change:** Move only the existing find modal JSX (currently near the end of `CostGrid.jsx`) into a component with explicitly named value/handler/ref props. The grid continues to own find text, selection scope, computed matches, current index, replace actions and focus timing. Preserve the existing `Modal` wrapper and markup in the extracted view with the same conditional mount timing.
- **Do not:** Move search algorithm (`gridFind.js` already owns it), change the 500-match navigation vs unlimited replace-all rule, alter key handling, move modal state to a global store, or introduce an effect inside the view that changes focus/selection.
- **Proof:** DOM/a11y and screenshot parity; Ctrl/Cmd+F/H, Enter/Shift+Enter, Escape, selection-only, case/entire-cell, filtered/hidden rows, derived read-only cells, invalid replacement, replace-one/all and focus restore.
- **Gate:** If portal ordering, focus or editor commit timing differs, revert only this extraction.

### G-03 — Review further grid decomposition only if measured benefit remains

- **Files:** `CostGrid.jsx` and **at most one** narrowly named sibling per proven boundary.
- **Candidates requiring separate approval-quality evidence:** a view-only row/header renderer with stable keys/refs and unchanged DOM; a pure clipboard matrix builder; a pure fill-preview geometry function. Extract one at a time only if the test harness reproduces pointer/focus/virtual-scroll behavior and its inputs/outputs are explicit.
- **Keep in grid by default:** `onGridKeyDown`, capture-phase CC/VV/PP listener, navigation guard and `commitRef`, selection refs, fill-drag effect and window pointer listeners, virtualizer/measurement/scroll restoration, editor commit/blur, image upload/URL lifecycle, and clipboard transport. Do not move them merely to meet a file-length target.
- **Proof:** Full relevant interaction matrix including large virtualized sheets, pointer capture/cancel, auto-scroll, edit while filtering, sheet switch, image measurement and reload. If evidence is incomplete, record the candidate as deferred and keep the current implementation.

## 5. Change protocol for every task

1. State the exact function and its current inputs, outputs, mutations, callbacks, side effects, event phases and time/order constraints.
2. Save the matching **before** data/UI trace from section 3. Use fresh isolated browser data for destructive scenarios.
3. Implement only the named task; do not run a repo-wide formatter, change hook dependency arrays, reformat a whole JSX file, move CSS or update dependencies at the same time.
4. Inspect the diff line by line for executable changes, JSX hierarchy and effect dependencies. For a format-only task, any changed expression or control-flow edge is a stop signal.
5. Run targeted tests and the relevant browser scenario; compare exact records/status/error text/DOM or computed styles. Revert the atomic task if parity cannot be established.
6. Record task completion/deferment and observed results before beginning the next task. Keep any added tests behavior-focused (failure/order/interaction), not copies of implementation details.

## 6. Final acceptance gate

- Run the complete test command in section 3, `npm.cmd run lint`, and `npm.cmd run build`; no new lint errors/warnings. Existing hook warnings may remain if changing them risks effect timing.
- Recheck project/sheet routes, create/rename/duplicate/delete, grid editing and calculations, filter/sort/find/replace, keyboard and pointer actions, undo/redo, group saves, pending/failed/retried writes and export-before/after-edit.
- Compare old/new IndexedDB records and JSON/Excel *semantic* exports, image bytes and attachment ownership, preferences and browser events, light/warm/dark/mobile/print screenshots and key computed styles.
- Confirm imports still flow UI → store/domain/repository; no UI imports in domain; original public repository/store/grid APIs and data formats remain stable.
- Report what actually became clearer (responsibility boundaries, named control flow, smaller reviewable functions), what was intentionally retained due to coupling, and any unverified scenarios. **Do not claim app-wide parity from unit tests or a successful build alone.**

## 7. Explicit exclusions

Do not address unrelated findings while implementing this plan: misleading help text/shortcuts, validation or calculation fixes, dead-code deletion, unused dependencies, new UI controls, design/accessibility changes, persisted model documentation corrections, version migrations, CSS consolidation, import/export format changes or new state-management architecture. Those require separate requests and baselines. The user's goal here is **the same app, organized and readable**, not a changed app.
