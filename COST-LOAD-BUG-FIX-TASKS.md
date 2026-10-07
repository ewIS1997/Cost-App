# Cost Load Bug-Fix Execution Tasks

> **Quantity-model supersession:** The shared `quantities` map, `boqQtyOverride`, and `unassignedQty` workflow described in this historical checklist has been replaced by a single independently editable `row.boqQty` field. New BOQ codes no longer require a quantity prompt; BOQ Qty is entered like any other cell. See `REACT-OFFLINE-IMPLEMENTATION-PLAN.md` §11.2 for the current contract.

## Purpose

Fix the confirmed user-visible defects in the Cost Load page without redesigning unrelated features.

This checklist is intentionally explicit so it can be executed by a weaker coding model. Complete the tasks in order. Do not weaken worksheet validation, remove persistence safeguards, or rewrite the grid.

## Scope And Constraints

- Modify only code needed for the defects listed here.
- Preserve the current IndexedDB, Zustand, calculation, undo/redo, filtering, and virtual-grid architecture.
- Keep every completed worksheet valid.
- Keep every mutation undoable through the existing `mutateSheet` gateway.
- Do not store an incomplete BOQ code/quantity pair, even temporarily.
- Do not invent a shared quantity such as `0` when the user has not entered one.
- Do not make derived columns editable.
- Do not change calculation formulas.
- Do not run MCP tools or a lint check for this task.
- Use manual browser verification for the acceptance checks.

## Authoritative Existing Rules

Use these rules when implementation choices are unclear:

- `Cost = CQBI * CR * Rate`.
- `Used Cost = Override` when Override is not null; otherwise Cost.
- Resolved BOQ quantity priority is local `boqQtyOverride`, then shared `quantities[normalizedBoqCode]`, then `unassignedQty` for a blank code, then null.
- `Total Cost = Used Cost * resolved BOQ quantity`.
- Every non-empty BOQ code must have a shared quantity entry.
- Shared quantity keys must be normalized, non-empty BOQ codes.
- Quantity-map entries with no matching row are not allowed.
- BOQ code input must be trimmed and converted to uppercase.
- A numeric zero is valid and must not be treated as missing.
- Invalid or non-finite numbers must never enter application state.

Relevant references:

- `src/domain/calculations.js`
- `src/domain/normalization.js`
- `src/domain/validation.js`
- `src/stores/workspaceStore.js`
- `src/features/cost-grid/CostGrid.jsx`
- `src/pages/CostLoadPage.jsx`
- `src/app/AppLayout.jsx`
- `PAGE-DESCRIPTION.md:22-40`
- `REACT-OFFLINE-IMPLEMENTATION-PLAN.md:421-499`
- `REACT-OFFLINE-IMPLEMENTATION-PLAN.md:760-792`

## Defect 1: A New Blank Project Cannot Accept Its First BOQ Code

### Root Cause

`CostGrid` commits a BOQ code through `prepareBoqCodeChange()`. When a blank row changes to a new code and no old shared quantity exists, no entry is created in `draft.quantities`. `mutateSheet()` then calls `validateWorksheet()`, which correctly rejects the incomplete worksheet.

Do not fix this by weakening `validateWorksheet()` and do not silently create a zero quantity.

### Required Behavior

When the user commits a non-empty BOQ code that has no destination shared quantity and cannot inherit an old shared quantity:

1. Pause the BOQ-code commit.
2. Open a small modal asking for the new BOQ code's shared quantity.
3. Show the normalized BOQ code in the modal.
4. Parse the quantity with the existing `parseNumeric()` function.
5. Require a non-null valid number. Accept zero.
6. On confirmation, apply the normalized BOQ code and shared quantity in one `mutateSheet()` call.
7. The operation must create one undo-history entry.
8. On cancellation, do not change the row, quantity map, or history.
9. Return focus to the edited cell or grid after confirmation or cancellation.

### Implementation Tasks

