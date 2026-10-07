# BOQ Cost Load React Offline Application - Implementation Plan

## 1. Purpose Of This Document

This document is the complete execution plan for rebuilding the BOQ Cost Load application as a React application.

The implementer must follow this document literally. Do not replace a selected technology, change a data rule, omit a validation rule, or invent a different workflow without obtaining explicit approval from the project owner.

This document is a plan only. It does not contain the application implementation.

## 2. Required Outcome

Create a multi-page, offline-first cost-loading web application with these properties:

1. The source is organized as a normal React, Vite, and JavaScript project.
2. The production build produces one self-contained file named `BOQ-Cost-Load.html`.
3. A user can open that file by double-clicking it in Windows.
4. The application runs under a `file://` URL in current Microsoft Edge and Google Chrome.
5. No web server, installation, internet connection, CDN, API, cloud database, or login is required.
6. Application data is persisted locally in IndexedDB.
7. Users can manage multiple independent cost-estimation projects.
8. Each project contains a workbook with multiple sheets.
9. All legacy behaviors specified in this plan are retained unless a later requirement in this plan explicitly replaces them.
10. Project data can be transferred between computers through explicit JSON and Excel export/import operations. The HTML file itself does not contain the user's saved data.

## 3. Sources Of Truth And Conflict Rules

Use the following precedence if requirements appear to conflict:

1. This implementation plan.
2. `PAGE-DESCRIPTION.md` for the legacy single-workbook interface.
3. Existing source code, if it is added to the workspace later.
4. Existing source code, if it is added to the workspace later.

Important resolved ambiguity:

- Undo and redo history is limited to 20 snapshots and 24 MB of serialized snapshots per sheet.
- The application has multiple routed views, but it remains one React single-page application. Do not create multiple HTML files.
- Use `HashRouter`, never `BrowserRouter`, because the production application runs from `file://`.
- Do not add a service worker or PWA functionality. The final HTML already contains all runtime assets.

## 4. Fixed Technology Stack

Use the following stack. Do not substitute alternatives.

| Responsibility | Required technology |
|---|---|
| UI framework | React 19.3 |
| Language | JavaScript with JSDoc typedefs where they improve clarity |
| Build tool | Vite 8 |
| React Vite integration | `@vitejs/plugin-react` |
| Routing | React Router with `HashRouter` |
| Persistent database | Browser IndexedDB |
| IndexedDB wrapper | Dexie.js |
| Tabular data model | TanStack Table |
| Row virtualization | TanStack Virtual |
| UI and workspace state | Zustand |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Excel reading/writing | SheetJS package `xlsx` |
| Single-file packaging | `vite-plugin-singlefile` |

Version rules:

- Begin with React `19.3.x` and Vite `8.x`.
- Pin exact dependency versions in the lockfile.
- Use a currently compatible `@vitejs/plugin-react` version for Vite 8.
- Use `vite-plugin-singlefile` version `2.3.3` or a later compatible patch/minor version that explicitly supports Vite 8.
- Do not upgrade a major dependency during implementation unless required to resolve a confirmed blocker.
- Do not create, configure, or run unit, component, integration, end-to-end, or other automated tests at any point. All validation is manual.
- Run the Vite localhost development server throughout implementation and review changes there in real time.
- Do not run a production build until every implementation phase is complete.

## 5. Hard Constraints

The following are non-negotiable:

- Do not use Next.js, Remix, Electron, Tauri, a backend, Supabase, or any remote service.
- Do not use a CDN.
- Do not reference remote fonts, stylesheets, scripts, images, analytics, or APIs.
- Do not require `npm`, Node.js, or a local server on the end user's computer.
- Do not use normal path-based browser routing.
- Do not produce separate JavaScript, CSS, font, image, source-map, or worker files in the distributable folder.
- Do not dynamically import routed pages. Static imports are required so Vite does not create route chunks.
- Do not store business data only in Zustand, React state, `localStorage`, or the HTML file.
- Do not remove JSON backup and restore merely because IndexedDB persistence works.
- Do not put derived `cost`, `usedCost`, or `totalCost` values into the authoritative row records.
- Do not mutate workbook data outside the central mutation gateway.
- Do not silently discard invalid imported data.
- Do not implement any feature that makes a network request.

## 6. Browser And Distribution Contract

### 6.1 Supported browsers

Support the current stable versions of:

- Microsoft Edge on Windows.
- Google Chrome on Windows.

Firefox and Safari are not required acceptance targets, although the application should avoid unnecessary browser-specific code.

### 6.2 Final artifact

The final distribution directory must contain:

```text
dist/
`-- BOQ-Cost-Load.html
```

No other file is allowed in the final distribution directory.

### 6.3 Local-file limitations that must be visible to users

IndexedDB data belongs to the browser's interpretation of the local file origin. Moving, renaming, or copying the HTML file can result in a different storage context. Therefore:

- Show a short first-run notice explaining that saved projects live in the browser, not inside the HTML file.
- Recommend creating regular JSON backups.
- State that copying the HTML file does not copy projects.
- Do not claim that browser persistence is a substitute for backup.

The notice must be dismissible. Store dismissal in the application settings table.

## 7. Functional Scope

Implement the complete functional scope and the multi-project and multi-page structure defined here.

### 7.1 Existing features that must be retained

- Spreadsheet-like BOQ cost loading grid.
- Workbook sheets, including add, activate, rename, duplicate, and delete.
- Inline cell editing.
- Formula bar editing.
- Rectangular selection.
- Keyboard navigation and shortcuts.
- Copy, cut, paste, and drag-handle fill down, up, left, and right.
- A directly editable BOQ Qty field on every resource row.
- Derived Cost, Used Cost, and Total Cost columns.
- Filtering, condition filtering, sorting, and restore-original-order.
- Row insertion and deletion, including filter-aware insertion.
- Find and replace.
- Column visibility and resizing.
- Undo and redo per sheet.
- Resource copy dialog and gutter `CC`/`VV` shortcuts.
- Dark mode.
- IndexedDB autosave.
- JSON backup and restore.
- CSV export.
- Excel template import and export.
- Virtualized row rendering.
- Responsive toolbar behavior.
- Toast notifications and error feedback.

### 7.2 New features required by the React version

- Multiple independent projects.
- Projects dashboard.
- Cost summary page.
- Reports page.
- Dedicated import/export page.
- Settings page.
- Hash-based navigation between pages.
- Project-level timestamps and project duplication.

### 7.3 Explicitly excluded from scope

- User accounts or authentication.
- Multi-user collaboration.
- Cloud synchronization.
- Server-side storage.
- Network-based update checking.
- PDF generation library. Printing uses browser print styles and the browser's Save as PDF capability.
- User-defined calculation formulas.
- Macros or scripting.
- Currency conversion.
- External price databases.

## 8. Routes And Page Responsibilities

Use the following routes exactly:

| Hash route | Page | Responsibility |
|---|---|---|
| `#/projects` | Projects | List, create, rename, duplicate, delete, import, and open projects |
| `#/projects/new` | New Project | Create a named project with one blank sheet |
| `#/projects/:projectId/cost-load` | Cost Load | Workbook tabs and the spreadsheet editor |
| `#/projects/:projectId/summary` | Summary | Read-only cost totals and grouped summaries |
| `#/projects/:projectId/reports` | Reports | Printable summary and resource-detail reports |
| `#/projects/:projectId/import-export` | Import/Export | Excel, CSV, and JSON operations for the selected project |
| `#/settings` | Settings | Application defaults, storage notice, and global data maintenance |

