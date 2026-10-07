# Codebase Cleanup Plan — structural refactor only

## 1. Executive Summary

The application is a local-first React cost-estimating workbook. Its underlying domain modules are already reasonably separated; the highest-value cleanup is at the boundaries: a 1,960-line interactive grid, a 404-line multipurpose Dexie repository, a 207-line workspace store, a 219-line resources page, and a single 836-line cascading stylesheet. Preserve the current product byte-for-byte where externally observable: routes, visual output, keyboard/mouse interactions, calculation results, saves, imports, exports, and old data. Favor a few cohesive extractions rather than a new architecture. **No schema migration or dependency change is required.**

Audit scope: all application source under `src/`, entry/build/lint/package configuration, the legacy fixture, and the existing test inventory; `node_modules/` and generated `dist/` are third-party/build output, not application implementation. Baseline: `node --test "src/domain/*.test.js" "src/features/cost-grid/*.test.js" "src/features/import-export/*.test.js"` passed **72/72**; `npm.cmd run lint` returned **0 errors, 8 warnings**, all in `CostGrid.jsx` (one TanStack Virtual incompatible-library warning and seven hook dependency warnings). Do not treat eliminating warnings as permission to change effect timing. No browser regression baseline, IndexedDB fixture comparison, or build was performed in this planning-only session; a build would write `dist/`.

## 2. Current Architecture Overview

`index.html` mounts `src/main.jsx` (React StrictMode); `src/app/App.jsx` provides an error boundary, hash routes, `AppLayout`, and toasts. Project routes resolve slugs/aliases/old IDs, canonicalize paths, and load the workspace. Pages are Projects, New Project, Cost Load, Resources, Summary, Reports, and Settings. Cost Load composes sheet tabs, Excel controls, assembly dialog, and virtualized TanStack grid. Zustand `workspaceStore` owns the loaded project, sheets, assemblies, active sheet, undo/redo, dirty/failed status and navigation guard; `uiStore` owns preferences and toasts. `domain/` holds validation, shapes/default constructors, arithmetic, projections, summaries, attachment transitions, assembly operations and backup helpers. `database/database.js` declares Dexie versions; `database/migrations.js` handles old stored/backup formats; `database/repositories.js` performs transactions, attachment management, queued saves, import/export snapshots and legacy discovery. Persistence is browser-local; no server application code was found.

Flow: UI event → grid/page handler → workspace mutation (clone, validate, history) or repository operation → save coordinator/transaction → IndexedDB; reads flow from repository → workspace → domain projections → pages. Image metadata/blobs flow separately through repository events; Settings preferences flow through a serialized write queue and `boq-settings-updated` event. Reports and Excel export are views of the stored row inputs plus derived calculations.

## 3. Current Folder Structure

```text
index.html; package.json; package-lock.json; vite.config.js; eslint.config.js
legacy-v4-dummy.json; project/phase/performance Markdown notes
src/
  main.jsx
  app/                 App.jsx, AppLayout.jsx, version.js
  pages/               CostLoadPage, ProjectsPage, NewProjectPage, ResourcesPage,
                       SummaryPage, ReportsPage, SettingsPage
  components/          Modal, ToastRegion, ErrorBoundary
  features/            cost-grid/{CostGrid,useGridInteraction,clipboard,BoqImageGallery},
                       import-export/{ExcelExchangeControls,excelExchange},
                       workbook/SheetTabs, assemblies/AssemblyDialog;
                       empty placeholder folders: filtering, find-replace, history,
                       projects, resources, reports
  stores/              workspaceStore, uiStore
  database/            database, migrations, repositories
  domain/              calculations, columns, constants, normalization, validation,
                       types, projection, summaries, assemblies, resourceCopy,
                       numericExpressions, arithmetic, images, backups, routes,
                       history, queues, demoData and colocated tests
  styles/              index.css
dist/                  generated build
node_modules/          installed dependencies
```

The feature folders for filtering/find-replace/history/projects/resources/reports contain only `.gitkeep`; they are not evidence of missing runtime functionality. Existing Markdown files and `legacy-v4-dummy.json` are historical material/fixture, not unused runtime code by implication.

## 4. Current Data Architecture

| Entity | Authoritative shape / ownership | Relationships and derived data |
| --- | --- | --- |
| Project | `id`, `name`, `activeSheetId`, `darkMode`, `createdAt`, `updatedAt`; optional `routeSlug`, `routeAliases` | `activeSheetId` points to its sheet; route slug/aliases are persisted URL identities, including compatibility with old ID URLs. Project list adds transient `sheetCount`. |
| Sheet | `id`, `projectId`, `name`, zero-based `position`, `data`, timestamps | Each project has 1–100 sheets. `data` is a worksheet object, not another Dexie store. |
| Worksheet | `schemaVersion: 4`, `rows`, positional `columnWidths` (12 entries), `filters` keyed by column, `sort` (`col` index/`direction`) or null, `hiddenColumnKeys` | Widths, filters, sort and visibility are persisted user choices. Defaults are built by `createBlankWorksheet`; column order lives in `columns.js`. |
| Row | `id`, `boqCode`, `resource`, `cqbi`, `unit`, `cr`, `rate`, `override`, `boqQty`, `remark`; optional `expressions` map | `boqQty` is **per resource row**. `expressions` stores source text for numeric cells while numeric values store evaluated results; both are meaningful persisted fields. `cost = cqbi × cr × rate`, `usedCost = override !== null ? override : cost`, `totalCost = usedCost × boqQty` are calculated, not stored. `0` is a valid input. |
| Assembly | `id`, `projectId`, `name`, `sourceSheetName`, `sourceBoqCode`, resource-field-only `rows`, timestamps | Saved snapshot of resource values; no row IDs or BOQ codes in assembly lines. Applying creates new row IDs and can inherit destination quantity/CQBI or use current project rates. |
| Image | `attachments` metadata: `id`, `projectId`, `sheetId`, normalized `boqCode`, `position`, `mimeType`, dimensions, timestamp, optionally `originCode`/`itemRowIds`; `attachmentBlobs` contains matching `id`, ownership, `blob` | Images are grouped by sheet/item code; `originCode`/`itemRowIds` retain undo/redo ownership after BOQ code transitions. JSON backups substitute base64 `data` for `blob`. |
| App settings | singleton `id: 'app'`, `schemaVersion: 3`, theme, font, density, decimals, grouping, currency label, project defaults, reminder dismissal | Preferences are both persisted and held in `uiStore`; page-local optimistic state is serialized through an async queue. |
| Backups | project/all-project JSON `backupType`, `schemaVersion: 1`, `exportedAt`, records, optional assemblies/attachments; all-project includes settings | Legacy worksheet/workbook imports are transformed at the boundary. Excel is a separate 12-column interchange contract; derived columns and formula results are exported but ignored on import. |

