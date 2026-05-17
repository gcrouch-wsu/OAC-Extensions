# WSU Line v2 Build List

This document is a build checklist for the next WSU Line iteration. It is
intended to be detailed enough for another AI or developer to review against
the source before implementation.

Primary source:

```text
oac-sdk-dev/src/customviz/com-wsu-line/
```

Primary files:

```text
wsuLine.js
wsuLinedatamodelhandler.js
wsuLinestyles.css
extensions/oracle.bi.tech.plugin.visualization/com-wsu-line.json
extensions/oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-line.visualizationDatamodelHandler.json
nls/root/messages.js
```

Related reference docs:

```text
docs/project_spec_wsu_line.md
docs/oac_design.md
docs/all_plugins.md
```

## Current Findings

WSU Line already has these foundations:

- A `Sorting Term Code (STRM)` bucket exists in the grammar as logical `size`.
- `wsuLine.js` reads STRM into each row as `termCode`.
- STRM is currently used by tooltip year-comparison calculations only.
- WSU Line already consumes OAC theme colors through:
  - `getColorContext(...)`
  - `getCachedColorInterpolator(...)`
  - `getDataItemColorInfo(...)`
  - `DEFAULT_COLOR_SETTINGS_CHANGED`
- WSU Line does not currently call `_addColorMenuOption(...)`, so the native
  Color menu path used by some training plugins is not exposed.
- Axis title text overrides exist, but axis title font controls do not.
- Tooltip column visibility controls exist for Series, Value, X-per-row, and
  Average footer, but not for the X value in the tooltip title.
- The value column label is derived from the measure display name or
  `valueLabel`; it does not dynamically evaluate workbook parameters.

Training plugin evidence for color menu support:

- `plugin_training/sample-circlepack/circlePack.js` calls
  `_addColorMenuOption(oTransientVizContext, aResults, oTransientRenderingContext)`.
- `plugin_training/sample-circlepack/circlePack.js` also overrides
  `_isOnlyPhysicalRowEdge()` to return `false`, but this appears tied to
  measure/data-edge color handling rather than being a required color-menu
  prerequisite.
- `plugin_training/com-company-collapsibleTreeViz/collapsibleTreeViz.js` calls
  `_addColorMenuOption(...)` without `_isOnlyPhysicalRowEdge()`, and its color
  bucket is categorical-only like WSU Line.
- `plugin_training/com-company-network2Viz/network2Viz.js` contains the same
  call, but it is commented out.

## Target Outcomes

1. STRM can drive tooltip row sort and legend order.
2. Axis title labels can be styled from the property panel.
3. Tooltip X/value display is less redundant and more controllable.
4. Parameter-selected measures have a practical label strategy without
   hardcoding workbook-specific parameter names into the plugin.
5. WSU Line exposes the native OAC color assignment menu path when using OAC
   theme colors.

## Work Item 1: STRM Sort Support

### Problem

The grammar has a `Sorting Term Code (STRM)` bucket, and rows contain
`termCode`, but the property controls do not expose STRM as a sort option.
The tooltip sort dropdown currently offers only:

- default value descending
- series
- value
- rank
- tooltip detail fields

The legend order also uses label chronology, name sort, or color order. It
does not sort by the explicit STRM bucket.

### Source Areas

In `wsuLine.js`:

- `_buildSortColumnOptions`
- `_generateData`
- `_aggregateRows`
- `_tooltipRows`
- `_legendItems`
- `Config.legendOrder`
- property panel `legendOrderGadget`
- `_handlePropChange`

### Implementation Steps

1. Track the STRM bucket display label during dataset generation.

   Add a local variable in `_generateData`, for example:

   ```js
   var termCodeLabel = "Sorting Term Code (STRM)";
   ```

   When iterating layers, if `key === "size"`, set:

   ```js
   termCodeLabel = displayName || termCodeLabel;
   ```

   Include `termCodeLabel` in the returned dataset object and in
   `setLastDatasetMeta(...)`.