Routing rules:

- `#/` redirects to `#/projects`.
- An unknown route redirects to `#/projects` and shows a warning toast.
- A route containing an unknown project ID redirects to `#/projects` and shows `Project not found`.
- Deleting the currently open project navigates to `#/projects`.
- Navigation must commit or cancel an active cell edit before leaving the Cost Load page.
- Browser Back and Forward must work between routes.

## 9. Page Specifications

### 9.1 Projects page

Display projects sorted by `updatedAt` descending. Each project item shows:

- Project name.
- Number of sheets.
- Last updated date and time.
- Created date.
- Open action.
- Rename action.
- Duplicate action.
- Export backup action.
- Delete action.

The page also provides one top-level `Import Project` action. It accepts a validated project backup or legacy workbook backup and always creates a new project; it never replaces an existing project from this page.

Rules:

- Project names are trimmed, required, and limited to 100 characters.
- Duplicate names are allowed because identity is based on project ID.
- Deletion requires confirmation containing the project name.
- Project duplication deep-clones every sheet and row and generates new project, sheet, and row IDs.
- A duplicated project is named `<original name> Copy`, adding an incrementing number if needed for clarity.
- Creating a project creates one sheet named `Sheet 1` with zero worksheet rows until the user adds or imports data.
- Opening a project navigates to its Cost Load page and restores its active sheet.
- Include empty-state guidance when no projects exist.

### 9.2 New Project page

Provide:

- Project name input.
- Create button.
- Cancel button.

On successful creation, navigate directly to the new project's Cost Load page. Validation errors remain on the page and focus the invalid field.

### 9.3 Cost Load page

This is the primary workbook editor. It contains:

- Shared application header and project navigation.
- Existing workbook toolbar actions.
- Formula bar.
- Virtualized cost-loading grid.
- Sheet tab strip.
- Status bar.
- Existing overlays, menus, dialogs, and toast region.

The page must preserve the interaction behavior specified in this plan. React components may reorganize implementation details, but behavior must not change without explicit approval.

### 9.4 Summary page

This page is read-only and operates on all sheets in the active project.

Display:

- Project grand total.
- Total number of sheets.
- Total source rows.
- Number of unique non-empty BOQ codes.
- A grouped table with one row per sheet and BOQ code.
- Columns: Sheet, BOQ Code, Resource Rows, BOQ Quantity, Sum of Used Cost, and Total Cost.

Grouping rules:

- Treat empty BOQ codes as `Unassigned`.
- `Resource Rows` is the count of source rows in the group.
- `BOQ Quantity` shows the common resolved quantity when every row in the group has the same resolved quantity, `Mixed` when resolved quantities differ, and blank when every resolved quantity is null.
- `Sum of Used Cost` is the sum of each row's derived Used Cost.
- `Total Cost` is the sum of each row's derived Total Cost.
- Do not combine same-named BOQ codes across sheets into one row; retain the sheet dimension.
- Add a final grand-total row.
- Read calculations from shared domain functions, never duplicate formula logic in the page.

### 9.5 Reports page

Provide two report types:

1. Project Summary.
2. Resource Detail.

Project Summary includes project metadata, sheet totals, grouped BOQ totals, and project grand total.

Resource Detail includes sheet name, BOQ code, resource, CQBI, CR, Rate, Cost, Override, Used Cost, BOQ Qty, Total Cost, and Remark.

Rules:

- Reports are read-only.
- Let the user choose all sheets or one sheet.
- Provide a Print button that calls the browser print dialog.
- Add print CSS that hides application navigation and controls.
- Do not add a PDF library.
- Reuse domain formatting and calculation functions.

### 9.6 Import/Export page

Organize actions into clearly separated panels:

- Export project JSON backup.
- Import project JSON backup as a new project.
- Replace current project from a JSON backup.
- Export active sheet to Excel.
- Import Excel into the active sheet.
- Export active sheet's currently visible rows to CSV.

Replacement operations require confirmation. Import-as-new never overwrites an existing project.

### 9.7 Settings page

Include only these settings and maintenance actions:

- Default theme for newly created projects: Light or Dark.
- Show the local browser-storage explanation and allow the dismissed first-run notice to be shown again.
- Export an all-projects JSON backup.
- Import an all-projects JSON backup after validation and confirmation.
- Delete all local application data after a two-step confirmation.
- Display application version and database schema version.

Do not add unsupported currency, locale, cloud, account, or synchronization settings.

## 10. Domain Data Model

Use JavaScript data structures with JSDoc typedefs for persisted and complex runtime structures. Validate all persisted and imported domain data at runtime.

### 10.1 Row

The authoritative row shape remains:

```js
/**
 * @typedef {Object} CostRow
 * @property {string} id
 * @property {string} boqCode
 * @property {string} resource
 * @property {number | null} cqbi
 * @property {number | null} cr
 * @property {number | null} rate
 * @property {number | null} override
 * @property {number | null} boqQty
 * @property {string} remark
 */
```

Do not persist `cost`, `usedCost`, or `totalCost`. They are derived.

### 10.2 Worksheet

```js
/**
 * @typedef {Object} WorksheetData
 * @property {4} schemaVersion
 * @property {CostRow[]} rows
 * @property {number[]} columnWidths
 * @property {Object.<string, ColumnFilter>} filters
 * @property {{ col: number, direction: "asc" | "desc" } | null} sort
 * @property {string[]} hiddenColumnKeys
 */
```

Use this filter shape:

```js
/**
 * @typedef {Object} ColumnFilter
 * @property {string} search
 * @property {"" | "equals" | "notEquals" | "contains" | "notContains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "between" | "isBlank" | "isNotBlank"} condition
 * @property {string} conditionValue
 * @property {string} conditionValue2
 * @property {string[] | null} selected
 */
```

Project theme is not duplicated inside a worksheet. Legacy worksheet `darkMode` values are accepted during migration and then removed from the authoritative React model.

### 10.3 Sheet record

```js
/** @typedef {{ id: string, projectId: string, name: string, position: number, data: WorksheetData, createdAt: string, updatedAt: string }} SheetRecord */
```

### 10.4 Project record

```js
/** @typedef {{ id: string, name: string, activeSheetId: string, darkMode: boolean, createdAt: string, updatedAt: string }} ProjectRecord */
```

Use ISO 8601 UTC strings for persisted timestamps.

### 10.5 Application settings

```js
/** @typedef {{ id: "app", schemaVersion: 1, defaultDarkMode: boolean, storageNoticeDismissed: boolean }} AppSettings */
```

### 10.6 Column definitions

Preserve these columns and order exactly:

| Index | Key | Label | Editable | Derived | Default width |
|---|---|---|---|---|---|
| 0 | `boqCode` | BOQ Code | Yes | No | 128 px |
| 1 | `resource` | Resource | Yes | No | 190 px |
| 2 | `cqbi` | CQBI | Yes | No | 100 px |
| 3 | `cr` | CR | Yes | No | 90 px |
| 4 | `rate` | Rate | Yes | No | 110 px |
| 5 | `cost` | Cost | No | Yes | 120 px |
| 6 | `override` | Override | Yes | No | 110 px |
| 7 | `usedCost` | Used Cost | No | Yes | 125 px |
| 8 | `boqQty` | BOQ Qty | Yes | No | 105 px |
| 9 | `totalCost` | Total Cost | No | Yes | 145 px |
| 10 | `remark` | Remark | Yes | No | 220 px |

Remark is hidden by default.

## 11. Calculations And Normalization

Implement these as pure functions in `src/domain/calculations.js` and `src/domain/normalization.js`.

### 11.1 Formulas

```text
Cost       = CQBI x CR x Rate
Used Cost  = Override when Override is not null, otherwise Cost
Total Cost = Used Cost x row BOQ Qty
```

Rules:

- A missing numeric factor produces a null derived value rather than silently substituting an arbitrary value.
- A numeric zero is valid and must not be treated as missing.
- Never use JavaScript truthiness to choose between Override and Cost.
- Reject non-finite values.
- Display and export logic must use the same derived functions.

### 11.2 BOQ quantity

- BOQ Qty is a nullable numeric input on each resource row.
- Editing a row changes only that row.
- When a contextual row insertion copies a BOQ item, it copies the source row's BOQ Qty as the new row's initial value; the two rows are independent afterward.
- Empty BOQ Qty remains null. Numeric zero is valid.

### 11.3 BOQ code normalization

- Convert input to a string.
- Trim leading and trailing whitespace.
- Convert to uppercase.
- Empty input becomes an empty string.

### 11.4 Numeric parsing

- Accept numbers and trimmed numeric strings.
- Accept grouping commas.
- Empty input becomes null.
- Reject malformed values rather than partially parsing them.
- Reject `NaN`, infinity, and absolute values over `1e12`.

### 11.5 Number display

- Show raw, unformatted numeric text while a cell is being edited.
- Outside edit mode, use `Intl.NumberFormat` with the browser's locale.
- Use grouping separators, zero minimum fraction digits, and six maximum fraction digits.
- Do not display a currency symbol because no project currency is defined.
- Do not round the authoritative stored number. Formatting affects display only.
- Excel exports contain numeric cell values, not preformatted strings, except where text-safety rules require text.

## 12. Validation Rules

Create explicit validation functions for rows, worksheets, sheets, projects, backups, and Excel imports.

Enforce:

- Maximum 10,000 rows per sheet.
- Maximum 100 sheets per project.
- Maximum sheet name length of 60 characters.
- Sheet names are unique within a project, case-insensitively.
- Sheet names are trimmed and non-empty.
- Row IDs are unique within a sheet.
- BOQ Code maximum length is 100 characters.
- Resource maximum length is 500 characters.
- Remark maximum length is 1,000 characters.
- Project name maximum length is 100 characters.
- All persisted numbers are finite and have absolute value no greater than `1e12`.
- BOQ Qty is null or a finite number within the configured numeric limit.
- Column width count equals the column definition count.
- Every column width is between 72 and 480 px.
- Hidden columns contain recognized keys only.
- Active project sheet ID references an existing sheet.
- Each project always contains at least one sheet.

Validation failures must produce human-readable errors. Import errors must identify the file row or field when possible.

## 13. IndexedDB And Dexie Design

### 13.1 Database

Use database name:

```text
boq-cost-load-react
```

Initial Dexie schema:

```text
projects: id, updatedAt, createdAt, name
sheets: id, projectId, [projectId+position], updatedAt
settings: id
```

Store sheet row arrays inside each sheet record. Do not create one IndexedDB record per cost row in the first implementation.

### 13.2 Repository boundary

React components must not call Dexie directly. Create repository functions for:

- Listing projects with sheet counts.
- Loading one project and all ordered sheets.
- Creating a project and first sheet in one transaction.
- Saving project metadata.
- Saving one sheet.
- Creating, duplicating, renaming, and deleting sheets.
- Duplicating and deleting projects.
- Reading and writing settings.
- Replacing all data from a validated all-project backup.