IDs are generated via `createId`; sheet `position` orders tabs. BOQ code identifies a group **within a sheet**, not a global item ID; repeated noncontiguous code runs still share an item-level summary. `projectResources` groups by case-insensitive normalized `(resource, unit)`, independent of BOQ code. Summary/report/filter row objects are ephemeral projections, not alternate persistent models.

## 5. Key Structural Problems

1. `CostGrid.jsx` owns too many independent lifecycles: session position, selection, virtual row measurement, fill dragging, editing, keyboard routing, row operations, find/replace, filter UI, clipboard, assemblies shortcuts, and attachments. Splitting must keep event ordering and ref lifetimes intact.
2. `repositories.js` combines project/sheet CRUD, attachments, settings, background save coordination, backups, and legacy discovery; callers import a broad hub. A narrow extraction of save coordination is safer than changing transaction APIs wholesale.
3. `ResourcesPage.jsx` imports `FilterMenu` from the entire `CostGrid.jsx` module (also `ReportsPage.jsx`), producing a misleading UI dependency and potentially loading grid-only code on read-only pages.
4. `index.css` contains overlapping earlier/later `.grid-shell`, `.cost-workspace`, `.app-shell`, `.grid-header`, and responsive overrides; naive splitting/reordering would change the final cascade.
5. Several page-level backup/clipboard/format handlers are long and compressed; responsibilities can be grouped without changing rendering. `SettingsPage` also owns asynchronous preference write ordering.
6. Validation, legacy migration, column metadata and derived projections are tightly connected by persisted names/positions; “normalization” must not rewrite stored records opportunistically.

## 6. Code Quality Findings

The dominant readability issue is dense multi-statement lines, particularly `repositories.js`, `migrations.js`, `workspaceStore.js`, `SettingsPage.jsx` and large JSX render expressions. Prefer local formatting/early-return extraction one function at a time, with unchanged expression evaluation order. `listProjectsWithSheetCounts` is a **read that can write** route identities; this side effect must remain. `saveCoordinator` is module-global and installs a `pagehide` listener; grouping/flush semantics are not interchangeable with a simple debounce. `CostGrid` registers capture-phase `window` keyboard listeners and a workspace navigation guard; modal/focus exclusion is important. `AppLayout` installs capture-phase link/popstate/hashchange guards. Images use `boq-attachments-updated`, settings use `boq-settings-updated`, and preferences use local/session storage; all are hidden cross-module contracts. There is no demonstrated runtime circular import among source modules, but a proposed grid/filter split should eliminate the page → grid-module dependency without introducing domain → UI imports. No broad prop-drilling rewrite is justified: `CostLoadPage`'s grid action ref and assembly callbacks are narrow intentional interfaces.

## 7. Large File / Component Findings

| File | Approx. lines | Current responsibilities; recommended action | Risk |
| --- | ---: | --- | --- |
| `src/features/cost-grid/CostGrid.jsx` | 1,960 | Render virtualized grid plus all input lifecycles. Extract `FilterMenu` first, then pure edit/find helpers, then a **cohesive** find/replace hook/dialog; keep selection, keyboard routing, fill drag and virtualizer in grid until behavior-level verification exists. | HIGH |
| `src/styles/index.css` | 836 | Fonts, shell, grid, themes, reports, dialogs, images, assemblies, print and responsive cascade. Keep one file initially; index sections/comments only after capturing computed styles. Do not split based on selector names alone. | HIGH if reordered |
| `src/database/repositories.js` | 404 | Transactions plus save scheduler/queues, backup and attachments. Extract save coordinator into one database-adjacent module, with explicit injected save functions if needed to avoid cycles; retain public API facade temporarily. | HIGH |
| `src/features/import-export/excelExchange.js` | 274 | ExcelJS export styling/images/formulas and XLSX parser. Two coherent halves already; keep together until a demonstrated edit need. | HIGH |
| `src/pages/ResourcesPage.jsx` | 219 | Aggregation projection, filters, widths persisted in localStorage, cross-sheet rate editing, table. Isolate only resource filter-row adapter/width helpers if useful; preserve page-local UI state. | HIGH |
| `src/stores/workspaceStore.js` | 207 | Project lifecycle, history, grouped rate edits, save status/guards. Organize named private helpers; avoid wholesale state rewrite. | HIGH |
| `src/database/migrations.js` | 184 | Stored worksheet/settings and JSON legacy conversion. Leave format handling together, document version boundaries. | HIGH |
| `src/features/assemblies/AssemblyDialog.jsx` | 167 | Save/manage/library/apply views and preview. Existing domain actions are separated; optional view-only decomposition after other work, no new global state. | MEDIUM |
| `src/domain/validation.js` | 154 | Validation of rows, worksheets, projects, assemblies, attachments, backups. Large because of real format boundaries; keep together unless a future change demonstrates benefit. | HIGH |

### Important-file review (dependencies and decisions)

In this table “preserve” identifies what could accidentally change; **Keep** means no code edit is justified by size alone. Files not individually listed are addressed by their owning module group below or remain as-is.

