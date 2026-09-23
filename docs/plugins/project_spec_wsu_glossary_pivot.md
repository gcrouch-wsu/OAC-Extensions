# WSU Glossary Pivot — Plugin Reference

Canonical reference for the **WSU Glossary Pivot** custom visualization
(`com-wsu-glossary-pivot`). Read this plus `../oac_design.md` to pick up
WSU Glossary Pivot development without re-deriving design decisions.

---

## 1. Overview

### Identity
- **Display name**: WSU Glossary Pivot
- **Short name**: WSU Glossary Pivot
- **Category**: WSU
- **Root id**: `com-wsu-glossary-pivot`
- **Version constant**: `GlossaryPivotViz.VERSION = "0.14.0"` (see `CHANGELOG.md`)
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-glossary-pivot/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-glossary-pivot.zip`

Versions on this plugin are independent of the 1.x line shared by the other
five visualizations. Do not renumber it to match them.

### What WSU Glossary Pivot is
A pivot table whose column and row headers show a business-glossary
description on hover. It is the pivot people already use (rows, columns,
values, totals, sort, hide a grouping field) with that description attached.
It is not a reimplementation of every native-pivot command.

### Capabilities at a glance
- **Glossary tooltip on headers** — hover or keyboard-focus a header. The
  description comes from OAC's column-info map when that map has one, and
  from a small bundled field dictionary otherwise. The badge says which.
- **Rows, Columns, Values** — up to 5 categorical fields on Rows, 5 on
  Columns, 20 measures on Values. Measure names render as their own column
  header layer.
- **Click-to-sort** — one header at a time, ascending then descending then
  off. Session-only. Original row indexes are kept for marking and collapse.
- **Totals** — grand total row, grand total column (the total of each row),
  and outer-group row subtotals. Each is a sum of the numbers on screen.
  Default off.
- **Row-group collapse** — with 2 or more Row fields, collapse the outer
  group to one summary row. Session-only.
- **Row marking** — click a row header or a value cell to mark that source
  row for cross-filtering. Incoming marks highlight rows.
- **Number format** — one global switch, plus a per-measure text override.
  Auto shows the text OAC already formatted.
- **Hide and rename** — a field can stay in the query (so order and groups
  still follow it) and be omitted from the drawing. A display label changes
  the field title, not the member values and not the glossary lookup.
- **Header colors and a per-measure heat map** — hex text fields. Empty
  header hex keeps the stylesheet gray. Heat map defaults off.
- **Print PDF** — a button on the pivot opens the browser print dialog
  on the table alone. The button is not on the pages. Set the title and
  page orientation in properties. Totals follow the total switches already
  on the pivot.
- **Print Canvas** — a second button next to Print PDF. Prints every
  print-capable visualization currently on the same canvas — this plugin
  and WSU Report Print — as one document, one table per visualization, in
  canvas position order, not just this pivot. See §3a.
- **Property panel** — every gadget is on the General tab. Labels are
  English literals. Viewer strings (empty state, tooltip badges, "Total")
  come from `nls/root/messages.js`.

### Confirmed on the tenant
On oac.wsu.edu, 2026-09-22:

- Subject Area and Dataset descriptions are read from `_info.desc`. A
  workbook Calculated Field's Description (Edit Calculation) is read from
  `_info.additionalProperties.customColumnDescription.json.text`. A straight
  `_info.desc` read is empty for a calculated field.
- Per-measure format override, grand total row, and row subtotals were
  exercised. The grand-total column sits to the right; on a wide table it
  is reached by the horizontal scrollbar.
- Header hide and display-label text fields were exercised.

`node --check` on the renderer and `node tests/run.js` from `oac-sdk-dev/`
pass (36 tests). The harness has no layout fixture for this plugin; its NLS
test does cover `glossaryPivotViz.js`. Sections 2–7 of
`../guides/oac_dev_verification.md` have not been recorded for it.

---

## 2. Bucket Layout

Defined in
`extensions/oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-glossary-pivot.visualizationDatamodelHandler.json`.

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `row` | `ROW` / `CATEGORY` | categorical | 0 | 5 | Rows |
| `col` | probed (`COLUMN`, `COL`, or `COLUMNS`) | categorical | 0 | 5 | Columns |
| `measures` | `MEASURES` | measures | 1 | 20 | Values |

`color`, `size`, and `glyph` are `none`. Measure labels are placed on the
physical COLUMN edge so several measures render as sibling columns.

`dataModelGovernor.dm1` is 10 000 rows and 500 columns. `isMarkingSupported`
is true.

The logical name of the column edge is not listed in Oracle's public
`datamodelshapes` JSDoc. `glossaryPivotVizdatamodelhandler.js` tries
`COLUMN`, then `COL`, then `COLUMNS`, logs the hit, and maps that member
onto physical `COLUMN`. If none of those exist, the Columns tray does not
map and the log says so. Do not replace that probe with a hardcoded name
without a tenant log that shows the member.

The root id and `viz:chart.type` are both `com-wsu-glossary-pivot`. Changing
either makes uploaded workbooks lose the visualization.

---

## 3. Glossary

Built on first render and refreshed from the live column-info map on every
full render (`mergeLive`). `_doInitializeComponent` does not build it; there
is no data yet. A sort click or a collapse toggle redraws the table without
re-reading the map.

Lookup key, in order:

1. Workbook override: `[id]._info.additionalProperties.customColumnDescription.json.text` (badge **Workbook override**).
2. Live catalog text: `[id]._info.desc` (badge **Live**). This is the same property for a Subject Area column and a Dataset column. The badge does not say "Dataset".
3. `FALLBACK_DESCRIPTIONS` in `glossaryPivotViz.js` (badge **Bundled fallback**).

Within each source, the full column id is tried, then its last path segment,
then the display name. An exact key wins over the same name with ` Attr`
stripped. Live and override text always outrank the bundled map.

`FALLBACK_DESCRIPTIONS` is a column dictionary (field name and business
description), not student rows. It exists because the column-info map is
sometimes empty and the plugin cannot query another dataset. New entries go
in that map, with a comment citing the knowledge-base row. Skip a name that
is used for unrelated columns (the file's note on `AMOUNT` is the example).
See `SECURITY.md`.

A display-label override changes the text in the cell. The tooltip still
looks up the real column id and the original display name.

**Tooltip: Glossary Descriptions** turns the tooltips off. The badge and the
text are still resolved when it is on; an empty result shows no tooltip.

**Debug: Log Column Metadata** prints the live map and the rendering context
to the browser console on every full render. Leave it off. It is how the
three description sources were confirmed.

---

## 3a. Print Canvas

`docs/oac_design.md` §2: a plugin only sees data bound to its own grammar
buckets. There is no OAC API for one visualization instance to read
another's DataLayout, so one plugin cannot build a combined document by
querying its neighbors. Print Canvas works around that without needing one:
`window.__wsuPrintCanvas` is a plain, same-page JS object (not an OAC
mechanism), keyed by `this.getID()`. Every print-capable plugin instance —
this one and WSU Report Print — adds a `{getContainer, build}` entry on
`_doInitializeComponent` and removes it on `_doStopComponent`. `build()`
returns `{title, html}` (or `null`) by calling the SAME fragment-building
path Print PDF already uses for that instance alone
(`_buildPrintFragment`/`buildFragment`); the entry's closure only captures
the instance, so it always reflects current data and Config, not whatever
was true at registration time.

Clicking Print Canvas on either plugin walks every currently registered
entry, sorts them by DOM position (`compareDocumentPosition`, not
registration order, so the printed order matches canvas layout), and joins
each returned fragment into one document with a page break before every
section after the first (`joinPrintSections`). A section whose `build()`
throws, or returns nothing (missing layout, zero columns), is skipped —
one bad visualization does not block the rest of the canvas from printing.
Orientation and the overall document title come from whichever instance's
own Config the click came from; `@page` is document-wide, so there is no
per-section override when two instances disagree.

Not verified on the tenant: whether `iframe.contentWindow.print()` opens a
dialog scoped to the iframe's document across the browsers WSU staff use,
including Safari specifically — same open question as the single-table
Print PDF, now more consequential since a canvas document is larger and
more likely to span pages. See `docs/plugins/project_spec_wsu_report_print.md`.

---

## 4. Config Schema

Saved with the workbook. Session-only state (sort, which groups are
collapsed, which rows are marked) is not in this object.

### Format
| Key | Default | Values |
|-----|---------|--------|
| `numberFormat` | `"auto"` | auto / number / percent / currency / compact |
| `decimalPlaces` | `"auto"` | auto / "0" / "1" / "2" / "3" / "4" |
| `measureFormatOverrides` | `""` | `MEASURE_ID:format:decimals; ...` |

**Auto** shows the string OAC already produced for that cell. **Number**
prints the raw value with a thousands separator (`1,234` or `1,234.50` when
a decimal count is chosen). **Currency** does the same and adds `$`
(`$1,234.00`, sign before the dollar). **Percent** multiplies by 100 and
appends `%`. **Compact** uses K / M / B. A non-numeric cell is left as OAC
rendered it.

The per-measure box wins over the two switches for the named measure. The
token is the measure id, compared in upper case. `CUM_GPA:currency:2` matches
a measure whose id is `CUM_GPA`. The title on the header, such as
`Cumulative GPA`, does not match unless that title is the id. An id that is
not on the pivot is ignored. Format words are lowercase.

### Header
| Key | Default | Values |
|-----|---------|--------|
| `headerLabels` | `""` | `NAME: Display text; ...` |
| `hiddenColumns` | `""` | `NAME; NAME; ...` |
| `headerColor` | `""` | hex for the field-name band (corner and measure names). Empty keeps `#f0f2f4` |
| `headerDataColor` | `""` | hex for column headers whose text is a member value (Fall 2024). Empty keeps the same gray |

