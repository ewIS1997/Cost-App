# Cost Load Grid Performance Plan

Date: 2026-10-04

## Planning Principles

- Preserve all Cost Load behavior and calculation results.
- Optimize measured bottlenecks, not assumed ones.
- Keep each phase independently releasable and reversible.
- Add measurement before architectural changes.
- Keep the IndexedDB schema unchanged unless later profiling demonstrates a persistence bottleneck that cannot be solved within the current schema.
- Preserve keyboard shortcuts, filters, copy/paste, undo/redo, assemblies, autosave, and accessibility.

## Success Criteria

Use a production build and persisted fixtures of 1,000, 2,000, and 10,000 rows. Record results on the same hardware/browser before and after each phase.

Initial target budgets:

| Interaction | Target |
| --- | ---: |
| Single-cell keyboard navigation | p95 under 50 ms |
| Pointer selection extent update | p95 under 16 ms visual frame, no long task over 50 ms |
| Large-range visual selection | independent of logical selected-cell count, excluding deferred summary |
| Start editing / editor keystroke | p95 under 50 ms |
| Commit one changed cell at 2,000 rows | p95 under 100 ms UI response |
| Commit one unchanged cell | p95 under 50 ms |
| Continuous scroll | no obvious blocking; target 55+ FPS on reference hardware |
| Filter apply at 2,000 rows | p95 under 100 ms |
| Copy selected range | no unnecessary React render before clipboard serialization |
| Autosave | no user-visible input blocking; save remains debounced and ordered |
| Mounted row count | bounded by viewport plus configured overscan |

The Google Sheets benchmark is qualitative for interaction continuity. Exact timing targets should be adjusted after a baseline is captured on the reference machine.

## Prioritization Method

Priority uses expected user impact, regression risk, and implementation cost:

- P0: measurement or critical interaction fix with high confidence.
- P1: high impact with low-to-medium risk/cost.
- P2: high impact but broader state/history changes.
- P3: conditional optimization requiring post-P2 evidence.

## Phase 0: Performance Harness and Correctness Safety Net

**Priority: P0**

**Impact: Enables every later phase**

**Risk: Low**

**Cost: Low-Medium**

### Work

- Add deterministic persisted fixtures for 1,000, 2,000, and 10,000 rows with representative BOQ groups, multiline resources, overrides, blanks, and repeated values.
- Add a production profiling route or development-only fixture loader that does not ship as user-facing functionality.
- Record baseline traces for selection drag, Shift/Ctrl navigation, scrolling, editing, commit, paste, filter, sort, find, and undo/redo.
- Add React render-count instrumentation for `CostGrid` and future row components in test/profiling mode.
- Add component/integration tests for:
  - Mounted rows remain bounded by viewport plus overscan.
  - Selection coordinates and status aggregates are correct.
  - Filtering while full rows are selected has defined behavior.
  - Edit, paste, fill, undo, and redo preserve results.
  - Autosave remains debounced, ordered, and retryable.

### Files likely affected

- New performance fixtures/tests under `src/`
- Test configuration if a browser component runner is added
- No production behavior change

### Exit criteria

- Baselines are recorded in production mode.
- Critical interactions can be repeated consistently.
- Calculation and undo/autosave behavior have regression coverage.

## Phase 1: Stop Unrelated Parent and Store Renders

**Priority: P1**

**Impact: High**

**Risk: Low-Medium**

**Cost: Low**

### Work

- Replace whole-workspace subscriptions in `CostLoadPage`, `SheetTabs`, and relevant layout code with narrow Zustand selectors.
- Memoize the exported `CostGrid` boundary.
- Memoize Cost Load footer projection and aggregate calculation.
- Calculate footer totals, BOQ count, and visible count in one pass.
- Isolate selection-summary display so updating it does not cause a second grid render.
- Verify save-status changes do not rerender `CostGrid` or recompute unchanged worksheet totals.

### Files likely affected

- `src/pages/CostLoadPage.jsx`
- `src/features/cost-grid/CostGrid.jsx`
- `src/features/workbook/SheetTabs.jsx`
- `src/app/AppLayout.jsx`

### Verification