2. Add STRM to tooltip sort options.

   In `_buildSortColumnOptions`, read from last dataset meta:

   ```js
   var hasTermCode = meta && meta.hasTermCode;
   var termCodeLabel = meta && meta.termCodeLabel ? meta.termCodeLabel : "Sorting Term Code (STRM)";
   ```

   Add an option when STRM is available:

   ```js
   { value: "termCode", label: "STRM (" + termCodeLabel + ")" }
   ```

   If no rendered dataset exists yet, still include a conservative option:

   ```js
   { value: "termCode", label: "STRM (Sorting Term Code)" }
   ```

   Rationale: the property dialog can open before the first render. The saved
   value must not disappear.

3. Teach `_tooltipRows` to sort by STRM.

   In sort-kind detection:

   ```js
   else if (lcSort === "termcode" || lcSort === "strm" || lcSort === "sorting term code") sortKind = "termCode";
   ```

   Add comparator:

   ```js
   else if (sortKind === "termCode") {
      ascCmp = function(a, b) {
         var av = isValidStrmTermCode(a.termCode) ? a.termCode : Number.MAX_SAFE_INTEGER;
         var bv = isValidStrmTermCode(b.termCode) ? b.termCode : Number.MAX_SAFE_INTEGER;
         return av - bv;
      };
   }
   ```

   Default direction for STRM should probably be ascending, because it matches
   chronological order from oldest to newest. If the use case wants newest at
   top, users can set Sort Direction to Descending.

   Explicitly update the default-direction expression:

   ```js
   var defaultDir = (sortKind === "series" || sortKind === "detail" || sortKind === "rank" || sortKind === "termCode") ? "asc" : "desc";
   ```

   Current `_tooltipRows` checks detail-label matches before special keyword
   matches. Keep that precedence for v2: if a Tooltip detail field is named
   `termCode` or `strm`, the authored detail field wins. This edge case is
   acceptable but should be documented in the implementation comment if touched.

4. Add legend STRM order modes.

   Extend `Config.legendOrder` valid values to include:

   ```text
   strmAsc
   strmDesc
   ```

   Update `legendOrderGadget` options:

   ```js
   { value: "strmAsc", label: "STRM (oldest first)" }
   { value: "strmDesc", label: "STRM (newest first)" }
   ```

5. Compute representative STRM per series.

   Add a helper or local map in `_legendItems`:

   ```js
   var seriesTermCodes = new Map();
   dataset.rows.forEach(function(row) {
      if (!isValidStrmTermCode(row.termCode)) return;
      if (!seriesTermCodes.has(row.series)) {
         seriesTermCodes.set(row.series, row.termCode);
      }
      else {
         seriesTermCodes.set(row.series, Math.min(seriesTermCodes.get(row.series), row.termCode));
      }
   });
   ```

   Build this from `dataset.rows`, after `_aggregateRows` has run. Existing
   aggregation logic already sets `termCode` to `null` when source rows in the
   same `(series, x)` group have conflicting STRM values. Therefore the legend
   representative should be the minimum valid, post-aggregation `termCode` per
   series. Rows with null or invalid STRM are ignored for representative
   selection.

6. Sort legend items by representative STRM.

   In `_legendItems`:

   ```js
   else if (order === "strmAsc") {
      ordered.sort(function(a, b) { return compareSeriesTermCode(a, b, false); });
   }
   else if (order === "strmDesc") {
      ordered.sort(function(a, b) { return compareSeriesTermCode(a, b, true); });
   }
   ```

   Tie-break with `compareChronologicalLabel` or `compareNatural`.

   Define the comparator explicitly so missing STRM values do not produce `NaN`
   comparator results:

   ```js
   function compareSeriesTermCode(seriesA, seriesB, desc) {
      var aMissing = !seriesTermCodes.has(seriesA);
      var bMissing = !seriesTermCodes.has(seriesB);
      if (aMissing && bMissing) return compareChronologicalLabel(seriesA, seriesB);
      if (aMissing) return 1;
      if (bMissing) return -1;
      var av = seriesTermCodes.get(seriesA);
      var bv = seriesTermCodes.get(seriesB);
      if (av === bv) return compareChronologicalLabel(seriesA, seriesB);
      return desc ? bv - av : av - bv;
   }
   ```

   Series with no valid STRM sort last in both ascending and descending order.

### Validation

