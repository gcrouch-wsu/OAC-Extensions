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
- **Version constant**: `GlossaryPivotViz.VERSION = "0.17.0"` (see `CHANGELOG.md`)
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
  description comes from a workbook-level override (e.g. a Calculated
  Field's Description) or from OAC's live column-info map; a column with
  neither has no tooltip. (Through 0.15.x, a third, lowest-priority tier —
  a hardcoded dictionary of 16 Student Data Warehouse columns — filled in
  when both were missing; removed in 0.16.0 as unmaintainable. See §3.)
- **Rows, Columns, Values** — up to 5 categorical fields on Rows, 5 on
  Columns, 20 measures on Values. Measure names render as their own column
  header layer.
- **Click-to-sort** — one header at a time, ascending then descending then
  off. Session-only. Original row indexes are kept for marking and collapse.
- **Totals** — grand total row, grand total column (the total of each row),
  and outer-group row subtotals. Default off. Each measure totals by its
  rule in Totals: Measure Rules — sum (default), avg, min, max, none,
  weighted(W), or ratio(N, D) — so a rate totals as sum(numerator) /
  sum(denominator). Under Auto format a total copies its column's look.
- **Layout** — horizontal and vertical alignment for row headers, column
  headers, and values; header and body text wrapping at spaces only (never
  inside a word); value column width, per-column widths, and table width
  (fill, content, fixed px).
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
  on the table alone. The button is not on the pages. Set the title, page
  orientation, margin, and table width in properties. Totals follow the
  total switches already on the pivot. A table too wide for the page is
  reduced from 9pt only as far as 6pt. A still-over-wide table remains
  over-wide for its designer to correct (never CSS zoom — see §3a). Print
  always opens from a hidden `<iframe>`; no visible tab or
  popup is ever created, only the native print dialog.
- **Print Canvas** — a second button next to Print PDF. Prints every
  WSU Glossary Pivot currently on the *active* canvas tab as one document
  (not other WSU plugins or native OAC visuals),
  one table per visualization, in canvas position order. Print: Canvas
  Page Breaks chooses one page per report (default) or a compact document
  that minimizes blank space. See §3a.
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

On the WSU **dev** tenant (`wsuaacdevoac-wsucloud.analytics.ocp.oraclecloud.com`,
not production oac.wsu.edu), 2026-09-23, Print Canvas specifically:

- Live-verified the `isOnActiveCanvas` occlusion fix (§3a) against the
  actual DOM: on the canvas tab with three stacked reports, the old
  clamped test point for the tallest report (`top=799, height=247` against
  a measured `vh=855`) resolved to
  `bi_reporttoolbar_environment_footer_container`; the corrected,
  visible-slice-top test point resolved to a `<th>` inside that report's
  own table. Confirmed the true fix target, not assumed.
- Measured the live "Subject Area" table's natural width (1958px) and
  computed its real `fitScale` result outside the browser
  (`node -e ...` against `tests/harness.js`): 0.368 in portrait, 0.49 in
  landscape — both below the 6pt font floor, so this specific table's
  header text still shrinks to the floor rather than the ideal scale (see
  §3a's font-size caveat).
- Not yet re-verified after the rebuild that carries these two fixes
  (0.14.15) — the tenant was still running 0.14.14 at last check; needs a
  re-upload and a hard reload (Ctrl+Shift+R; a plain refresh does not bust
  the cached AMD module) before Print Canvas is exercised again end to end.

For 0.15.0 on the dev tenant, 2026-09-24, the active tab and panel
relationship was inspected without modifying the workbook. The selected tab
ID was `insightComponentManager_197-tabitem-snapshot!canvas!1` or
`...canvas!3`; its panel ID was the manager ID plus `-canvas!1` or
`-canvas!3`. The selected panel was visible and the inactive panel used
`display:none` at inspection time. The panel-based selector follows this
observed structure and checks visibility, without a viewport hit test.
This verifies the selector's premise, not an uploaded 0.15.0 build or a
printed PDF. Safari and Firefox output remain unverified.

`node --check`, `node tests/run.js`, and `node tests/lint.js` pass locally
for 0.15.0 (60 Node tests). The tests include registry filtering, font-fit
floor and overflow, print-frame lifecycle stubs, format validation, stale
render/metadata and marking, and basic accessibility markup. They do not
replace browser print and PDF inspection. Sections 2–7 of
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

A column with neither has no tooltip: no badge, no dotted underline, no
`gp-has-desc` class — it renders exactly like a column that was never in
any description source.

Within each source, the full column id is tried, then its last path segment,
then the display name. An exact key wins over the same name with ` Attr`
stripped. Override always outranks live.

**Removed in 0.16.0, at the data team's request: a third, lowest-priority
tier.** `FALLBACK_DESCRIPTIONS` was a hardcoded dictionary (field name and
business description for 16 Student Data Warehouse columns — `STRM`,
`CUM_GPA`, `ACAD_PROG`, and 13 others — sourced from the WSU Reporting
knowledge base, captured 2026-09-22) used only when a column had neither
override nor live text, badged **Bundled fallback**. Removed because a
copy of glossary text hand-maintained inside the renderer's own source,
disconnected from the real data dictionary it was captured from, is not
maintainable: nothing forces it to be re-checked as the source dictionary
changes, and the badge was the only signal to a viewer that the text might
be stale. If a column that used to show bundled text now needs a tooltip,
add the description as a workbook override (Calculated Field, or ask OAC's
catalog owner to add/fix `_info.desc` at the source) rather than
reintroducing a bundled copy — see `SECURITY.md`, which carried a reviewed
exception for this dictionary specifically and no longer needs to.

A display-label override changes the text in the cell. The tooltip still
looks up the real column id and the original display name.

**Tooltip: Glossary Descriptions** turns the tooltips off. The badge and the
text are still resolved when it is on; an empty result shows no tooltip.

**Debug: Log Column Metadata** prints the live map's column ids and each
resolved description's origin label to the browser console on every full
render — never cell/row values. Leave it off. It is how the two
description sources were confirmed.

---

## 3a. Print Canvas

`docs/oac_design.md` §2: a plugin only sees data bound to its own grammar
buckets. There is no OAC API for one visualization instance to read
another's DataLayout, so one plugin cannot build a combined document by
querying its neighbors. Print Canvas works around that without needing one:
`window.__wsuPrintCanvas` is a plain, same-page JS object (not an OAC
mechanism), keyed by `printCanvasKey(self, "gp-")` — `"gp-" + getID() +
"-" + a random suffix`, stored on the instance as `this._wsuPrintKey` so a
repeat registration overwrites the same entry instead of accumulating
duplicates. Every entry is `{getContainer, build}`. `build()` returns
`{title, html, printTableSize, printOrientation}` (or `null`); `html` is the
table that instance's own Print PDF would place in the document — the pivot
expands rowspans and stamps its title inside `build()`. The closure captures
the instance, so `build()` reflects current data and Config. This is a
Glossary Pivot registry, not a general OAC canvas-export API: other WSU
plugins and native OAC visuals are not included.

**Registration fires from two places**, both calling
`_registerPrintCanvas()`: `_doInitializeComponent`, and unconditionally at
the top of `_doRender`, before any of its own early-return checks.
Confirmed on the tenant: `_doInitializeComponent` does not reliably fire
for every canvas-tab instance (no error logged either), while `_doRender`
does. Registration is idempotent (same key, entry replaced), so calling it
from both costs nothing when `_doInitializeComponent` did fire.
Deregistered in `_doStopComponent`
(`delete window.__wsuPrintCanvas[this._wsuPrintKey]`).

**Only the active canvas tab prints.** A canvas the viewer switched away
from can stay registered without having stopped. Earlier tenant states
stacked inactive panels at the same coordinates, so geometry and viewport
intersection alone were insufficient. The selector matches the clicked
pivot's panel to its selected tab, then accepts only connected entries
within that panel whose ancestor tree is not hidden, `display:none`,
`visibility:hidden/collapse`, `aria-hidden`, or `inert`. Off-screen active
tables remain eligible. An unreadable/detached container is skipped. If
the clicked pivot has no recognized panel, only that pivot prints; there
is no fail-open to all registered entries.

**"Is this tab selected" is read from `data-bi-item-id`, not the tab's own
DOM id.** OAC hosts the canvas tabs in two different widgets depending on
context, confirmed live on the dev tenant 2026-09-24: the read/view host
(`insightComponentManager_N`) ids its selected tab
`<mgr>-tabitem-snapshot!<suffix>`; the in-editor host
(`canvasComponentManager_N` — live for the entire time a property panel is
open, and for Preview/Run entered from the editor, not just a transient
state) ids the same tab `<mgr>-tabitem-<suffix>`, with no `snapshot!`
infix. A selector that only matched the first template made every Print
Canvas click taken while editing properties, or after Preview/Run, see
zero selected tabs and fail closed — "No tables on this canvas could be
printed" — even though the clicked panel was genuinely the one on screen.
Confirmed live: a plain page reload does not clear this, because it
revisits the same URL (editor mode, if that was the URL's state); only
fully leaving the report and reopening it resets to the read-mode host.
Fixed in 0.15.1 by reading `data-bi-item-id` off the selected tab, which
is `<suffix>` on the editor host and `snapshot!<suffix>` on the read
host — a stable value across both — instead of reconstructing the tab's
own id string. If a host ever omits `data-bi-item-id`, the original id
template is the fallback, not a fail-open. If OAC changes either
convention, Print Canvas may print nothing rather than risk mixing
inactive tabs; re-inspect both hosts' live DOM before altering the
selector again.

Clicking Print Canvas walks the filtered entries, sorts by panel-relative
top then left position (DOM order breaks ties), and joins each fragment
into one document (`joinPrintSections(tableHtmls, forceBreaks)`). A
section whose `build()` throws, or returns nothing (missing layout, zero
columns), is skipped — one bad visualization does not block the rest of
the canvas from printing. `forceBreaks` is
`Config.printCanvasSpacing === "perReport"`: when true, a page break is
set directly on each `<table>` element's own `style` attribute (not a
wrapping `<div>` — a wrapper div was producing blank pages and splitting a
header from its own table in Chrome's print layout); when false
("compact"), sections are concatenated with no break at all. Orientation
and the overall document title come from the clicked instance; `@page` is
document-wide, so there is no per-section override when two instances
disagree. A mixed-orientation canvas prints with the clicked instance's
orientation and receives a nonblocking warning. Each table's own Table
Width setting is carried separately.

**A too-wide table is fit only to a readability limit.** `fitScale` and
`printTableLayout` provide a capped initial estimate. `fitPrintedReport`
measures the natural width in an automatic-layout table, reduces its font
from 9pt in 0.1pt steps, and remeasures, stopping at 6pt. It never forces
an over-wide table into `table-layout: fixed`. If the table still exceeds
the page content width at 6pt, it retains natural width and printing
proceeds — confirmed live against the actual "Subject Area" Headcount
table (genuinely ~47% over the landscape/narrow-margin content width at
6pt, not a measurement bug). The viewer sees a **readability advisory**,
not an error: `PRINT_OVERFLOW`'s text says the table printed and remains
wide at the readability floor, and the `.gp-printerr` element gets a
`gp-printnote` class that overrides its default red with a neutral gray
(`glossaryPivotVizstyles.css`), so a genuine failure (no tables, print
blocked) still reads as an error and this does not. This plugin never
clips the table itself to avoid the message — whether Chrome's print
dialog additionally auto-scales the page to avoid visible clipping is a
host/browser behavior outside this code's control and was not confirmed
either way as of 0.15.1; the wording was chosen to be accurate regardless
of that answer (it does not claim the print will fail). A table that fits
uses its own content width or fills the margins according to that
section's `printTableSize`.
CSS `zoom`/`transform: scale`/`filter`/`opacity` are never applied to
printed content: Chrome's PDF printer rasterizes a zoomed/transformed page
into one image, and Adobe Acrobat then reports that PDF as a scanned
document. `font-size` is the one sizing lever that keeps a real text
layer.

**Print surface**: `openGlossaryPrint` always uses a hidden, off-screen
`<iframe>` (`left:-12000px`), never `window.open()`. A visible tab or a
chromeless popup were both tried and rejected — the only surface the
viewer should ever see is the native print dialog itself. The iframe is
sized to the page's content width, then its height is set to the greater
of one page's height or the document's actual measured
`scrollHeight`, so a multi-page Print Canvas document is not clipped to a
single page. Cleanup attaches before `print()`, is idempotent on
`afterprint`, removes the frame on component stop or an exception, and
holds rapid repeat clicks. If an engine omits `afterprint`, another click
can recover only after 30 seconds; this is not a blind removal timer.

Not verified on the tenant: whether `iframe.contentWindow.print()` opens a
dialog scoped to the iframe's document across the browsers WSU staff use,
including Safari specifically — same open question as the single-table
Print PDF, now more consequential since a canvas document is larger and
more likely to span pages.

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
token is matched against the measure's real id first — `CUM_GPA:currency:2`
matches a native measure whose id is `CUM_GPA`; the header title does not
match unless that title happens to be the id. **If the id doesn't match,
the token is tried again against the measure's display title** (0.17.0:
also the last segment of a qualified id, the same `nameKeys` order hide and
rename use; format words are case-insensitive with aliases `percentage`,
`pct`, `usd`, `dollar(s)`, `numeric`; entries parse from the right so a
name may contain a colon; rejected entries are logged) — confirmed
live to be necessary for a calculated measure: OAC gives a calculated
measure (Full-Time, a workbook ratio calc, ...) a real, non-null raw id,
but an opaque, auto-generated one ("c34") that is never shown anywhere in
the UI, so an author can only ever type what they can see — the printed
header text — not that id. `resolveFormat` tries the id, then the title,
so `Full-Time:number:0` matches a calculated measure titled "Full-Time"
even though its real id is something else entirely. An id/title that
matches neither is ignored. Format words are lowercase and must be one of
the documented values; decimals must be `auto` or `0`–`4`. Malformed
per-measure entries are ignored rather than breaking the whole pivot. This
took two attempts to diagnose correctly — see CHANGELOG.md's 0.16.2 entry,
which corrects 0.16.1's initial (wrong) diagnosis that the id came back
null; it does not, it is simply opaque.

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
  collapse key stays the original outer group's start row. If every Row
  field is hidden, the display shows detail rather than an aggregate with
  no visible control to expand it.
- A **Columns** field drops that header row. The data columns stay split by
  that field. Hiding the only column layer leaves a blank header row so the
  corner names still line up with the body.
- A **measure** drops its data columns, including from totals and from the
  heat-map scale. A parent header's colspan counts only the columns still
  drawn. The measure-labels layer itself is not hidden as a layer; that
  would remove every measure name. `columnListed` (the function `colHidden`
  calls) already matches by id or by display name (`nameKeys`), so hiding a
  calculated measure by its printed title works the same way renaming one
  does — this was checked directly against the live tenant and confirmed
  correct, not assumed; see CHANGELOG.md's 0.16.2 entry, which corrects an
  0.16.1 claim that this was broken.

A rename changes the field title in the corner, on measure headers, and on
a grand-total column label. It does not rename member values.

Header color is painted with CSS variables (`--gp-hdr-bg`, `--gp-hdr-fg`),
same reason as the heat map: the glossary hover rule stays able to cover
the cell. Text is chosen as black or white by contrast with the hex.
Hovering a glossary header switches
the label back to dark text on the teal hover fill. An invalid hex paints
nothing.

### Totals
| Key | Default | Values |
|-----|---------|--------|
| `showGrandTotalRow` | `"off"` | on / off — a total row under the table |
| `showRowSubtotals` | `"off"` | on / off — a subtotal under each outer row group. Does nothing with fewer than 2 Row fields |
| `showGrandTotalColumn` | `"off"` | on / off — a column on the right, one total per measure, summing that row. Does nothing when the Columns edge has no layer |
| `rowGroupCollapse` | `"off"` | on / off — collapse toggle on the outer row group. Does nothing with fewer than 2 Row fields |
| `totalRules` | `""` | `NAME = rule; ...` — rule is `sum`, `avg`, `min`, `max`, `none`, `weighted(W)`, or `ratio(N, D[, scale])`. Unlisted measures sum |

The three total switches are independent. All three can be on. The
right-hand column is labeled **Grand Total Column** because it is a column;
it is the total of each row. On a wide pivot it is past the horizontal
scrollbar. One total per measure means one per bucket from
`bucketColsByMeasure` (§4 Format), keyed by each measure's own raw id —
including a calculated measure's, which is real (just opaque, not the
kind of id an author would type) and therefore already distinct per
measure. Confirmed live: a workbook mixing native and calculated measures
correctly produced separate ids per measure, so this was not found to be
broken; see CHANGELOG.md's 0.16.2 entry, which corrects an 0.16.1 claim
that calculated measures shared one bucket here.

Each total is computed from the raw numbers in the cells it covers, by that
measure's rule. Blank cells are skipped, not treated as zero. The plugin
does not know the measure's server-side aggregation and cannot ask OAC for
a server total (a custom visualization receives only the cells in its
buckets), so the default rule is sum, which is wrong for an average, a
ratio, or a GPA. Name the rule for those measures:

- `weighted(W)` — sum(value × W) / sum(W) over the covered cells, pairing
  each cell with measure W's cell under the same Columns members. With W
  the rate's denominator this is exactly sum(numerator) / sum(denominator),
  and it keeps the column's own scale (89.14 or 0.8914). Needs only the
  denominator on the pivot. Example: `% Full-Time = weighted(Headcount)`.
- `ratio(N, D)` — sum(N) / sum(D), times an optional third argument
  (`ratio(Full-Time, Headcount, 100)` for a column shown as 89.14). The
  rate's own cells are not used.
- `avg` — the mean of the covered cells (the native report-based average).
  `min`, `max`, `none` (blank) are also accepted. Rule words and measure
  names are case-insensitive; names match like hide and rename.

A referenced measure must be in the query; it can be hidden with Header:
Hidden Columns. A rule naming a measure that is not on the pivot leaves the
total blank (never a wrong sum) and logs a warning. The same rule drives
the grand total row, subtotals, collapsed-group rows, and the Grand Total
Column (across a measure's columns). Checked against the data team's IPEDS
2026 Spring screenshot: weighted(Headcount) gives 86.29 for % Full-Time
and 54.37 for % Female, matching the native pivot.

Under Auto format a total has no OAC string of its own, so it copies the
look of its column's first formatted cell: prefix (`$`), suffix (`%`),
whether OAC multiplied by 100, decimals, and thousands grouping. With no
sample it prints the number with grouping and float noise trimmed. An
explicit format (Number, Percent, ...) applies as it does to cells.

A collapsed group is one summary row using the same sum. It does not also
draw a subtotal.

### Style and tooltip
| Key | Default | Values |
|-----|---------|--------|
| `cellColor` | `"off"` | on / off — per-measure heat map on value cells |
| `cellColorLow` | `"#eff6ff"` | hex at the measure's minimum |
| `cellColorHigh` | `"#1e3a8a"` | hex at the measure's maximum |
| `showDescriptions` | `"on"` | on / off |
| `showSourceBadges` | `"off"` | on / off — Live and Workbook override chips |
| `showHeaderUnderline` | `"off"` | on / off — dotted underline on headers that have a description. Tooltip, hover, and focus stay either way |
| `tooltipAlign` | `"left"` | left / center / right — text inside the tooltip. The bubble stays centered under the header |
| `showPrintPdf` | `"off"` | on / off — Print PDF on this visualization. Off until switched on |
| `showPrintCanvas` | `"off"` | on / off — Print Canvas. Turn on for one visualization on the canvas |
| `printOrientation` | `"landscape"` | landscape / portrait |
| `printMargin` | `"normal"` | narrow (0.25 in) / normal (0.5 in) / wide (1 in) — `@page` margin, repeated on every page |
| `printTableSize` | `"margins"` | margins / content — margins fills the page width when it fits; content keeps the table at its own header-driven width. Both use automatic layout and the 6pt floor for wide tables (§3a) |
| `printCanvasSpacing` | `"perReport"` | perReport / compact — Print Canvas only. perReport forces a page break before every table after the first; compact concatenates every table with no break, minimizing blank space |
| `printFollowTheme` | `"on"` | on / off — print buttons use the host accent color. Off keeps the fixed green |
| `debugLogMetadata` | `"off"` | on / off |

Heat-map min and max are per measure, over layout rows, excluding hidden
measure columns and excluding total cells. Colored cells set `--gp-cell-bg`
and `--gp-cell-fg`. Marked rows and row hover still win. "Per measure"
means per bucket from the same `computeMeasureIdByCol` used for per-measure
format overrides and the Grand Total Column (§4 Format) — a calculated
measure's real (if opaque) id keeps its heat-map range separate from every
other measure's, the same as a native measure's; see CHANGELOG.md's 0.16.2
entry, which corrects an 0.16.1 claim that calculated measures shared one
range here.

### Layout
| Key | Default | Values |
|-----|---------|--------|
| `rowHeaderAlign` / `rowHeaderVAlign` | `"left"` / `"middle"` | left / center / right; top / middle / bottom — row labels, the corner field names, total labels |
| `colHeaderAlign` / `colHeaderVAlign` | `"center"` / `"middle"` | column headers (members and measure names) |
| `valueAlign` / `valueVAlign` | `"right"` / `"middle"` | value and total cells |
| `wrapHeaders` | `"off"` | on / off — wrap header text |
| `wrapCells` | `"off"` | on / off — wrap row labels and values |
| `columnWidth` | `""` | px for every value column; blank is automatic |
| `columnWidths` | `""` | `NAME: px; ...` — a measure or a Rows field; wins over `columnWidth` |
| `tableWidth` | `"fill"` | fill (stretch to the tile, the old behavior) / content / fixed |
| `tableWidthPx` | `""` | px for `fixed`; a blank or invalid value falls back to fill |

Alignment is emitted as CSS custom properties on the `<table>` (`--gp-rh-align`
and so on), read by the stylesheet and by the print document, so print
follows the same settings. Widths are `<col>` elements in a `<colgroup>`,
emitted only when a width is set; 20–4000 px is accepted.

**Wrapping never breaks inside a word.** On-screen text stayed `nowrap`
until 0.17.0 because an earlier print path split words. Wrapped text uses
`white-space: normal; word-break: normal; overflow-wrap: normal; hyphens:
manual` with automatic table layout, so no column is narrower than its
longest word; a width smaller than that word leaves the column at the
word's width. Browsers also break after a hyphen or slash, so each label
run containing one (`Full-Time`) is wrapped in `span.gp-nobr` (nowrap),
and a lone `%`, `#` or `$` is joined to the next word with a no-break
space (`labelHtml`). Checked in headless Chrome with the screenshot's
headers at 40px and 90px: no word split. The print stylesheet dropped
`overflow-wrap: break-word` for the same reason; a table still too wide
at 6pt runs past the margin with the overflow advisory.

---

## 5. Sort, collapse, and marking

### Sort
Click a corner header (`data-gp-sort="row:<layer>"`) or a column header that
covers exactly one data column (`data-gp-sort="col:<layer>:<dataColumn>"`).
The same target cycles ascending, descending, off. A different target starts
at ascending. Spanning headers and grand-total headers are not targets.
Enter and Space activate the focused header. Sort targets are in the tab
order and expose `aria-sort`; decorative arrows are hidden from assistive
technology. Glossary tooltip text is associated with its focused header.

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

The toggle is a named native button with `aria-expanded`, not the rest of
the cell. Activating it does not mark the row. Focus is restored to the
replacement toggle after the table is rebuilt.

### Marking
Outgoing marks use `setMark(layout, DATA, row, column)` with the original
layout row. Ctrl-click or Command-click extends a mark. One table body row
at a time is keyboard-focusable; Up/Down moves that stop, and Enter/Space
marks its source row (Ctrl/Command extends). `data-gp-mark-rows` is
`start:end` when the indexes are contiguous, and a comma list when a sort
has separated them. Incoming marks are applied per row only for the
current layout/render revision; stale callbacks are discarded.
`_applyMarkedRows` highlights `tr[data-gp-row]`.

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
| `totalRulesGadget` | Totals: Measure Rules (name = sum \| avg \| weighted(W) \| ratio(N, D) \| none; ...) | text |
| `rowHeaderAlignGadget` / `rowHeaderVAlignGadget` | Layout: Row Header Align / Vertical | switcher |
| `colHeaderAlignGadget` / `colHeaderVAlignGadget` | Layout: Column Header Align / Vertical | switcher |
| `valueAlignGadget` / `valueVAlignGadget` | Layout: Value Align / Vertical | switcher |
| `wrapHeadersGadget` | Layout: Wrap Header Text | toggle |
| `wrapCellsGadget` | Layout: Wrap Row and Value Text | toggle |
| `columnWidthGadget` | Layout: Value Column Width (px, blank = auto) | text |
| `columnWidthsGadget` | Layout: Column Widths (name: px; ...) | text |
| `tableWidthGadget` | Layout: Table Width | switcher |
| `tableWidthPxGadget` | Layout: Fixed Table Width (px) | text |
| `cellColorGadget` | Style: Cell Color (heat map) | toggle |
| `cellColorLowGadget` | Style: Cell Color Low (hex) | text |
| `cellColorHighGadget` | Style: Cell Color High (hex) | text |
| `headerColorGadget` | Style: Header Color (hex) | text |
| `headerDataColorGadget` | Style: Header Data Color (hex) | text |
| `showDescriptionsGadget` | Tooltip: Glossary Descriptions | toggle |
| `showSourceBadgesGadget` | Tooltip: Source Badges (Live / Workbook) | toggle |
| `showHeaderUnderlineGadget` | Tooltip: Underline Headers | toggle |
| `showPrintPdfGadget` | Print: Show PDF Button | toggle |
| `showPrintCanvasGadget` | Print: Show Canvas Button | toggle |
| `printOrientationGadget` | Print: Page Orientation | switcher |
| `printMarginGadget` | Print: Margins | switcher |
| `printTableSizeGadget` | Print: Table Width | switcher |
| `printCanvasSpacingGadget` | Print: Canvas Page Breaks | switcher |
| `printFollowThemeGadget` | Print: Follow Theme | toggle |
| `tooltipAlignGadget` | Tooltip: Text Align | switcher |
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