- Render counters show zero grid renders for save-status-only and unrelated dialog changes.
- Selection summary updates do not recompute footer worksheet projection.
- Existing build, lint, tests, and interaction suite pass.

### Rollback boundary

This phase can be reverted without affecting worksheet data or persistence.

## Phase 2: Lightweight, Frame-Coalesced Selection

**Priority: P1**

**Impact: Critical for the reported issue**

**Risk: Medium**

**Cost: Medium**

### Work

- Replace separate active/anchor/extent setters with one atomic selection action.
- Reuse one row-ID-to-index and column-key-to-index map.
- Resolve selection validity and bounds in O(1).
- Remove duplicate pointerdown/click selection updates.
- During pointer drag, store the latest target in a ref and commit one extent update per animation frame.
- Avoid `scrollToCell` for ordinary pointer movement over an already visible cell.
- Retain edge auto-scroll and keyboard scroll behavior.
- Keep the coordinate model; do not generate selected-cell arrays.
- Decide and test full-row selection behavior when filtering hides selected rows.

### Files likely affected

- `src/features/cost-grid/useGridInteraction.js`
- `src/features/cost-grid/CostGrid.jsx`

### Verification

- Selection state update count is at most one per animation frame during drag.
- Visual selection remains correct for mouse, touch/pen if supported, Shift-click, Shift+arrows, Ctrl/Cmd+Shift+arrows, fill handle, and auto-scroll.
- Keyboard shortcuts, copy/paste bounds, and accessibility selection state remain correct.
- Large-range visual latency improves without changing summary results.

### Rollback boundary

Selection state remains local and coordinate-based; no persisted data changes.

## Phase 3: Decouple Selection Aggregates from Visual Selection

**Priority: P1**

**Impact: Critical for large rectangles**

**Risk: Medium**

**Cost: Medium**

### Work

- Make visual extent updates independent of count/sum/average calculation.
- Calculate rectangular cell count from bounds without visiting each cell.
- Build or reuse per-row numeric projections so sum/average do not repeatedly derive and parse the same cells.
- During active pointer drag, defer expensive sum/average work until the next idle/deferred update or drag completion.
- Cancel stale summary jobs when selection changes again.
- Keep accessibility announcements useful without announcing stale values as final.

### Files likely affected

- `src/features/cost-grid/CostGrid.jsx`
- Shared projection/selection-summary helper
- `src/pages/CostLoadPage.jsx`

### Verification

- Selecting 120,000 logical cells does not block visual selection.
- Final count, numeric count, sum, and average exactly match current behavior.
- Rapidly changing selection never displays a final result for an obsolete range.

### Decision gate: selection overlay

After this phase, profile mounted-cell reconciliation. Introduce a single selection overlay only if it remains a material cost. An overlay must support variable row heights, horizontal scrolling, virtual boundaries, active-cell outline, fill handle, find highlights, and accessibility. Do not add it solely because spreadsheets often use one.

## Phase 4: Cheap Derived Values, Formatting, and Projection

**Priority: P1**

**Impact: High across render, filter, find, and totals**

**Risk: Low**

**Cost: Low-Medium**

### Work

- Make `valueFor` branch before calculating derived values.
- Compute derived values once per row when needed.
- Cache `Intl.NumberFormat` by effective options.
- Precompute active filters before scanning rows.
- Fast-path no-filter/no-sort projection.
- Compute row-derived values once when filtering or sorting by derived columns.
- Consolidate Cost Load visible-row projection and aggregates into a shared cached result.

### Files likely affected

- `src/domain/calculations.js`
- `src/domain/projection.js`
- `src/features/cost-grid/CostGrid.jsx`
- `src/pages/CostLoadPage.jsx`

### Verification

- Existing calculation tests remain byte-for-byte/number-for-number equivalent.
- Add projection tests for all filter conditions, blanks, selected values, stable sorting, nulls, zero, and derived columns.
- Profile filter/sort and ordinary grid renders at all fixture sizes.

### Rollback boundary

No data shape or persistence change.

## Phase 5: Structural Sharing and Incremental Edit Validation

**Priority: P2**

**Impact: Critical for editing, paste, fill, filtering, and row operations**

**Risk: High**

**Cost: Medium-High**

### Work