- With `Term` in Series / Color and `STRM` in Sorting Term Code, tooltip sort
  can be set to STRM ascending and descending.
- With labels such as `2026 Fall`, `2025 Fall`, etc., legend order follows STRM
  even if labels would sort differently.
- With STRM absent, the chart still renders, saved configs still load, and
  year-comparison columns stay hidden.
- With invalid STRM values, invalid rows sort last in ascending order and last
  or first consistently in descending order; document the behavior.

## Work Item 2: Axis Title Font and Size Controls

### Problem

The native OAC line chart exposes axis title formatting. WSU Line currently
has text overrides only:

- `xAxisTitle`
- `yAxisTitle`

The rendered title style is fixed by CSS:

```css
.wsu-line .axis-label {
  fill: #202124;
  font-size: 11px;
  font-weight: 600;
}
```

### Source Areas

In `wsuLine.js`:

- `Config`
- `loadConfig`
- `_draw`
- property panel Axis & Legend section
- `_handlePropChange`

In `wsuLinestyles.css`:

- `.wsu-line .axis-label`

### Implementation Steps

1. Add Config keys.

   Recommended minimal set:

   ```js
   xAxisTitleFontSize: 11,
   yAxisTitleFontSize: 11,
   xAxisTitleColor: "",
   yAxisTitleColor: "",
   axisTitleBold: "on",
   axisTitleItalic: "off"
   ```

   Optional split if separate bold/italic is required:

   ```js
   xAxisTitleBold
   yAxisTitleBold
   xAxisTitleItalic
   yAxisTitleItalic
   ```

   Keep the first implementation simpler unless there is a known need for
   separate X/Y font weight.

2. Normalize numeric values in `loadConfig`.

   Follow existing patterns for `legendFontSize` and `headerFontSize`.

   Example:

   ```js
   this.Config.xAxisTitleFontSize = Number(this.Config.xAxisTitleFontSize);
   if (isNaN(this.Config.xAxisTitleFontSize) || this.Config.xAxisTitleFontSize < 8) this.Config.xAxisTitleFontSize = 11;
   ```

3. Add a small style helper.

   Example:

   ```js
   WsuLineViz.prototype._axisTitleStyle = function(axis) {
      var sizeKey = axis === "x" ? "xAxisTitleFontSize" : "yAxisTitleFontSize";
      var colorKey = axis === "x" ? "xAxisTitleColor" : "yAxisTitleColor";
      return {
         size: Number(this.Config[sizeKey]) || 11,
         color: str(this.Config[colorKey]).trim() || null,
         bold: this.Config.axisTitleBold !== "off",
         italic: this.Config.axisTitleItalic === "on"
      };
   };
   ```

4. Apply inline styles when drawing axis titles.

   Replace the two existing `g.append("text").attr("class", "axis-label")...`
   calls with variables so styles can be applied:

   ```js
   var xTitleStyle = this._axisTitleStyle("x");
   var yTitleStyle = this._axisTitleStyle("y");
   ```

   Then apply:

   ```js
   .style("font-size", xTitleStyle.size + "px")
   .style("fill", xTitleStyle.color || null)
   .style("font-weight", xTitleStyle.bold ? "600" : "400")
   .style("font-style", xTitleStyle.italic ? "italic" : "normal")
   ```

5. Add property panel controls under Axis & Legend.

   Recommended labels:

   ```text
   Axis: X Title Font Size
   Axis: Y Title Font Size
   Axis: X Title Color
   Axis: Y Title Color
   Axis: Title Bold
   Axis: Title Italic
   ```

   Use sliders for sizes, text fields for colors, and checkbox toggles for
   bold/italic.

6. Wire `_handlePropChange`.

   Add all new gadget IDs to the main gadget-to-config map. Also add checkbox
   gadgets to `TOGGLE_GADGETS`; otherwise OAC's checkbox payload will be read
   from `oPropChange.value` instead of `oPropChange.checked`.

   Required toggle additions:

   ```js
   axisTitleBoldGadget: 1,
   axisTitleItalicGadget: 1
   ```

### Validation

- Auto axis titles and manually overridden axis titles both receive the chosen
  font size.
