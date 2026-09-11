# WSU Dumbbell — Plugin Reference

Canonical reference for the **WSU Dumbbell** custom visualization
(`com-wsu-dumbbell`). Read this plus `../oac_design.md` to pick up WSU Dumbbell
development or fork it without re-deriving design decisions.

---

## 1. Overview

### Identity
- **Display name**: WSU Dumbbell
- **Short name**: WSU Dumbbell
- **Category**: WSU
- **Root id**: `com-wsu-dumbbell`
- **Version constant**: `WsuDumbbellViz.VERSION = "1.0.1"` (see `CHANGELOG.md`)
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-dumbbell/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-dumbbell.zip`

### What WSU Dumbbell is
A paired-value dumbbell chart for comparing two measures per entity
(pre/post, first/second, before/after). Connector lines pair the two
endpoints; endpoints can be circles or other shapes. Designed for
educational and operational dashboards where the *change* between two
values per entity is the primary signal.

### Capabilities at a glance
- **Wide and long data shape support** — accepts either 2 measures per
  row (wide) or 1 measure with a `Pair role` field (long); see
  `../oac_design.md` §6.22.
- **Bucket-driven Sort/Filter UI** — drop attributes into the Sort By and
  Filter By buckets to populate in-chart `<select>` strips for viewer-side
  control without opening the property panel; see `../oac_design.md` §6.21.
- **Three color modes** — Endpoint (first/second), Group (by Color
  bucket), or Direction (improve/worse/same).
- **`d3.symbol()` endpoint shapes** — Circle / Square / Triangle /
  Diamond / Cross / Star with matching legend markers.
- **Connector pattern** — Solid / Dashed / Dotted / Dash-Dot with
  width-scaled dasharray.
- **View modes** — Individuals (one dumbbell per entity), Group Aggregate
  (one dumbbell per group with mean/median/sum/min/max), or Small
  Multiples (one panel per group).
- **X / Y / X+Y drag-to-zoom** — drag horizontally for entity range, Y
  for value range, rectangle for both. Esc cancels, double-click resets,
  Reset Zoom button appears after zoom.
- **Brush-select rows** — alternative drag mode for marking entities by
  range; brush wins over zoom when both are configured.
- **Tooltip Show toggles** — eight switchers (Category / First Value /
  Second Value / Δ / Δ% / Direction / Group / Count) for full per-row
  control. Tooltip details are categorical-only authored fields; if a
  measure-like value belongs there, expose it upstream as a formatted
  attribute.
- **Reference lines and annotations** — text-field configured
  (`Value:Label, Value:Label, ...`).
- **Stats summary bar** — Up / Flat / Down / Avg Δ / Large drops counts
  above the chart.
- **Color Source switcher** — defaults to OAC Theme; Custom Palette mode
  for explicit palette overrides.
- **Number formatting** — auto / number / percent / currency / compact
  with decimal places + prefix/suffix overrides; applied to tooltip
  values, axis ticks, reference line labels, and the stats summary.
- **Long-format role mapping** — Keyword (matches `pre`/`first`/`before`
  vs `target`/`second`/`after`) or Bucket Order. Locale-flexible.
- **Four-tab property panel** — General / Style / Reference / Axis &
  Legend (attempted via custom panel IDs with try/catch fallback to
  General; see `../oac_design.md` §6.14).

---

## 2. Bucket Layout

Defined in
`extensions/oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-dumbbell.visualizationDatamodelHandler.json`.
Bucket schema:

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `measures` | `MEASURES` | measures | 1 | 2 | Value(s) |
| `row` | `ROW` / `CATEGORY` | categorical | 1 | 1 | Category (X-Axis) |
| `item` | `ITEM` | categorical | 0 | 1 | Pair role |
| `color` | `COLOR` | categorical | 0 | 1 | Color (Group) |
| `detail` | `CATEGORY` | categorical | 0 | 10 | Tooltip details |
| `glyph` | `GLYPH` | both | 0 | 10 | Sort By |
| `size` | `SIZE` | both | 0 | 5 | Filter By |

**Wide vs long format**:
- **Wide** (2 measures): each row has both `first` and `second` values in a
  single source row.
- **Long** (1 measure + `Pair role` bucket): two source rows per entity,
  one per role. Role detection uses keyword matching by default
  (`pre`/`first`/`before` → first; `target`/`second`/`after` → second). Set
  `Long Format Role Mapping = Bucket Order` to fall back to row position.

---

## 3. Config Schema (Full Reference)

### View
| Key | Default | Values |
|-----|---------|--------|
| `viewMode` | `"individual"` | individual / groupAverage / smallMultiples |
| `groupAggregation` | `"mean"` | mean / median / sum / min / max |
| `longFormatRoleMapping` | `"keyword"` | keyword / bucketOrder |
| `viewerControls` | `"on"` | on / off |
| `sortBy` | `"original"` | original / first / second / delta / absDelta / `sort-N` |
| `sortDirection` | `"ascending"` | ascending / descending |
| `sortControlPosition` | `"topRight"` | topRight / topLeft / bottomRight / bottomLeft / above / below |
| `sortControlStyle` | `"compact"` | compact / expanded |
| `controlSpacing` | `"default"` | tight / default / loose |
| `jitter` | `"on"` | on / off (when first==second) |
| `performanceMode` | `"auto"` | auto / full |

### Tooltip
| Key | Default | Values |
|-----|---------|--------|
| `tooltipLayout` | `"table"` | table / compact |
| `showSummary` | `"on"` | on / off (stats bar above chart) |
| `showCategory` | `"on"` | on / off |
| `showFirstValue` | `"on"` | on / off |
| `showSecondValue` | `"on"` | on / off |
| `showDelta` | `"on"` | on / off |
| `showDeltaPercent` | `"off"` | on / off |
| `showDirection` | `"off"` | on / off |
| `showGroup` | `"on"` | on / off |
| `showCount` | `"on"` | on / off (only renders when group-aggregated) |

If every built-in tooltip row is disabled and `Tooltip details` is empty, the
tooltip is suppressed instead of rendering an empty shell.

### Format
| Key | Default | Values |
|-----|---------|--------|
| `numberFormat` | `"auto"` | auto / number / percent / currency / compact |
| `decimalPlaces` | `"auto"` | auto / "0" / "1" / "2" / "3" / "4" |
| `valuePrefix` | `""` | text |
| `valueSuffix` | `""` | text |
| `missingMode` | `"hide"` | hide / show / zero |
| `yScale` | `"auto"` | auto / gpa (-1 to 4) |

### Color
| Key | Default | Values |
|-----|---------|--------|
| `colorSource` | `"oac"` | oac / custom |
| `colorMode` | `"endpoint"` | endpoint / group / direction |
| `palette` | `""` (empty) | comma-separated hex |
| `firstColor` | `""` | hex override |
| `secondColor` | `""` | hex override |
| `connectorColor` | `""` | hex override |
| `improveColor` | `"#1b8b3a"` | hex |
| `worseColor` | `"#c62828"` | hex |
| `sameColor` | `"#888888"` | hex |

### Reference
| Key | Default | Values |
|-----|---------|--------|
| `referenceLines` | `""` | `Value:Label, Value:Label, ...` |
| `annotations` | `""` | `Value:Label, Value:Label, ...` |
| `averageLines` | `"off"` | on / off |
| `largeChangeThreshold` | `1` | numeric |
| `highlightOutliers` | `"off"` | on / off |

### Style
| Key | Default | Values |
|-----|---------|--------|
| `dotSize` | `4` | 2–12 (slider). Visual radius; converted to symbol area |
| `lineWidth` | `2` | 1–8 (slider) |
| `linePattern` | `"solid"` | solid / dashed / dotted / dashdot |
| `endpointShape` | `"circle"` | circle / square / triangle / diamond / cross / star |

### Axis & Legend
| Key | Default | Values |
|-----|---------|--------|
| `xLabels` | `"auto"` | auto / off / on |
| `gridlines` | `"on"` | on / off |
| `xAxisTitle` | `""` | text override |
| `yAxisTitle` | `""` | text override |
| `legend` | `"on"` | on / off |
| `legendPosition` | `"auto"` | auto / right / bottom / off |
| `legendMarkerShape` | `"match"` | match / circle / square / triangle / diamond / cross / star |
| `legendMarkerSize` | `8` | 4–14 (slider) |

### Interaction
| Key | Default | Values |
|-----|---------|--------|
| `zoomMode` | `"off"` | off / x / y / xy |
| `brushMode` | `"off"` | on / off (brush wins over zoom) |
| `clickBehavior` | `"single"` | single |

### Label overrides
| Key | Default | Notes |
|-----|---------|-------|
| `entityLabel` | `""` | Tooltip Category row label |
| `firstLabel` | `""` | First measure name override |
| `secondLabel` | `""` | Second measure name override |
| `groupLabel` | `""` | Group field label override |

---

## 4. Property Panel — Four-Tab Layout

Implemented via `gadgetdialog.forcePanelByID` with custom string IDs
(`wsuDumbbellStyle`, `wsuDumbbellReference`, `wsuDumbbellAxisLegend`) and a
try/catch fallback. See `../oac_design.md` §6.14.

**Gadget conventions** (see also `../oac_design.md` §6.24, §6.28):
- Boolean on/off properties (Tooltip Show toggles, Stats Summary,
  Jitter, Avg Lines, Outliers, Gridlines, Legend Show, In-chart
  Controls) render as **checkboxes** (`TEXT_TOGGLE`), not paired text
  buttons. Internal Config still stores `"on"`/`"off"` strings —
  translation at gadget boundary.
- Multi-option choices (Zoom Mode, Brush Select Rows label, Y Scale,
  X Labels, etc.) remain `TEXT_SWITCHER`.
- Numeric ranges are sliders. Text overrides are text fields.

```
GENERAL TAB
  View: Mode (Individuals / Group Aggregate / Small Multiples)   switcher
  View: Group Aggregation (Mean / Median / Sum / Min / Max)      switcher
  View: Long-format Role (Keyword / Bucket Order)                switcher
  Tooltip: Layout (Table / Compact)                              switcher
  Tooltip: Stats Summary Bar                                     ☑ checkbox
  Tooltip: Show Category                                         ☑ checkbox
  Tooltip: Show First Value                                      ☑ checkbox
  Tooltip: Show Second Value                                     ☑ checkbox
  Tooltip: Show Δ                                                ☑ checkbox
  Tooltip: Show Δ%                                               ☑ checkbox
  Tooltip: Show Direction                                        ☑ checkbox
  Tooltip: Show Group                                            ☑ checkbox
  Tooltip: Show Count                                            ☑ checkbox
  Format: Number Format / Decimal Places                         switchers
  Format: Value Prefix / Value Suffix                            text
  Format: Missing Values (Hide / Show / Zero)                    switcher
  Format: Y Scale (Auto / GPA)                                   switcher
  Interaction: Zoom Mode (Off / X / Y / X+Y)                     switcher
  Interaction: Brush Select Rows                                 switcher