| Current file(s) | Responsibility and evidence-based problem | Recommended action; dependencies | Preserve; risk |
| --- | --- | --- | --- |
| `src/main.jsx`, `src/app/App.jsx` | Bootstrap/routes; project route effect reads repositories and workspace, canonicalizes aliases. | Keep; `App` depends on pages, repository, route domain and workspace. | Route readiness, redirects and StrictMode behavior; MEDIUM if touched. |
| `src/app/AppLayout.jsx` | Navigation capture/guards, theme/font, settings notice; mixes shell JSX and browser side effects. | Keep pending guard-level baseline; depends on settings repository, workspace/UI stores and router. | Hash/back/forward, capture ordering, appearance; HIGH. |
| `src/pages/ProjectsPage.jsx` | Project CRUD, legacy JSON import and project backup download in one page. | Clean handlers internally only if needed; depends on repositories/migrations/backup serialization. | ID remap, routes, download/legacy acceptance; HIGH. |
| `src/pages/NewProjectPage.jsx` | Small creation form with settings defaults. | Keep; depends on repository, workspace guard and routes. | New-project defaults/navigation; LOW if untouched. |
| `src/pages/CostLoadPage.jsx` | Grid toolbar, visible-row status totals, dialog orchestration, image-display preference. | Keep orchestration together; depends on grid, tabs, assemblies, Excel controls, projections. | Visible-only totals, action ref and localStorage preference; MEDIUM. |
| `src/pages/ResourcesPage.jsx` | Resource adapter/table, filters, localStorage widths and rate edits. | Clarify adapter and retain rate/resize state; depends on `projectResources`, `projection`, workspace, shared `FilterMenu`. | Rate propagation, old width-array handling, sort; HIGH. |
| `src/pages/SummaryPage.jsx` | Project and sheet metrics, navigation to sheet. | Keep; depends on project summary, workspace/router. | All-rows totals and navigation; LOW if untouched. |
| `src/pages/ReportsPage.jsx` | Read-only reports, filter adapter, TSV copy/print. | Reuse only TSV serialization; depends on report rows, projections, calculations and shared filter UI. | Headers/order, percentages, clipboard fallback/print; MEDIUM/HIGH. |
| `src/pages/SettingsPage.jsx` | Preference write queue, backup/restore/delete and settings controls. | Clean internally after persistence baseline; depends on repositories, migrations, queue and stores. | Write order/rollback, destructive restore, visual options; HIGH. |
| `src/features/cost-grid/CostGrid.jsx`, `useGridInteraction.js`, `clipboard.js`, `BoqImageGallery.jsx` | Grid editing/virtualization, selection hook, TSV logic, blob URL lifecycle. | Split filter/pure helpers only; selection/clipboard/gallery keep their current owners; depend on domain, repositories and stores. | Key/mouse/focus/scroll, clipboard bytes and URL revocation; HIGH. |
| `src/features/import-export/ExcelExchangeControls.jsx`, `excelExchange.js` | Excel preview/commit and separate read/write libraries. | Keep together; depend on worksheet validator, repository attachments, ExcelJS/XLSX. | Import replacement and exported workbook format; HIGH. |
| `src/features/workbook/SheetTabs.jsx`, `src/features/assemblies/AssemblyDialog.jsx` | Tab/menu lifecycle and assembly save/manage/apply views. | Keep; assembly planning already in domain; depend on workspace, dialogs and assembly domain. | Focus/keyboard tab order, assembly options and grouped writes; MEDIUM/HIGH. |
| `src/components/{Modal,ErrorBoundary,ToastRegion}.jsx`, `src/stores/uiStore.js` | Shared dialogs/errors/toasts and UI preferences. | Keep; consumers across pages/grid, no duplicate implementation identified. | Modal focus trap/restore, toast timing, preference updates; MEDIUM if touched. |
| `src/stores/workspaceStore.js` | Project state, history, save status and navigation guard. | Narrow private cleanup; depends on repository coordinator, validation, rates and grouped history. | Cross-sheet undo and pending saves; HIGH. |
| `src/database/database.js`, `migrations.js`, `repositories.js` | Dexie schema, historic formats and transaction/API hub. | Keep schema/migrations; extract only coordinator; depend on domain validators/converters. | Existing database/version/backup and atomic writes; HIGH. |
| `src/domain/{normalization,types,columns,constants,validation}.js` | Record defaults/shape, ordered columns, limits and data validation. | Document types; otherwise keep, with default-filter factoring only after parity proof. | Keys/positions/versions and accepted inputs; HIGH. |
| `src/domain/{calculations,arithmetic,numericExpressions,worksheetRates,projection}.js` | Authoritative cost formulas, expression edits, rate updates and filters. | Keep separate; no formula/filter consolidation recommended. | Null/zero, evaluation/formatting, sort stability; HIGH. |
| `src/domain/{projectSummary,projectResources,boqItemCostSummary,reportRows,resourceCopy,assemblies}.js` | Distinct aggregates, item copy and assembly planning. | Keep distinct; optional private inherited-value helper only. | Grouping/quantities/percentages and insertion order; HIGH. |
| `src/domain/{imageAttachments,imageAttachmentTransitions,attachmentBackup,backupSerialization}.js` | Image preprocessing/ownership and JSON serialization. | Keep; investigate unused-looking export before any removal; repository/validation depend on these. | Image bytes, position, undo, size limits; HIGH. |
| `src/domain/{projectRoutes,asyncWriteQueue,groupedHistory,theme,demoData}.js`, `src/app/version.js` | Route compatibility, queue primitive, grouped history pruning, theme, sample data/version. | Keep and retain colocated tests; callers in stores/pages/repository. | Slugs, write sequencing, sample outputs, theme; MEDIUM/HIGH by caller. |
| `src/styles/index.css` | One ordered cascade covering all screens/print. | Keep and annotate, not move/split; depends on JSX class names and Tailwind/font imports. | Pixel-level styling/responsive/print; HIGH. |

## 8. Duplication Findings

| Locations | Similarity / equivalence | Recommendation and risk |
| --- | --- | --- |
| `CostGrid.jsx` `serializeClipboardMatrix` consumer and `ReportsPage.jsx` `copyTable` quoting | The TSV quoting expression and CRLF joining are equivalent for values, **but** reports add headers, choose summary/detail schemas and use Clipboard API fallback; grid handles browser copy events. Share only the pure matrix serializer from `clipboard.js` after output parity checks; keep transports distinct. MEDIUM. |
| `ResourcesPage.jsx` `updateRate`/`clearRate` | Same success cleanup/count/notify shape, different empty-input validation and target rate (`parsed.value` vs `null`). A small local `applyRateChange(resource, value, verb)` is viable only after retaining message/error specifics. MEDIUM. |
| `workspaceStore.js` `commitSheetGroup`, `mutateSheet`, `applyHistory` | Repeated clone/validate/history/dirty/save bookkeeping, but grouped history uses synchronous grouped writes and special undo boundaries. Factor only small private history/status helpers; **do not unify mutation pipelines**. HIGH. |
| `repositories.js` duplicate/import project/sheet attachment remapping | Row/attachment IDs and ownership remapping recur, but sheet/project duplication, import-as-new and replace-all have distinct timestamp/transaction/route rules. Share a verified pure map helper only if full snapshot equivalence is demonstrated. HIGH. |
| `normalization.js` default filter keys vs `columns.js` and `migrations.js` legacy keys | Current default key list corresponds to `COLUMN_KEYS`; legacy insertion must keep its original field ordering/version semantics. Centralize only default worksheet filter creation, not legacy migration behavior. MEDIUM/HIGH. |
| `CostLoadPage.jsx` totals, `projectSummary.js`, `reportRows.js`, `projectResources.js` | All use calculated rows, **not equivalent**: visible vs all rows, populated-row policy, sheet-specific BOQ groups, resource/unit aggregate, and largest item quantity differ. Keep separate. HIGH. |
| `resourceCopy.js` inherited CQBI vs inherited BOQ quantity | Same frequency/tie-break algorithm, different fields; optional private parameterized helper inside same file, with zero/null/tie cases retained. MEDIUM. |
| `ProjectsPage.jsx` and `SettingsPage.jsx` JSON backup download/import | Share low-level serialization already in `backupSerialization.js`; project import-as-new and workspace destructive restore are intentionally different. Do not merge workflows. HIGH. |

