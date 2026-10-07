# BOQ Cost Load — Page Description

## Overview

BOQ Cost Load is an offline, spreadsheet-style workspace for preparing and reviewing Bill of Quantities (BOQ) cost estimates. The page brings data entry, automatic cost calculations, filtering, resource reuse, and workbook management together in a single browser interface.

Open `cost Load.html` in a modern browser to use the application. It works offline and does not require installation, an account, or a build step.

## Page layout

The application is arranged as a full-height workspace:

1. **Header** — shows the app identity and workbook save status.
2. **Toolbar** — provides row actions, resource copying, filters, search, exports, and backup controls. On smaller screens, some actions are available from the overflow menu.
3. **Formula bar** — displays the active cell address and value, and supports editing the selected cell.
4. **BOQ grid** — the main spreadsheet area for entering and reviewing estimate rows.
5. **Sheet tabs** — switch between workbook sheets or add a sheet.
6. **Status bar** — displays worksheet and selection information, including available totals and aggregates.

Menus, filter panels, search controls, dialogs, and toast messages appear as overlays when needed.

## BOQ grid

Each row represents a BOQ resource line. The grid has these columns:

| Column | Description |
|---|---|
| BOQ Code | Code used to group resources under a BOQ item. |
| Resource | Resource name or description. |
| CQBI | Editable calculation input. |
| CR | Editable calculation input. |
| Rate | Editable rate input. |
| Cost | Calculated as CQBI × CR × Rate. |
| Override | Optional manual value for Used Cost. |
| Used Cost | Override when entered; otherwise Cost. |
| BOQ Qty | Quantity stored on an individual resource row; resource-copy operations resolve the item's inherited quantity from its resource rows. |
| Total Cost | Calculated as Used Cost × BOQ Qty. |
| Remark | Optional notes column, hidden by default. |

Calculated columns are read-only. BOQ codes are trimmed and converted to uppercase when committed. Rows with the same BOQ code receive a consistent group color to make related resources easier to scan.

## Common actions

- **Edit cells:** Select a cell and type, click the active cell again, double-click, or press F2. Use the formula bar to edit the active cell value.
- **Manage rows:** Add one or more rows, insert before the selected row, or delete selected rows.
- **Select rows:** Click a row-number gutter to select a whole row. Shift-click selects a contiguous range; Ctrl-click (Cmd-click on Mac) toggles individual rows; Ctrl+Shift-click adds an anchored range. Click a cell to return to cell selection. With rows selected, Ctrl/Cmd+C copies them, Ctrl/Cmd+X cuts them, Ctrl/Cmd+V pastes them before the active row, and Ctrl/Cmd+- deletes them.
- **Select and fill:** Select a rectangular cell range, then copy, cut, paste, or clear. Drag the small handle at the selection’s lower-right editable cell to repeat its value pattern down, up, left, or right. Filling is done by dragging; there is no fill keyboard shortcut.
- **Copy and paste cells:** With the worksheet focused, Ctrl/Cmd+C copies a cell or selected range as tab-separated data for Excel, and Ctrl/Cmd+V pastes data from Excel starting at the active cell. Pasting one cell into a larger selection fills that selection. Calculated columns are skipped; invalid values reject the complete paste. Paste changes can be undone as one operation.
- **Find:** Search the worksheet and move between matches; find-and-replace is also available.
- **Filter and sort:** Use a column’s filter control to search values, select values, apply conditions, or sort. Clear filters to restore all rows.
- **Reuse resources:** Copy a BOQ item’s resource lines to other BOQ codes using the Copy Resources dialog or the gutter CC/VV shortcut.
- **Assemblies:** Right-click a coded BOQ row and save its resource lines as a named project assembly. Open **Assemblies** to append or replace resources on one or more BOQ items across project sheets, choosing whether to use saved or current rates and assembly or destination CQBI.
- **Project resources:** Open **Resources** to review resources aggregated across every Cost Load sheet, see total required quantities, and edit a shared unit rate. Resources are matched by name and unit; rate edits from Resources or an individual Cost Load rate cell update matching rows project-wide. Rate disagreements are flagged for resolution. Quantity totals include complete lines and identify any incomplete lines separately.
- **Reports:** The Project Summary report lists one row per BOQ code per sheet with the largest BOQ Qty, Unit Cost, Total Cost, and percentage of the full project total. Unit Cost divides the item's total cost by its largest BOQ Qty. Sort and filter the summary without changing Cost Load data; percentages continue to use the full project when viewing a single sheet.