- Define operation-aware worksheet mutation results:
  - Changed row IDs.
  - Inserted/deleted row IDs.
  - Changed worksheet metadata fields.
  - Explicit no-op result.
- Publish a new rows array containing new objects only for affected rows; retain unchanged row objects.
- Stop using full `JSON.stringify` equality on the synchronous edit path.
- Validate changed rows and directly affected metadata synchronously.
- Retain full worksheet validation before IndexedDB persistence, import/export, restore, and other trust boundaries.
- Replace repeated full-history size serialization with tracked history sizes.
- Evaluate compact patches/inverse patches for history while preserving atomic undo/redo behavior.
- Ensure filter/sort/column-width changes do not replace row objects.

### Files likely affected

- `src/stores/workspaceStore.js`
- `src/domain/validation.js`
- Callers of `mutateSheet` in `CostGrid.jsx` and other features
- History helpers/tests

### Verification

- One-cell edit changes exactly one row object identity.
- No-op edit performs no full worksheet clone and creates no history/save entry.
- Paste/fill remains one atomic undo entry.
- Undo/redo, grouped operations, assemblies, filters, sort, column widths, row insert/delete, and autosave produce the same persisted data.
- Corrupt data cannot bypass full validation at persistence boundaries.

### Rollback boundary

Keep the existing `mutateSheet` implementation available behind one internal adapter until every operation has tests. Remove it only after parity is demonstrated.

## Phase 6: Memoized Virtual Rows and Local Editors

**Priority: P2**

**Impact: High after structural sharing**

**Risk: Medium**

**Cost: Medium**

### Work

- Extract a memoized `GridRow` component.
- Pass stable row data and minimal primitive state describing active/selected/fill/find status.
- Stabilize event dispatch using a reducer/dispatcher or grid-level event delegation.
- Isolate editor text state so typing affects the active row/editor rather than every mounted row.
- Add a memoized `GridCell` only if profiling shows row isolation is insufficient.

### Files likely affected

- `src/features/cost-grid/CostGrid.jsx`
- New `GridRow.jsx` and possibly `GridCell.jsx`

### Verification

- Editing one cell rerenders only the active/affected row plus necessary shell/status UI.
- Moving a one-cell selection rerenders only old/new affected rows or the overlay.
- Scrolling mounts/reuses only the expected virtual rows.
- No stale editor, tooltip, fill, find, or selection state.

### Dependency

Do this after structural sharing. Memoized rows provide limited benefit if every worksheet mutation replaces every row object.

## Phase 7: Search, Suggestions, Tooltip, Resize, and Position Persistence

**Priority: P2**

**Impact: Medium-High**

**Risk: Low-Medium**

**Cost: Medium**

### Work

- Combine find navigation records and total match count into one scan.
- Build a match-key `Set` for O(1) cell highlighting.
- Defer find query processing and cancel obsolete work.
- Cache distinct suggestion indexes by column and worksheet revision.
- Isolate or imperatively position the cost-summary tooltip once per frame.
- Preview column resize through CSS/imperative style updates once per frame; commit final width on pointer-up.
- Store latest grid position in refs, debounce/idle-write session storage, and register `pagehide` once.

### Files likely affected

- `src/features/cost-grid/CostGrid.jsx`
- `src/styles/index.css`
- Search/suggestion helper tests

### Verification

- Find typing remains responsive at 10,000 rows.
- Match count/navigation/replace semantics are unchanged.
- Tooltip and resize pointer movement do not rerender the virtual window.
- Reload restores selection and scroll position.

## Phase 8: Virtualization Robustness and Scroll Tuning

**Priority: P2**

**Impact: Medium**

**Risk: Low-Medium**

**Cost: Low**

### Work

- Provide stable virtual item keys from row IDs.
- Align estimated row heights with actual CSS density values.
- Retain measurement for multiline resource rows.
- Tune overscan only with scroll traces; do not reduce it merely to lower node count.
- Verify filter/sort/insert/delete and editor expansion do not produce scroll jumps.

### Files likely affected

- `src/features/cost-grid/CostGrid.jsx`
- `src/styles/index.css`

### Verification