Hide and rename match, ignoring case, the column id, the last segment of a
qualified id, and the display name already printed on the table. `Term` and
`STRM` are enough when that is what the header shows. Semicolons separate
entries. A colon in a rename separates the name from the new title; the new
title may contain further colons.

What hide does:

- A **Rows** field drops its header column. Grouping, sort, and collapse
  still use its values, so two groups that share a visible label stay
  separate. If the outer field is hidden, the collapse toggle moves to the
  first visible row field and the collapsed label uses that field. The
  collapse key stays the original outer group's start row.
- A **Columns** field drops that header row. The data columns stay split by
  that field. Hiding the only column layer leaves a blank header row so the
  corner names still line up with the body.
- A **measure** drops its data columns, including from totals and from the
  heat-map scale. A parent header's colspan counts only the columns still
  drawn. The measure-labels layer itself is not hidden as a layer; that
  would remove every measure name.

A rename changes the field title in the corner, on measure headers, and on
a grand-total column label. It does not rename member values.

Header color is painted with CSS variables (`--gp-hdr-bg`, `--gp-hdr-fg`),
same reason as the heat map: the glossary hover rule stays able to cover
the cell. A dark hex uses light text. Hovering a glossary header switches
the label back to dark text on the teal hover fill. An invalid hex paints
nothing.