## 9. Data Structure Findings

`types.js` documents core persisted types but misses the optional row `expressions` field and both image records/backup `data`, and its backup typedefs omit optional attachments. Correct documentation without changing records. A BOQ “item” is an implicit normalized code group; report summary selects `maxBoqQty`, while copying chooses **most frequent non-null quantity** with first-seen tie-break, and calculations use each row's quantity. These are not duplicate authoritative fields. `filters` and `sort.col` refer to column keys/positions respectively; a column reorder would invalidate persisted widths/sort and Excel mapping. `ReportsPage` maps sheet/total/percent values into existing column keys (`resource`, `override`, `cr`) solely to reuse filtering; `ResourcesPage` similarly maps derived summary fields into temporary rows. Document adapters at the boundary; do not persist them or rename real row keys. `ProjectRecord.routeSlug` and aliases are optional for old data and may be materialized on listing; not redundant. Optional `originCode`/`itemRowIds` retain image ownership through undo. Derived `sheetCount`, summary totals, resource status, `cost`, `usedCost`, and `totalCost` are not persisted. Numeric `expressions` *are* persisted alongside results by design; removing them loses formula-bar/edit behavior.

## 10. IndexedDB / Persistence Findings

Dexie database name `boq-cost-load-react`, version **6**; stores/indexes: `projects: id, updatedAt, createdAt, name`; `sheets: id, projectId, [projectId+position], updatedAt`; `settings: id`; `assemblies: id, projectId, [projectId+name]`; `attachments: id, projectId, sheetId, [sheetId+boqCode], [projectId+sheetId]`; `attachmentBlobs: id, projectId, sheetId`. Registered history: v1 core, v3 worksheet/unit conversion, v4 assemblies, v5 attachments, v6 blob extraction and attachment owner backfill. Worksheet schema version 4, settings schema version 3 and JSON backup version 1 are **different version axes**. Historic `boq-cost-load`/`appState`/`boq-cost-load:v1` probing exists in `discoverLegacyCandidate`; no current source call found, but do not remove until its compatibility purpose is investigated. Other browser keys: `boq-cost-load-show-images` (localStorage), `project-resources-columns-v1:<projectId>` (localStorage, supports old six-width arrays), `cost-grid-position-v1:<projectId>:<sheetId>` (sessionStorage on reload). Do not change keys, index declarations, transaction table sets, write ordering, 500ms schedule, attachment event timing, destructive restore atomicity, or old-format handling as part of structural work.

## 11. State Management Findings

Workspace state holds persisted records in memory plus ephemeral `histories`, `dirtySheetIds`, `failedSheetIds`, `saveStatus`, `loading`, `navigationGuard` and active sheet ID. Per-sheet undo/redo snapshots are bounded by count and serialized byte length; cross-sheet rate/assembly operations use module-closure `rateOperations` for grouped history. Save coordinator tracks pending snapshots, timers, project write queues, grouped-save status, retry and flush on navigation/export/pagehide. `loadGeneration` suppresses stale async project loads. These closures are purposeful, not unnecessary global application state. Grid selection, editor, clipboard, find, fill, image state is local; Resources/Reports filters and widths have different persistence lifetimes. UI preferences are mirrored in `uiStore`, `SettingsPage` local state/ref and Dexie to support optimistic ordered writes; collapsing them requires HIGH-risk review. Keep exact guard and flush order around route changes, project switches and Excel/JSON exports.

## 12. Import / Export Findings

Excel **export**: `exceljs` creates `BOQ Template` plus `Instructions`, fixed 12 headers/order, styles, number formats, freeze/autofilter, formula cells and embedded images after each code's last resource row. Numeric expressions may become Excel formulas. **Import**: `xlsx` selects a valid `BOQ Template` preferentially, accepts header aliases, retains Excel row numbers for errors, ignores empty rows and derived-column edits, constructs fresh row IDs, previews replacement, validates, then replaces rows and clears filters/sort in one undoable mutation; images are not imported from Excel. JSON project export/import-as-new and full workspace export/replace-all are distinct; legacy worksheet/workbook and old settings upgrades go through `migrations.js`, validation and repository ID remapping. Preserve exact headers, aliases, source-sheet choice, formulas, cached values, images, filenames, MIME types, max sizes, error text and confirmation flow. The legacy fixture is a synthetic v4 workbook input; never assume its deprecated `quantities`, `boqQtyOverride`, `unassignedQty` are current storage fields.

## 13. Naming & Consistency Findings

Use PascalCase for React components/files, `useX` camelCase for hooks, camelCase for functions/JS fields, UPPER_SNAKE_CASE for immutable constants, and existing kebab-case for feature folders/CSS classes. Keep current `boqCode`, `boqQty`, `cqbi`, `cr`, `resource`, `rate`, `override`, `remark`, Dexie store names, event names, localStorage keys, backup keys and Excel headers exactly. UI alternates “BOQ” and “BQ”; it is observable copy, so do not normalize it. `domain/normalization.js` also constructs records, `database/migrations.js` also processes backup formats, and `database/repositories.js` also schedules saves; clarify responsibility with module documentation and narrow extractions rather than changing public persisted names. Dense one-line JSX and inconsistent spacing make navigation harder; formatting must leave DOM and cascade untouched.

## 14. Dead Code Findings