STYLE TAB
  Color: Source (OAC Theme / Custom Palette)                     switcher
  Color: Mode (Endpoint / Group / Direction)                     switcher
  Color: Custom Palette / First / Second                         text (hex)
  Color: Improve / Worse / Same overrides                        text (hex)
  Style: Endpoint Shape (Circle / Square / Triangle / etc.)      switcher
  Style: Endpoint Size                                           slider
  Style: Connector Pattern (Solid / Dashed / Dotted / DashDot)   switcher
  Style: Connector Width                                         slider
  Style: Jitter (when first==second)                             ☑ checkbox
  Label: Category / First / Second / Group overrides             text

REFERENCE TAB
  Reference Lines / Annotations                                  text (Value:Label, ...)
  Reference: Show Avg Lines                                      ☑ checkbox
  Reference: Large Change Threshold                              text (numeric)
  Reference: Highlight Outliers                                  ☑ checkbox

AXIS & LEGEND TAB
  Sort: Direction (Ascending / Descending)                       switcher
  Sort: Field                                                    switcher (dynamic)
  Sort: In-chart Controls                                        ☑ checkbox
  Sort: Control Position / Style / Spacing                       switchers
  Axis: X Labels (Auto / On / Off)                               switcher
  Axis: Gridlines                                                ☑ checkbox
  Axis: X Title / Y Title                                        text
  Legend: Show                                                   ☑ checkbox
  Legend: Position / Marker Shape                                switchers
  Legend: Marker Size                                            slider