- 10,000-row scroll trace has no repeated long tasks attributable to grid rendering.
- Variable-height rows maintain correct offsets after sort/filter/insert/delete.
- Keyboard navigation to distant rows remains correct.

## Phase 9: History and Project-Wide Aggregate Hardening

**Priority: P2**

**Impact: Medium for grid, high for long projects/sessions**

**Risk: High**

**Cost: Medium**

### Work

- Bound grouped history by entry and actual byte budgets.
- Share one budget policy across ordinary and grouped history.
- Clone only sheets affected by project-wide resource-rate updates.
- Reuse resource references/indexes to find affected rows.
- Cache resource/project/report aggregates by sheet and row revisions.
- Ensure Cost Load row edits invalidate only relevant aggregates.

### Files likely affected

- `src/stores/workspaceStore.js`
- `src/domain/groupedHistory.js`
- `src/domain/projectResources.js`
- `src/domain/projectSummary.js`
- `src/domain/reportRows.js`
- Resources/Summary/Reports pages

### Verification

- Mixed grouped and ordinary undo/redo remains correct across sheets.
- Long sessions stay within the configured history budget.
- Updating one resource rate clones and recalculates only affected sheets/rows.
- Reports and summaries retain exact current results.

## Phase 10: Persistence Reassessment

**Priority: P3, conditional**

**Impact: Unknown until re-profiled**

**Risk: High if schema changes**

**Cost: Medium-High**

### Work before any schema decision

- Instrument autosave snapshot-clone time, full validation time, serialization time, transaction time, and IndexedDB write time separately.
- Measure coalescing effectiveness during realistic editing bursts.
- Confirm whether persistence causes main-thread stalls after Phases 1-9.

### Preferred current-schema options

- Schedule snapshot cloning outside the immediate input task where correctness permits.
- Use worksheet revisions to avoid cloning unchanged data.
- Keep latest dirty-record metadata and batch saves.
- Retain one-record worksheet transactions if write duration is acceptable.

### Schema migration gate

Only consider row-level IndexedDB records or a new normalized schema if measured whole-record write/clone cost remains outside the budget at 10,000 rows after in-memory optimizations. Any migration must include:

- Versioned migration and rollback strategy.
- Backup/import/export compatibility.
- Atomic sheet operations.
- Undo/redo and grouped-save compatibility.
- Failure recovery and migration tests.

## Cross-Phase Regression Matrix

Run after every behavior-changing phase:

| Area | Required checks |
| --- | --- |
| Calculations | Cost, Used Cost override, BOQ quantity, Total Cost, null, zero, precision |
| Selection | Click, drag, Shift-click, arrows, Shift+arrows, Ctrl/Cmd jumps, row selection |
| Editing | F2, typing replacement, formula bar, Enter, Tab, Escape, multiline resource |
| Clipboard | Cell/rectangle copy, cut, one-cell fill paste, multi-cell paste, row copy/paste |
| Fill | Horizontal/vertical fill, preview, auto-scroll, operation limit |
| Filters/sort | All conditions, selected values, blanks, derived fields, stable order |
| History | Edit, paste, fill, row operations, filter/sort/width, grouped undo/redo |
| Persistence | Debounce, latest-write wins, failure/retry, navigation flush, export flush |
| Virtualization | Scroll, distant navigation, variable heights, filter/sort/insert/delete |
| Accessibility | Grid roles/counts, active/selected state, keyboard access, live regions |

## Measurement Report Template

For each phase, record:

```text
Build: production/dev
Browser and version:
Hardware:
Fixture rows:
Visible columns:
Mounted rows/cells:
Interaction:
Median / p95 latency:
Longest main-thread task:
React commits and duration:
Layout/reflow duration:
Heap before/after:
Correctness suite result:
Notes:
```

## Recommended First Implementation Slice

After review, the safest high-value slice is:

1. Phase 0 baseline fixture and render counters.
2. Phase 1 narrow subscriptions and memoized boundaries.
3. Phase 2 atomic/frame-coalesced selection.
4. Phase 3 deferred selection aggregates.
5. Re-profile before beginning structural mutation changes.

This slice directly targets the reported selection/navigation lag, has no IndexedDB schema impact, and creates the evidence needed to justify the higher-risk editing/history work.