- X and Y title sizes can differ.
- Empty color fields fall back to CSS/default styling.
- Specifically confirm empty `xAxisTitleColor` / `yAxisTitleColor` remove the
  inline SVG `fill` style and fall back to `.wsu-line .axis-label`.
- Invalid color text should not break rendering. Prefer no validation for now
  unless the repo already has a shared color sanitizer for this plugin.
- Saved workbooks without these keys load with current visual behavior.

## Work Item 3: Tooltip X Display Controls

### Problem

`Tooltip: Show X Per Row` controls the X column inside the tooltip table, but
the tooltip title still shows the X label/value:

```text
Weeks from Start: -29
```

This makes the X value appear even when the user thinks they turned it off.
In shared-X mode the title can still be useful, but users need explicit control.

### Source Areas

In `wsuLine.js`:

- `Config.showXPerRow`
- `_tooltipHtml`
- property panel General tab
- `_handlePropChange`

### Implementation Steps

1. Add a new Config key:

   ```js
   showXInTitle: "on"
   ```

2. Update `_tooltipHtml` title construction.

   Current behavior:

   ```js
   var titleHtml = privacyOn
      ? "<div class='title'>" + esc(dataset.xLabel) + "</div>"
      : "<div class='title'>" + esc(dataset.xLabel) + ": " + esc(xValue) + "</div>";
   ```

   New behavior:

   ```js
   var showXInTitle = this.Config.showXInTitle !== "off" && !privacyOn;
   var titleText = showXInTitle
      ? esc(dataset.xLabel) + ": " + esc(xValue)
      : esc(dataset.xLabel);
   var titleHtml = titleText ? "<div class='title'>" + titleText + "</div>" : "";
   ```

   If product direction is that "off" should hide the whole title, add a second
   control later. For v2, keep the label-only title because it preserves context.

3. Add property panel checkbox:

   ```text
   Tooltip: Show X In Title
   ```

   Place it near `Tooltip: Show X Per Row`.

4. Wire `_handlePropChange`.

   Add:

   ```js
   showXInTitleGadget: "showXInTitle"
   ```

   Add it to both the main gadget-to-config map and `TOGGLE_GADGETS`:

   ```js
   showXInTitleGadget: 1
   ```

### Validation

- `Show X In Title = On`, `Show X Per Row = Off` shows `Weeks from Start: -29`
  in the title and no X table column.
- `Show X In Title = Off`, `Show X Per Row = Off` shows no `-29` in the tooltip.
- Privacy Mode still suppresses the X value regardless of the new setting.
- Single-row and shared-X tooltip modes both follow the same title rule.

## Work Item 4: Value Column and Dynamic Parameter Labels

### Problem

The measure in the reported workbook is parameter-driven:

```sql
CASE @parameter("Admissions Status Selector")('Applied')
WHEN 'Applied' THEN ... "APPLIED"
WHEN 'Admitted' THEN ... "ADMITTED"
WHEN 'Confirmed' THEN ... "CONFIRMED"
WHEN 'Enrolled' THEN ... "ENROLLED"
END
```

The native OAC line chart can use a Values Axis title expression such as:

```text
@parameter("Admissions Status Selector")
```

WSU Line does not evaluate workbook parameters in axis labels. It renders:

- Y axis title from `yAxisTitle` override or dataset value label.
- Tooltip value column from `dataset.valueLabel`.
- `dataset.valueLabel` comes from `valueLabel` override or the measure name.

This means the tooltip column can stay labeled `Admission Status` while the
numbers are Applied, Admitted, Confirmed, or Enrolled counts.

### Important Constraint

Do not hardcode `Admissions Status Selector` into WSU Line. The plugin must
remain workbook-agnostic.

The existing design guidance in `docs/oac_design.md` says not to push
parameter evaluation into the plugin for workbook-specific logic.

### Recommended v2 Strategy

Keep the current fallback chain and make it clearer in the UI. For the
workbook-parameter use case, add a data-driven label bucket so OAC evaluates the
parameter in a calculated attribute and passes the resolved text to WSU Line.

Current behavior already works like this:

```text
Tooltip value column = valueLabel override -> measure display name
Y axis title = yAxisTitle override -> tooltip value label
```

