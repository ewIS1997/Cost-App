# BOQ Cost Load - Phase 3 And 4 Execution Checklist

This document is the implementation checklist for only Phase 3 (Domain Layer) and Phase 4 (Database and Repositories). It is written for a weak implementation model. Follow every item in order.

The source of truth remains `REACT-OFFLINE-IMPLEMENTATION-PLAN.md`. Do not start Phase 5 from this checklist.

> **Data-model supersession:** Quantity-map and row-override details in this original phase checklist describe the former worksheet schema. The current schema stores one editable `boqQty` value per row; see the current data-model and migration sections in `REACT-OFFLINE-IMPLEMENTATION-PLAN.md`.

## Review Of Existing Phase 0-2 Work

| Phase | Status | Evidence | Follow-up |
|---|---|---|---|
| Phase 0 - Baseline and requirements | Cannot be proven from source | Both planning documents exist. Node/npm checks and documented conflict review leave no source artifact. | Read both documents before Phase 3. Record any newly found conflict. |
| Phase 1 - Project foundation | Mostly complete | React 19.3, Vite 8, JavaScript, Tailwind, linting, package lock, source folders, and runtime dependencies are present. | Do not backfill Phase 1 during this task. The required empty domain/database folders are ready for Phase 3/4. |
| Phase 2 - Single-file configuration and routes | Mostly complete | `vite.config.js` sets relative base path, uses `vite-plugin-singlefile`, disables CSS splitting/source maps, and defines the `BOQ-Cost-Load` output. `App.jsx` uses static `HashRouter` routes and placeholder pages. | Do not run a production build. Keep all route pages statically imported. |

Existing files that must be preserved unless the current phase requires a direct change:

- `package.json`
- `vite.config.js`
- `src/main.jsx`
- `src/app/App.jsx`
- `src/app/AppLayout.jsx`
- `src/pages/*.jsx`
- `src/styles/index.css`

Current gaps intentionally outside this task:

- The required full source structure is not yet complete; this task creates only the Phase 3/4 domain and database modules.
- The project UI does not yet exist, so persistence can only receive a manual browser workflow review when Phase 6 provides project creation and loading controls.
- Do not add a temporary test page, test harness, seed script, test file, or test dependency to compensate for the missing UI.

## Rules For This Task

- [ ] Use JavaScript only: `.js` modules in `src/domain/` and `src/database/`.
- [ ] Use JSDoc typedefs. Do not add TypeScript, TypeScript configuration, `any`, or untyped persisted data assumptions.
- [ ] Do not create, configure, or run any automated test, test script, test page, test harness, fixture, or test dependency.
- [ ] Keep the Vite localhost development server running while implementing. Review imports, route rendering, and browser console errors manually.
- [ ] Do not run `npm run build`, inspect `dist`, or open a `file://` artifact.
- [ ] Do not modify the UI routes or placeholder pages in these phases except to fix an import error caused directly by Phase 3/4 code.
- [ ] Do not import React, Dexie, Zustand, browser DOM APIs, or UI code from `src/domain/`.
- [ ] Do not call Dexie directly from React components. Only repositories may access the database instance.
- [ ] Do not store derived `cost`, `usedCost`, or `totalCost` on a persisted row.
- [ ] Do not persist data in localStorage, Zustand middleware, React state, or the HTML file.
- [ ] Use transactions for every database operation that changes related records.
- [ ] Never silently repair, discard, or partially persist invalid imported data.
- [ ] If an instruction is ambiguous, stop and report it rather than inventing behavior.

## Required Files

Create these files. Do not combine all logic into one file.

```text
src/
|-- domain/
|   |-- types.js
|   |-- constants.js
|   |-- columns.js
|   |-- normalization.js
|   |-- calculations.js
|   |-- projection.js
|   `-- validation.js
`-- database/
    |-- database.js
    |-- migrations.js
    `-- repositories.js
