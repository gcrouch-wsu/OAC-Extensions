# WSU Line — Plugin Reference

Canonical reference for the **WSU Line** custom visualization
(`com-wsu-line`). Read this plus `../oac_design.md` to pick up WSU Line
development or fork it without re-deriving design decisions.

---

## 1. Overview

### Identity
- **Display name**: WSU Line
- **Short name**: WSU Line
- **Category**: WSU
- **Root id**: `com-wsu-line`
- **Version constant**: `WsuLineViz.VERSION = "1.2.1"` (see `CHANGELOG.md`)
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-line/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-line.zip`

### What WSU Line is
A line chart with a Tableau-style shared-X tooltip and a comprehensive
set of styling and analytical controls. Line-only (no bar mode). Defers
to OAC themes for colors by default. Designed for time-series and
period-over-period comparisons, with STRM-backed 1-year and 3-year
tooltip calculations when the term-code bucket is provided.

### Capabilities at a glance
- **Shared-X tooltip** — hovering any X position shows every series at
  that position in a tabular tooltip (full-height invisible hit areas
  per X value; see `../oac_design.md` §6.19).
- **Δ% 1-year and Δ% 3-year built-in comparisons** — require a
  `Sorting Term Code (STRM)` bucket and compare same-season academic terms
  rather than guessing from display labels.
- **Tooltip detail bucket** — categorical-only authored fields appear
  automatically with no plugin change. Use formatted attribute copies when a
  measure-like value belongs in the tooltip. Toggle visibility per built-in
  row (Show Series Column, Show Value Column, Show X Per Row, Show X In Title).
- **Header Attributes bucket** — drop attributes (e.g., Snapshot Date)
  to render labeled chips in a strip above the chart, with style
  presets (Default / Compact / Prominent / Hidden) and individual
  overrides for background color, text color, font size, bold, italic,
  underline.
- **Drag-to-zoom** — X-only by default (drag horizontally to subset
  visible X range, Y rescales to visible data); X+Y or Off as options.
  Esc cancels mid-drag, double-click resets, Reset Zoom button appears
  after a zoom.
- **Legend click highlighting** — clicking a legend item fades other
  series; clicking again or clicking empty area restores.
- **Full styling controls** — point shape (`d3.symbol()`), line pattern
  with width-scaled dasharray, line smoothing (linear / curve / step),
  legend marker shape and size.
- **Color Source switcher** — defaults to OAC Theme (so workbook themes
  drive colors); Custom Palette mode for explicit overrides. In OAC Theme mode,
  the visualization exposes the host Color menu path for color assignments when
  supported by OAC/OAD.
- **Number formatting** — auto / number / percent / currency / compact
  with decimal places + prefix/suffix overrides.
- **Missing-data mode** — Hide / Zero / Gap.
- **Sort Column dropdown** — dynamic options drawn from real bucket
  field names, built-in rows, and STRM when supplied, plus Sort Direction
  (auto / asc / desc).
- **Four-tab property panel** — General / Style / Header / Axis & Legend
  (attempted via custom panel IDs with try/catch fallback to General;
  see `../oac_design.md` §6.14).

---

## 2. Bucket Layout

Seven buckets defined in
`extensions/oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-line.visualizationDatamodelHandler.json`.

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `measures` | `MEASURES` | measures | 1 | 1 | Value (Y-Axis) |
| `row` | `ROW` / `CATEGORY` | categorical | 1 | 1 | Category (X-Axis) |
| `color` | `COLOR` | categorical | 0 | 1 | Series / Color |
| `glyph` | `GLYPH` | categorical | 0 | 5 | Header Attributes |
| `detail` | `CATEGORY` | categorical | 0 | 20 | Tooltip detail |
| `size` | `SIZE` | both | 0 | 1 | Sorting Term Code (STRM) |
| `item` | `ITEM` | categorical | 0 | 1 | Dynamic Value Label (from data) |

---

## 3. Config Schema

All keys with defaults. Saved Configs are migration-safe; new keys default
to safe values in `loadConfig`.

### Tooltip
| Key | Default | Values | Notes |
|-----|---------|--------|-------|
| `tooltipMode` | `"sharedX"` | sharedX / single | |
| `compareMode` | `"average"` | off / average / previous / previousPercent / rank | `previous` modes render only when valid STRM data is present |
| `delta3Mode` | `"off"` | off / value / percent / valuePercent | Δ 3 Years columns render only when valid STRM data is present |
| `tooltipSortColumn` | `""` | empty / `series` / `value` / `rank` / `termCode` / *any detail label* | dynamic dropdown built from real bucket labels; `termCode` appears for Sorting Term Code (STRM) |
| `tooltipSortDirection` | `"auto"` | auto / asc / desc | |
| `tooltipLimit` | `20` | 5–50 | row cap |
| `tooltipColumnLimit` | `20` | 1–20 | detail column cap |
| `showSeriesCol` | `"on"` | on / off | |
| `showValueCol` | `"on"` | on / off | |
| `showXPerRow` | `"on"` | on / off | |
| `showXInTitle` | `"on"` | on / off | controls whether the tooltip title includes the hovered X value; Privacy Mode still suppresses it |
| `showAverage` | `"on"` | on / off | |

### Chart core
| Key | Default | Values |
|-----|---------|--------|
| `aggregation` | `"sum"` | sum / average / max / min / first |

### Format
| Key | Default | Values | Notes |
|-----|---------|--------|-------|
| `numberFormat` | `"auto"` | auto / number / percent / currency / compact | |
| `decimalPlaces` | `"auto"` | auto / "0" / "1" / "2" / "3" / "4" | |
| `valuePrefix` | `""` | text | applied to all numeric renders including axes |
| `valueSuffix` | `""` | text | applied to all numeric renders including axes |
| `missingValueMode` | `"hide"` | hide / zero / gap | labeled "Treat Nulls As" in panel |

### Style — Line
| Key | Default | Values |
|-----|---------|--------|
| `linePattern` | `"solid"` | solid / dashed / dotted / dashdot |
| `lineWidth` | `2` | 1–8 (slider) |
| `lineSmoothing` | `"linear"` | linear / smooth / step / stepBefore |

### Style — Points
| Key | Default | Values |
|-----|---------|--------|
| `showPoints` | `"on"` | on / off |
| `pointShape` | `"circle"` | circle / square / triangle / diamond / cross / star |
| `pointSize` | `4` | 4–12 (slider). Treated as visual radius; converted to `d3.symbol().size = π × r²` for symbol rendering. Values below 4 are clamped to 4 (1.2.0) |

### Style — Color
| Key | Default | Values | Notes |
|-----|---------|--------|-------|
| `colorSource` | `"oac"` | oac / custom | `oac` uses the platform color service; `custom` forces palette |
| `palette` | `""` (empty) | comma-separated hex | only used when `colorSource = custom` (or as last-resort fallback). Default empty so OAC theme drives. |
| `currentColor` | `"#1e88e5"` | reserved | |
| `backgroundOpacity` | `0.45` | 0–1 | |
| `valueLabel` | `""` | text override | Manual fallback label for the value column; also feeds the Y-axis title unless `yAxisTitle` is set. A populated `Dynamic Value Label (from data)` bucket overrides this field. |
| `seriesLabel` | `""` | text override | |

### Header
| Key | Default | Values | Notes |
|-----|---------|--------|-------|
| `headerPreset` | `"default"` | default / compact / prominent / hidden | base layout |
| `headerBackgroundColor` | `""` | hex text | overrides preset background |
| `headerFontColor` | `""` | hex text | text color override |
| `headerFontSize` | `11` | 8–18 (slider) | px |
| `headerFontBold` | `"off"` | on / off | |
| `headerFontItalic` | `"off"` | on / off | |
| `headerFontUnderline` | `"off"` | on / off | |
| `headerChipLimit` | `6` | 1–20 | distinct values per attribute before `+N more` |

### Interaction
| Key | Default | Values | Notes |
|-----|---------|--------|-------|
| `zoomMode` | `"x"` | x / xy / off | X-only is the recommended default |
| `clickBehavior` | `"sharedX"` | sharedX / single | |
| `privacyMode` | `"off"` | off / on | suppresses X labels and X-value in tooltip title |

### Axis
| Key | Default | Values |
|-----|---------|--------|
| `xSort` | `"natural"` | natural / descending / original |
| `xLabels` | `"auto"` | auto / off / on — `off` suppresses tick text entirely (1.2.0) |
| `showGridlines` | `"on"` | on / off |
| `showGuide` | `"on"` | on / off |
| `xAxisTitle` | `""` | text override |
| `yAxisTitle` | `""` | text override |
| `yAxisTitleSource` | `"auto"` | auto / hidden |
| `xAxisTitleFontSize` | `11` | 8–24 (slider) |
| `yAxisTitleFontSize` | `11` | 8–24 (slider) |
| `xAxisTitleColor` | `""` | hex text |
| `yAxisTitleColor` | `""` | hex text |
| `axisTitleBold` | `"on"` | on / off |
| `axisTitleItalic` | `"off"` | on / off |

### Legend
| Key | Default | Values |
|-----|---------|--------|
| `legend` | `"on"` | on / off |
| `legendPosition` | `"auto"` | auto / right / bottom / off — when `auto`, the renderer auto-flips bottom→right when the bottom legend would consume more than 25% of available height (L4a). A right legend taller than the chart is clipped and scrolls with the mouse wheel (1.2.0) |
| `legendOrder` | `"chronoAsc"` | chronoAsc / chronoDesc / strmAsc / strmDesc / nameAsc / nameDesc / colorOrder — `colorOrder` is order of first appearance in the data, i.e. color-assignment order (1.2.0) |
| `legendMarkerShape` | `"match"` | match / circle / square / triangle / diamond / cross / star — `match` follows the chart's `pointShape` |
| `legendMarkerSize` | `5` | 3–12 (slider). Visual radius; converted to symbol area the same way as `pointSize`. Default reduced from 8 to 5 so legend markers are visually proportional to default chart points (L5). |
| `legendFontSize` | `11` | 8–18 (slider). Applied as inline `font-size` on each legend `<text>` element. Row height and column width adapt to the chosen font size. |
| `legendLabelMaxLength` | `18` | 6–40 (slider). Truncates legend labels with an ellipsis past this character count. Right-side and bottom column widths scale to whichever is smaller of the actual longest label or this cap. |

**All of these are exposed in the Properties dialog under the
Axis & Legend tab** (or in the General tab if the SDK falls back from
the multi-panel attempt). If the legend wraps onto too many rows, the
first knobs to reach for are `Legend: Label Max Length` and
`Legend: Font Size` — both shrink the per-item footprint without
changing the data.

**Click highlight visual states**: a clicked legend item highlights
its series via three opacity layers, not just two:
- Default (no click active): `opacity: var(--bg-opacity, 1)` from `backgroundOpacity` Config (default 0.45 for line backgrounds).
- Faded (other series when one is active): `.wsu-faded` class → `opacity: 0.18`.
- Active (matching series when its legend item is clicked): `.wsu-legend-active` class → `opacity: 1.0` (L7).

This guarantees the active series visibly stands out, instead of
sitting at the same baseline opacity as it had before clicking.

---

## 4. Property Panel — Four-Tab Layout

Implemented via `gadgetdialog.forcePanelByID` with custom string IDs and a
try/catch fallback. See `../oac_design.md` §6.14.

**Gadget conventions** (see also `../oac_design.md` §6.24, §6.28):
- Boolean on/off properties (`Show Series Column`, `Privacy Mode`,
  `Header: Bold`, etc.) render as **checkboxes** (`TEXT_TOGGLE`), not
  paired text buttons. Internal Config still stores `"on"`/`"off"`
  strings — translation happens at the gadget boundary.
- Multi-option choices (3+ options like `Zoom Mode = Off / X / X+Y`)
  remain `TEXT_SWITCHER` with stacked label buttons.
- Numeric ranges (line width, font size, marker size, label max length)
  are sliders.
- Free-form text (axis titles, value prefix/suffix, palette hex, color
  overrides) are text fields.

```
GENERAL TAB
  Chart: Aggregation                              switcher
  Tooltip: Mode                                   switcher
  Tooltip: Compare                                switcher
  Tooltip: Δ 3 Years                              switcher
  Tooltip: Sort Column                            switcher (dynamic options)
  Tooltip: Sort Direction (Auto / Asc / Desc)     switcher
  Tooltip: Row Limit                              slider
  Tooltip: Detail Column Cap                      slider
  Tooltip: Show Series Column                     ☑ checkbox
  Tooltip: Show Value Column                      ☑ checkbox
  Tooltip: Show X Per Row                         ☑ checkbox
  Tooltip: Show X In Title                        ☑ checkbox
  Tooltip: Show Average Footer                    ☑ checkbox
  Format: Number Format                           switcher
  Format: Decimal Places                          switcher
  Format: Value Prefix                            text
  Format: Value Suffix                            text
  Interaction: Zoom Mode (Off / X / X+Y)          switcher
  Interaction: Click Marks                        switcher
  Interaction: Privacy Mode                       ☑ checkbox