That means `valueLabel = Applied` already changes the tooltip value column and,
unless `yAxisTitle` is set, the Y axis title. The dynamic bucket becomes the
first source for `dataset.valueLabel` when supplied.

For v2, do not add a four-state title-source model. Add only a small
visibility control for hiding the Y axis title when needed.

### Implementation Steps

1. Rename or re-label the existing `valueLabel` property in the UI.

   Current UI label:

   ```text
   Style: Value Label (override)
   ```

   Recommended label:

   ```text
   Value: Display Label (axis + tooltip)
   ```

   Keep the Config key as `valueLabel` for backward compatibility.

2. Add a minimal Y axis title visibility/source option.

   New Config:

   ```js
   yAxisTitleSource: "auto"
   ```

   Valid values:

   ```text
   auto
   hidden
   ```

   Meaning:

   - `auto`: preserve current fallback chain:
     `yAxisTitle` override -> `valueLabel` override -> measure display name.
   - `hidden`: render no Y axis title.

3. Add a Y title resolution helper.

   Example:

   ```js
   WsuLineViz.prototype._resolvedYAxisTitle = function(dataset) {
      var source = this.Config.yAxisTitleSource || "auto";
      if (source === "hidden") return "";
      return this._configText("yAxisTitle", dataset.valueLabel);
   };
   ```

4. Add an optional `Dynamic Value Label (from data)` grammar bucket.

   Use the real OAC logical channel `ITEM`, exposed with JSON edge key `item`.
   Do not use `shape`; this SDK does not expose `Logical.SHAPE`.

   The bucket is categorical, optional, and max-count 1. Authors can bind a
   calculated attribute such as:

   ```sql
   CASE @parameter("Admissions Status Selector")('Applied')
   WHEN 'Applied' THEN 'Applied'
   WHEN 'Admitted' THEN 'Admitted'
   WHEN 'Confirmed' THEN 'Confirmed'
   WHEN 'Enrolled' THEN 'Enrolled'
   END
   ```

5. Resolve dynamic labels from raw rows.

   Build a set of non-empty `item` values before aggregation:

   - one distinct value: use it as `dataset.valueLabel`
   - zero values: fall through to `valueLabel`, then measure name
   - multiple values: treat as conflict and fall through

   Do not propagate the dynamic label through `_aggregateRows`; it is
   dataset-level metadata, not a per-series/per-X value.

6. Do not add `rawValueLabel` for v2.

   The current `dataset.valueLabel` already stores the effective label. Adding
   a parallel raw measure label is unnecessary unless a future requirement needs
   to display both the raw measure name and the override at the same time.

7. Tooltip value column should keep using `dataset.valueLabel`.

   This lets a user bind a parameter-driven dynamic label, or fall back to
   setting `Value: Display Label` manually.

8. Do not attempt to parse `@parameter(...)` expressions in v2.

   If OAC exposes a safe API for current parameter values later, add it as a
   separate work item after host API confirmation.

### Validation

- With no custom value label, existing behavior remains unchanged.
- With a calculated attribute in `Dynamic Value Label (from data)`, tooltip
  value column and Y-axis fallback title follow that attribute as the workbook
  parameter changes.
- With conflicting non-empty dynamic label values, the chart falls back to
  `Value: Display Label`, then the measure name.
- Local source/build validation can confirm the bucket and label-resolution
  wiring, but OAC Dev must still confirm that `@parameter(...)` is accepted in a
  categorical calculated attribute and refreshes the label when the selector
  changes.
- With `valueLabel = Applied`, tooltip value column is labeled `Applied`.
- With `valueLabel = Applied` and empty `yAxisTitle`, the Y axis title is also
  `Applied`.
- With `valueLabel = Applied` and `yAxisTitle = Admission Status`, the tooltip
  value column says `Applied` and the Y axis title says `Admission Status`.
- With `yAxisTitleSource = hidden`, no Y axis title is rendered.
- Saved workbooks using the old `valueLabel` key still load.

## Work Item 5: Native OAC Color Menu Support

### Problem

WSU Line uses OAC theme colors but does not expose the native Color context menu
path. The user wants behavior closer to the native OAC Line chart's:

```text
Color -> Manage Color Assignments
```