**Confirmed Dead:** none established to a deletion-safe standard. **Potentially Dead — Requires Verification:** `getFilterRelevantValues` (`projection.js`), `validateExcelStagingRows` (`validation.js`), `isColumnKey`/`isEditableColumnKey`/`EDITABLE_COLUMN_KEYS` (`columns.js`), `discoverLegacyCandidate` (`repositories.js`) have no source callers in the audited tree; the last has a legacy compatibility purpose. `rekeyAttachmentRecords` is used by `imageAttachments.test.js` but no production caller was located: retain until transition/compatibility review. CSS contains early `.sidebar`, `.main-nav`, `.topbar`, `.workspace`, `.route-toast`, `.resource-warning`-style selectors with no obvious current JSX match; later selectors override some early rules. Dynamic class names, print rules, portals, old integrations and CSS cascade prevent classifying them as safe deletions. `.gitkeep` folders and historical Markdown are non-runtime artifacts, not cleanup targets. Do not delete code or dependencies from static absence alone.

## 15. Dependency Findings

Runtime usage verified: React/React DOM/Router (render/navigation), Zustand (stores), Dexie (IndexedDB), TanStack Table/Virtual (grid), ExcelJS (Excel writer), `xlsx` (Excel reader), Lucide (icons), four fontsource packages (CSS fonts), Tailwind CSS (`@import` and Vite plugin). Dev usage: Vite, React plugin, single-file plugin, Tailwind Vite plugin, ESLint core/plugins/globals. No clearly unused declared package or duplicate-purpose library was established. ExcelJS and `xlsx` overlap as spreadsheet libraries but implement **different observed import/export paths**; consolidation is HIGH-risk and outside normal cleanup. `vite-plugin-singlefile` and Vite settings are part of offline single-HTML distribution. Do not remove Tailwind merely because much CSS is handwritten: its import can affect resets/build output. Do not upgrade packages during this refactor.

## 16. Recommended Architecture

Keep the existing layers: `app/` routing/shell; `pages/` route orchestration; `features/` cohesive interactive widgets; `stores/` workspace/UI state; `domain/` pure models/calculations/validation; `database/` Dexie and persistence orchestration; `styles/` current cascade. New extractions should have one owner, no domain imports from UI, and stable public entry points. In particular, pages should import a standalone shared filter menu instead of importing a giant grid module, and the save coordinator should sit beside repositories while repositories temporarily re-export its API. Keep Excel export/import together; keep calculation and summarization modules distinct. Prefer explicit function inputs and narrowly documented side effects over generic service classes or a new event bus.

## 17. Proposed Folder Structure

```text
src/
  app/                      App.jsx, AppLayout.jsx, version.js
  components/               Modal.jsx, ErrorBoundary.jsx, ToastRegion.jsx
  features/
    filtering/              FilterMenu.jsx                    [existing empty folder]
    cost-grid/              CostGrid.jsx, useGridInteraction.js, clipboard.js,
                             BoqImageGallery.jsx, gridEdit.js, gridFind.js
    workbook/               SheetTabs.jsx
    assemblies/             AssemblyDialog.jsx
    import-export/          ExcelExchangeControls.jsx, excelExchange.js
  pages/                    existing seven route pages
  stores/                   workspaceStore.js, uiStore.js
  database/                 database.js, migrations.js, repositories.js,
                             saveCoordinator.js
  domain/                   existing pure domain files and colocated tests
  styles/                   index.css (keep cascade order)
```

`gridEdit.js`, `gridFind.js`, and `saveCoordinator.js` are **future proposed files only** and should be added only as their tasks proceed. Empty placeholder folders do not need to be populated merely to satisfy a taxonomy. No other folder move improves understanding enough to justify import churn.

## 18. File Move / Rename Map

| CURRENT | PROPOSED | REASON / constraint |
| --- | --- | --- |
| `src/features/cost-grid/CostGrid.jsx` (`FilterMenu` export only) | `src/features/filtering/FilterMenu.jsx` (extract component; retain `CostGrid.jsx`) | Resources/Reports then depend on the filtering UI directly instead of importing grid virtualizer/edit logic. Preserve portal DOM, styles, class names, keyboard/focus and props. MEDIUM. |

No whole-file renames/moves are recommended. No stylesheet move: CSS source order is observable. Extraction of new helpers/services is detailed below; those are not relocations of existing files.

## 19. Recommended Component Decomposition

`CostGrid.jsx`: first extract the self-contained `FilterMenu` (lines ~1827–1960) with its condition option lists. Then move pure parsing/formatting/edit primitives (`textFields`, `editText`, `editCellText`, `parseEdit`, `applyParsedEdit`, `updateEditableCell`) to `gridEdit.js`, preserving rate-specific updates and expression handling. Move pure `replaceText`/`collectFindMatches` to `gridFind.js`; **keep find modal markup and its state with the grid initially** because it depends on current selection, filtered row model, focus and commit timing. Only if that succeeds, consider a `useGridFind` hook + `FindReplaceDialog` in `cost-grid/`, moving the existing markup unchanged and keeping grid-owned selection callbacks. Do not simultaneously extract `onGridKeyDown`, fill-drag effect, virtualizer/measurement, resource CC/VV/PP shortcuts or clipboard transport: those share mutable refs and timing. `AssemblyDialog` can remain one component; view-only splitting has a smaller payoff than preserving its modal lifecycle. `ResourcesPage` should remain the owner of width persistence/rate editor even if pure adapters are extracted.

## 20. Recommended Utility / Hook / Service Extraction

- `gridEdit.js`: pure row edit input conversion/update, including numeric expression metadata and rate cascade semantics; no React imports. HIGH because all grid mutation paths use it.
- `gridFind.js`: pure case-sensitive/insensitive find and replacement functions; search still targets visible rows/columns with optional captured selection scope. MEDIUM.
- `database/saveCoordinator.js`: preserve exact per-project serialized queue, 500ms debounce, retry/group/flush, status events and `pagehide`; inject repository save callbacks or export via a carefully checked facade to avoid cycles. HIGH.
- Local `ReportsPage` TSV serialization can call existing `clipboard.js` pure serializer without sharing clipboard transport. MEDIUM.
- Optional private `resourceCopy.js` numeric inheritance helper for `getInheritedCqbi`/`getInheritedBoqQuantity`; public functions and tie behavior unchanged. MEDIUM.
- No generic `useCRUD`, repository base class, app-wide grid state, or generic formatter is warranted.

