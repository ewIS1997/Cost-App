# Cost Load Grid Performance Audit

Date: 2026-10-04

## Scope and Method

This audit covers the Cost Load grid's rendering, selection, editing, keyboard navigation, clipboard paths, filtering/sorting, calculations, aggregate generation, IndexedDB autosave, and undo/redo integration.

Evidence was collected from:

- Static tracing of the React, Zustand, domain, and Dexie code paths.
- A runtime inspection of an existing persisted worksheet containing 1,086 rows on Vite localhost.
- Chrome performance traces for large keyboard range selection, navigation, and a no-op cell commit.
- The existing build, lint, and test suite.

Runtime timings in this document are development-build measurements on the current machine. They are not production benchmark numbers, but they reproduce the reported lag and identify which interactions scale badly. Production baselines must be recorded before and after implementation.

## Executive Summary

The Cost Load grid already uses vertical row virtualization. On the profiled 1,086-row worksheet, only 21-28 rows and 252-336 cells were mounted, so rendering all project rows into the DOM is not the primary bottleneck. There are currently 12 columns, making column virtualization unnecessary.

The main confirmed bottlenecks are:

1. Selection and editor state live in one large `CostGrid` component, so high-frequency interaction state regenerates every mounted row and cell.
2. A rectangular selection is stored efficiently as anchor/extent coordinates, but each change synchronously scans the selected rectangle for footer statistics and then causes a second parent/grid render.
3. Pointer drag updates are not coalesced with `requestAnimationFrame`; entering cells can issue several state updates and a scroll request per event.
4. Committing one cell clones, validates, compares, and snapshots the complete worksheet synchronously. Even a no-op edit pays most of that cost.
5. Whole-sheet cloning destroys unchanged row identity, invalidating grid memoization and preventing effective row-level render isolation.
6. `CostLoadPage` subscribes to the whole workspace store and repeats filtering and aggregate passes on selection summaries and save-status changes.
7. Derived values and number formatters are recomputed far more often than necessary during cell rendering, filtering, find, and footer aggregation.
8. Find performs two worksheet-wide scans per query update and then linearly searches up to 500 matches for each mounted cell.

The architecture should be improved incrementally, not rewritten. Preserve the IndexedDB schema initially, retain row virtualization, and make the in-memory/current-state path structurally shared and render-isolated before considering any persistence migration or overlay architecture.

## Runtime Evidence

### DOM and virtualization

The existing 1,086-row sheet reported:

| Metric | Observed value |
| --- | ---: |
| Logical rows (`aria-rowcount`) | 1,086 |
| Mounted rows | 21-28 |
| Mounted cells | 252-336 |
| Total DOM elements | 645 |
| Scroll viewport height | 371 px |
| Scroll content height | 35,318 px |

This confirms that vertical virtualization is active and materially bounds DOM size.

### Large range selection

Extending a selection from row 15 through row 1,086 across columns A-G selected 7,504 nonblank cells in the status summary. Chrome recorded:

| Metric | Observed value |
| --- | ---: |
| Interaction latency | 1,973 ms |
| Input delay | 0.3 ms |
| Event processing | 889 ms |
| Presentation delay | 1,083 ms |
| Forced reflow | 28 ms |

The trace attributed forced layout work to `saveGridPosition` and TanStack Virtual scroll-offset measurement. Most latency was processing and presentation, consistent with synchronous range-summary work plus full virtual-window reconciliation and scrolling.

### Selection collapse/navigation

Collapsing the large selection and navigating to the first cell with Ctrl+Home recorded 1,506 ms total latency: 651 ms processing and 856 ms presentation. This confirms that even selection/navigation paths that do not mutate worksheet data can be expensive.

### Cell commit

Committing the existing value `150` back into the active Rate cell, producing no worksheet change, recorded:

| Metric | Observed value |
| --- | ---: |
| Interaction latency | 1,336 ms |
| Input delay | 0.3 ms |
| Event processing | 1,282 ms |
| Presentation delay | 54 ms |

Because `mutateSheet` performs two full clones, validation, and full serialization before detecting equality, the no-op case is still expensive.

## Current Architecture

### Data and persistence flow

The current flow is:

```text
IndexedDB (Dexie, one record per worksheet)
  -> Zustand workspace store
  -> active sheet passed to CostLoadPage and CostGrid
  -> filtered/sorted visible row projection
  -> TanStack Table row model
  -> TanStack Virtual vertical window
  -> manually rendered visible rows and all 12 visible columns
```