STYLE TAB
  Line: Pattern (Solid / Dashed / Dotted / DashDot)  switcher
  Line: Width                                     slider
  Line: Smoothing (Linear / Smooth / Step / StepBefore)  switcher
  Line: Treat Nulls As (Hide / Zero / Gap)        switcher
  Points: Show                                    ☑ checkbox
  Points: Shape                                   switcher
  Points: Size                                    slider
  Color: Source (OAC Theme / Custom Palette)      switcher
  Color: Custom Palette                           text (comma-separated hex)
  Value: Display Label (axis + tooltip)           text override
  Style: Series Label                             text override

HEADER TAB
  Header: Style Preset (Default / Compact / Prominent / Hidden)  switcher
  Header: Background Color / Text Color           text (hex)
  Header: Font Size                               slider
  Header: Bold                                    ☑ checkbox
  Header: Italic                                  ☑ checkbox
  Header: Underline                               ☑ checkbox
  Header: Chip Cap                                slider

AXIS & LEGEND TAB
  Axis: X Sort                                    switcher
  Axis: X Labels (Auto / On / Off)                switcher
  Axis: Gridlines                                 ☑ checkbox
  Axis: Guide Line                                ☑ checkbox
  Axis: X Title / Y Title                         text overrides
  Axis: Y Title Source (Auto / Hidden)            switcher
  Axis: X Title Font Size                         slider
  Axis: Y Title Font Size                         slider
  Axis: X Title Color / Y Title Color             text overrides
  Axis: Title Bold                                ☑ checkbox
  Axis: Title Italic                              ☑ checkbox
  Legend: Show                                    ☑ checkbox
  Legend: Position (Auto / Right / Bottom / Off)  switcher
  Legend: Order (Chrono Asc/Desc / STRM Asc/Desc / Name Asc/Desc / Color Order)  switcher
  Legend: Marker Shape (Match / Circle / Square / Triangle / etc.)  switcher
  Legend: Marker Size (3–12)                      slider
  Legend: Font Size (8–18)                        slider
  Legend: Label Max Length (6–40)                 slider