Use Dexie transactions whenever multiple records must remain consistent.

### 13.3 Autosave

- Debounce normal saves by 500 ms.
- Serialize writes so only one write for a given sheet is active at a time.
- If data changes during a write, queue exactly one follow-up write using the latest state.
- Display `Saving...`, `Saved`, or `Save failed` in the application header.
- A save failure must retain dirty state and allow retry.
- A persisted worksheet mutation advances both the sheet and parent project `updatedAt`. Save the sheet and monotonic project timestamp atomically; an older delayed write must never move either timestamp backward.
- Project and sheet lifecycle operations, imports, replacements, rename, and theme changes also advance the affected project `updatedAt`. Project creation/duplication use their new creation timestamp for both fields.
- Attempt a best-effort flush on `pagehide`.
- Do not claim that asynchronous IndexedDB completion is guaranteed during page shutdown.

### 13.4 Legacy migration

Support these import paths:

- Legacy worksheet backup schemas v1, v2, and v3.
- Legacy workbook backup schema v4.
- New project backup schema v1.
- New all-projects backup schema v1.

When possible, perform a one-time read of the legacy database named `boq-cost-load`, object store `appState`, key `boq-cost-load:v1`. If valid legacy data is available in the same browser storage context, offer to import it as a project. Never delete legacy data automatically.

Legacy import naming and identity rules:

- A v1-v3 single worksheet becomes one new project with one sheet named `Sheet 1`.
- A v4 workbook becomes one new project retaining its sheet names, order, active sheet, and workbook theme.
- Use the imported file's base filename as the project name when importing from a file.
- Trim and limit that name to 100 characters; use `Imported Project` when the filename produces an empty name.
- Generate new project, sheet, and row IDs for every legacy import.

## 14. Backup Schemas

### 14.1 Project backup

Export a complete, portable project envelope:

```js
/** @typedef {{ backupType: "boq-cost-load-project", schemaVersion: 1, exportedAt: string, project: ProjectRecord, sheets: SheetRecord[] }} ProjectBackupV1 */
```

On import as a new project:

- Validate the complete file before writing anything.
- Generate new project, sheet, and row IDs to prevent collisions.
- Preserve names, data, sheet order, theme, and active-sheet relationship.
- Set new creation and update timestamps.

Before entering an export action from the Cost Load page, resolve the active editor through the navigation guard. The repository export-snapshot operation is scoped by project ID and must flush/await every dirty, queued, or in-flight save for that project, including the latest coalesced follow-up, before reading a transactional snapshot. Abort export visibly if validation or persistence fails; never export a knowingly stale snapshot.

When replacing the current project:

- Validate the complete backup before changing IndexedDB.
- Preserve the target project's ID so the current route remains valid.
- Replace the target name, theme, sheets, active-sheet relationship, and workbook data with backup values.
- Generate new sheet and row IDs and remap `activeSheetId`.
- Preserve the target project's original `createdAt` and set a new `updatedAt`.
- Delete the target project's former sheet records and write all replacements in one transaction.

### 14.2 All-projects backup

```js
/** @typedef {{ backupType: "boq-cost-load-all-projects", schemaVersion: 1, exportedAt: string, projects: ProjectRecord[], sheets: SheetRecord[], settings: AppSettings }} AllProjectsBackupV1 */
```

Validate referential integrity before replacing existing data.

All-project restore is a full replacement. Preserve every validated project, sheet, and row ID, relationship, position, theme, and persisted timestamp exactly as provided, and replace settings with the validated backup settings. Because all existing application data is replaced in one transaction, ID regeneration is neither required nor permitted. After commit, clear loaded workspace state and route safely.

Before entering all-project export from Cost Load, resolve the active editor through the navigation guard. The repository all-project export-snapshot operation must flush/await all dirty, queued, or in-flight saves, then read a stable transactional snapshot. Abort visibly on failure.

### 14.3 Backup limits

- Reject files over 100 MB before parsing.
- Parse inside error handling.
- Never partially apply an invalid backup.
- Replacement must occur in a transaction.

## 15. Zustand State Design

Use small focused stores or slices. Do not mirror the entire database unnecessarily.

Required state areas:

- Current project metadata and loaded sheets.
- Active sheet ID.
- Grid selection and editing state.
- Filtered/sorted visible row IDs.
- Per-sheet undo and redo stacks.
- Save status and dirty state.
- Dialog, menu, toast, and responsive UI state.

Persisted data is loaded from and saved to Dexie. Zustand persistence middleware must not be used for project or workbook business data.

Use selectors so editing one cell does not rerender unrelated application sections.

## 16. Central Mutation Gateway

All worksheet data changes must pass through one mutation function with this logical flow:

1. Commit or reject any active editor value as appropriate.
2. Clone the current worksheet data into a draft.
3. Run the requested operation on the draft.
4. Normalize affected values.
5. Prune orphaned quantities.
6. Validate the complete draft.
7. Stop if the draft is unchanged.
8. Push the pre-change state to undo history.
9. Enforce the 20-entry and 24 MB history limits.
10. Clear redo history.
11. Replace active worksheet state.
12. Clear derived-value caches.
13. Recompute visible row IDs.
14. Mark the sheet dirty.
15. Schedule the 500 ms autosave.

Project and sheet lifecycle changes must use equivalent transactional actions but are not added to cell-level sheet undo history.

Persisted worksheet-view changes also use this gateway. Applying or clearing a filter, applying or clearing a sort, committing a column resize, and changing column visibility each create one undo entry, dirty the sheet, and schedule autosave. Temporary filter-popup edits and intermediate pointer-move resize values do not mutate the worksheet; Cancel creates no history entry. Commit a resize once on pointer release or keyboard confirmation.

## 17. Grid Architecture

### 17.1 Library responsibilities

TanStack Table handles:

- Column definitions.
- Accessors.
- Sort state integration.
- Filter state integration where useful.
- Header and row/cell model metadata.

TanStack Virtual handles:

- Vertical row virtualization.
- Twelve rows of overscan.
- Scroll positioning.
- Rendering only visible rows plus overscan.