### Totals
| Key | Default | Values |
|-----|---------|--------|
| `showGrandTotalRow` | `"off"` | on / off — a total row under the table |
| `showRowSubtotals` | `"off"` | on / off — a subtotal under each outer row group. Does nothing with fewer than 2 Row fields |
| `showGrandTotalColumn` | `"off"` | on / off — a column on the right, one total per measure, summing that row. Does nothing when the Columns edge has no layer |
| `rowGroupCollapse` | `"off"` | on / off — collapse toggle on the outer row group. Does nothing with fewer than 2 Row fields |

The three total switches are independent. All three can be on. The
right-hand column is labeled **Grand Total Column** because it is a column;
it is the total of each row. On a wide pivot it is past the horizontal
scrollbar.

Each total is a sum of the raw numbers in the cells it covers. Blank cells
are skipped, not treated as zero. The plugin does not know the measure's
aggregation rule, so the sum is wrong for an average, a ratio, or a GPA.
That is why the default is off and the label is "Total".

A collapsed group is one summary row using the same sum. It does not also
draw a subtotal.

### Style and tooltip
| Key | Default | Values |
|-----|---------|--------|
| `cellColor` | `"off"` | on / off — per-measure heat map on value cells |
| `cellColorLow` | `"#eff6ff"` | hex at the measure's minimum |
| `cellColorHigh` | `"#1e3a8a"` | hex at the measure's maximum |
| `showDescriptions` | `"on"` | on / off |
| `showSourceBadges` | `"off"` | on / off — Live and Workbook override chips. Bundled fallback still shows |
| `showHeaderUnderline` | `"off"` | on / off — dotted underline on headers that have a description. Tooltip, hover, and focus stay either way |
| `tooltipAlign` | `"left"` | left / center / right — text inside the tooltip. The bubble stays centered under the header |
| `showPrintButton` | `"on"` | on / off — the Print PDF bar on the canvas |
| `printTitle` | `"Report"` | title repeated at the top of each printed page |
| `printOrientation` | `"landscape"` | landscape / portrait |
| `debugLogMetadata` | `"off"` | on / off |