- [ ] In `CostGrid.jsx`, add state for a pending new-BOQ-code edit. Store at least `rowId`, normalized `nextCode`, and the original editor context.
- [ ] Before committing a BOQ-code edit, inspect the current worksheet data.
- [ ] If `nextCode` is blank, use the existing `prepareBoqCodeChange()` path.
- [ ] If `draft.quantities[nextCode]` already exists, use the existing path and preserve that destination quantity.
- [ ] If the old normalized code has a shared quantity, use the existing transfer rule in `prepareBoqCodeChange()`.
- [ ] If neither destination nor old shared quantity exists, open the shared-quantity modal instead of calling `mutateSheet()`.
- [ ] On modal confirmation, call `prepareBoqCodeChange()` and then assign the parsed number to `next.quantities[nextCode]` before the mutation finishes.
- [ ] Make the code and quantity one atomic `mutateSheet()` operation.
- [ ] Reuse the same guarded behavior for every interactive path that can create a BOQ code, including cell editing and formula-bar editing.
- [ ] For non-interactive bulk paths such as fill or Replace All, do not open multiple modals. Reject the operation with a clear message when it would introduce a code with no shared quantity.
- [ ] Keep `validateWorksheet()` strict.

### Acceptance Checks

- [ ] Create a new blank project and enter `a.01` in the first BOQ Code cell.
- [ ] Confirm that the modal displays normalized code `A.01`.
- [ ] Enter shared quantity `12.5` and confirm.
- [ ] Confirm that the cell shows `A.01` and BOQ Qty shows `12.5`.
- [ ] Reload the page and confirm both values persist.
- [ ] Undo once and confirm both the code and newly created shared quantity are removed together.
- [ ] Redo once and confirm both values return together.
- [ ] Repeat with quantity `0` and confirm zero is accepted and persisted.
- [ ] Enter malformed quantity text and confirm the modal stays open with a specific error.
- [ ] Cancel the modal and confirm no data or history change occurs.

## Defect 2: BOQ Qty Editing Always Creates A Local Override

### Root Cause

Both BOQ Qty edit paths assign directly to `row.boqQtyOverride`:

- `src/features/cost-grid/CostGrid.jsx:69`
- `src/features/cost-grid/CostGrid.jsx:694`

This means ordinary editing never updates the shared `data.quantities` value, although the UI describes BOQ Qty as shared by rows with the same code.

### Required Behavior

Use this exact editing behavior:

- For a coded row with `boqQtyOverride === null`, normal BOQ Qty editing updates `draft.quantities[normalizedCode]`.
- For a coded row that already has a local override, normal BOQ Qty editing updates that local override.
- For a row with a blank BOQ code, normal BOQ Qty editing updates `row.unassignedQty`.
- Clearing a shared quantity is not allowed while rows still use that BOQ code, because the worksheet invariant requires a shared value.
- Clearing an unassigned quantity sets `unassignedQty` to null.
- Clearing an existing local override restores use of the shared quantity by setting `boqQtyOverride` to null.
- Provide an explicit action named `Set local quantity override` for a coded row using a shared quantity.
- Provide an explicit action named `Use shared quantity` for a coded row with a local override.
- The local-override action must start with the currently resolved BOQ quantity so the user can edit it.
- Every quantity action must use one `mutateSheet()` call and create one undo entry.

### Implementation Tasks

- [ ] Create one small helper in `CostGrid.jsx` or the domain layer that applies a parsed BOQ Qty edit according to the rules above.
- [ ] Replace both direct `row.boqQtyOverride = parsed.value` assignments with the helper.
- [ ] Ensure Find/Replace and fill use the same helper or reject ambiguous BOQ Qty operations clearly.
- [ ] Add the two explicit local/shared actions to an existing lightweight cell action or context-menu pattern. Do not redesign the toolbar.
- [ ] Visually distinguish an overridden BOQ Qty from a shared BOQ Qty, using a short label or title comparable to the existing `Used Cost` override indicator.
- [ ] Make `Use shared quantity` unavailable when the row has a blank BOQ code.
- [ ] Keep `getResolvedBoqQuantity()` unchanged unless a confirmed calculation defect is found.

### Acceptance Checks

- [ ] Create two rows with BOQ code `A.01` and shared quantity `10`.
- [ ] Edit BOQ Qty to `20` on either row while neither has an override.
- [ ] Confirm both rows display `20` and both Total Cost values recalculate.
- [ ] Set a local override of `7` on only the second row.
- [ ] Confirm the first row shows `20`, the second shows `7`, and the override is visibly identified.
- [ ] Edit the shared quantity to `30` from the first row.
- [ ] Confirm the first row shows `30` while the overridden second row remains `7`.
- [ ] Choose `Use shared quantity` on the second row and confirm it now shows `30`.
- [ ] Confirm undo and redo restore each shared/local state correctly.
- [ ] Confirm a blank-code row stores BOQ Qty as `unassignedQty` and remains valid.