```

If the SDK version doesn't accept the custom panel IDs (`wsuLineStyle`,
`wsuLineHeader`, `wsuLineAxisLegend`), every gadget falls back to the General
tab. The build doesn't break either way.

**Behaviors driven by panel choices**:
- When `Legend: Position = Auto` and the bottom legend would consume
  more than 25% of the chart's vertical space, the renderer auto-flips
  to right placement (see `../oac_design.md` §6.29). User-explicit
  bottom/right choices override this.
- A clicked legend item elevates the matching series to opacity 1.0 via
  the `.wsu-legend-active` CSS class (see `../oac_design.md` §6.31). Other
  series fade to 0.18 via `.wsu-faded`. Click empty area or the same
  legend item again to clear (empty-area click also clears marks).
- The *Dynamic Value Label* consistency check runs over every source row,
  including rows hidden by `missingMode = hide`; a conflicting label on a
  hidden row still forces the manual fallback (1.2.0).
- Inbound marks from other visualizations highlight a point when any of
  its `sourceRows` is marked, so aggregated points respond to every
  contributor (1.2.0).
- Header `Font Color` / `Bold` controls apply to the header attribute
  chips as well as the header frame (1.2.0).
- Tooltip content that exceeds the visible viewport (70vh) appends a
  sticky "Tooltip clipped — additional rows hidden" footer at the
  bottom of the visible area (see `../oac_design.md` §6.30).
- During an active drag-to-zoom gesture, the chart cursor switches
  from `zoom-in` to `crosshair`. Released on `mouseup` / `Escape` /
  `mouseleave`.
- `Tooltip: Show X In Title` controls only the X value in the tooltip title.
  `Tooltip: Show X Per Row` controls the X table column. Privacy Mode overrides
  both by suppressing the X value.
- `Dynamic Value Label (from data)` is reduced from raw row values before
  aggregation. If exactly one non-empty value is present, it becomes the
  tooltip value column label and Y-axis fallback title. If the bucket is empty
  or has conflicting non-empty values, WSU Line falls back to `Value: Display
  Label (axis + tooltip)`, then the measure display name.
- `Legend: Order = STRM` uses the valid post-aggregation STRM value associated
  with each series. Series with no valid STRM sort last.

---

## 5. Built-in Calculations

Per row:

| Field | Formula | Used by |
|-------|---------|---------|
| `_rank` | 1-based rank by descending value within the X bucket; rows with a missing value are unranked (blank cell, sorted last) — 1.1.1 | compareMode `rank` |
| `_delta` | `value − mean(values at this X)` | compareMode `average` |
| `_prevDelta` | `value − same-season STRM from exactly one prior academic year` | compareMode `previous` / `previousPercent` |
| `_prevPercent` | `_prevDelta / prior.value × 100` | compareMode `previousPercent` |
| `_delta3Value` | `value − avg(prior 3 same-season years)` | `delta3Mode` value or valuePercent |
| `_delta3Pct` | `_delta3Value / avg × 100` | `delta3Mode` percent or valuePercent |

`_prevDelta`, `_prevPercent`, `_delta3Value`, and `_delta3Pct` require
valid STRM values. The algorithm uses PeopleSoft-style term codes such as
`2263` for Spring 2026:
- Δ 1 Year compares to the same-season term exactly one academic year earlier
  (`STRM - 10`).
- Δ 3 Years compares against up to three prior same-season STRM values
  (`STRM - 10`, `-20`, `-30`) and averages those valid prior rows.
- If the STRM bucket is absent or invalid, those year-comparison tooltip
  columns do not render.

---

## 6. Authoring Recipes

### 6.1 Tableau-style year-over-year tooltip with both Δ 1Y and Δ 3Y

Bucket binding:
| Bucket | Field |
|--------|-------|
| Category (X-Axis) | `Weeks from Start` *(Attribute)* |
| Series / Color | `Term` |
| Value (Y-Axis) | `Admission Status (Selected)` |
| Tooltip detail | `Date`, optionally `Day of Term` |
| Header Attributes | `Snapshot Date` *(optional)* |
| Sorting Term Code (STRM) | `STRM` such as `2263` *(required for Δ 1Y / Δ 3Y)* |
| Dynamic Value Label (from data) | parameter-driven label such as `Admission Status Label` *(optional)* |

Property panel:
- `Tooltip: Compare` = `Δ 1 Year + Δ% 1 Year`
- `Tooltip: Δ 3 Years` = `Δ 3 Years + Δ% 3 Years`
- `Tooltip: Sort Column` = `STRM (Sorting Term Code)` or `Series (Term)`
- `Tooltip: Sort Direction` = `Descending`
- `Tooltip: Show X Per Row` = `Off`
- `Tooltip: Show X In Title` = `On` if the hovered week should remain in the title; `Off` if the X value should be suppressed entirely
- `Format: Number Format` = `Number`, `Decimal Places` = `0`

Resulting tooltip columns: `Term · Date · Applied · Δ 1 Year · Δ% 1 Year · Δ 3 Years · Δ% 3 Years`.

### 6.2 STRM-driven legend ordering

Bucket binding:
| Bucket | Field |
|--------|-------|
| Category (X-Axis) | `Weeks from Start` |
| Series / Color | `Term` |
| Value (Y-Axis) | selected admissions count |
| Sorting Term Code (STRM) | numeric STRM such as `2267` |

Property panel:
- `Legend: Order` = `STRM (oldest first)` or `STRM (newest first)`
- `Tooltip: Sort Column` = `STRM (Sorting Term Code)`
- `Tooltip: Sort Direction` = `Ascending` or `Descending`

This keeps legend and tooltip ordering tied to the authoritative term code
rather than display-label parsing. Missing or invalid STRM values sort last.

### 6.3 Parameter-driven admission status label

Use this when a workbook parameter acts as a view selector for Applied,
Admitted, Confirmed, or Enrolled.

Create a calculated attribute:

```sql
CASE @parameter("Admissions Status Selector")('Applied')
WHEN 'Applied' THEN 'Applied'
WHEN 'Admitted' THEN 'Admitted'
WHEN 'Confirmed' THEN 'Confirmed'
WHEN 'Enrolled' THEN 'Enrolled'
END
```

Bucket binding:
| Bucket | Field |
|--------|-------|
| Value (Y-Axis) | parameter-driven admissions measure |
| Dynamic Value Label (from data) | calculated attribute above |

Leave `Value: Display Label (axis + tooltip)` blank unless a manual fallback is
desired. The dynamic bucket overrides that manual fallback when exactly one
non-empty label value is present. `Axis: Y Title (override)` still wins for the
Y-axis only; it does not change the tooltip value column header.

> Host validation pending — see `CHANGELOG.md` → "Known gaps" (WSU Line:
> `@parameter(...)` inside a categorical calculated attribute).

### 6.4 OAC-theme-driven colors

Default behavior. Leave `Color: Source` = `OAC Theme` and `Custom Palette`
empty. Workbook theme and OAC color assignments control every series color. To
verify: change the workbook theme or use the visualization Color menu / Manage
Color Assignments and watch the chart re-color.

> Host validation pending — see `CHANGELOG.md` → "Known gaps" (WSU Line:
> native Color / Manage Color Assignments menu wording).

### 6.5 WSU-branded colors when needed

`Color: Source` = `Custom Palette`, paste WSU hex codes into `Custom
Palette`:
```
#981e32,#5e6a71,#a60f2d,#262e30,#cdb87d,#1c2730
```

### 6.6 Header styling combos

| Goal | Settings |
|------|----------|
| Crimson banner with white bold text | `Header: Style Preset = Default`, `Background Color = #981e32`, `Text Color = #ffffff`, `Bold = On` |
| Subtle compact header | `Style Preset = Compact` (no other overrides) |
| Italic warning header | `Style Preset = Prominent`, `Italic = On` |
| Hide header entirely | `Style Preset = Hidden` (collapses div) |