```

**Where to find Zoom Mode**: General tab, scroll past the nine Tooltip
Show checkboxes and the five Format controls. Labelled
`Interaction: Zoom Mode`.

If the SDK rejects custom panel IDs, every gadget falls back to the
General tab. The label prefixes keep it scannable.

**Plugin runtime services**: WSU Dumbbell uses
`obitech-appservices/logger` (see `../oac_design.md` §6.27) for init and
error logging. All viewer-facing strings are consolidated in the `LBL`
const at the top of `wsuDumbbell.js` (NLS-ready per §6.25).

---

## 5. Built-in Calculations

Per row:

| Field | Formula |
|-------|---------|
| `first` | `parseFloat(value at column 0)` (wide) or measure assigned to first role (long) |
| `second` | `parseFloat(value at column 1)` (wide) or measure assigned to second role (long) |
| `delta` | `second − first` |
| `absDelta` | `abs(delta)` |
| `direction` | "Improved" if `delta > 0`, "Worse" if `< 0`, "Same" if `= 0`, "Incomplete" if either side missing |
| `count` | rows aggregated into this group (only meaningful in `groupAverage` view mode) |

`Group Aggregate` applies active `Filter By` selections before aggregation.
Aggregate rows intentionally do not carry row-level `Tooltip details`; if
aggregate-safe explanatory text is needed, provide it upstream as a field that
is already valid at the displayed aggregate grain.

For Δ% in tooltip (when `showDeltaPercent = on`):
```
Δ% = (delta / first) × 100, displayed as +X.X% / -X.X%
```

---

## 6. Authoring Recipes

### 6.1 Pre/Post comparison with custom calculated columns

Bucket binding:
- **Category**: a per-entity attribute (e.g. `Course`)
- **Value(s)**: two measures (`Pre-test Score`, `Post-test Score`)
- **Color**: optional grouping (e.g. `Cohort`)
- **Tooltip details**: categorical authored fields such as `Status Flag`, or
  upstream formatted attributes when a measure-like value needs to read as
  tooltip text

Property panel:
- `Tooltip: Show Δ%` = On
- `Tooltip: Show Direction` = On
- `Color: Mode` = `direction` (so Improved is green, Worse is red, Same is
  grey)
- `Reference Lines` = `0:No change, 5:Significant gain` (etc.)

### 6.2 Tableau-style minimal tooltip (only show your bucket fields)

- Drop `Date`, `Day of Term`, and any formatted attribute copies you want shown
  in Tooltip details.
- Property panel:
  - `Tooltip: Show Category` = Off
  - `Tooltip: Show First Value` = Off, `Show Second Value` = Off
  - `Tooltip: Show Δ` = Off, `Δ%` = Off, `Direction` = Off
  - `Tooltip: Show Group` = Off, `Show Count` = Off
- Result: tooltip shows only your bucket fields, in bucket order.

### 6.3 Group aggregate with median (instead of mean)

- `View: Mode` = `Group Aggregate`
- `View: Group Aggregation` = `Median`
- Drop `Color (Group)` field.
- Each dot now represents the median first/second of its group; `Count` in
  tooltip shows how many rows aggregated.
- Active `Filter By` selections are applied before the group aggregate is
  computed.
- Row-level `Tooltip details` are intentionally omitted in this mode unless the
  author supplies aggregate-safe fields upstream.

### 6.4 Drag-to-zoom into entity range

- `Interaction: Zoom Mode` = `X (drag horizontally)`
- Confirm `Interaction: Brush Select Rows` = `Off`
- Cursor over chart shows zoom-in.
- Drag horizontally → only entities in selected range remain. Reset Zoom
  button appears top-right; double-click also resets.

### 6.5 Drag-to-mark rows (brush)

- `Interaction: Zoom Mode` = anything
- `Interaction: Brush Select Rows` = `On` (overrides zoom)
- Cursor shows crosshair.
- Drag horizontally → all entities in range get marked. Marks propagate to
  other vizzes on the dashboard via OAC's marking service.

### 6.6 Direction-coded dumbbells

- `Color: Mode` = `Direction (improve/worse/same)`
- Connector + endpoints color by sign of delta.
- Legend shows three swatches; clicking one fades non-matching dumbbells.
- Optionally adjust `Color: Improve / Worse / Same` hex codes.

### 6.7 Control spacing for compact dashboards

- `Sort: Control Spacing` = `Tight` (or `Loose` for breathing room).
- Affects in-chart sort/filter `<select>` strip padding.

---

## 7. Implementation Patterns (cross-references)

WSU Dumbbell uses these patterns from `../oac_design.md`:

| Pattern | Reference |
|---------|-----------|
| Symbol pinning | §6.3 |
| Side-by-side install | §6.2 |
| Tooltip viewport clipping | §6.5 |
| Format-as-Config | §6.7 — `formatValue` / `formatDelta` / `_formatOpts` |
| Missing-data strategy | §6.8 |
| Property panel grouping | §6.9 |
| Cached dataset meta | §6.10 — drives the Sort Field dropdown |
| CSS namespacing | §6.12 — `.wsu-dumbbell` prefix |
| Multi-panel try/catch | §6.14 |
| `d3.symbol()` matching legend markers | §6.15 |
| Color source switching | §6.16 |
| Defer to platform defaults | §6.18 — empty palette default |
| Dasharray width scaling | §6.19 |

---

## 8. Deferred Items

Reviewed during design and explicitly **not** implemented. Future
agents: do not propose these without re-discussing.

| Feature | Why deferred |
|---------|--------------|
| Header attribute frame (GLYPH bucket) | GLYPH is already used for sort fields; would require remapping or breaking change |
| Tooltip column reordering | Out of scope — visibility toggles + bucket order workaround sufficient |
| Per-series shape override | Brittle when series labels change; global shape covers 95% of cases |
| Plugin-internal formula evaluator | Domain-specific calculations belong in OAC dataset/workbook calcs |

---

## 9. Build & Deploy

```powershell
# Validate
cd oac-sdk-dev\src\customviz\com-wsu-dumbbell    # from the repo root
node --check wsuDumbbell.js
node --check wsuDumbbelldatamodelhandler.js
Get-Content extensions\oracle.bi.tech.plugin.visualization\com-wsu-dumbbell.json -Raw | ConvertFrom-Json
Get-Content extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\com-wsu-dumbbell.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json

# Build
cd ..\..\..    # back to oac-sdk-dev
.\build-sdk.ps1

# Output
# build\distributions\customviz_com-wsu-dumbbell.zip
```

Install in OAD: Console → Extensions → Upload → pick the zip → restart
OAD. Find under category **WSU** as **WSU Dumbbell**, alongside any
other WSU plugins installed in OAD (e.g., WSU Line).

---

## 10. File Inventory

```
com-wsu-dumbbell/
  wsuDumbbell.js                       # main viz + symbol pinning + LBL strings
  wsuDumbbelldatamodelhandler.js       # bucket-to-Logical mapping
  wsuDumbbellstyles.css                # all selectors prefixed .wsu-dumbbell*
  wsuDumbbellIcon.png                  # gallery icon
  extensions/
    oracle.bi.tech.plugin.visualization/
      com-wsu-dumbbell.json
    oracle.bi.tech.plugin.visualizationDatamodelHandler/
      com-wsu-dumbbell.visualizationDatamodelHandler.json
  nls/
    messages.js
    root/messages.js
```
