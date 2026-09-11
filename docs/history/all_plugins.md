# All Plugins - Cross-Plugin Review Notes

> **STATUS: HISTORICAL REVIEW NOTES.** Snapshot of a cross-plugin review from
> May 2026. Items 3.1 and 3.2 have since been implemented. The durable lessons
> now live in `docs/oac_design.md`; still-open items are tracked in
> `CHANGELOG.md` under "Known gaps".

This document captures plugin-level lessons that now apply across the WSU OAC
custom visualization set, plus focused review questions for plugins that may
benefit from follow-up work.

Read alongside:
- `oac_design.md` for reusable architecture and OAC/OAD host patterns.
- `project_spec_wsu_*.md` for plugin-specific behavior and implementation
  contracts.

---

## 1. Shared Lessons Learned

### 1.1 Property pane compatibility
- Host-compatible gadget wiring matters. Boolean controls should use
  `TextToggleGadgetInfo`; text inputs should use `factory.createGadgetInfo(...)`
  when that is the working repo pattern.
- Multi-panel property dialogs should be treated as best-effort. Use a General
  panel fallback when custom panel IDs are not honored by the host version.

### 1.2 Tooltip contracts should be explicit
- Plugin-authored tooltip rows are acceptable only when their semantics are
  stable and clearly controlled by properties.
- When analytical meaning depends on row history, unseen filters, or upstream
  grain, prefer dataset-authored fields over plugin inference.
- Authored-only tooltip modes should render exactly what is present in the
  tooltip/detail grammar bucket and avoid hidden fallback rows.

### 1.3 Grammar bucket caveats
- A `contentType: "both"` bucket can be host-sensitive. Current OAC/OAD behavior
  may allow either attributes or measures but not both families together once a
  bucket is populated.
- A failed drop does not automatically mean a bucket rejects that data family.
  The host may reject reusing the exact same field in multiple grammar buckets
  within one visualization.
- When the same semantic value must serve multiple roles, use a separate
  aliased/copied source field in the dataset.
- For authored tooltip-detail buckets, categorical-only should be the default
  cross-plugin standard. If a measure-like value needs to appear there, expose a
  formatted attribute upstream instead of relying on mixed-family bucket
  behavior.

### 1.4 Color and legend precedence
- OAC theme color assignment should remain the default behavior unless a plugin
  has a clear, property-driven reason to override it.
- When a visual state needs special emphasis, such as incomplete Sankey paths,
  the precedence rule should be explicit and visible in both code and docs.
- Legends that imply interaction should be click-active or should read clearly
  as static keys.

---

## 2. Current Plugin-Specific Lessons

### 2.1 Sankey
- Incomplete-path handling is now explicit and property-driven.
- Canonical missing-terminal routing belongs in the plugin because it is part of
  the chart grammar, not a workbook author workaround.
- Incomplete highlight color must override normal flow coloring when enabled.
- Tooltips now keep authored detail visible independently from derived metrics.

### 2.2 Lattice Scatter
- Derived `Attempt` and `Repeats` were removed from the plugin tooltip contract.
- Tooltips are now authored-only from `Tooltip Detail`.
- If attempt/repeat metrics are analytically required, they should be calculated
  upstream in the dataset and intentionally added to the tooltip bucket.
- Empty `Tooltip Detail` should not produce an empty tooltip shell.
- Host field-reuse limitations matter in practice: a field already used in a
  dedicated role bucket may need an alias/copy before it can also appear in the
  tooltip.

---

## 3. Dumbbell - Recommended Follow-Up Review

### 3.1 Likely improvement: suppress empty tooltips
Current behavior:
- Dumbbell supports a hybrid tooltip model with property-controlled built-in
  rows plus authored `Tooltip details`.
- If all tooltip show toggles are disabled and `Tooltip details` is empty, the
  renderer still appears capable of opening an empty tooltip container.

Decision:
- Yes. Dumbbell should suppress the tooltip entirely when there are no visible
  rows to render.

### 3.2 Standardize Tooltip details as categorical-only
Current behavior:
- `Tooltip details`, `Sort By`, and `Filter By` are currently mixed-family
  buckets in Dumbbell.

Decision:
- Change Dumbbell `Tooltip details` to categorical-only for consistency with
  the preferred cross-plugin tooltip-detail contract.
- Keep the host field-reuse caveat documented: a field already used elsewhere in
  the grammar may not be reusable in `Tooltip details`, `Sort By`, or
  `Filter By` without a dataset alias/copy.
- If a measure needs to appear in authored tooltip detail, use a formatted
  attribute exposed upstream.

### 3.3 Group Aggregate mode drops authored tooltip detail
Current behavior:
- Aggregate rows are rebuilt without carrying through row-level `details`.

Decision:
- Keep authored row-level tooltip detail out of `Group Aggregate` mode unless a
  truthful aggregate rule is explicitly defined.
- Do not surface arbitrary carry-through values or concatenated row details.
- Document that aggregate-mode tooltip detail should come from pre-aggregated
  dataset fields when authors need aggregate-safe explanatory text.

### 3.4 Potential behavior gap: aggregate-mode Sort By / Filter By
Observed risk:
- Group aggregation appears to happen before filtering/sorting, and aggregate
  rows do not retain `sortFields` / `filterFields`.

Questions:
- Do viewer-side `Sort By` and `Filter By` controls still work correctly in
  `Group Aggregate` mode?
- If not, should filtering occur before aggregation and sorting use preserved
  aggregate-safe fields, or should those controls be disabled/hidden in that
  mode?

Conclusion:
- Treat this as a confirmed functional bug.
- Recommended fix:
  1. Apply active `Filter By` selections before group aggregation.
  2. Aggregate the filtered row set.
  3. Preserve or recompute only aggregate-safe sort metadata for grouped rows,
     rather than leaving visible Sort controls backed by missing fields.