### 6.7 Line pattern + smoothing combos

| Goal | Settings |
|------|----------|
| Smooth solid lines (default-ish) | Pattern = Solid, Smoothing = Smooth |
| Dotted comparison lines | Pattern = Dotted, Smoothing = Linear |
| Step-style operational metrics | Pattern = Solid, Smoothing = Step |

### 6.8 Legend interaction recipe

Click any legend item → all other series fade. Click again to clear.
Multiple terms = quick way to focus on one cohort while keeping others as
faint reference lines. Marking and tooltip behavior unaffected.

---

## 7. Implementation Patterns (cross-references)

WSU Line is the reference implementation for these patterns. Each links to
`../oac_design.md`:

| Pattern | Reference |
|---------|-----------|
| Symbol pinning | §6.3 |
| Side-by-side install | §6.2 |
| Drag-to-zoom over hover | §6.4 |
| Header frame layout | §6.6 |
| Tooltip viewport clipping | §6.5 |
| Format-as-Config | §6.7 |
| Missing-data strategy | §6.8 (relabeled "Treat Nulls As") |
| Property panel grouping | §6.9 |
| Cached dataset meta | §6.10 |
| Parameter-mirroring | §6.11 |
| CSS namespacing | §6.12 — `.wsu-line` prefix |
| Domain-aware logic | §6.13 — Δ 3 Years exception |
| Multi-panel try/catch | §6.14 — WSU Line is the reference |
| `d3.symbol()` matching legend markers | §6.15 |
| Color source switching | §6.16 |
| Header preset + override | §6.17 |
| Defer to platform defaults | §6.18 — empty palette default |
| Dasharray width scaling | §6.19 |