## 21. Data Structure Cleanup Recommendations

Update JSDoc in `domain/types.js` to accurately describe optional row expressions, attachments/blobs and backup attachments; document *persisted versus projected* fields and nullable zero semantics alongside existing constructors/validators. Use `COLUMN_KEYS` to construct **new** default worksheet filters if equivalent and tested; leave the versioned migration's old column lists alone. Treat temporary `ResourcesPage`/`ReportsPage` filter rows as explicit adapters, with explanatory names/comments and no writes back to storage. Keep `boqQty` per row, numeric expression text, optional slug/alias history and image owner metadata. **Optional / High-Risk — Do Not Implement Without Explicit Approval:** storing BOQ items separately, replacing row quantities with item quantities, replacing positional widths/sort with keyed objects, consolidating attachment stores, or changing backup/schema versions. None is needed for this cleanup.

## 22. AI-Agent Readability Improvements

In this plan's implementation phase, add succinct ownership comments at the top of `CostGrid.jsx`, `workspaceStore.js`, `repositories.js`, `migrations.js`, and `types.js` (only where they clarify boundaries); keep comments near non-obvious side effects such as route listing writes, grouped-save boundaries and attachment transitions. Make exported helper names indicate inputs/outputs; colocate existing domain tests with their modules and add targeted behavior tests only for extracted risky seams. Use the folder map above as a navigation guide. Existing phase/performance notes are history, not an authoritative source of current behavior; use source and regression fixtures. Avoid creating parallel entity definitions or a new documentation sprawl.

## 23. Risk Assessment

**LOW:** documentation of record shapes, comments and isolated formatting that changes no expression/effect ordering. **MEDIUM:** filter UI extraction, pure find/TSV helpers and local UI decomposition; portal/focus or output bytes may still shift. **HIGH:** grid edit/keyboard/drag/virtualization changes; workspace history/guards; queued writes and IndexedDB transactions; image ownership; calculation/projection and persisted defaults; JSON/Excel interchange; CSS cascade order. A HIGH-risk task is acceptable only with a captured pre-change input/action/output baseline and an isolated implementation. If exact behavior cannot be demonstrated, leave the current implementation in place and seek manual approval instead. Lint hook warnings are baseline warnings; adding dependencies mechanically could trigger extra effects and alter reload restoration or selection.

## 24. Behavior Preservation Requirements

Invariant contracts: original hash routes and alias resolution; row/sheet/project IDs and order; current `null` vs `0`, formulas and `expressions`; existing column order, names, widths, filters, sort/hidden state; row-level vs item-level vs project-resource math; same undo/redo boundaries and save-status text; navigation committing/flush behavior; all capture/bubble key and pointer handlers; selection, focus, scroll restoration, virtualization and gallery placement; attachment metadata/blobs/ownership; settings writes and events; local/session storage keys and fallbacks; backup and Excel byte-level *semantic* contents including headers/formulas/image placement; visual cascade including print/responsive/theme. Compare equivalent user-visible output, not only whether the page still renders. Document known baseline quirks rather than silently repairing them (e.g. Settings help advertises Ctrl+Shift+D while no matching handler was found).

## 25. Ordered Refactoring Strategy

1. Capture baseline: tests/lint, IndexedDB export fixtures and browser interaction/visual records. No implementation before this exists for high-risk seams.
2. Low-risk record-shape documentation and local formatting with diffs reviewed per function.
3. Extract only `FilterMenu` to its existing feature folder; verify all three callers.
4. Extract pure find/TSV helpers and verify serialized output and search scope.
5. Extract grid edit helper independently; then, if warranted, the find UI boundary. Leave keyboard/drag/virtualizer for manual review unless a reproducible browser regression harness is available.
6. Clarify workspace private history helpers independently of save coordinator; then extract coordinator behind unchanged repository export.
7. Inspect data adapters and source-only dead candidates, retaining any compatibility uncertainty.
8. Final consistency pass and exact behavior comparison. Never combine schema, storage, calculation and grid changes in one patch.

## 26. Detailed Atomic Task List

Each task below specifies the **accidental behavior change** explicitly; verification is performed against the unchanged baseline, not against a newly invented desired behavior. New-file paths are proposed outputs, not files that exist now.

### CLN-001 — Establish behavioral baseline
- **Objective:** Capture reproducible pre-refactor outputs and actions.
- **Files Affected:** None (read-only: `src/**`, `package.json`, `legacy-v4-dummy.json`).
- **Current Problem:** Unit tests omit browser interaction, persistence and navigation timing.
- **Proposed Change:** In a future implementation session, record test/lint results, browser routes/screenshots/computed styles for themes and print, keyboard/mouse grid scenarios, export samples and backed-up IndexedDB fixtures without modifying app code.
- **Must Preserve / accidental change:** Baseline capture itself must not mutate production user data; fixture project creation should use isolated browser storage.
- **Dependencies:** None. **Risk:** LOW.
- **Verification:** Current 72 passing tests and 8 lint warnings documented above; compare independently captured before/after snapshots, imports and action traces.

### CLN-002 — Correct persisted-model documentation
- **Objective:** Make stored/derived boundaries discoverable.
- **Files Affected:** `src/domain/types.js`.
- **Current Problem:** Optional `expressions` and attachment/backup image data are undocumented.
- **Proposed Change:** Extend JSDoc typedefs for existing shapes and relationships; no constructors, validators or storage changes.
- **Must Preserve / accidental change:** No runtime data shape, backup or calculation change.
- **Dependencies:** CLN-001. **Risk:** LOW.
- **Verification:** Review typedefs against `normalization.js`, `validation.js`, `repositories.js`; run domain tests.

### CLN-003 — Clarify core module ownership
- **Objective:** Reduce future agent misinterpretation of side effects.
- **Files Affected:** `src/database/repositories.js`, `src/database/migrations.js`, `src/stores/workspaceStore.js`, `src/features/cost-grid/CostGrid.jsx`.
- **Current Problem:** Hidden route-list writes, save/guard boundaries, legacy version axes and grid listener scope are easy to miss.
- **Proposed Change:** Brief ownership/contract comments at relevant declarations, no executable edit or broad reformat.
- **Must Preserve / accidental change:** Exact execution order and exports.
- **Dependencies:** CLN-002. **Risk:** LOW.
- **Verification:** Inspect diff for comment-only changes; lint remains at baseline.