## Defect 3: Add Row Does Not Append A Blank Row

### Root Cause

`insertRow(false)` still copies a BOQ code from the active row or first visible row in `CostGrid.jsx:866-884`, even though the toolbar describes this action as `Append a blank row`.

### Required Behavior

- With no active filters, `Add row` appends a completely blank `createBlankRow()` result.
- With no active filters, it must not copy the active or first row's BOQ code.
- `Insert below` may preserve its current contextual BOQ-code behavior when no filters are active.
- Filter-aware behavior is handled by Defect 4 below.

### Implementation Tasks

- [ ] Separate append behavior from contextual insert behavior instead of sharing the current unconditional BOQ-code assignment.
- [ ] For unfiltered `Add row`, append the untouched result of `createBlankRow()`.
- [ ] Preserve row-limit validation and focus behavior.
- [ ] Preserve the current rule that sorting may be cleared when positional insertion requires it.

### Acceptance Checks

- [ ] Select a row with BOQ code `A.01` and click `Add row` with no filters active.
- [ ] Confirm the appended row has blank BOQ Code, Resource, numeric inputs, Unit, Override, BOQ Qty, and Remark.
- [ ] Confirm the row remains after reload.
- [ ] Confirm `Insert below` still inserts directly below the active source row.

## Defect 4: A Row Added Under Active Filters Can Immediately Disappear

### Root Cause

Row insertion does not copy enough filter-relevant source values. A new row can fail the active filters immediately, so the user sees no visible result. Existing helper functions in `src/domain/projection.js` are not currently used by row insertion and may need correction before use.

### Required Behavior

- When filters are active, use the active visible row as the source. If there is no active visible row, use the first visible row.
- Copy only values needed to satisfy all active filters and their derived dependencies.
- Do not clear filters automatically.
- Verify the candidate row actually passes the active filters before committing it.
- If no suitable visible source exists or a valid visible candidate cannot be built, abort without mutation and show an explanatory notification.
- The new row must remain visible after insertion.

Derived filter dependencies:

| Filtered column | Source fields that may be needed |
|---|---|
| BOQ Code | `boqCode` and matching quantity state |
| Resource | `resource` |
| CQBI | `cqbi` |
| Unit | `unit` |
| CR | `cr` |
| Rate | `rate` |
| Cost | `cqbi`, `cr`, `rate` |
| Override | `override` |
| Used Cost | `override`, `cqbi`, `cr`, `rate` |
| BOQ Qty | `boqCode`, `boqQtyOverride`, `unassignedQty`, and matching shared quantity |
| Total Cost | Cost dependencies plus BOQ Qty dependencies |
| Remark | `remark` |

### Implementation Tasks

- [ ] Correct or replace `getInsertionValuesFromRow()` so quantity-derived values use the worksheet's real quantity map.
- [ ] Build the candidate from `createBlankRow()` and copy the minimum dependency fields needed for active filters.
- [ ] If a copied non-empty BOQ code uses a shared quantity, keep the existing shared quantity entry; do not duplicate or overwrite it.
- [ ] Evaluate the candidate with `projectVisibleRowIds()` and the current filters before committing.
- [ ] Abort and notify if the candidate would be hidden.
- [ ] Keep insertion and any required quantity handling inside one `mutateSheet()` call.
- [ ] Preserve physical source-row order except where the existing explicit insert action requires a position.

### Acceptance Checks

- [ ] Apply a BOQ Code filter, add a row, and confirm the new row stays visible and matches that code.
- [ ] Apply a Resource text filter, add a row, and confirm the new row stays visible.
- [ ] Apply a Cost numeric filter, add a row, and confirm copied calculation inputs keep the row visible.
- [ ] Apply a Total Cost filter, add a row, and confirm both cost and quantity dependencies keep it visible.
- [ ] Apply filters that produce zero visible rows and click Add row.
- [ ] Confirm no row is added, filters remain active, and a clear notification explains why insertion was aborted.

## Defect 5: Browser History Or Direct Hash Navigation Can Lose An Active Edit

### Root Cause

`AppLayout.jsx` guards intercepted anchor clicks only. Browser Back, Forward, direct hash changes, and unguarded programmatic navigation can leave Cost Load without resolving the active editor.

`CostGrid.jsx` also registers a navigation guard without using the unregister function returned by `registerNavigationGuard()`.

### Required Behavior