This is the highest-priority Dumbbell follow-up because it is a real behavioral
mismatch, not just a documentation issue.

---

## 4. WSU Line - Recommended Follow-Up Review

### 4.1 Tooltip detail is attribute-only today
Current behavior:
- `Tooltip detail` is currently categorical-only in the datamodel handler.
- The project spec says calculated fields can be dropped into the tooltip,
  which may be read more broadly than the implementation allows.

Decision:
- Keep WSU Line `Tooltip detail` categorical-only.
- Tighten the spec so it says authored tooltip detail is attribute-only.
- Use dataset-authored or calculated formatted attributes when a measure-like
  value must appear in the tooltip.

### 4.2 Derived comparisons need explicit data-trust rules
Current behavior:
- `Vs Avg`, `Rank`, `Delta 1 Year`, and `Delta 3 Years` are plugin-derived
  tooltip columns.
- The previous-period and 3-year logic rely on `Series / Color` carrying a
  chronological meaning, with academic-term parsing and fallback ordering.

Implemented:
- WSU Line now exposes an optional `Sorting Term Code (STRM)` grammar bucket and
  uses it as the authoritative chronology input for year-over-year tooltip
  calculations.
- `Delta 1 Year` compares the same-season STRM exactly one academic year back.
- `Delta 3 Years` averages prior same-season STRM values across up to three
  academic years.
- If `STRM` is absent or invalid, `Delta 1 Year` and `Delta 3 Years` do not
  render.
- Display-label parsing is no longer part of the decision path for these two
  derived tooltip columns.

### 4.2.1 STRM sort and legend order
Implemented:
- WSU Line tooltip sorting now exposes STRM as an explicit sort option when the
  `Sorting Term Code (STRM)` bucket is supplied.
- WSU Line legend ordering now supports STRM ascending and descending modes.
- Missing or invalid STRM values sort last, and aggregation conflicts already
  collapse conflicting grouped STRM values to null.

### 4.3 Field reuse should be documented
Current behavior:
- Line has `Series / Color`, `Header Attributes`, and `Tooltip detail` buckets.

Questions:
- Should the Line spec document the same field-reuse caveat now captured for
  Lattice Scatter?
- If an author wants the same attribute both in the header chip strip and in the
  tooltip, should the recommended setup be a separate aliased/copied dataset
  field?

### 4.4 Low-priority UX cleanup: near-empty tooltips
Observed risk:
- Authors can turn off multiple built-in columns and provide little or no detail,
  resulting in a very thin tooltip structure that may still render.

Decision:
- Keep WSU Line's richer property-driven tooltip system intact.
- Do not collapse it into the Lattice/Dumbbell authored-only pattern simply for
  consistency.
- Only revisit tooltip suppression if there is a clearly empty shell with no
  meaningful title/value context left to display.

### 4.5 WSU Line v2 UI controls
Implemented:
- Tooltip X value visibility is split between `Show X In Title` and
  `Show X Per Row`, with Privacy Mode still taking precedence.
- Axis title font size, title color, bold, and italic controls are available
  for the SVG axis titles.
- `Value: Display Label` is the user-facing label for the existing `valueLabel`
  override. It controls the tooltip value column and also feeds the Y-axis title
  unless a specific Y-axis title override is set.
- `Dynamic Value Label (from data)` is an optional categorical bucket for
  parameter-driven labels. When exactly one non-empty label value is supplied,
  it overrides the manual `Value: Display Label` fallback for the tooltip value
  column and Y-axis fallback title.
- Local build/package validation passed for this bucket, but parameter behavior
  still needs OAC Dev testing because the workbook must evaluate
  `@parameter(...)` inside a categorical calculated attribute before WSU Line can
  receive the resolved text.
- The native OAC color menu hook is exposed when `Color Source = OAC Theme`.
  Final menu wording and Manage Color Assignments behavior remain host-version
  details to validate in OAD/OAC.

### 4.6 Cross-extension color control follow-up
Follow-up:
- Review WSU Dumbbell, WSU Lattice Scatter, WSU Network, and WSU Sankey for the
  same color-source pattern now used in WSU Line: default to OAC Theme, keep
  Custom Palette as an explicit override, and expose the native color menu /
  Manage Color Assignments path when the plugin uses OAC theme colors.
- Do not assume the hook is copy/paste safe. Confirm each plugin's data model
  maps `Logical.COLOR`, uses the OAC color service for series/items, and
  subscribes to default color assignment changes before adding menu support.
- Any plugin-specific color semantics, such as Sankey edge/node coloring or
  Network incomplete-path highlighting, must keep their intended precedence over
  generic color assignment.

---

## 5. Recommended Cross-Plugin Validation Order

1. Confirm Dumbbell aggregate-mode `Sort By` / `Filter By` behavior.
2. Validate WSU Line `Sorting Term Code (STRM)` authoring in OAC/OAD and confirm
   `Delta 1 Year` / `Delta 3 Years` appear only when STRM is supplied.
3. Validate WSU Line `Dynamic Value Label (from data)` with the Admissions
   Status Selector parameter in OAC Dev.
4. Validate WSU Line native Color / Manage Color Assignments behavior in OAC
   Theme mode.
5. Review other WSU extensions for whether WSU Line's color-source controls and
   native color menu hook should be implemented there.
6. Validate categorical-only Tooltip Detail behavior in Dumbbell and WSU Line.
7. Validate truly empty Dumbbell tooltip shells are suppressed.
8. Keep WSU Line's richer configured tooltip model; only suppress tooltips if a
   clearly empty-shell case is proven.
9. Update any downstream handoff notes only if host testing reveals a mismatch
   between packaged behavior and OAC/OAD rendering.
