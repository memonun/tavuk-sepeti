# CRM Spec — Spreadsheet-Style Grid for Clients & Orders

## 0. How to read this spec
- Sections marked **[FILL IN]** require information from the **existing data model**.
  Do NOT invent field names, types, statuses, or relationships. Read them from the
  current schema and complete those sections before implementing.
- Everything outside **[FILL IN]** is a grounded requirement and should be implemented
  as written unless it conflicts with the existing system (if it does, flag it, don't
  silently change it).
- "Decision required" items must be confirmed with the product owner before build.

---

## 1. Goal
Replace the current basic, static Clients (Müşteriler) table with an interactive,
Notion/Excel-like **data grid** as the primary editing surface. The grid operates over
the project's **existing relational, typed-field data model** for Clients and Orders.
This spec defines grid behavior and the contract the grid expects from the data model.
It does **not** define the data model itself.

---

## 2. Glossary (so requirements are unambiguous)
- **Data grid / spreadsheet UI**: the interactive cell-based component.
- **Cell range selection**: click-drag to select a rectangular block of cells.
- **Multi-range selection**: Ctrl/Cmd-click to select multiple non-adjacent blocks.
- **Fill handle**: small square at the bottom-right of a selection; dragging it
  copies/extends the value across cells (Excel/Google Sheets behavior).
- **Bulk paste / paste-to-create**: pasting tabular data from Excel/Sheets; if pasted
  rows exceed existing rows, new records are created automatically.
- **Typed field/column**: a column bound to a model field with a specific data type and
  a type-appropriate editor (not free text for everything).
- **Relation / link field**: a column whose value references another record (Order → Client).
- **View**: an alternate presentation of the same data (grid, kanban, calendar).
- **Virtualization**: rendering only the visible rows/cells for performance at scale.

---

## 3. Data model contract  **[FILL IN — use the existing model]**
The grid is model-agnostic but requires the following to be supplied from the existing
schema. Fill each item from the real model; do not assume.

### 3.1 Entities in scope
- Primary entity 1: **Clients (Müşteriler)** — existing table/model: `[FILL IN name]`
- Primary entity 2: **Orders (Siparişler)** — existing table/model: `[FILL IN name]`
- Any additional related entities the grid must reference: `[FILL IN or "none"]`

### 3.2 Per-entity field map  **[FILL IN]**
For EACH entity, list every field the grid will display or edit, as:

| Source field | Display label | Grid column type | Editable? | Required? | Constraints/options |
|--------------|---------------|------------------|-----------|-----------|---------------------|
| `[FILL IN]`  | `[FILL IN]`   | text / number / currency / date / datetime / single-select / multi-select / link / boolean / readonly | yes/no | yes/no | enum options, min/max, regex, etc. |

Notes:
- Map each source field to exactly one **grid column type** so the correct editor and
  validation are used. If a field's type isn't representable, flag it.
- Mark system fields (id, timestamps, computed values) as **readonly**.
- For select fields, the **allowed options come from the existing model** — `[FILL IN]`.

### 3.3 Relationship  **[FILL IN]**
- Cardinality between Clients and Orders: `[FILL IN — e.g. one Client has many Orders]`
- The link field and the key it joins on: `[FILL IN]`
- On-delete behavior when a Client has Orders: `[FILL IN]` (Decision required:
  block, cascade, or set-null — confirm against existing constraints).

### 3.4 Identity & ordering  **[FILL IN]**
- Primary key field per entity: `[FILL IN]`
- Default sort/order of rows in the grid: `[FILL IN]`

---

## 4. Functional requirements — the grid (grounded)

### 4.1 Selection & navigation
- Single-cell selection on click; arrow-key navigation between cells.
- **Range selection** by click-drag.
- **Multi-range** (non-adjacent) selection via Ctrl/Cmd-click.
- Whole-row selection via row marker; whole-column selection via header click.
- Select-all via Ctrl/Cmd+A.

### 4.2 Editing
- Inline edit on double-click or by typing into a selected cell.
- **Type-aware editors**, driven by the column type from §3.2:
  dropdown for select fields, date picker for dates, numeric/currency input for numbers,
  record-picker for link fields, checkbox for boolean.
- **Fill handle**: drag to copy/extend a value across a range (down and right).
- Delete/Backspace clears the contents of selected editable cells.
- Validation enforced per column constraints from §3.2; invalid edits are rejected with
  a visible, inline error and do not persist.

### 4.3 Bulk operations
- **Copy** selected range to clipboard as TSV (Excel/Sheets-compatible).
- **Paste** from clipboard:
  - Into a matching range → overwrite cells (respecting type/validation).
  - Beyond existing rows → **auto-create new records** for the extra rows, mapping
    columns positionally to the visible columns.
  - Paste into readonly columns is ignored (with a notice), not errored.