### CC / VV / PP resource-copy shortcuts

These shortcuts copy all resource rows belonging to one BOQ item and replace the resource rows of another BOQ item without opening the dialog:

1. Hover over the row-number gutter beside a row in the **source** BOQ item.
2. Press **C** twice within 450 ms (**CC**) to copy that BOQ item’s resources.
3. Hover over the row-number gutter beside a row in the **destination** BOQ item.
4. Press **V** twice within 450 ms (**VV**) to paste the copied resources to that BOQ item.
5. Alternatively, press **P** twice within 450 ms (**PP**) to paste the resources while preserving the destination item's CQBI.

Both paste shortcuts replace the destination’s existing resources with the copied resources. **VV** copies CQBI values from the source; **PP** keeps the destination's existing CQBI, using its most frequent nonblank CQBI value for each pasted resource (ties use the first value in worksheet order, and all-blank destination CQBI remains blank). Normal copied quantities inherit the destination item's BOQ Qty, not the source item's quantity. A source resource whose quantity differs from the source item's inherited quantity retains that deliberate resource-level quantity. The inherited item quantity is resolved as the most frequent nonblank BOQ Qty among that item's rows (ties use the first value in worksheet order). The source and destination are identified by the BOQ code of the hovered row. Use the Copy Resources dialog instead when copying to multiple destination BOQ items at once.
- **Change appearance:** Toggle dark mode or show/hide the Remark column.

## Workbooks and sheets

A workbook can contain multiple sheets. Use the **+** button to add a sheet. Activate a tab to switch sheets; double-click or open its context menu to rename, duplicate, or delete it. Each sheet keeps its own rows, filters, sort order, column widths, and hidden-column settings.

Use **New Project** to replace the current workbook with a blank project after confirmation.
New projects open with an empty Cost Load grid and zero worksheet rows. Add the first row when entering data, or import a completed Excel workbook.

## Saving and data exchange

- The workbook is automatically saved in the browser using IndexedDB. The header indicates when a save is in progress and when it last completed.
- **Save Backup** downloads a JSON copy of the workbook; **Open Backup** restores a supported backup.
- **Export to Excel** downloads the entire active sheet as an `.xlsx` workbook, including a header-only template for an empty sheet. The `BOQ Template` worksheet has one **BOQ Qty** field per resource row.
- **Import from Excel** reads editable columns from a supported workbook and replaces the active sheet after validation and confirmation. Empty rows are ignored, each row's BOQ Qty is imported independently, and a successful import is one undoable change.
- **Export CSV** downloads the active sheet’s currently visible rows, respecting its filters and sort order.

Browser storage belongs to the current browser profile and device. Use a backup to move a workbook to another device or profile.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| Arrow keys | Move the active cell |
| Shift + Arrow | Extend the selection |
| Enter / Shift + Enter | Commit and move down / up |
| Tab / Shift + Tab | Move to the next / previous editable cell |
| F2 | Edit the active cell |
| Escape | Cancel the current edit |
| Ctrl + C / X / V | Copy / cut / paste |
| Click row gutter | Select a whole row |
| Shift + click row gutter | Select a contiguous row range |
| Ctrl/Cmd + click row gutter | Toggle a row in the selection |
| Ctrl/Cmd + Shift + click row gutter | Add an anchored row range |
| Delete / Backspace | Clear editable selected cells |
| Ctrl + Z | Undo |
| Ctrl + Y or Ctrl + Shift + Z | Redo |
| Ctrl + F / Ctrl + H | Find / find and replace |
| Ctrl + + / Ctrl + - | Insert row / delete selected rows |
| Ctrl + Shift + R | Toggle the Remark column |
| Ctrl + Shift + D | Toggle dark mode |
| Ctrl + S | Save the workbook |
| Hover gutter + C, C (within 450 ms) | Copy resources for the hovered BOQ item |
| Hover destination gutter + V, V (within 450 ms) | Replace its resources with the copied BOQ item’s resources |

Sheet tabs can be navigated with the arrow keys, Home, and End. Press Enter or Space to activate a focused tab; Shift+F10 opens its context menu.