Application code handles:

- Spreadsheet selection.
- Active-cell focus.
- Editing overlay.
- Keyboard navigation.
- Clipboard behavior.
- Fill handle.
- Formula bar.
- Derived values.
- Filter popup UI.
- Context menus.
- Gutter interactions.

Do not assume TanStack Table provides spreadsheet editing behavior.

### 17.2 Performance rules

- Support 10,000 rows per sheet.
- Keep the row height fixed at 28 px.
- Use stable row IDs, never array positions, as React keys.
- Build row-ID lookup maps when worksheet rows change.
- Do not scan all rows during pointer movement.
- Do not create a React component state object for every cell.
- Memoize derived values by row ID and relevant row/quantity inputs.
- Clear affected caches after mutations.
- Use `startTransition` or `useDeferredValue` for expensive non-urgent filter/search rendering where it improves responsiveness.
- Do not use `useMemo` or `useCallback` indiscriminately. Use them where library APIs require stable references or profiling proves value.

### 17.3 Selection

Preserve:

- Active cell.
- Selection anchor.
- Selection extent.
- Rectangular selection bounds.
- Shift extension.
- Whole-row selection with Shift+Space.
- Whole-column selection with Ctrl+Space.
- Select all with Ctrl+A.

Selection is based on visible row order after filters and sorting.

Status aggregation is exact through 2,000 selected cells. Above 2,000 cells, show the exact selected-cell count and omit sum/average using an em dash or equivalent neutral marker.

### 17.4 Editing

- Only columns A, B, C, D, E, G, I, and K are editable.
- Derived columns F, H, and J are read-only.
- A single click selects a cell.
- Clicking an already active editable cell starts replace-mode editing.
- Double-click starts editing and places the caret near the click position.
- F2 starts editing with the existing value selected.
- Typing a printable character starts editing with that character.
- Enter commits and moves down.
- Shift+Enter commits and moves up.
- Tab and Shift+Tab commit and move among editable visible columns.
- Escape cancels.
- Invalid numeric input remains in edit mode and shows an error.

### 17.5 Clipboard limits

- Copy, clear, and fill operations: maximum 50,000 cells.
- Paste: maximum 100,000 cells.
- Use tab-separated values.
- Preserve an internal clipboard matrix as a fallback.
- Pasting beyond the final row may append rows up to the 10,000-row limit.
- Never write into derived columns.
- A one-cell paste into a larger selection fills the selection.

### 17.6 Filtering and sorting

Implement the filter shape and conditions documented in this plan.

Implement the pure filter/sort projection and filter-aware insertion-value helpers in `src/domain/projection.js` during the domain phase. Feature code in `src/features/filtering/` owns the popup and interaction UI and consumes those shared helpers. This early pure contract is required by the mutation gateway and row insertion before the Phase 11 UI is built.