### Evidence From Training Plugins

`sample-circlepack/circlePack.js`:

```js
this._addColorMenuOption(oTransientVizContext, aResults, oTransientRenderingContext);
```

It also defines:

```js
CirclePack.prototype._isOnlyPhysicalRowEdge = function(){
   return false;
};
```

That override is not treated as a WSU Line prerequisite because
`sample-circlepack` supports measure/data-edge color handling. WSU Line's color
bucket is categorical-only.

`com-company-collapsibleTreeViz/collapsibleTreeViz.js`:

```js
this._addColorMenuOption(oTransientVizContext, aResults, oTransientRenderingContext);
```

Both plugins add the hook inside `_addVizSpecificMenuOptions` for
`euidef.CM_TYPE_VIZ_PROPS`. The categorical-only tree example is the closer
model for WSU Line because it exposes the color menu without
`_isOnlyPhysicalRowEdge()`.

### Source Areas

In `wsuLine.js`:

- `_addVizSpecificMenuOptions`
- `_doInitializeComponent`
- `_generateData`
- `Config.colorSource`

In `wsuLinedatamodelhandler.js`:

- `Logical.COLOR` mapping

In `com-wsu-line.visualizationDatamodelHandler.json`:

- `color` bucket

### Current WSU Line Color State

WSU Line already has:

```js
oColorContext = this.getColorContext(oTransientRenderingContext);
oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, LOGICAL_COLOR);
colorInfo = this.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
```

And:

```js
this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
```

The missing piece is adding the menu option.

### Implementation Steps

1. Add `_addColorMenuOption` in WSU Line's context menu hook.

   Current block:

   ```js
   if (sMenuType === euidef.CM_TYPE_VIZ_PROPS && !this.isViewOnlyLimit()) {
      if (!oTransientRenderingContext) oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._addFilterMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
      this._addRemoveSelectedMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
   }
   ```

   Proposed:

   ```js
   WsuLineViz.superClass._addVizSpecificMenuOptions.call(this, oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext);
   this.loadConfig();
   if (sMenuType === euidef.CM_TYPE_VIZ_PROPS && !this.isViewOnlyLimit()) {
      if (!oTransientRenderingContext) oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._addFilterMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
      this._addRemoveSelectedMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
      if (this.Config.colorSource !== "custom") {
         this._addColorMenuOption(oTransientVizContext, aResults, oTransientRenderingContext);
      }
   }
   ```

   `this.loadConfig()` should be called after the superclass call and before
   the WSU Line menu branch. Context menus can be built outside the normal
   render path, and `colorSource` determines whether the native OAC color menu
   should be shown.

2. Decide whether to show Color menu even in Custom Palette mode.

   Recommended behavior:

   - If `Color Source = OAC Theme`, show native Color menu.
   - If `Color Source = Custom Palette`, either hide native Color menu or keep
     it visible but document that custom palette overrides assignments.

   Prefer hiding in Custom Palette mode to avoid a misleading menu.

3. Keep the existing `DEFAULT_COLOR_SETTINGS_CHANGED` subscription.

   No change needed unless testing shows the render does not refresh after
   color assignment changes.

4. Confirm `Logical.COLOR` remains mapped to row.

   WSU Line already maps:

   ```js
   oMapper.addCategoricalMapping(datamodelshapes.Logical.COLOR, oRow);
   ```

   Do not remove this.

5. Host-test the menu.

   This item cannot be fully validated by `node --check`. It needs OAD/OAC.

### Validation

- Right-click or use the visualization menu with `Color Source = OAC Theme`.
- Confirm a Color menu appears.
- Confirm the menu includes Manage Color Assignments or the host equivalent.
- Confirm Manage Color Assignments sees the `Series / Color` labels, not blank
  entries or internal row identifiers.
- Change a series color assignment.
- Confirm WSU Line rerenders with the new color.
- Confirm legend swatches, line strokes, point fills, and tooltip swatches all
  use the updated color.
- Switch `Color Source = Custom Palette`.
- Reopen the visualization context menu after switching modes; menu visibility
  is evaluated when the menu is built.