```

Use small private helpers inside the appropriate module when they are only used there. Export only functions other modules need.

## Phase 3 - Domain Layer

### 3.1 Define Stable Data Contracts

- [ ] Create `src/domain/types.js`.
- [ ] Add JSDoc typedefs for `CostRow`, `ColumnFilter`, `WorksheetData`, `SheetRecord`, `ProjectRecord`, `AppSettings`, `ProjectBackupV1`, and `AllProjectsBackupV1`.
- [ ] Match every persisted property name, nullability, and schema version in plan sections 10 and 14 exactly.
- [ ] Document that a cost row only persists `id`, `boqCode`, `resource`, `cqbi`, `cr`, `rate`, `override`, `boqQtyOverride`, `unassignedQty`, and `remark`.
- [ ] Document that calculated cost fields are derived and never persisted.
- [ ] Keep types.js declaration-only. Do not put factories, validation, calculations, or database calls in it.

Manual review:

- [ ] Inspect the file and confirm all record fields are represented.
- [ ] Confirm no TypeScript syntax or React/Dexie import exists.

### 3.2 Add Constants And Columns

- [ ] Create `src/domain/constants.js`.
- [ ] Export named constants for: database name, database schema version, row limit 10,000, sheet limit 100, history entry limit 20, history byte limit 24 MB, project-name limit 100, sheet-name limit 60, BOQ-code limit 100, resource limit 500, remark limit 1,000, numeric absolute limit `1e12`, JSON backup limit 100 MB, Excel import limit 25 MB, and column width limits 72/480.
- [ ] Export the default column-width array in the exact A-K order.
- [ ] Export a blank/default filter value with empty search and condition fields and `selected: null`.
- [ ] Create `src/domain/columns.js`.
- [ ] Export the 11 columns in exact order: `boqCode`, `resource`, `cqbi`, `cr`, `rate`, `cost`, `override`, `usedCost`, `boqQty`, `totalCost`, `remark`.
- [ ] Include index, A-K letter, key, label, editable state, derived state, and default width for each column.
- [ ] Export recognized column-key and editable-column-key helpers/constants.
- [ ] Keep Remark hidden by default through the blank worksheet factory, not by omitting its column definition.

Manual review:

- [ ] Confirm columns F, H, and J are derived/read-only and all other planned editable columns are marked editable.
- [ ] Confirm default widths exactly match the plan.

### 3.3 Normalize And Create Data

- [ ] Create `src/domain/normalization.js`.
- [ ] Implement `normalizeBoqCode(value)`: convert to string, trim, uppercase, return empty string for blank input.
- [ ] Implement a strict numeric parser that accepts numbers and fully valid trimmed numeric strings with grouping commas.
- [ ] Return `null` for blank input.
- [ ] Reject malformed numeric strings rather than partially parsing them.
- [ ] Reject `NaN`, infinity, negative infinity, and absolute values above `1e12`.
- [ ] Return a structured parse result or a value/error contract that lets callers show a human-readable error without guessing why parsing failed.
- [ ] Implement text normalization for resource and remark values without changing valid user text beyond the required trim behavior.
- [ ] Implement a UUID helper using `crypto.randomUUID()` when present and a collision-resistant safe fallback otherwise.
- [ ] Implement `createBlankRow()` with a new ID, blank strings, and null numeric fields.
- [ ] Implement `createBlankWorksheet()` with schema version 3, one blank row, empty quantities/filters/sort, default widths, and Remark hidden.
- [ ] Implement `createSheetRecord(projectId, name, position, timestamp)`.
- [ ] Implement `createProjectRecord(name, firstSheetId, darkMode, timestamp)`.
- [ ] Implement `createAppSettings()` with schema version 1, light default mode, and storage notice not dismissed.

Manual review:

- [ ] Read each factory return object and confirm it contains no derived costs.
- [ ] Confirm a valid numeric zero remains zero and is not converted to null.

### 3.4 Implement Calculations And Quantity Rules

- [ ] Create `src/domain/calculations.js`.
- [ ] Implement `getCost(row)`: return `cqbi * cr * rate` only when every factor is a finite number; otherwise return null.
- [ ] Implement `getUsedCost(row)`: return `override` whenever override is not null, including zero; otherwise return the derived Cost.
- [ ] Implement `getResolvedBoqQuantity(row, quantities)`: row override, then shared normalized non-empty BOQ code quantity, then unassigned quantity for blank BOQ code, then null.
- [ ] Implement `getTotalCost(row, quantities)`: Used Cost multiplied by resolved BOQ quantity only when both are numeric; otherwise null.
- [ ] Implement one `formatNumber(value)` function using browser locale, grouping separators, minimum zero and maximum six fraction digits, and no currency symbol.
- [ ] Export a single row-derived-values helper for grid, summary, reports, CSV, and Excel usage.
- [ ] Do not duplicate formula logic in another domain or repository module.

Manual review:

- [ ] Confirm all calculation functions treat zero as a valid number.
- [ ] Confirm no function uses truthiness to choose Override versus Cost.

### 3.5 Implement Quantity Maintenance

- [ ] Add pure quantity pruning helpers to `normalization.js` or a clearly named domain module.
- [ ] After a completed row mutation, retain only shared quantity keys used by at least one non-empty normalized BOQ code.
- [ ] Implement BOQ-code-change preparation logic exactly: preserve row override; seed a new destination shared quantity from the old code only if destination has none; preserve an existing destination quantity; initialize unassigned quantity from old shared quantity only when required; remove old shared quantity only when unused.
- [ ] Ensure each helper returns new data or mutates only a supplied draft. Never mutate a live caller-owned object unexpectedly.

Manual review:

- [ ] Check the helper logic against plan section 18 line by line.

### 3.6 Implement Filter And Sort Projection

- [ ] Create `src/domain/projection.js`.
- [ ] Implement a pure visible-row projection that reads rows, filters, and sort state and returns visible row IDs in display order.
- [ ] Implement case-insensitive substring search.
- [ ] Implement all conditions exactly: `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`, `between`, `isBlank`, and `isNotBlank`.
- [ ] Use the shared numeric parser for numeric comparisons.
- [ ] Treat `between` as inclusive and normalize reversed valid bounds.
- [ ] Treat blank as null or an empty trimmed string. Do not treat numeric zero as blank.
- [ ] Implement selected-values whitelist behavior; `null` means all values are permitted.
- [ ] Implement sort without modifying the source rows array.
- [ ] Sort numeric and derived columns numerically, with blanks last for ascending and descending directions.
- [ ] Sort text case-insensitively with locale-aware comparison.
- [ ] Implement helper(s) that produce the filter-relevant values to copy to a newly inserted row under active filters.
- [ ] Make helper(s) report no suitable source instead of clearing filters or fabricating a matching value.

Manual review:

- [ ] Confirm projections never call `rows.sort()` on the input array.
- [ ] Confirm derived columns get their values from the calculations module.

### 3.7 Implement Validation And Backups

- [ ] Create `src/domain/validation.js`.
- [ ] Return human-readable errors from every validator. Include field name and file row number when the input supplies one.
- [ ] Validate each row: unique ID at sheet level, string limits, permitted null/numeric fields, finite numeric values, and numeric limit.
- [ ] Validate each worksheet: schema version 3, row count, quantity map, width count/range, filters, sort shape, recognized hidden columns, row IDs, and no orphaned quantities after mutation completion.
- [ ] Validate each sheet: project relationship, non-empty trimmed name, 60-character name limit, position, timestamps, and worksheet data.
- [ ] Validate a project and its sheets: 1-100 sheets, unique case-insensitive names, active sheet points to an existing sheet, and valid timestamps/theme.
- [ ] Validate app settings schema/version and booleans.
- [ ] Validate project and all-project backup envelopes, IDs, cross-record relationships, positions, settings, timestamps, and schema versions before any write occurs.
- [ ] Implement legacy data migrations for worksheet v1-v3 and workbook v4. Generate project, sheet, and row IDs for legacy imports.
- [ ] Implement import adapters that preserve valid names/order/active-sheet relationships and report invalid legacy data rather than silently dropping it.
- [ ] Validate Excel staging rows: read only supported input columns, require shared quantity for non-empty BOQ codes, and report conflicting quantities with source rows.

Manual review:

- [ ] Confirm every import path validates everything before it returns data suitable for persistence.
- [ ] Confirm no validator silently deletes invalid values to make input pass.

### Phase 3 Gate

- [ ] Every required domain file exists and uses JavaScript/JSDoc.
- [ ] `src/domain/` imports no React, Dexie, Zustand, or UI module.
- [ ] All formulas, parsing, limits, normalization, and validation rules match the implementation plan.
- [ ] No test file, test code, or test command was added.
- [ ] The Vite localhost app still loads without an import or console error.

## Phase 4 - Database And Repositories

### 4.1 Create The Dexie Database

- [ ] Create `src/database/database.js`.
- [ ] Import Dexie only in database modules.
- [ ] Create one exported database instance named for application use.
- [ ] Set the Dexie database name to `boq-cost-load-react`.
- [ ] Define the initial schema exactly:

```text
projects: id, updatedAt, createdAt, name
sheets: id, projectId, [projectId+position], updatedAt
settings: id
```

- [ ] Store full worksheet row arrays inside a sheet record. Do not create a cost-row table.
- [ ] Keep database schema upgrade/migration registration isolated in `src/database/migrations.js`.
- [ ] Do not delete legacy database data during initialization or migration.

Manual review:

- [ ] Confirm no module outside `src/database/` imports Dexie.
- [ ] Confirm the schema does not add an unnecessary rows table.

### 4.2 Implement Repository Boundaries

- [ ] Create `src/database/repositories.js`.
- [ ] Import domain factories, validation, migrations, and database instance through explicit module imports.
- [ ] Add `listProjectsWithSheetCounts()` sorted by project `updatedAt` descending.
- [ ] Add `loadProjectWithSheets(projectId)` that returns null for an unknown project and otherwise returns ordered sheets by position.
- [ ] Validate data read from IndexedDB before returning it to callers. Surface a descriptive error for corrupted persisted data.
- [ ] Add `createProjectWithFirstSheet(name, defaultDarkMode)` in one Dexie transaction.
- [ ] Use the same new UTC timestamp for creation and update timestamps on a newly created project and first sheet.
- [ ] Add `saveProjectMetadata(project)` and validate before write.
- [ ] Add `saveSheetAndProjectTimestamp(sheet, projectTimestamp)` in one transaction.
- [ ] Ensure delayed writes cannot move the project or sheet timestamp backward.
- [ ] Add transactional create, rename, duplicate, and delete sheet operations.
- [ ] Add transactional duplicate and delete project operations.
- [ ] Generate correct new project, sheet, and row IDs for duplication operations.
- [ ] Add `readSettings()` and `writeSettings()`; initialize default settings if missing.

Manual review:

- [ ] Read each multi-record operation and confirm it uses a Dexie transaction.
- [ ] Confirm no repository exposes direct table access to a React component.

### 4.3 Implement Save Coordination

- [ ] Create the autosave coordinator in `repositories.js` or a small database-only helper module if it improves clarity.
- [ ] Keep coordinator state outside persisted data and scope pending work by sheet ID.
- [ ] Debounce normal dirty-sheet saves by 500 ms.
- [ ] Allow only one active write per sheet.
- [ ] If data changes while a sheet save is active, retain only one queued follow-up save using the latest sheet data.
- [ ] Expose a save-status callback/notification contract for future UI state: `Saving...`, `Saved`, and `Save failed`.
- [ ] Retain dirty state after a save failure and expose a retry action.
- [ ] Add an immediate-save request method for the future Ctrl+S action.
- [ ] Add a project-scoped flush method that waits for every dirty, queued, and active save before export.
- [ ] Add an all-projects flush method for global backup export.
- [ ] Register a best-effort `pagehide` flush without claiming asynchronous IndexedDB completion is guaranteed during shutdown.

Manual review:

- [ ] Confirm coordinator logic never writes an older snapshot after a newer one.
- [ ] Confirm an export snapshot cannot knowingly read stale queued data.

### 4.4 Implement Transactional Backup Operations

- [ ] Add a project export snapshot operation that flushes project writes, then reads project and ordered sheets in a stable transaction.
- [ ] Add all-project export snapshot operation that flushes all writes, then reads projects, sheets, and settings in a stable transaction.
- [ ] Add import-as-new project operation: validate complete backup first, generate new project/sheet/row IDs, create new timestamps, preserve data/order/theme/active-sheet relationship, then write in one transaction.
- [ ] Add replace-current-project operation: validate first, retain target project ID and original `createdAt`, generate replacement sheet/row IDs, remap active sheet, delete old target sheets, write replacements, and update timestamp in one transaction.
- [ ] Add replace-all-projects operation: validate referential integrity first, preserve all imported IDs/timestamps exactly, replace projects/sheets/settings in one transaction, and return a signal for the caller to clear workspace state and route safely.
- [ ] Reject oversized backup files before JSON parsing in the file-operation layer; repository methods accept only already-validated domain envelopes.
- [ ] Never partially write an invalid backup.

Manual review:

- [ ] Confirm project import-as-new regenerates IDs while all-project replacement preserves them.
- [ ] Confirm replace-current does not change the target route project ID.

### 4.5 Implement Legacy Discovery

- [ ] Add a one-time legacy read attempt for database `boq-cost-load`, store `appState`, key `boq-cost-load:v1`.
- [ ] Treat legacy data as optional: unavailable, missing, or invalid data must not block the application.
- [ ] If valid legacy data is found, return an offerable import candidate. Do not import automatically.
- [ ] Never delete or modify the legacy database.
- [ ] Reuse Phase 3 migration functions for legacy shape conversion and ID generation.

Manual review:

- [ ] Confirm legacy discovery failures return a safe “no candidate” result rather than an application crash.

### Phase 4 Gate And Deferred Manual Review

- [ ] Every required database file exists and all Dexie access is isolated inside `src/database/`.
- [ ] Every multi-record write is transactional.
- [ ] Repository inputs are validated before writes and outputs are validated before use.
- [ ] Autosave provides serialized, latest-state-only behavior and a retryable failure contract.
- [ ] Legacy data is read-only and optional.
- [ ] No test file, fixture, test harness, test dependency, or test command was added.
- [ ] The Vite localhost application still loads without module import or console errors.

Do not create an artificial UI to demonstrate Phase 4. Record this deferred manual review for Phase 6:

- [ ] Create a project through the completed Projects page.
- [ ] Reload the Vite localhost page and confirm project and first sheet remain.
- [ ] Make a workbook change after Phase 7 is completed, wait for autosave, reload, and confirm it remains.
- [ ] Confirm duplicate projects, sheets, and rows use different IDs.
- [ ] Confirm save failure exposes retry state when a realistic browser storage failure can be produced.

## Completion Report Format

When this checklist is complete, report only:

```text
Phase 3: complete or blocked
Phase 4: complete or blocked
Files created or changed: <list>
Manual localhost review: <what was reviewed>
Deferred manual review: <Phase 6 items still waiting>
Tests: none created or run
Production build: not run
Blockers or deviations: <list or none>
```