- **Add multiple rows directly**: an explicit "add row" action plus support for
  pasting N rows at once. (Decision required: also offer "add N empty rows"? `[FILL IN]`)
- **Bulk delete** of selected rows, with a confirmation that states the count and
  respects the on-delete rule from §3.3.

### 4.4 Display & performance
- **Virtualized** rendering; must stay smooth scrolling at the expected dataset size
  (target: `[FILL IN expected max rows; default assumption 10,000+]`).
- Resizable and reorderable columns.
- Freeze/pin the first column(s); sticky header row.
- Per-column **sort** and **filter**; optional **group-by**.
- Column show/hide control.

### 4.5 Views (phase 2 — optional)
- Default **Grid** view, plus optional **Kanban** (group by a select field) and
  **Calendar** (by a date field). Which fields drive these: `[FILL IN or defer]`.
- **Client detail** panel showing that client's linked Orders inline.

---

## 5. Keyboard & interaction map (grounded)
- Arrows: move active cell. Tab/Shift+Tab: move horizontally. Enter: confirm + move down.
- Esc: cancel current edit. F2 or double-click: enter edit mode.
- Ctrl/Cmd+C / +V / +X: copy / paste / cut. Ctrl/Cmd+A: select all.
- Shift+Arrows / Shift+Click: extend range. Ctrl/Cmd+Click: add disjoint range.
- Drag fill handle: extend value. Delete/Backspace: clear cells.

---

## 6. Non-functional requirements (grounded)
- **Performance**: no perceptible lag scrolling/editing at the target row count.
- **Persistence**: edits persist to the existing backend via `[FILL IN API/data layer]`;
  define optimistic vs. server-confirmed update behavior (Decision required).
- **Concurrency**: behavior on stale/conflicting writes: `[FILL IN or "last-write-wins"]`.
- **Accessibility**: keyboard operable; focus states visible.
- **Browser support target**: `[FILL IN]`.
- **Localization**: UI labels support Turkish; respect existing i18n setup `[FILL IN]`.

---

## 7. Implementation options (pick one; reference open-source counterparts)
Use these as references when an implementation detail is unclear, and to validate
behavior against a working example. Choose ONE approach and state why.

1. **Glide Data Grid** (React, MIT, free) — closest feel to Notion/Airtable; canvas-
   rendered, scales to millions of rows. Constraint: not compatible with React 19
   (use React 16/17/18). Repo: github.com/glideapps/glide-data-grid
2. **Handsontable** — most Excel-like out of the box (fill handle, multi-range select).
   Constraint: commercial use requires a paid license — verify before adopting.
   Repo: github.com/handsontable/handsontable
3. **AG Grid** — Community is free (MIT); range selection + advanced clipboard/fill are
   Enterprise (paid). Repo: github.com/ag-grid/ag-grid
4. **react-data-grid (adazzle)** — MIT, lighter weight, solid editing + copy/paste.
   Repo: github.com/adazzle/react-data-grid
5. **Adopt a no-code DB instead of building** (if a self-hosted app is acceptable):
   Teable (github.com/teableio/teable), Baserow (github.com/baserow/baserow),
   NocoDB (github.com/nocodb/nocodb), Grist (github.com/gristlabs/grist-core).

Selected approach: `[FILL IN]`  ·  Reason: `[FILL IN]`  ·  React version in use: `[FILL IN]`

---

## 8. Acceptance criteria (grounded)
- [ ] A user can select a cell, a dragged range, and multiple disjoint ranges (Ctrl/Cmd-click).
- [ ] Dragging the fill handle copies/extends a value across the selected range.
- [ ] Copying from the grid pastes correctly into Excel/Sheets, and vice versa.
- [ ] Pasting more rows than currently exist creates new records mapped to visible columns.
- [ ] A user can add several new rows directly without leaving the grid.
- [ ] Each column enforces its type and constraints from §3.2 (invalid edits rejected inline).
- [ ] The Order→Client relation resolves to a real Client; the Client detail view lists its Orders.
- [ ] On-delete behavior from §3.3 is enforced.
- [ ] The grid stays responsive at the target row count from §4.4.
- [ ] All edits persist to the existing backend and survive reload.

---

## 9. Out of scope (unless added explicitly)
- Real-time multi-user collaboration / presence cursors.
- Formula / computed columns.
- Role-based permissions and access control.
- Changes to the existing data model schema.

---

## 10. Open decisions to confirm before build
1. Selected grid approach + React version (§7).
2. On-delete behavior for Clients with Orders (§3.3).
3. Optimistic vs. server-confirmed edits, and concurrency handling (§6).
4. Whether "add N empty rows" is offered in addition to paste-to-create (§4.3).
5. Target maximum row count for performance (§4.4).
6. Whether phase-2 views (Kanban/Calendar) are in this iteration (§4.5).