- Confirm OAC color assignments do not override the custom palette.
- Confirm the Color menu is hidden or clearly non-authoritative in Custom
  Palette mode, depending on the final implementation choice.

## Work Item 6: Documentation Updates

Update `docs/project_spec_wsu_line.md` after implementation.

Required updates:

1. Add STRM as a supported tooltip sort option.
2. Add STRM legend order modes.
3. Add axis title font/size/color controls.
4. Add tooltip `Show X In Title` behavior.
5. Clarify that `Value: Display Label` controls tooltip value column labeling
   and, unless `yAxisTitle` is set, also drives the Y axis title.
6. Add `yAxisTitleSource = auto | hidden` if implemented.
7. Clarify that WSU Line does not evaluate workbook parameters directly.
8. Add native Color menu behavior:
   - Available when `Color Source = OAC Theme`.
   - Custom Palette mode overrides OAC assignments.

Also update `docs/all_plugins.md` after v2 ships to note the implemented STRM
sort/legend behavior, axis title styling, tooltip title visibility, and native
color-menu findings. Color-menu wording can remain conditional on host testing;
the STRM and axis items should be documented once implemented.

## Recommended Implementation Order

Implement in this order so each change can be validated before the next broader
surface area:

1. Tooltip X title control.

   Smallest behavioral surface: one Config key, one checkbox gadget, one
   `_tooltipHtml` branch, one `_handlePropChange` map entry, and one
   `TOGGLE_GADGETS` entry.

2. Axis title styling.

   Pure rendering/property work around the two SVG axis-title nodes. Add Config
   defaults, `loadConfig` normalization, property gadgets, map entries, and
   `TOGGLE_GADGETS` entries for boolean controls.

3. STRM tooltip sort and legend order.

   Larger data-behavior change. Add metadata caching, tooltip sort support,
   default-direction handling, legend order modes, and the representative STRM
   comparator.

4. Value label UI cleanup and Y title hiding.

   Rename the existing `valueLabel` gadget label, preserve the current fallback
   chain, and add only `yAxisTitleSource = auto | hidden`.

5. Native color menu hook.

   Add `_addColorMenuOption(...)` last because it requires OAD/OAC host testing
   and cannot be fully verified with syntax checks.

6. Documentation updates.

   Update `project_spec_wsu_line.md` and `all_plugins.md` after the implemented
   behavior is known.

## Work Item 7: Validation Commands

Run from:

```powershell
cd "C:\Python Projects\wsu-gradschool-oac\OAC-Extensions"
```

Syntax checks:

```powershell
node --check oac-sdk-dev\src\customviz\com-wsu-line\wsuLine.js
node --check oac-sdk-dev\src\customviz\com-wsu-line\wsuLinedatamodelhandler.js
```

Manifest JSON checks:

```powershell
Get-Content oac-sdk-dev\src\customviz\com-wsu-line\extensions\oracle.bi.tech.plugin.visualization\com-wsu-line.json -Raw | ConvertFrom-Json | Out-Null
Get-Content oac-sdk-dev\src\customviz\com-wsu-line\extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\com-wsu-line.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json | Out-Null
```

Build:

```powershell
cd "C:\Python Projects\wsu-gradschool-oac\OAC-Extensions\oac-sdk-dev"
.\build-sdk.ps1
```

Expected output:

```text
oac-sdk-dev/build/distributions/customviz_com-wsu-line.zip
```

## Host Test Matrix

Test in OAD/OAC after building and uploading the extension.

### Data Setup

Recommended workbook fields:

```text
Value (Y-Axis): Admission Status parameter CASE measure
Category (X-Axis): Weeks from Start
Series / Color: Term
Sorting Term Code (STRM): STRM
Tooltip detail: Date, Day of Term, optional formatted attribute fields
Header Attributes: Last Snapshot, Day of Week
```

For the parameter-label test, also bind:

```text
Dynamic Value Label (from data): Admissions Status Selector label CASE attribute
```

This test is still pending in OAC Dev. Local testing can confirm that the
extension loads and that the bucket is packaged, but only Dev can prove the
workbook parameter refreshes the calculated label attribute.

### Tests

1. Tooltip Sort: STRM Asc
   - Hover a shared X position.
   - Rows are ordered oldest to newest by STRM.