- Every route transition away from Cost Load must run `guardNavigation()` first.
- This includes links, programmatic navigation, Browser Back, Browser Forward, and direct hash changes.
- A valid active edit must commit before navigation completes.
- An invalid active edit must keep the user on Cost Load and show the existing validation/navigation message.
- Pending dirty worksheet changes must finish saving before navigation completes.
- Unmounting `CostGrid` must unregister its navigation guard.
- Do not leave a stale guard in the Zustand store after Cost Load unmounts.

### Implementation Tasks

- [ ] Change the guard-registration effect in `CostGrid.jsx` to return the unregister callback from `registerNavigationGuard()`.
- [ ] Centralize guarded navigation instead of adding unrelated one-off handlers to individual page buttons.
- [ ] Cover browser history and hash navigation in addition to anchor clicks.
- [ ] If a history/hash transition is detected after the URL changes, restore the previous Cost Load URL until the asynchronous guard succeeds; do not briefly expose another project's data.
- [ ] Prevent recursive history/hash handling while restoring or completing an approved transition.
- [ ] Keep the existing save flush in `workspaceStore.guardNavigation()`.

### Acceptance Checks

- [ ] Start a valid cell edit and click Projects. Confirm the edit commits and persists before navigation.
- [ ] Start a valid cell edit and use Browser Back. Confirm the edit commits and persists.
- [ ] Start a valid cell edit and use Browser Forward. Confirm the edit commits and persists.
- [ ] Enter invalid numeric text and try each navigation method.
- [ ] Confirm navigation is blocked and the editor remains open with its error.
- [ ] Leave Cost Load, navigate elsewhere, and confirm no stale Cost Load editor is committed again.

## Defect 6: The Worksheet Footer Always Reports Ready

### Root Cause

`CostLoadPage.jsx:63` renders `Ready` unconditionally even when `workspaceStore.saveStatus` is `Saving...` or `Save failed`.

### Required Behavior

- The footer must display the current workspace save status.
- Use the existing store states: `Saved`, `Saving...`, and `Save failed`.
- Do not create a second persistence state.
- Use an error style for `Save failed` and a non-error live style for the other states.
- Keep the existing retry control in the top bar unless deliberately reused without duplication.

### Implementation Tasks

- [ ] Select `saveStatus` from `useWorkspaceStore()` in `CostLoadPage.jsx`.
- [ ] Replace hardcoded `Ready` with the current save status.
- [ ] Update the status dot/class so failure is not presented as healthy.
- [ ] Keep the status text accessible through the existing status footer semantics.

### Acceptance Checks

- [ ] Edit a valid cell and confirm the footer changes to `Saving...`.
- [ ] Wait for persistence and confirm the footer changes to `Saved`.
- [ ] Confirm the footer and top-bar status do not contradict each other.

## Cross-Cutting Review Tasks

- [ ] Confirm every new data mutation goes through `mutateSheet()`.
- [ ] Confirm no component mutates `sheet.data`, a row, or `quantities` directly outside a mutation draft.
- [ ] Confirm BOQ code and quantity are committed atomically when introducing a new code.
- [ ] Confirm shared quantity changes recalculate every row with the same normalized code.
- [ ] Confirm local quantity overrides affect only their own row.
- [ ] Confirm quantity pruning still removes a shared key only after its last coded row is removed or changed.
- [ ] Confirm destination shared quantities are never overwritten during a BOQ-code change.
- [ ] Confirm zero remains valid for CQBI, CR, Rate, Override, shared BOQ Qty, local BOQ Qty, and unassigned BOQ Qty.
- [ ] Confirm all fixes work from both the inline cell editor and formula bar.
- [ ] Confirm undo and redo produce valid worksheet states after every fixed operation.
- [ ] Confirm page reload restores the final saved values.

## Recommended Implementation Order

1. Fix the new BOQ code/shared quantity atomic workflow.
2. Implement correct shared, local, and unassigned BOQ Qty editing.
3. Fix unfiltered Add Row behavior.
4. Implement filter-aware insertion.
5. Fix navigation guard coverage and cleanup.
6. Connect the footer to the existing save status.
7. Run every manual acceptance check in this document.

Do not mark a defect complete until all acceptance checks under that defect pass.

## Completion Report Template

When implementation is complete, report:

- Files changed.
- Behavior changed for each of the six defects.
- Manual acceptance checks completed.
- Any acceptance check that could not be completed and the exact reason.
- Any remaining known risk.