Heat-map min and max are per measure, over layout rows, excluding hidden
measure columns and excluding total cells. Colored cells set `--gp-cell-bg`
and `--gp-cell-fg`. Marked rows and row hover still win.

---

## 5. Sort, collapse, and marking

### Sort
Click a corner header (`data-gp-sort="row:<layer>"`) or a column header that
covers exactly one data column (`data-gp-sort="col:<layer>:<dataColumn>"`).
The same target cycles ascending, descending, off. A different target starts
at ascending. Spanning headers and grand-total headers are not targets.
Enter and Space activate the focused header.

With one Row field, the sort is flat. With two or more, a sort on an inner
field or on a measure reorders rows inside each outer group and leaves the
groups in place. Sorting the outer field reorders the groups. Ties break on
the original row index. Blanks, and non-numeric values in a measure sort,
are last in both directions. Two numeric-looking row labels compare as
numbers.

Rowspans are computed from neighbors in the sorted buffer. `getItemEndSlice`
describes the host's order and is not used after a reorder. Duplicate
visible labels do not merge across groups: the comparison includes the
outer group and the values of the layers above the cell.

### Collapse
`_collapsedGroups` is keyed by the outer group's original start index, not
by the label. Two groups with the same text collapse separately. State is
not reset in `_doInitializeComponent`; a new instance starts empty, and a
saved workbook opens uncollapsed.

The toggle is the arrow, not the rest of the cell. A click on the arrow
does not mark the row.

### Marking
Outgoing marks use `setMark(layout, DATA, row, column)` with the original
layout row. `data-gp-mark-rows` is `start:end` when the indexes are a
contiguous set, and a comma list when a sort has separated them. Incoming
marks are applied per row. `_applyMarkedRows` highlights `tr[data-gp-row]`.

---

## 6. Property panel

All gadgets are added to General. Switchers carry an order index; text
fields and toggles appear in the order they are added.