---

## 8. Build & Deploy

```powershell
# 1. Validate per file
cd oac-sdk-dev\src\customviz\com-wsu-line    # from the repo root
node --check wsuLine.js
node --check wsuLinedatamodelhandler.js
Get-Content extensions\oracle.bi.tech.plugin.visualization\com-wsu-line.json -Raw | ConvertFrom-Json
Get-Content extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\com-wsu-line.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json

# 2. Build
cd ..\..\..    # back to oac-sdk-dev
.\build-sdk.ps1

# 3. Output
# build\distributions\customviz_com-wsu-line.zip
```

Install in OAD: Console → Extensions → Upload → pick the zip → restart OAD.
Find under category **WSU**, alongside the WSU Shared Tooltip family.

---

## 9. File Inventory

```
com-wsu-line/
  wsuLine.js                           # main viz + symbol pinning + LBL strings
  wsuLinedatamodelhandler.js           # bucket-to-Logical mapping
  wsuLinestyles.css                    # all selectors prefixed .wsu-line*
  wsuLineIcon.png                      # gallery icon
  extensions/
    oracle.bi.tech.plugin.visualization/
      com-wsu-line.json
    oracle.bi.tech.plugin.visualizationDatamodelHandler/
      com-wsu-line.visualizationDatamodelHandler.json
  nls/
    messages.js                        # locale registry (root: true)
    root/messages.js                   # root-locale strings
```

When forking WSU Line, see `../oac_design.md` §6.2 for the full rename
checklist that must be applied across every file.