- Support these conditions exactly: `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `endsWith`, `gt`, `gte`, `lt`, `lte`, `between`, `isBlank`, and `isNotBlank`.
- Search and text comparisons are case-insensitive.
- Search is substring-based.
- Numeric comparisons parse condition values with the shared numeric parser.
- Invalid numeric filter values prevent Apply and show a validation message.
- `between` is inclusive and requires two valid numeric values; reverse bounds are normalized to lower then upper.
- Blank means null or an empty trimmed string. Numeric zero is not blank.
- Sort numeric and derived columns numerically, with blank values last in either direction.
- Sort text columns case-insensitively using locale-aware comparison.
- Selected values are a whitelist or null for all.
- Render at most 200 matching value checkboxes.
- Hidden values remain represented in selection state.
- Sorting does not mutate physical source-row order.
- Restore Original Order clears sort state.
- New rows added while filters are active copy sufficient filter-relevant values from the active visible source row so they remain visible.
- If no suitable source exists, abort insertion and show an explanatory error. Never clear filters automatically.

## 18. Workbook And Sheet Rules

- Maximum 100 sheets per project.
- Sheet names are unique case-insensitively within the project.
- New sheets use `Sheet 1`, `Sheet 2`, and so on, selecting the first available number.
- A project must always contain at least one sheet.
- The only sheet cannot be deleted.
- Duplicate sheet creates new sheet and row IDs.
- Duplicate sheet is inserted immediately after the source sheet.
- Double-clicking a sheet tab opens its rename interaction.
- Deleting an active sheet activates the nearest remaining adjacent sheet.
- Keep undo and redo histories independent per sheet during the current application session.
- Sheet history does not need to persist after closing the HTML application.
- Project `activeSheetId` does persist.

When a row's BOQ code changes:

- Normalize the destination code before processing quantities.
- Preserve the row's `boqQty`; it is independent of BOQ Code.

## 19. Resource Copy Rules

Preserve both workflows defined below:

- Copy Resources dialog using Ctrl+Alt+C.
- Gutter hover `CC` to copy and `VV` to paste within a 450 ms double-tap window.

Copying resources from one BOQ item to destination BOQ items replaces destination resources according to existing behavior. Keep this operation undoable as one mutation. Clear transient resource clipboard state when changing projects.

Use these exact clone rules:

- Copy source rows in their physical source order.
- For each destination BOQ code, remove its existing rows and insert replacement rows at the position of its first former row. If no destination row position exists, append replacements.
- Clone `resource`, `cqbi`, `cr`, `rate`, `override`, `boqQty`, and `remark` from each source row.
- Set `boqCode` to the destination code.
- Generate a new row ID for every cloned row.

## 20. Find And Replace

Preserve:

- Ctrl+F opens Find.
- Ctrl+H opens Find and Replace.
- Next and previous match navigation.
- Search within the active sheet only.
- Search scope can be all currently visible cells or the current selection. If there is no multi-cell selection, disable the current-selection scope.
- Provide `Match case` and `Match entire cell` options; both are off by default.
- Replace current.
- Replace all editable matches.
- Match highlighting only for mounted virtual rows.

Find may match editable or derived visible cells. Retain the exact total match count but store at most 500 navigable display records. Replacement skips derived columns and never modifies them. Filtered-out rows are outside the visible search scope.

### 20.1 Required keyboard shortcut matrix

Implement all shortcuts below on the Cost Load page. Grid shortcuts must not hijack keystrokes while a normal text input, select, dialog field, or active cell editor is handling text, except for the editor-specific keys listed here.

| Shortcut | Required action |
|---|---|
| Arrow keys | Move the active grid cell |
| Shift+Arrow | Extend selection |
| Enter | Move down, or commit editor and move down |
| Shift+Enter | Move up, or commit editor and move up |
| Tab | Move to next editable cell, or commit editor and move there |
| Shift+Tab | Move to previous editable cell, or commit editor and move there |
| Home | Move to column A of the active visible row |
| Ctrl+Home | Move to the first visible cell |
| Ctrl+End | Move to the final visible row and final visible column |
| Ctrl+Up / Ctrl+Down | Move to the edge of the current continuous data range |
| Ctrl+Shift+Up / Ctrl+Shift+Down | Extend selection to the edge of the current continuous data range |
| F2 | Edit the active editable cell with its current text selected |
| Printable character | Replace-edit the active editable cell beginning with that character |
| Escape while editing | Cancel edit |
| Delete / Backspace | Clear editable cells in the selection |
| Ctrl+C | Copy the current selection as tab-separated values |
| Ctrl+X | Cut editable cells in the current selection |
| Ctrl+V | Paste from the system clipboard or internal fallback |
| Ctrl+Shift+R | Toggle Remark column visibility |
| Ctrl+Shift+D | Toggle the current project's dark mode |
| Ctrl+Alt+C | Open Copy Resources dialog |
| Ctrl++ | Insert a row before the active row |
| Ctrl+- | Delete selected rows |
| Ctrl+Z | Undo active-sheet mutation |
| Ctrl+Shift+Z / Ctrl+Y | Redo active-sheet mutation |
| Ctrl+S | Immediately request an IndexedDB save and prevent browser Save Page |
| Ctrl+F | Open Find and prevent browser Find |
| Ctrl+H | Open Find and Replace |
| Ctrl+A | Select all visible grid cells |
| Shift+Space | Select the entire active visible row |
| Ctrl+Space | Select the entire active visible column |
| C twice within 450 ms while gutter-hovering | Copy hovered BOQ resources |
| V twice within 450 ms while gutter-hovering | Replace hovered BOQ resources from resource clipboard |

## 21. Excel, CSV, And Formula Safety

### 21.1 Excel export

- Export the active sheet only, including a header-only template for an empty worksheet.
- Include editable Cost Load values and one BOQ Qty value per resource row.
- Include derived formulas and cached values for Cost, Used Cost, resolved BOQ Qty, and Total Cost.
- Include worksheet column widths.
- Include freeze panes and AutoFilter when supported by SheetJS Community Edition.
- Name the data worksheet `BOQ Template` and include concise instructions in a second worksheet.
- Include project and active-sheet names in the filename.
- Bundle SheetJS locally in the single HTML.

### 21.2 Excel import

- Reject files over 25 MB.
- Prefer a sheet named `BOQ Template`; otherwise use the first worksheet.
- Map supported editable columns by header name, including per-row BOQ Qty.
- Ignore derived values and formulas; recalculate them in the application.
- Ignore completely empty rows.
- If no data rows remain, leave the active worksheet empty.
- BOQ Qty is optional on each row and is imported independently, even when rows share a BOQ code.
- Validate the entire import before replacing the active sheet.
- Apply a successful import through one undoable mutation.

### 21.3 CSV export

- Export currently visible active-sheet rows in visible sorted order.
- Include headers.
- Include derived values.
- Escape quotes, commas, and line breaks correctly.
- Prevent spreadsheet formula injection for user-entered text beginning with `=`, `+`, `-`, or `@` by exporting it as text rather than executable CSV formula content.

## 22. Styling And Responsive Design

Use Tailwind CSS while preserving the visual semantics documented in this plan and `PAGE-DESCRIPTION.md`.

Requirements:

- Define theme values as CSS custom properties and reference them through Tailwind utilities or component CSS.
- Preserve light and dark themes.
- Preserve deterministic BOQ group colors with adequate text contrast.
- Preserve active, selected, derived, overridden, filter, and find-result visual states.
- Keep the primary grid optimized for desktop use.
- At widths below 900 px, move lower-priority toolbar actions into an overflow menu.
- The grid may scroll horizontally on narrow screens.
- Respect `prefers-reduced-motion`.
- Use Lucide icons with visible text or accessible names.
- Use system fonts. Do not fetch web fonts.

Do not rewrite every interaction as generic cards. The Cost Load page must retain a dense professional spreadsheet/workbook character.

## 23. Accessibility Requirements

- All buttons have accessible names.
- Icon-only buttons use `aria-label` and tooltips where helpful.
- Menus and dialogs support keyboard use and Escape dismissal.
- Modal dialogs trap focus and restore focus when closed.
- Sheet tabs use `role="tablist"`, tab roles, and roving `tabIndex`.
- ArrowLeft, ArrowRight, Home, End, Enter, Space, Shift+F10, and ContextMenu work on sheet tabs as documented.
- Inputs have labels and validation messages.
- Toasts use a suitable live region without repeatedly interrupting editing.
- Focus indicators remain visible in light and dark modes.
- Color is not the only indication of overrides, errors, selection, or status.
- Printing excludes interactive controls.

## 24. Error Handling

Create a top-level React error boundary for unexpected rendering errors. It must offer a safe route back to Projects and must not delete local data.

Handle these errors explicitly:

- IndexedDB unavailable or blocked.
- Database read/write failure.
- Storage quota exceeded.
- Invalid project route.
- Invalid backup structure.
- Oversized backup or Excel file.
- Invalid or conflicting Excel rows.
- Clipboard permission failure.
- File download creation failure.
- Sheet or row limits reached.

Never catch an error and silently continue as if the operation succeeded.

## 25. Required Source Structure

Use this structure unless a minor addition is necessary. Do not collapse the application into one component.

```text
src/
|-- app/
|   |-- App.jsx
|   |-- AppLayout.jsx
|   |-- ErrorBoundary.jsx
|   |-- router.jsx
|   `-- version.js
|-- components/
|   |-- ConfirmDialog.jsx
|   |-- EmptyState.jsx
|   |-- Modal.jsx
|   |-- ToastRegion.jsx
|   `-- Toolbar.jsx
|-- database/
|   |-- database.js
|   |-- migrations.js
|   `-- repositories.js
|-- domain/
|   |-- calculations.js
|   |-- columns.js
|   |-- constants.js
|   |-- normalization.js
|   |-- projection.js
|   |-- types.js
|   `-- validation.js
|-- features/
|   |-- cost-grid/
|   |-- filtering/
|   |-- find-replace/
|   |-- history/
|   |-- import-export/
|   |-- projects/
|   |-- reports/
|   |-- resources/
|   `-- workbook/
|-- pages/
|   |-- CostLoadPage.jsx
|   |-- ImportExportPage.jsx
|   |-- NewProjectPage.jsx
|   |-- ProjectsPage.jsx
|   |-- ReportsPage.jsx
|   |-- SettingsPage.jsx
|   `-- SummaryPage.jsx
|-- stores/
|   |-- uiStore.js
|   `-- workspaceStore.js
|-- styles/
|   |-- index.css
|   `-- print.css
`-- main.jsx
```