| Gadget id | Label | Control |
|-----------|-------|---------|
| `numberFormatGadget` | Format: Number Format | switcher |
| `decimalPlacesGadget` | Format: Decimal Places | switcher |
| `measureFormatOverridesGadget` | Format: Per-Measure Override (id:format:decimals; ...) | text |
| `headerLabelsGadget` | Header: Display Label (id: label; ...) | text |
| `hiddenColumnsGadget` | Header: Hidden Columns (id; id; ...) | text |
| `showGrandTotalRowGadget` | Totals: Grand Total Row | toggle |
| `showRowSubtotalsGadget` | Totals: Row Subtotals (2+ Row layers) | toggle |
| `showGrandTotalColumnGadget` | Totals: Grand Total Column | toggle |
| `rowGroupCollapseGadget` | Totals: Row Group Collapse (2+ Row layers) | toggle |
| `cellColorGadget` | Style: Cell Color (heat map) | toggle |
| `cellColorLowGadget` | Style: Cell Color Low (hex) | text |
| `cellColorHighGadget` | Style: Cell Color High (hex) | text |
| `headerColorGadget` | Style: Header Color (hex) | text |
| `headerDataColorGadget` | Style: Header Data Color (hex) | text |
| `showDescriptionsGadget` | Tooltip: Glossary Descriptions | toggle |
| `showSourceBadgesGadget` | Tooltip: Source Badges (Live / Workbook) | toggle |
| `showHeaderUnderlineGadget` | Tooltip: Underline Headers | toggle |
| `tooltipAlignGadget` | Tooltip: Text Align | switcher |
| `showPrintButtonGadget` | Print: Show Button | toggle |
| `printTitleGadget` | Print: Report Title | text |
| `printOrientationGadget` | Print: Page Orientation | switcher |
| `debugLogMetadataGadget` | Debug: Log Column Metadata (Console) | toggle |

The panel cannot list the fields on the viz. Hide, rename, and the
per-measure override are text for that reason (`../oac_design.md` §2 and
§6.10). For hide and rename, type the name already printed on the table.
For the format override, type the measure id.

Gadget ids are the Config keys' partners. Do not rename them; saved
workbooks store values by these ids through `_handlePropChange`.

There is no color-picker gadget in this family. Header and heat-map colors
are hex strings, the same pattern as the other plugins.

---

## 7. Files

```
com-wsu-glossary-pivot/
  glossaryPivotViz.js
  glossaryPivotVizdatamodelhandler.js
  glossaryPivotVizstyles.css
  glossaryPivotVizIcon.png
  nls/messages.js
  nls/root/messages.js
  extensions/
    oracle.bi.tech.plugin.visualization/com-wsu-glossary-pivot.json
    oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-glossary-pivot.visualizationDatamodelHandler.json
```

The renderer is `glossaryPivotViz.js`, not `wsu*.js`. The NLS check in
`oac-sdk-dev/tests/run.js` selects the top-level JS file that is not the
datamodel handler. Do not put that filter back to `wsu*.js`.

CSS classes use the `gp-` prefix. They are not wrapped in a single root
class (`../oac_design.md` §6.12). Two Glossary Pivots on one canvas will
share those rules. Left that way on purpose; a rename has to cover every
selector and the HTML the renderer emits.

Renderer code is ES5 (`var`, `function`). The AMD dependency list must stay
inside `tests/lint.js`'s allowlist. `obitech-report/visualization` is
forbidden; this plugin uses `obitech-report/datavisualization`.

### Not in this plugin
Column-group collapse, sorting by more than one column, a manual column
order, a conditional-format rule builder, and native drill, include,
exclude, and export. Print PDF and Print Canvas (§3a) are the browser print
dialog on a document this family builds itself, opened from a button — not
the host's own canvas PDF export. The host already supplies the Filters
shelf and the visualization title; this plugin does not add a filter bucket.

---

## 8. Check before packaging

```powershell
cd oac-sdk-dev\src\customviz\com-wsu-glossary-pivot
node --check glossaryPivotViz.js
node --check glossaryPivotVizdatamodelhandler.js
Get-Content extensions\oracle.bi.tech.plugin.visualization\com-wsu-glossary-pivot.json -Raw | ConvertFrom-Json
Get-Content extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\com-wsu-glossary-pivot.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json
cd ..\..\..\..
node tests\run.js
.\build-sdk.ps1
```

The zip to upload is
`oac-sdk-dev\build\distributions\customviz_com-wsu-glossary-pivot.zip`.
Source edits are not in that zip until this build runs.