2. Tooltip Sort: STRM Desc
   - Hover a shared X position.
   - Rows are ordered newest to oldest by STRM.

3. Legend Order: STRM Asc
   - Legend follows term-code chronology.

4. Legend Order: STRM Desc
   - Legend reverses term-code chronology.

5. Axis Title Styling
   - Increase X title font size.
   - Increase Y title font size.
   - Confirm only title text changes, not tick labels.

6. Tooltip X Title Control
   - Turn off `Show X In Title`.
   - Turn off `Show X Per Row`.
   - Hover chart and confirm no X value is shown.

7. Value Label
   - Set `Value: Display Label = Applied`.
   - Confirm tooltip value column says `Applied`.
   - Confirm Y axis title says `Applied` when `yAxisTitle` is empty.
   - Set `yAxisTitle = Admission Status` and confirm only the axis title
     changes while the tooltip value column remains `Applied`.

8. Dynamic Value Label
   - Create the Admissions Status Selector calculated label attribute.
   - Drop it into `Dynamic Value Label (from data)`.
   - Change the selector through Applied, Admitted, Confirmed, and Enrolled.
   - Confirm the measure values, Y-axis fallback title, and tooltip value column
     update together without property edits.

9. Color Menu
   - Set `Color Source = OAC Theme`.
   - Open visualization context menu.
   - Confirm Color menu appears.
   - Use Manage Color Assignments.
   - Confirm lines, points, legend, and tooltip swatches update.

10. Custom Palette Override
   - Set `Color Source = Custom Palette`.
   - Confirm custom palette controls color output.
   - Confirm OAC color assignments do not unexpectedly override custom palette.

## Risks and Open Questions

1. Native Color menu behavior is host-controlled.

   `_addColorMenuOption(...)` is present in training plugins, but final menu
   text and exact behavior must be confirmed in OAD/OAC.

   Do not add `_isOnlyPhysicalRowEdge() { return false; }` in the minimum v2
   build. `com-company-collapsibleTreeViz` exposes `_addColorMenuOption(...)`
   without that override, and it is the closer categorical-color example. Add
   `_isOnlyPhysicalRowEdge()` only as a follow-up if host testing shows WSU
   Line's categorical color menu fails without it.

2. Parameter evaluation is likely not available through current plugin code.

   Do not implement workbook-specific parsing unless an official host API is
   identified and tested. Use the `Dynamic Value Label (from data)` bucket to
   receive parameter-evaluated text from an OAC calculated attribute instead.

3. STRM conflicts within one series are possible.

   `_aggregateRows` already sets conflicting grouped STRM values to `null`.
   Legend representative STRM should be computed from valid post-aggregation
   row `termCode` values only, with missing series sorting last.

4. Multi-panel property dialog remains best-effort.

   If custom tabs fail in a host version, all controls should still appear in
   General via the existing fallback pattern.

5. Function names are more reliable than line numbers.

   Reviews from other agents may cite approximate line numbers. Use function
   names such as `_tooltipHtml`, `_addVizSpecificMenuOptions`, `_legendItems`,
   and `_buildSortColumnOptions` as the canonical references.

## Acceptance Criteria

The v2 work is complete when:

- `node --check` passes for both WSU Line JS files.
- Both WSU Line JSON manifests parse.
- The SDK build creates `customviz_com-wsu-line.zip`.
- STRM appears in tooltip sort options.
- STRM appears in legend order options.
- Tooltip and legend STRM ordering work in OAD/OAC.
- Axis title font controls work for both auto and override titles.
- Tooltip X value can be hidden from the title and row columns.
- Dynamic Value Label can align tooltip and Y axis naming for parameter-driven
  measures without manual property edits after each parameter change.
- OAC Dev validates the Admissions Status Selector calculated label path:
  Applied / Admitted / Confirmed / Enrolled each update the measure, Y-axis
  fallback title, and tooltip value column together.
- Native OAC Color menu path appears when `Color Source = OAC Theme`, or host
  testing documents why it cannot be exposed.
- `docs/project_spec_wsu_line.md` is updated to match implemented behavior.
- `docs/all_plugins.md` is updated with implemented WSU Line v2 outcomes.