### CLN-004 — Extract shared filter UI
- **Objective:** Remove the pages' dependency on the whole grid module.
- **Files Affected:** `src/features/cost-grid/CostGrid.jsx`, `src/features/filtering/FilterMenu.jsx` (new), `src/pages/ResourcesPage.jsx`, `src/pages/ReportsPage.jsx`.
- **Current Problem:** Both pages import `FilterMenu` from `CostGrid.jsx` despite being read-only tables.
- **Proposed Change:** Move the existing `FilterMenu` function and its text/number condition lists verbatim to `FilterMenu.jsx`; update all three imports/exports. Retain the portal behavior and current CSS.
- **Must Preserve / accidental change:** Filter values, select-visible 200 limit, sort, draft reset, focus/position, Escape/Enter behavior, appearance in light/warm/dark.
- **Dependencies:** CLN-001. **Risk:** MEDIUM.
- **Verification:** Run tests/lint; compare interactive filter menus in grid, Resources and Reports at different viewport sizes and themes.

### CLN-005 — Isolate pure grid find transforms
- **Objective:** Make search semantics explicit without moving UI state.
- **Files Affected:** `src/features/cost-grid/CostGrid.jsx`, `src/features/cost-grid/gridFind.js` (new), optionally colocated `gridFind.test.js` (new only if necessary for scope/limit parity).
- **Current Problem:** `replaceText` and `collectFindMatches` are embedded in the giant component file.
- **Proposed Change:** Extract these two functions unchanged; keep React state, modal JSX, selection and commit callbacks in `CostGrid.jsx`.
- **Must Preserve / accidental change:** Case folding, whole-cell matching, regex escaping, visible-row order, selection-only scope and first-500 navigation vs unlimited replace-all.
- **Dependencies:** CLN-004. **Risk:** MEDIUM.
- **Verification:** Compare find/replace on hidden/filtered/selected rows, mixed-case text and >500 hits; run tests/lint.

### CLN-006 — Reuse TSV serializer only
- **Objective:** Remove proven duplicate quoting, not clipboard workflows.
- **Files Affected:** `src/pages/ReportsPage.jsx`, `src/features/cost-grid/clipboard.js`, `src/features/cost-grid/clipboard.test.js`.
- **Current Problem:** Report copying embeds the same tab/newline/double-quote escaping already in `serializeClipboardMatrix`.
- **Proposed Change:** Import the pure serializer for report matrices; leave report headers/rows, Clipboard API fallback, grid cut/copy/paste transport unchanged.
- **Must Preserve / accidental change:** Exact CRLF/tab/quote output including multiline resource text, summary/detail columns and copied-row notices.
- **Dependencies:** CLN-001. **Risk:** MEDIUM.
- **Verification:** Compare exact report clipboard text before/after for multiline/quoted values and zero/null cells; run clipboard tests.

### CLN-007 — Consolidate inherited-value loop privately
- **Objective:** Deduplicate genuinely identical frequency/tie logic.
- **Files Affected:** `src/domain/resourceCopy.js`, `src/domain/resourceCopy.test.js`.
- **Current Problem:** CQBI and BOQ-quantity inheritance use duplicated loops.
- **Proposed Change:** Private field-parameterized numeric frequency helper; retain named public wrappers and `copyResourcesToBoq`.
- **Must Preserve / accidental change:** Ignore non-finite/null, accept zero, choose most frequent, ties follow first source row, preserve explicit source deviations.
- **Dependencies:** CLN-001. **Risk:** MEDIUM.
- **Verification:** Existing resource-copy tests plus direct comparison of old/new outputs on ties, zeros, nulls and noncontiguous items.

### CLN-008 — Isolate grid edit primitives
- **Objective:** Clarify single-cell update rules shared by edit, fill and replace.
- **Files Affected:** `src/features/cost-grid/CostGrid.jsx`, `src/features/cost-grid/gridEdit.js` (new), `src/domain/numericExpressions.js`, `src/domain/worksheetRates.js` (read-only dependencies; edit only if required to preserve existing call sites).
- **Current Problem:** Parsing/text normalization and row/rate updates live in render module.
- **Proposed Change:** Extract pure `editText`, `editCellText`, `parseEdit`, `applyParsedEdit`, `updateEditableCell` and relevant field set; preserve calls to existing domain helpers. Do not rewrite event handlers.
- **Must Preserve / accidental change:** Numeric expression storage/clearing, raw rate handling, validation errors, formulas, null/zero, input length and resource newlines.
- **Dependencies:** CLN-005. **Risk:** HIGH (all edit/paste/fill/replace paths).
- **Verification:** Existing arithmetic/rate/clipboard tests and before/after UI cases for cell/formula edit, paste, fill, find-replace and cross-sheet resource rates.

### CLN-009 — Make resource/report filter projections explicit
- **Objective:** Explain transient adapter rows and sort index mapping.
- **Files Affected:** `src/pages/ResourcesPage.jsx`, `src/pages/ReportsPage.jsx`.
- **Current Problem:** Temporary `resource`, `remark`, `override`, `cr`, `boqQty` assignments appear to be persisted row mutations.
- **Proposed Change:** Rename local projection variables and add short boundary comments; keep identical object fields and `projectVisibleRowIds` calls. No shared adapter abstraction.
- **Must Preserve / accidental change:** Exact filter/search/sort output, default ordering, status text, percentages, hidden/full-project totals and column labels.
- **Dependencies:** CLN-004. **Risk:** MEDIUM (HIGH if adapter values change).
- **Verification:** Compare project resource/report ordering/filter menus and TSV output before/after; run projection/resource/report tests.

### CLN-010 — Document or narrowly factor history bookkeeping
- **Objective:** Reduce store maintenance burden without changing state ownership.
- **Files Affected:** `src/stores/workspaceStore.js`, `src/domain/groupedHistory.js` (read-only dependency).
- **Current Problem:** `commitSheetGroup`, `mutateSheet`, `applyGroupedRateHistory` and `applyHistory` repeat status/history operations but have different boundaries.
- **Proposed Change:** Extract only private size-pruning/status helpers within `workspaceStore.js` where outputs are provably identical; otherwise leave as-is after documentation. No new store architecture.
- **Must Preserve / accidental change:** 20-entry/24 MiB history limits, grouped undo across sheets, redo invalidation, status and retry handling, save scheduling, navigation guards.
- **Dependencies:** CLN-001, CLN-003. **Risk:** HIGH.
- **Verification:** Before/after grouped rate and assembly apply, undo/redo after another sheet changes/deletion, failed write/retry and reload; domain tests alone are insufficient.