Committed mutations flow through:

```text
editor / paste / fill / filter / sort
  -> workspaceStore.mutateSheet
  -> clone before + clone draft
  -> mutate draft
  -> validate complete worksheet
  -> stringify before and draft
  -> append full history snapshot
  -> publish complete worksheet clone to Zustand
  -> clone complete sheet into autosave coordinator
  -> 500 ms debounce/coalescing
  -> validate complete worksheet again
  -> replace complete sheet record in IndexedDB transaction
```

Relevant files:

- `src/database/database.js:5-17`
- `src/database/repositories.js:116-139`
- `src/database/repositories.js:192-249`
- `src/stores/workspaceStore.js:162-173`

### Grid rendering

`CostGrid` owns nearly all grid UI state and renders headers, virtual rows, cells, editors, selection styling, find highlights, fill preview, tooltips, menus, and status UI in one component.

- Main component and state: `src/features/cost-grid/CostGrid.jsx:154-203`
- Row projection/table/virtualizer: `src/features/cost-grid/CostGrid.jsx:256-308`
- Virtual row and cell rendering: `src/features/cost-grid/CostGrid.jsx:1430-1556`

TanStack Virtual limits mounted rows, but there is no memoized row or cell component boundary. A `CostGrid` state update regenerates all mounted row and cell JSX.

### Selection

Cell selection is stored by stable row ID and column key:

```text
active cell
anchor cell
extent cell
derived top/bottom/left/right bounds
```

This is already the correct lightweight model and does not create one object per selected cell.

- Selection model: `src/features/cost-grid/useGridInteraction.js:4-31`
- Selection summary: `src/features/cost-grid/CostGrid.jsx:322-342`
- Cell selection classes: `src/features/cost-grid/CostGrid.jsx:1472-1495`
- Drag entry handling: `src/features/cost-grid/CostGrid.jsx:1513-1536`

The visual implementation still marks every mounted selected cell individually. That cost is bounded by virtualization, but each extent change causes full-window reconciliation. The status summary separately iterates every logical cell in the full range, so its cost is not bounded by the viewport.

### Calculations and aggregates

Derived costs are intentionally not persisted. They are computed from authoritative row inputs by `src/domain/calculations.js`.

`CostLoadPage` independently projects visible rows and calculates footer aggregates during render (`src/pages/CostLoadPage.jsx:22-32`). `CostGrid` performs its own visible projection and BOQ summaries (`src/features/cost-grid/CostGrid.jsx:264-284`).

This preserves correct calculation results, but duplicates work and repeats it on unrelated parent updates.

## Confirmed Bottlenecks

### 1. Large selection summaries scale with every selected cell

**Severity: Critical**

**Evidence**

- `selectionSummary` nests loops over every row and column in the selection: `src/features/cost-grid/CostGrid.jsx:322-341`.
- Every value passes through projection and numeric parsing.
- A 7,504-cell range on the 1,086-row runtime sheet produced a 1,973 ms interaction.
- At the 10,000-row limit, a 12-column selection can visit 120,000 cells on every extent update.

**Recommended solution**

- Keep coordinate-only selection state.
- Decouple immediate visual selection from aggregate calculation.
- Update the visual extent at most once per animation frame.
- Compute count immediately from bounds where possible.
- Defer sum/average, compute them incrementally from cached per-row values, or update them after drag settles.
- Ensure the summary result does not force `CostLoadPage` and `CostGrid` through a second render.

**Files/components affected**

- `src/features/cost-grid/useGridInteraction.js`
- `src/features/cost-grid/CostGrid.jsx`
- `src/pages/CostLoadPage.jsx`

**Regression risk: Medium**

Selection count, sum, average, filtered-row semantics, derived-column values, and accessibility announcements must remain identical. Deferred summaries need a clear stale/pending policy.

### 2. Worksheet mutation performs full synchronous copies and scans

**Severity: Critical**

**Evidence**

- `mutateSheet` clones the entire worksheet twice: `src/stores/workspaceStore.js:164`.
- It validates every row: `src/stores/workspaceStore.js:165`, `src/domain/validation.js:20-31`.
- It serializes both complete snapshots to detect a change: `src/stores/workspaceStore.js:166`.
- It repeatedly serializes full history entries to enforce the history limit: `src/stores/workspaceStore.js:15,167-168`.
- Autosave clones the complete sheet again: `src/database/repositories.js:207`.
- Persistence validates the complete worksheet again and replaces the complete sheet record: `src/database/repositories.js:116-124`.
- A no-op Rate commit on 1,086 rows produced a 1,336 ms interaction dominated by 1,282 ms event processing.