Keep feature-specific components and hooks inside their feature directories. Do not add test files, test configuration, or test scripts.

## 26. Vite And Single-File Build Configuration

Configure Vite so the production build is compatible with local files:

- Set `base` to `./`.
- Add React plugin.
- Add `vite-plugin-singlefile`.
- Disable CSS code splitting.
- Inline all asset types by setting a sufficiently high or unlimited inline threshold.
- Disable production source maps for the distributable build unless they can remain inside the HTML without creating another file.
- Set the output HTML filename to `BOQ-Cost-Load.html`.
- Avoid dynamic imports and separate workers.
- Ensure Tailwind output is included in the inlined stylesheet.
- Ensure Lucide icons compile into the JavaScript bundle.
- Ensure SheetJS compiles into the JavaScript bundle.

After the single final production build, inspect `dist` and fail verification if any file other than `BOQ-Cost-Load.html` exists.

## 27. Development Review Process

Do not create or run automated tests at any point in this implementation.

Use `npm run dev` to keep the Vite localhost development server running throughout all implementation phases. Review each completed change in the running application before moving to the next phase. Continue development and review on localhost until the entire functional scope is complete.

Do not run `npm run build`, open the distributable through `file://`, or verify the final `dist` contents during intermediate phases. Only after all phases are complete may the final production build and final distribution checks be run.

## 28. Implementation Phases

Complete phases in order. Do not start a later phase while the current phase's gate is failing.

### Phase 0: Baseline and requirements

Tasks:

- Read this plan completely.
- Read `PAGE-DESCRIPTION.md` completely.
- Record any contradiction before coding.
- Confirm Node and npm versions support Vite 8.

Gate:

- No unresolved requirement contradiction remains.

### Phase 1: Project foundation

Tasks:

- Create the React 19.3, JavaScript, and Vite 8 project.
- Configure JSDoc typedefs for domain and other complex data structures.
- Install only the approved runtime dependencies.
- Configure Tailwind.
- Add formatting and lint scripts using the project's selected standard tooling.
- Add the required source directory structure.
- Start the Vite localhost development server and keep it available for real-time review throughout implementation.

Gate:

- The development app renders on the Vite localhost server.

### Phase 2: Single-file configuration

Tasks:

- Configure Vite base path and `vite-plugin-singlefile` immediately, not at the end.
- Add HashRouter with placeholder routes.
- Verify route navigation and refresh behavior on Vite localhost.
- Review the placeholder routes on Vite localhost with browser network activity visible.

Gate:

- All placeholder routes work on the Vite localhost server.
- No production build has been run.

### Phase 3: Domain layer

Tasks:

- Implement constants, column definitions, domain types, normalization, calculations, and validation.
- Implement pure filter/sort projection and filter-aware insertion-value helpers.
- Implement ID generation using `crypto.randomUUID()` with a safe fallback.
- Implement blank row, worksheet, sheet, and project factories.
- Implement backup types and migration functions.

Gate:

- Domain modules have no React or Dexie imports.

### Phase 4: Database and repositories

Tasks:

- Implement Dexie database and indexes.
- Implement JSDoc-documented repositories and transactions.
- Implement settings initialization.
- Implement project and sheet lifecycle persistence.
- Implement autosave coordinator.
- Implement legacy-data discovery without automatic deletion.

Gate:

- Repository flows are reviewed manually through the Vite localhost application.

### Phase 5: Application shell and routing

Tasks:

- Implement App, ErrorBoundary, AppLayout, navigation, and toast region.
- Implement route validation and redirects.
- Implement first-run storage notice.
- Implement light and dark theme tokens.
- Implement responsive navigation.

Gate:

- Every route renders on Vite localhost.
- Missing routes and project IDs recover correctly.
- Keyboard focus is visible.

### Phase 6: Project management

Tasks:

- Implement Projects and New Project pages.
- Implement create, open, rename, duplicate, export, and delete.
- Add confirmations and validation.
- Add empty state.

Gate:

- Multiple projects persist independently when reviewed on Vite localhost.
- Duplicated projects share no project, sheet, or row IDs.

### Phase 7: Workbook and mutation foundation

Tasks:

- Implement workspace Zustand store and selectors.
- Load project sheets in position order.
- Implement the central mutation gateway.
- Implement per-sheet undo/redo limits.
- Implement sheet add, rename, duplicate, activate, and delete.
- Implement sheet tabs and keyboard behavior.
- Implement autosave status.

Gate:

- Sheet lifecycle and history behavior work when reviewed on Vite localhost.
- Switching sheets never leaks undo history.

### Phase 8: Read-only virtual grid

Tasks:

- Define TanStack Table columns.
- Implement TanStack Virtual row rendering with twelve-row overscan.
- Implement row-number gutter, headers, formula bar, and status bar.
- Display derived values using domain functions.
- Implement group coloring, hidden Remark column, and fixed row height.
- Review 10,000-row scrolling on Vite localhost before adding editing complexity.

Gate:

- Only the virtual window and overscan are mounted.
- A 10,000-row sheet scrolls without obvious blocking.

### Phase 9: Selection and editing

Tasks:

- Implement active cell and rectangular selection.
- Implement pointer selection and keyboard navigation.
- Implement inline editor and formula bar editing.
- Implement numeric validation and all movement rules.
- Implement derived-column protection.
- Implement automatic scrolling to the active cell.

Gate:

- Editing and keyboard behavior work when reviewed on Vite localhost.
- Invalid edits cannot corrupt state.

### Phase 10: Clipboard, rows, and quantities

Tasks:

- Implement copy, cut, paste, and clear.
- [x] Implement drag-only fill handle with preview, repeated range patterns, and one undoable mutation.
- Enforce operation limits.
- Implement append, insert, and delete rows.
- Treat BOQ Qty as an ordinary editable numeric row field.
- Keep BOQ Qty independent when BOQ Code changes.
- Implement filter-aware row insertion behavior.

Gate:

- All operations are undoable and validated.
- Derived columns cannot be overwritten by paste.

### Phase 11: Filters, sorting, columns, and find

Tasks:

- Implement filter popup and all documented filter conditions.
- Implement value search and 200-value rendering cap.
- Implement sorting and restore-original-order.
- Implement column resizing and visibility.
- Implement Find and Replace with 500 retained display records.
- Confirm virtualized highlights only affect mounted rows.

Gate:

- Filter, sort, column, and find behavior works when reviewed on Vite localhost.
- Source row order remains unchanged by sorting.

### Phase 12: Resource copy and interaction parity

Tasks:

- Implement Copy Resources dialog.
- Implement Ctrl+Alt+C.
- Implement gutter hover and `CC`/`VV` detection.
- Implement every shortcut listed in section 20.1.
- Resolve shortcut conflicts explicitly and review them on Vite localhost.
- Complete context menus and toolbar overflow behavior.

Gate:

- A manual checklist confirms every documented shortcut.

### Phase 13: Summary and reports

Tasks:

- Implement shared aggregation functions.
- Implement Summary page.
- Implement both report types and sheet scope selector.
- Add print styles and Print action.
- Review totals against domain calculations on Vite localhost.

Gate:

- Summary, report, and grid totals agree for the same fixture.

### Phase 14: Import and export

Tasks:

- Implement project and all-project JSON backup workflows.
- Implement legacy backup imports.
- Implement Excel export and validated import.
- Implement visible-row CSV export with injection protection.
- Implement file-size limits and transactional replacement.
- Add clear success and error feedback.

Gate:

- Round-trip workflows work when reviewed on Vite localhost.
- Invalid imports cause zero persisted changes.
- Summary, report, grid, CSV, and Excel totals agree for the same fixture.

### Phase 15: Settings, accessibility, and responsive polish

Tasks:

- Implement the exact Settings page scope.
- Complete dialogs, focus management, ARIA, reduced motion, and contrast checks.
- Complete dark-mode styling.
- Complete responsive toolbar and overflow menu.
- Verify print output.

Gate:

- Keyboard-only walkthrough succeeds.
- Manual accessibility review finds no serious known violations.

### Phase 16: Final hardening

Tasks:

- Confirm all prior phases are complete through Vite localhost review before building.
- Run the final production build once.
- Open the final output using `file://` and complete the final manual verification.
- Inspect the final HTML for external URLs.
- Inspect Network while offline.
- Verify IndexedDB persistence after browser restart.
- Verify storage quota and write-failure messaging where practical.
- Compare every feature against this plan.
- Record any intentional deviation and obtain approval.

Gate:

- Every item in the Definition of Done is satisfied.

## 29. Commands And Scripts To Provide

The completed project must expose equivalent npm scripts:

```text
npm run dev
npm run build
npm run lint
```

Do not provide test or test-runner scripts. Run `npm run build` exactly once, only after the project is fully complete; then manually inspect the resulting distribution.

On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd` rather than changing the machine execution policy.

## 30. Definition Of Done

The implementation is complete only when all statements below are true:

- React 19.3, Vite 8, and JavaScript are used.
- Vite 8 creates the production build.
- The final distribution contains exactly one HTML file.
- Double-clicking the file starts the application in Edge and Chrome.
- The application works with all network access disabled.
- No runtime asset is fetched externally.
- Hash routing works, including Back and Forward.
- Users can create, rename, duplicate, delete, export, import, and open multiple projects.
- Every project can contain up to 100 sheets.
- Every sheet supports up to 10,000 rows.
- All formulas and BOQ quantity rules match this plan.
- All documented grid editing, selection, filtering, sorting, clipboard, history, find, column, resource-copy, and shortcut behavior works.
- IndexedDB persistence survives closing and reopening the application in the same browser and file context.
- Save failures are visible and do not pretend to succeed.
- JSON backups are portable to another computer.
- Legacy backup schemas v1-v4 can be imported.
- Excel and CSV operations follow the specified validation and safety rules.
- Summary and report totals match grid calculations.
- Dark mode, responsive behavior, reduced motion, keyboard access, and printing work.
- The Vite localhost application has been reviewed throughout implementation.
- No automated tests were created or run. Manual review was used throughout.
- One final production build was run only after the entire project was completed.
- The functional scope in this plan has been checked item by item.

## 31. Instructions To The Implementing Model

Follow these instructions throughout execution:

1. Work on one implementation phase at a time.
2. Before each phase, read that phase and the related sections of this plan again.
3. Inspect existing files before editing them.
4. Make the smallest correct change that completes the current phase.
5. Do not rename domain fields or alter formulas for convenience.
6. Do not add backward-compatibility behavior except the migrations explicitly required here.
7. Use the Vite localhost development server for all development and real-time review; do not run a production build or `file://` verification until the entire project is complete.
8. Do not assume a library supplies behavior without verifying it. TanStack Table is headless.
9. Do not create or run automated tests. Review all behavior manually.
10. Run the current phase gate before moving forward.
11. If a requirement is technically impossible or contradictory, stop and report the exact conflict instead of silently changing scope.
12. Never delete or rewrite user data as an error-recovery strategy.
13. Never weaken validation to make an import pass.
14. Never add a network dependency.