### CLN-011 — Separate save coordination behind repository API
- **Objective:** Give asynchronous save scheduling a clear owner.
- **Files Affected:** `src/database/repositories.js`, `src/database/saveCoordinator.js` (new), `src/stores/workspaceStore.js` (import unchanged via facade if possible).
- **Current Problem:** `pending`, `projectWriteQueues`, `persistLatest`, `saveCoordinator` and `pagehide` listener sit amid CRUD and backup code.
- **Proposed Change:** Move that cohesive block with dependency injection for `saveSheetAndProjectTimestamp`/`saveSheetsAndProjectTimestamp` if necessary; keep `repositories.js` re-export and call signatures; avoid cyclic imports.
- **Must Preserve / accidental change:** Debounce 500ms, per-project write serialization, grouped flush/retry/status, error propagation, pagehide flush and export snapshot ordering.
- **Dependencies:** CLN-010. **Risk:** HIGH (potential user-data loss or stale exports).
- **Verification:** Compare pending write/flush/retry/group behavior under delayed/failing IndexedDB writes; verify export immediately after editing and navigation on invalid edits; run queue tests and browser scenarios.

### CLN-012 — Clarify settings/backup workflow locally
- **Objective:** Make distinct preference and full-backup transactions readable.
- **Files Affected:** `src/pages/SettingsPage.jsx`.
- **Current Problem:** `update`, `exportBackup`, `chooseRestore`, `confirmRestore`, `confirmDelete` are compressed long handlers.
- **Proposed Change:** Reformat handlers and introduce only local named helpers for repeated state-setting if execution order is provably identical; do not relocate optimistic settings queue or dialogs.
- **Must Preserve / accidental change:** Write revision rollback, failed-save toast, queue idle barrier, destructive confirmation steps, preferences refresh event, navigation and backup contents.
- **Dependencies:** CLN-001, CLN-011. **Risk:** HIGH.
- **Verification:** Toggle preferences rapidly including a failed write, export/restore/delete in isolated browser profile; compare resulting settings and full backup; run settings tests.

### CLN-013 — Investigate dead-code candidates; delete only on proof
- **Objective:** Avoid carrying unused code without breaking compatibility.
- **Files Affected:** `src/domain/projection.js`, `src/domain/validation.js`, `src/domain/columns.js`, `src/domain/imageAttachments.js`, `src/database/repositories.js`, their colocated tests; `src/styles/index.css` (inspection only).
- **Current Problem:** Candidate exports and historic CSS have no demonstrated runtime callers.
- **Proposed Change:** Trace imports, test uses, compatibility fixtures, dynamic references and CSS computed-style coverage; propose deletion **only after separate explicit evidence**. Preserve legacy discovery/transition helpers if uncertain.
- **Must Preserve / accidental change:** Old backup support, old IndexedDB discovery, image undo, existing CSS cascade and public module API.
- **Dependencies:** CLN-001, CLN-011. **Risk:** HIGH for deletion; LOW for investigation.
- **Verification:** Static and runtime usage audit plus legacy fixture restore, image transitions and visual/print comparison; otherwise classify as retained.

### CLN-014 — Final consistency and parity gate
- **Objective:** Finish only behavior-neutral readability work.
- **Files Affected:** `src/styles/index.css`, `src/features/cost-grid/CostGrid.jsx`, `src/database/repositories.js`, `src/stores/workspaceStore.js` **only where preceding tasks changed them**; no new files by default.
- **Current Problem:** Layered CSS overrides and dense formatting complicate later edits.
- **Proposed Change:** Review naming/comments/formatting; annotate stylesheet sections without moving declarations. Defer selector deletion, CSS split and hook-dependency rewrites unless proven visually/event-equivalent.
- **Must Preserve / accidental change:** Layout, colors, sizing, responsive/print precedence, focus and event timing, all baseline lint warning semantics.
- **Dependencies:** CLN-002 through CLN-013 (including any tasks deliberately deferred).
- **Risk:** HIGH if CSS/effects touched, LOW for comments alone.
- **Verification:** Full test/lint/build in future implementation session, generated single-file smoke test, before/after screenshots and computed styles, IndexedDB/backup round trips, grid interaction matrix and manual signoff for unresolved parity risks.

## 27. Final Verification Checklist

- [ ] Run original 72-test suite, `npm.cmd run lint`, and production build **in the future implementation session**; distinguish baseline warnings from newly introduced ones and inspect single-file output.
- [ ] Same project create/rename/duplicate/delete, sheet order/active tab, aliases/old-ID links, browser back/forward and navigation guard.
- [ ] Same row formulas, numeric expressions/edit text, zero/null behavior, overrides, visible totals, project summaries, resource aggregates and report percentages.
- [ ] Same keyboard shortcuts (including CC/VV/PP, Ctrl/Cmd+F/H/S/Z/Y, arrows, Tab, Delete/Backspace, Shift+F10), mouse select/drag/fill/resize and focus/scroll restoration.
- [ ] Same filtering, sorting, selection-scoped find/replace, 500-result navigation, paste expansion, cut/copy and TSV byte output.
- [ ] Same async save status, retry, grouped undo/redo, pagehide/route flush, project switch and export immediately after edits.
- [ ] Same stored Dexie database name/version/stores/indexes, old data load, legacy JSON fixture migration, project/full backup and attachment bytes/ownership.
- [ ] Same Excel template headers, aliases, formulas, calculated cached results, image placement, import preview/reset and filename/size rules.
- [ ] Same light/dark/warm/font/density/mobile/print visual results and CSS computed values, including portals and notice/toast behavior.
- [ ] For each task, compare same inputs/actions to unchanged baseline; if unprovable, stop that task for manual review rather than changing product behavior.

## 28. Explicitly Out-of-Scope Changes

Feature work, UX/UI/copy/styling redesign, new shortcuts, new validation rules, business-calculation changes, bug fixes (including mismatched help copy), IndexedDB/schema or backup format migrations, remapping BOQ items into a new persisted entity, import/export format changes, storage-key renames, dependency replacements/upgrades, wholesale state management replacement and speculative performance optimization. The optional schema ideas in section 21 require explicit separate approval. **This document is a plan; none of these tasks is implemented here.**