**Recommended solution**

- Add operation-specific mutation metadata: changed row IDs and changed worksheet metadata fields.
- Preserve full validation at persistence/import boundaries, but validate changed rows and directly affected metadata on the synchronous edit path.
- Replace stringify equality with explicit change detection from the mutation operation.
- Publish structurally shared state so unchanged row objects retain identity.
- Profile patch/inverse-patch history or compact operation history; retain current undo/redo semantics.
- Keep the IndexedDB schema unchanged initially. Whole-record persistence can remain debounced until profiling shows it is still a bottleneck after synchronous work is removed.

**Files/components affected**

- `src/stores/workspaceStore.js`
- `src/domain/validation.js`
- `src/database/repositories.js`
- All callers of `mutateSheet`

**Regression risk: High**

This path protects validation, undo/redo, grouped operations, autosave, and atomic persistence. It requires operation-level tests before changing behavior.

### 3. Monolithic grid rerenders the complete virtual window

**Severity: High**

**Evidence**

- Rows and cells are inline JSX inside `CostGrid`: `src/features/cost-grid/CostGrid.jsx:1431-1556`.
- There is no `React.memo` boundary in `src`.
- Selection, editor text, tooltip coordinates, find index, resize preview, fill preview, error, and status all live at the top of `CostGrid`: `src/features/cost-grid/CostGrid.jsx:175-202`.
- React Compiler skips automatic optimization of `CostGrid` because `useVirtualizer` returns incompatible functions; current lint output reports this at line 298.
- Every mounted cell recreates event closures and reevaluates state flags on each render.

**Recommended solution**

- First memoize the exported `CostGrid` boundary so unrelated parent/store updates do not enter it.
- Extract a memoized `GridRow` with stable primitive/render-state props.
- Profile before adding a `GridCell` component; row isolation may be sufficient.
- Stabilize event dispatch through compact callbacks or grid-level event delegation.
- Isolate editor and tooltip state where feasible.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`
- Potential new row component under `src/features/cost-grid/`
- `src/pages/CostLoadPage.jsx`

**Regression risk: Medium**

Memoization can create stale selection/editor state if props are incomplete. Render-count tests and interaction tests are required.

### 4. Selection movement generates multiple state updates and duplicate selection work

**Severity: High**

**Evidence**

- Normal selection calls separate setters for active, anchor, and extent: `src/features/cost-grid/CostGrid.jsx:544-552`.
- Each setter calls `setSelection` independently: `src/features/cost-grid/useGridInteraction.js:13-15`.
- Pointer down selects a cell, and the subsequent click selects it again: `src/features/cost-grid/CostGrid.jsx:1505-1522`.
- Drag selection calls `select` on every entered cell without frame coalescing: `src/features/cost-grid/CostGrid.jsx:1524-1536`.
- `select` also updates status and calls `scrollToCell`: `src/features/cost-grid/CostGrid.jsx:544-557`.

**Recommended solution**

- Expose one atomic selection update action.
- Make pointer down the authoritative start of mouse selection and suppress the duplicate click path.
- Keep the latest pointer target in a ref and commit extent at most once per animation frame.
- Do not call scroll-to-cell when ordinary pointer movement already targets a visible cell; retain auto-scroll only near viewport edges.
- Consider a single visual selection overlay only after profiling the above changes. The current cell-class cost is viewport-bounded, so an overlay is not the first required change.

**Files/components affected**

- `src/features/cost-grid/useGridInteraction.js`
- `src/features/cost-grid/CostGrid.jsx`

**Regression risk: Medium**

Shift selection, pointer capture, drag auto-scroll, double-click editing, touch/pen behavior, keyboard navigation, and accessibility state must be regression-tested.

### 5. Selection and grid-position lookup repeatedly scan visible rows

**Severity: High**

**Evidence**

- `useGridInteraction` runs three `rows.some` validations and two `rows.findIndex` calls during render: `src/features/cost-grid/useGridInteraction.js:16-27`.
- It then separately builds row and column maps: `src/features/cost-grid/useGridInteraction.js:28-30`.
- `CostGrid` already builds its own `rowIndexById`: `src/features/cost-grid/CostGrid.jsx:294`.

**Recommended solution**

- Build stable ID-to-index maps once and pass them to selection logic.
- Validate and resolve selection coordinates in O(1).
- Consolidate selection state so repaired coordinates do not cause chained updates.

**Files/components affected**

- `src/features/cost-grid/useGridInteraction.js`
- `src/features/cost-grid/CostGrid.jsx`

**Regression risk: Low**

The main risk is selection repair after filtering, sorting, deletion, or column visibility changes.

### 6. Parent subscriptions and aggregate calculations amplify grid updates

**Severity: High**

**Evidence**

- `CostLoadPage` subscribes to the entire workspace store: `src/pages/CostLoadPage.jsx:22`.
- It filters/sorts, builds a map, creates visible rows, performs two cost reductions, and calculates BOQ count on every render: `src/pages/CostLoadPage.jsx:25-32`.
- The grid reports a new selection summary object to the parent through an effect: `src/features/cost-grid/CostGrid.jsx:342`.
- The parent stores that summary: `src/pages/CostLoadPage.jsx:18,71`.
- Autosave status-only updates modify the workspace store: `src/stores/workspaceStore.js:95-105`, causing the same page work.
- `CostGrid` is not memoized, so the parent update re-enters the grid.

**Recommended solution**

- Use narrow Zustand selectors for active sheet, project metadata, save status, and actions.
- Memoize the footer projection and calculate all aggregate values in one pass.
- Reuse a shared worksheet projection/cache rather than projecting independently in the page and grid.
- Keep selection summary rendering in an isolated footer subscriber or prevent it from invalidating the grid.

**Files/components affected**

- `src/pages/CostLoadPage.jsx`
- `src/features/cost-grid/CostGrid.jsx`
- `src/stores/workspaceStore.js`
- Potential shared projection selector/module

**Regression risk: Medium**

Selectors must correctly update on active-sheet changes, filters, sorting, preferences, undo/redo, and save status.

### 7. Derived values and formatting are recomputed per cell

**Severity: High**

**Evidence**

- `valueFor` calls `getRowDerivedValues` before checking the requested column: `src/features/cost-grid/CostGrid.jsx:69-74`.
- Therefore even source text cells calculate derived values.
- `getRowDerivedValues` repeats `getCost` through `getUsedCost` and `getTotalCost`: `src/domain/calculations.js:1-16`.
- `formatNumber` constructs a new `Intl.NumberFormat` for every formatted value: `src/domain/calculations.js:13`.
- `valueFor` is called during visible-cell rendering at `src/features/cost-grid/CostGrid.jsx:1551`.

**Recommended solution**

- Branch by column before computing derived values.
- Compute derived values once per row projection/render.
- Cache `Intl.NumberFormat` instances by locale/options.
- Introduce a reusable in-memory derived-row cache keyed by stable row identity after structural sharing is established.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`
- `src/domain/calculations.js`
- Shared projection/derived-data module

**Regression risk: Low**

Tests must verify null, zero, override, quantity, precision, grouping, and locale behavior remain unchanged.

### 8. Filtering projects every column even when filters are inactive

**Severity: High**

**Evidence**

- New worksheets create filter objects for all 12 columns: `src/domain/normalization.js:29-30`.
- `projectVisibleRowIds` iterates every filter entry for every row: `src/domain/projection.js:42-51`.
- It calls `getProjectionValue` before checking whether search, condition, or selected values are active: `src/domain/projection.js:43-50`.
- Derived filter columns can therefore calculate costs even when their filter is inactive.

**Recommended solution**

- Precompute the active filter list before scanning rows.
- Return original row IDs immediately when there is no active filter and no sort.
- Compute each row's derived values once when active filters or sort require them.
- Keep filtering semantics and stable sort order unchanged.

**Files/components affected**

- `src/domain/projection.js`
- Projection tests

**Regression risk: Low**

Filter edge cases, numeric parsing, blank conditions, selected values, derived columns, and stable sorting need explicit tests.

### 9. Find performs duplicate full scans and linear per-cell matching

**Severity: High**

**Evidence**

- `findMatches` scans visible rows and columns and retains up to 500 records: `src/features/cost-grid/CostGrid.jsx:408-410`.
- `findMatchCount` scans the same rows and columns again: `src/features/cost-grid/CostGrid.jsx:411-427`.
- Every mounted cell calls `findMatches.some`: `src/features/cost-grid/CostGrid.jsx:1475-1476`.
- Editor suggestions scan all worksheet rows on each relevant text update: `src/features/cost-grid/CostGrid.jsx:394-407`.

**Recommended solution**

- Produce total count and the first 500 navigation records in one pass.
- Build an O(1) match-key set for rendering.
- Defer query processing with `useDeferredValue` or a transition.
- Cache distinct suggestion indexes per source column and worksheet revision.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`
- Potential search/index helper module and tests

**Regression risk: Low-Medium**

Match case, entire-cell mode, selection scope, visible-only semantics, replace current, and replace all must remain unchanged.

### 10. Tooltip and column-resize pointer movement update top-level grid state

**Severity: Medium**

**Evidence**

- Total Cost pointer movement updates tooltip coordinates in `CostGrid` state: `src/features/cost-grid/CostGrid.jsx:1496-1503`.
- Column resize updates `resizePreview` on every pointer event: `src/features/cost-grid/CostGrid.jsx:1311-1331`.
- Resize preview changes the `columns` array and grid templates: `src/features/cost-grid/CostGrid.jsx:258-262,1375,1446`.

**Recommended solution**

- Move tooltip positioning into an isolated portal component or update its transform imperatively once per frame.
- During resize, update a CSS custom property/preview line once per frame and persist the final width only on pointer-up.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`
- `src/styles/index.css`

**Regression risk: Low-Medium**

Tooltip boundaries, keyboard resize, persisted widths, and horizontal scroll alignment need verification.

### 11. Grid-position persistence participates in selection and layout work

**Severity: Medium**

**Evidence**

- Selection changes synchronously write JSON to `sessionStorage`: `src/features/cost-grid/CostGrid.jsx:41-55,343-378`.
- The `pagehide` listener is rebound when selection coordinates change: `src/features/cost-grid/CostGrid.jsx:379-383`.
- Runtime tracing attributed 28 ms of forced reflow to `saveGridPosition` and virtualizer scroll-offset measurement.

**Recommended solution**

- Debounce or idle-schedule position persistence.
- Keep the latest selection/scroll snapshot in refs.
- Register `pagehide` once.
- Avoid reading scroll geometry in an effect immediately following selection-driven DOM changes.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`

**Regression risk: Low**

Reload restoration and final page-hide persistence must remain reliable.

### 12. Full-row selection can become inconsistent after filtering

**Severity: High correctness risk; Medium performance impact**

**Evidence**

- Row-selection cleanup validates against all worksheet rows rather than visible rows: `src/features/cost-grid/CostGrid.jsx:440-445`.
- Footer count includes hidden selected IDs: `src/features/cost-grid/CostGrid.jsx:322-324`.
- Copy intersects selected IDs with the visible row model.
- Delete acts on all selected IDs, including hidden rows.

**Recommended solution**

- Define one explicit model. Spreadsheet behavior is safest if row selection is intersected with visible IDs when projection changes.
- If hidden selections are intentionally retained, expose the hidden count and make copy/delete semantics consistent.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`

**Regression risk: Medium**

This is behavior-sensitive and should be decided and tested before implementation.

### 13. Virtualizer identity and row-height estimates can increase scroll correction

**Severity: Medium**

**Evidence**

- `useVirtualizer` does not provide `getItemKey`: `src/features/cost-grid/CostGrid.jsx:298`.
- Stable row IDs already exist.
- Compact mode estimates 24 px, while CSS enforces a minimum row height of 28 px: `src/features/cost-grid/CostGrid.jsx:297`, `src/styles/index.css:599-601`.
- Resource editors can create variable-height rows and trigger remeasurement: `src/features/cost-grid/CostGrid.jsx:512-519`.

**Recommended solution**

- Add stable item keys based on row ID.
- Align estimates with actual density CSS.
- Retain dynamic measurement for multiline resource rows.
- Profile sort/filter/insert operations with variable-height rows.

**Files/components affected**

- `src/features/cost-grid/CostGrid.jsx`
- `src/styles/index.css`

**Regression risk: Low-Medium**

Incorrect item-key or measurement handling can cause stale heights or scroll jumps.

### 14. Project-wide resource changes clone every sheet before checking relevance

**Severity: Medium for Cost Load; High at maximum project scale**

**Evidence**

- `setResourceRate` clones each complete sheet before scanning for matching resources: `src/stores/workspaceStore.js:174-189`.
- Maximum scale is 100 sheets by 10,000 rows.

**Recommended solution**

- Scan immutable source rows or use existing resource references first.
- Clone only affected sheets.
- Preserve grouped atomic save and grouped undo/redo behavior.

**Files/components affected**

- `src/stores/workspaceStore.js`
- `src/domain/projectResources.js`

**Regression risk: Medium**

All matching resource/unit references and grouped history boundaries must remain exact.

### 15. Grouped history is not bounded like ordinary history

**Severity: Medium for interaction latency; High for long-session memory growth**

**Evidence**

- Grouped operations store complete before and after snapshots: `src/stores/workspaceStore.js:41`.
- Grouped undo/redo arrays are not bounded by entry or byte limits: `src/stores/workspaceStore.js:22,41-42,83`.
- Ordinary sheet history is bounded at `src/stores/workspaceStore.js:167-168`.

**Recommended solution**

- Enforce one bounded history budget across ordinary and grouped operations.
- Measure actual UTF-8 bytes rather than JavaScript string length.
- Prefer compact row/field patches after correctness tests exist.

**Files/components affected**

- `src/stores/workspaceStore.js`
- `src/domain/groupedHistory.js`

**Regression risk: High**

Mixed ordinary/grouped undo and redo across sheets require dedicated integration coverage.

## Lower-Priority Findings

### Column virtualization is not currently justified

**Severity: Low**

There are 12 domain columns (`src/domain/columns.js`). Rendering all columns for each mounted row is reasonable. Horizontal virtualization would add keyboard, selection, measurement, and accessibility complexity without demonstrated benefit. Revisit only if configurable columns materially increase the count.

### Clipboard operations are atomic but use inconsistent limits

**Severity: Low-Medium**

Cell copy/fill limits exist, but full-row copy has no equivalent cell limit, and paste uses a different threshold. Large operations still pass through the full-sheet mutation path. Standardize limits and preflight row limits, but optimize `mutateSheet` first.

### Autosave is already debounced

**Severity: Not a confirmed primary bottleneck**

The coordinator waits 500 ms and keeps only the latest pending snapshot (`src/database/repositories.js:200-208`). IndexedDB is not written on each keystroke; editing is committed on Enter/Tab/blur. The expensive confirmed work is cloning and validation on the UI thread plus whole-record persistence after the debounce. Do not change the database schema solely on the current evidence.

## Existing Strengths to Preserve

- Real vertical row virtualization with bounded DOM size.
- Stable React row keys using row IDs.
- Coordinate/identity-based selection rather than selected-cell arrays.
- Derived values are not persisted.
- Edits, paste, fill, and row operations are atomic undo entries.
- Autosave coalesces rapid commits and serializes writes per project.
- IndexedDB updates the sheet and project timestamp transactionally.
- Filters and sort are persisted and undoable.
- Clipboard and assembly operations preserve domain validation.

## Verification Status

The current repository was verified before documentation changes:

- `npm.cmd run build`: passed.
- `node --test "src/**/*.test.js"`: 61 passed, 0 failed.
- `npm.cmd run lint`: 0 errors, 8 warnings. The warnings are in `CostGrid.jsx`, including React Compiler skipping the component around `useVirtualizer` and hook dependency warnings.

There are no existing automated component performance tests for render counts, DOM row bounds, large selection latency, edit latency, or scroll behavior.

## Recommended Implementation Order

1. Add repeatable production performance fixtures, render counters, and regression tests.
2. Remove parent/store amplification with narrow selectors, memoized page aggregates, and a memoized `CostGrid` boundary.
3. Make selection updates atomic/O(1), remove duplicate click selection, and frame-coalesce pointer extent updates.
4. Decouple large selection summaries from immediate visual updates.
5. Eliminate redundant per-cell derived calculations and cache number formatters.
6. Skip inactive filters and consolidate projection/aggregate work.
7. Introduce structurally shared row updates and operation-aware validation/change detection while preserving history semantics.
8. Add memoized row rendering after row identity is stable.
9. Optimize find, suggestions, tooltip movement, resize, and session-position persistence.
10. Harden virtualization keys/estimates and grouped history/resource operations.
11. Re-profile. Consider a single selection overlay only if mounted-cell class reconciliation remains material.
12. Consider an IndexedDB schema change only if whole-record persistence remains measurable after the in-memory path is fixed.

## Target Architecture

The incremental target is:

```text
IndexedDB worksheet record
  -> in-memory project model with structural sharing and revisions
  -> cached/incremental row derivation and aggregate layer
  -> filtered/sorted row-ID projection
  -> virtualized visible rows
  -> memoized visible row rendering
```

Selection should flow as:

```text
pointer/keyboard input
  -> coordinate target in refs
  -> at most one atomic selection update per frame
  -> viewport-bounded visual update
  -> deferred/cached selection aggregate update
```

This reaches spreadsheet-like behavior without a complete rewrite, calculation changes, or an immediate database migration.
