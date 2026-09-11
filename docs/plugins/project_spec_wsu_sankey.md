# WSU Sankey — Plugin Reference

Canonical reference for the **WSU Sankey** custom visualization
(`com-wsu-sankey`). Read this plus `../oac_design.md` to continue
development without re-deriving design decisions from built-in Sankey limits.

---

## 1. Overview

### Identity
- **Display name**: WSU Sankey
- **Short name**: WSU Sankey
- **Category**: WSU
- **Root id**: `com-wsu-sankey`
- **Version constant**: `WsuSankeyViz.VERSION = "1.0.0"`
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-sankey/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-sankey.zip`

### What WSU Sankey is
A governed Sankey for academic pathway analysis where start, end, and optional
intermediate stages are modeled explicitly, rather than inferred loosely by
generic category logic.

Primary use cases:
- **Staged milestone journeys** such as academic-interest or career-program flow:
  `Initial Interest -> Year 1 Interest -> Year 2 Interest -> Year 3 Interest -> Graduation Outcome`.
- **Course-centered ordered flow** where the workbook has already shaped a
  bounded path row such as:
  `Prior 3 -> Prior 2 -> Prior 1 -> Target Course`
  or
  `Source Course -> Next 1 -> Next 2 -> Downstream Target`.
- Controlled transitions where users need deterministic flow stages and a
  numeric/table companion for auditability.

WSU Sankey is not interchangeable with WSU Network:
- use **Sankey** when the analytical question depends on fixed stage order and
  volume through those stages,
- use **Network** when the analytical question depends on connector structure,
  repeat self-loops, and non-linear adjacency around a course anchor.

### Why this plugin exists
Built-in OAC Sankey is powerful but too permissive for institutional pathway
workflows:
- cannot cleanly enforce start vs end semantics,
- may infer noisy intermediate nodes,
- has limited governance over ordering and validation.

WSU Sankey prioritizes **grammar control + predictable flow construction**.

---

## 2. Data Grain and Semantics (Authoritative)

### Supported v1 row shape (authoritative)
Phase 1 uses **explicit path-row grain**.

One source row represents one entity/path observation with:
- one `Start Node`,
- zero or more `Intermediate Nodes` (in bucket order),
- one `End Node`,
- optional `Flow Weight`.

The renderer expands each row into adjacent Sankey edges. If `Flow Weight` is
absent, each row contributes weight `1`.

Edge-row guided-auto input (`from_node`/`to_node`/`step_index`) is deferred to
post-v1 unless a separate grammar contract is added.

### Supported v1 dataset families

#### Family A — Staged milestone journeys
This is the preferred contract for academic-interest, program-migration, or
career-stage journeys with fixed checkpoints.

Example:
- `Initial Interest`
- `Year 1 Interest`
- `Year 2 Interest`
- `Year 3 Interest`
- `Graduation Plan` or `No Completion`

Each rendered Sankey row should represent one governed entity/path observation,
typically one student under a declared outcome policy.

#### Family B — Course-centered ordered pathway flow
This is the preferred Sankey contract for questions such as:
- “How did students get to `MATH 220`?”
- “Where did students go after `MATH 103`?”

The Sankey row should already be shaped upstream into explicit stage columns.
The plugin does not derive sequence from raw attempt rows. Dataset preparation
must select the anchor, bound the number of prior/future steps, and place each
step into a fixed stage column before rendering.

Example inbound-to-target row:
- `Start Node = Prior 3`
- `Intermediate 1 = Prior 2`
- `Intermediate 2 = Prior 1`
- `End Node = Target Course`

Example outbound-from-source row:
- `Start Node = Source Course`
- `Intermediate 1 = Next 1`
- `Intermediate 2 = Next 2`
- `End Node = Downstream Target` or terminal outcome

### Stage semantics
- `Start Node` is stage 0 anchor.
- `End Node` is terminal stage anchor.
- `Intermediate Nodes` are optional inserted stages between start and end.
- Intermediate stage order in explicit mode is **bucket layer order**.

### Ordering semantics
- `Sort Key (STRM)` is ordering evidence metadata, not the display
  label for stages.
- Prefer numeric dataset sort keys over label parsing.
- Do not parse chronology from display labels in Sankey v1.

### Flow construction precedence (authoritative)
1. Explicit stage grammar (Start + Intermediate + End),
2. dataset-provided ordering keys (`sort_key`, STRM, sequence fields),
3. neutral deterministic fallback when sort keys are missing.

### Missing-end and incomplete-outcome semantics
- Missing End values are detected from true nulls plus empty strings,
  whitespace-only strings, and the common literals `null`, `(null)`, `n/a`,
  and `na` after trim/lowercase normalization.
- When `routeMissingEndToIncomplete=on`,
  `includeIncompletePaths=on`, and Start is present, a missing End is routed
  to `incompleteEndLabel` (default `No Completion`) as a canonical terminal
  node.
- If the workbook already uses a COALESCE-style End calc that returns the same
  text as `incompleteEndLabel`, the plugin still treats that terminal as an
  incomplete outcome for highlighting and include/hide behavior.
- If `includeIncompletePaths=off`, rows that would resolve to the canonical
  incomplete terminal are excluded when `dropOrphans=on`, or redirected to
  `unknownEndLabel` when `dropOrphans=off`.

---

## 3. Dataset Contract (v1 recommended fields)

### Core fields
- `entity_id` (for example `student_id`)
- `start_node_label`
- `end_node_label`
- `intermediate_stage_1` .. `intermediate_stage_5` (optional)
- `flow_weight` (optional measure)

### Strongly recommended ordering fields
- `path_key` (stable path discriminator per entity pathway)
- `term_code` (STRM-style numeric code for ordering evidence)
- `term_label_short` (for display only; for example `Fall 2023`)

### Recommended context fields
- `campus`
- `college`
- `program`
- `admit_term`
- `grad_term`
- `course_subject_catalog`
- policy/advising flags

### Display vs sort guidance
- Use node label fields for display.
- Use `term_code` / STRM for ordering evidence.
- Do not derive chronology from display labels when sort keys exist.

### 3.1 Dataset family A — staged milestone journey contract

Recommended grain:
- one row per student-path outcome under a declared terminal policy

Recommended columns:
- `student_id`
- `initial_primary_interest`
- `year1_primary_interest`
- `year2_primary_interest`
- `year3_primary_interest`
- `graduation_plan`
- `graduation_status`
- `flow_weight` — usually `1`
- `admit_term`
- `college`
- `campus`
- `path_key`

Recommended Sankey mapping:

| Plugin Concept | Staged Journey Field |
|---|---|
| `Start Node` | `initial_primary_interest` |
| `Intermediate 1` | `year1_primary_interest` |
| `Intermediate 2` | `year2_primary_interest` |
| `Intermediate 3` | `year3_primary_interest` |
| `End Node` | `graduation_plan` or missing/null for plugin-routed incomplete |
| `Flow Weight` | `1` or governed row count |
| `Path Group` | cohort, college, or declared path family |
| `Tooltip Detail` | graduation status, admit term, cohort, completion notes |

Required policy decisions:
- define the annual checkpoint used for each year-stage, such as fall census or
  end-of-year primary interest,
- define whether missing intermediate stages mean “not yet observed,”
  “exited,” or an explicit authored missing-stage label,
- define terminal graduation policy when a student has multiple awarded plans,
  for example:
  - primary awarded plan only,
  - one row per awarded plan with an explicit disclosed duplication rule,
  - or one governed terminal outcome plus secondary plans relegated to detail.

The visualization should not silently duplicate one student into multiple
graduation outcomes because of upstream joins.

### 3.2 Dataset family B — course-centered ordered pathway contract

Recommended upstream source:
- an attempt-grain pathway fact, one row per
  `student_id + course_id + term_index + attempt_number`,
  with sequence fields such as `next_course_id`, `previous_course_id`,
  `transition_type`, and repeat markers already derived upstream.

Recommended Sankey extract grain:
- one row per anchored student path signature, or one row per anchored student
  path observation before aggregation

Inbound target-course mode example:
- anchor = `MATH 220`
- path scope = last `N` prior in-scope math attempts before the selected anchor
  attempt

Outbound source-course mode example:
- anchor = `MATH 103`
- path scope = first `N` subsequent in-scope math attempts after the selected
  source attempt

Recommended columns:
- `student_id`
- `path_key`
- `anchor_course_id`
- `trace_direction` (`backward_to_target` | `forward_from_source`)
- `start_node_label`
- `intermediate_stage_1`
- `intermediate_stage_2`
- `intermediate_stage_3`
- `intermediate_stage_4`
- `intermediate_stage_5`
- `end_node_label`
- `flow_weight`
- `anchor_term_index`
- `anchor_attempt_number`
- `repeat_count_on_path`
- `terminal_path_flag`
- `path_outcome_group`

Recommended Sankey mapping:

| Plugin Concept | Course Path Field |
|---|---|
| `Start Node` | first retained course step |
| `Intermediate Nodes` | bounded prior/future course steps in strict order |
| `End Node` | anchor target, downstream target, or terminal outcome |
| `Flow Weight` | `1` per path row or pre-aggregated count |
| `Sort Key` | anchor term or declared path order evidence |
| `Path Group` | pass/repeat/terminal or other aggregate-safe grouping |
| `Tooltip Detail` | anchor course, attempt number, route type, completion context |

Course-path rules:
- do not emit raw attempt rows directly into WSU Sankey,
- do not let label sorting determine sequence order,
- stage columns must already reflect the declared prior/future step order,
- repeated courses may appear in adjacent or non-adjacent stage columns when the
  prepared path row requires them,
- because `disallowSelfLinks=on` is the default plugin behavior, course-path
  workbooks that intentionally retain repeated adjacent stages must either:
  - configure Sankey to allow self-links where that rendering is analytically
    desired, or
  - collapse/report repeats outside the Sankey and use WSU Network as the
    repeat-aware companion visual.

---

## 4. Bucket Layout (current v1)

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `row` | `ROW` | categorical | 1 | 1 | Start Node |
| `item` | `ITEM` | categorical | 1 | 1 | End Node |
| `glyph` | `GLYPH` | categorical | 0 | 5 | Intermediate Nodes |
| `measures` | `MEASURES` | measures | 0 | 1 | Flow Weight |
| `size` | `SIZE` | both | 0 | 1 | Sort Key (STRM) |
| `color` | `COLOR` | categorical | 0 | 1 | Path Group |
| `detail` | `CATEGORY` | both | 0 | 20 | Tooltip Detail |

Notes:
- If `measures` is absent, plugin uses row count weight = 1.
- `glyph` layer order defines explicit intermediate stage order.
- v1 hard cap for intermediate depth is 5 (matches grammar max).

### Recommended workbook setup for student journeys
- `Start Node`: the entry state, such as initial academic plan or first observed
  course step.
- `Intermediate Nodes`: ordered pathway stages, one bucket layer per step when
  the journey should show middle transitions.
- `End Node`: the completion or terminal outcome. Raw null-like End values are
  acceptable when plugin-side canonical routing should create `No Completion`.
- `Flow Weight`: optional measure. Omit it when one source row should equal one
  pathway count.
- `Sort Key (STRM)`: chronology or ordering evidence only; it should not replace
  display labels.
- `Path Group`: optional color grouping. Incomplete-path highlighting still wins
  when enabled.
- `Tooltip Detail`: contextual author-supplied detail for edge tooltips. The
  current OAC/OAD grammar surface accepts attributes or measures here, but not
  both families together once the bucket is populated.

### Dataset architect decision guide

Use **staged milestone journey shaping** when:
- every row naturally has a fixed ordered checkpoint structure,
- the question is interest/program/career movement through named stages,
- `No Completion` or another incomplete terminal is a meaningful end state.

Use **course-centered ordered pathway shaping** when:
- the source data is an event history,
- the question is “how did students get here?” or “where did they go next?”,
- a bounded prior/future path should be flattened into explicit stage columns
  before Sankey rendering.

Use **WSU Network instead of or beside Sankey** when:
- repeated adjacent course attempts are a first-class analytic signal,
- connector/bottleneck structure matters more than stage lanes,
- the user needs a graph of observed transitions rather than a fixed-stage flow.

### Current plugin fit and required changes

The current Sankey plugin contract already fits both sanctioned dataset
families when the workbook/data-flow layer prepares explicit path rows:
- staged milestone journeys map directly onto Start / Intermediate / End,
- math course-path exploration works when bounded prior/future steps are
  flattened into explicit intermediate columns before rendering,
- incomplete terminal handling already supports outcomes such as
  `No Completion`.

No datamodel-handler change is required for these two v1 use cases.

Potential future plugin work, only if the authoring workflow demands it:
- guided workbook presets for “milestone journey” vs “course path” terminology,
- stronger UI affordances for stage-title templates by use case,
- optional repeat-aware Sankey treatment beyond the current
  `disallowSelfLinks` toggle,
- optional author-facing validation summaries tailored to path-row families.

These are usability enhancements, not prerequisites for data architects to
construct compatible datasets today.

---

## 5. Config Schema (v1, explicit mode only)

### Flow construction
- `flowMode`: `explicit` (fixed in v1)
- `intermediatePolicy`: `none|provided` (default `provided`)
- `maxIntermediateDepth`: integer `0..5` (default `4`)
- `maxIntermediateDepth` behavior: if dataset provides 5 intermediate layers and
  setting is `4`, the 5th layer is ignored and counted in validation warnings.

### Ordering
- `xSortDirection`: `asc|desc` (default `asc`)
- `termCodeDirection`: `asc|desc` (default `asc`)

`xSortDirection` controls visual stage direction only (left-to-right or
right-to-left). It does not change logical path semantics, which remain
`Start -> Intermediate -> End`.

### Noise reduction
- `minFlowThreshold`: numeric (default `0`)
- `thresholdMode`: `absolute|percent` (default `absolute`)
- `topNPerStage`: integer `0..50` (default `0`, off)
- `collapseOther`: `on|off` (default `off`)
- `dropOrphans`: `on|off` (default `on`)

### Incomplete outcomes
- `includeIncompletePaths`: `on|off` (default `on`)
- `routeMissingEndToIncomplete`: `on|off` (default `on`)
- `incompleteEndLabel`: text (default `No Completion`)
- `highlightIncompletePaths`: `on|off` (default `on`)
- `incompletePathColor`: hex color (default `#d97706`)
- `unknownStartLabel`: text fallback for missing Start values when orphan rows
  are retained (default `(Unknown Start)`).
- `unknownEndLabel`: text fallback for missing End values when orphan rows remain
  unresolved and are retained (default `(Unknown End)`).

### Validation and governance
- `disallowSelfLinks`: `on|off` (default `on`)
- `requireMonotonicStep`: `on|off` (default `off`)
- `requireUniquePathKey`: `on|off` (default `off`)
- `strictStageBoundaries`: `on|off` (default `on`)
- `showWarnings`: `on|off` (default `on`)

### Tooltip, color, and interaction
- `tooltipPercentMode`: `off|stage|total|both` (default `stage`)
- `showDerivedTooltipMetrics`: `on|off` (default `off`)
- `colorSource`: `oac|custom` (default `oac`)
- `colorBy`: `group|source|target` (default `group`)
- `customPalette`: text (comma-separated hex, optional)

### Visual
- `nodeWidth`: slider (default `24`)
- `nodeGap`: slider (default `18`)
- `autoNodeGap`: `on|off` (default `on`)
- `minNodeHeight`: slider (default `8`)
- `stagePadding`: slider (default `18`)
- `chartLeftPadding`: slider (default `72`)
- `chartRightPadding`: slider (default `72`)
- `chartBottomPadding`: slider (default `24`)
- `linkOpacity`: slider (default `0.35`)
- `linkCurve`: slider (default `0.5`)
- `valueDecimals`: slider (default `1`)
- `nodeFillColor`: hex color (default `#0f4c5c`)
- `nodeLabelFontSize`: slider (default `11`)
- `nodeLabelMaxChars`: slider (default `28`)
- `linkLabelFontSize`: slider (default `10`)
- `showNodeLabels`: `on|off` (default `on`)
- `showLinkLabels`: `on|off` (default `off`)
- `showLegend`: `on|off` (default `on`)
- `legendPosition`: `bottom|top` (default `bottom`)

### Stage-frame titles
- `showStageTitles`: `on|off` (default `off`)
- `startStageTitle`: text (default empty)
- `endStageTitle`: text (default empty)
- `stageTitleColor`: hex color (default `#202124`)
- `stageTitleFontSize`: slider (default `12`)
- `stageTitleBold`: `on|off` (default `on`)
- `stageTitleItalic`: `on|off` (default `off`)
- `stageTitleOrientation`: `vertical|horizontal` (default `vertical`)
- `stageTitleOffset`: slider (default `42`)

---

## 6. Flow Construction Contract (v1)

### Explicit mode
- Build path strictly as:
  `Start Node -> Intermediate Nodes (if provided/policy allows) -> End Node`.
- No inferred intermediate nodes in v1.
- If `intermediatePolicy=none`, connect Start directly to End.
- If End is missing and routing is enabled, the terminal is the canonical
  incomplete End node rather than a workbook-authored COALESCE dependency.

### Incomplete color precedence
- When `highlightIncompletePaths=on`, every rendered edge belonging to an
  incomplete pathway uses `incompletePathColor` before `colorSource` and
  `colorBy` logic.
- OAC theme color assignment remains the primary behavior for all other edges.
- The legend surfaces an `Incomplete Paths` entry when highlighted incomplete
  pathways are present.

### Validation definitions
- **Self-link**: adjacent edge where normalized source and target labels match.
- **Orphan**: row missing required Start or End value.
- **Monotonic violation**: adjacent stages whose available numeric order keys
  decrease.
- **Strict stage boundaries**: when enabled, invalid or out-of-order stages are
  dropped and counted in validation warnings.
- **Monotonic no-evidence behavior**: if `requireMonotonicStep=on` but fewer
  than two adjacent numeric order keys are available, monotonic evaluation is
  skipped and counted as `not evaluated` (not pass/fail).

### Processing and aggregation order
1. Expand each row into adjacent stage edges.
2. Validate edges/rows and drop invalids per toggles.
3. Aggregate by `stage_index + from_node + to_node + color_group`.
4. Compute totals and percent metrics.
5. Apply threshold and top-N rules.
6. Apply `collapseOther` (if enabled).
7. Render.

### Aggregation semantics
- Sum `flow_weight` when provided.
- Else count rows.
- `path_key` is for validation/drill evidence, not part of default aggregation
  key.

---

## 7. Tooltip and Marking Contract (v1)

### Tooltip content
Tooltip should include:
- node/edge identity rows (`Node`, or `From` / `To`) by default,
- Tooltip Detail fields in the same edge tooltip,
- optional derived rows when `showDerivedTooltipMetrics=on`
  (flow weight, stage/total percent, row counts),
- validation annotation when rows were dropped/collapsed.

`showDerivedTooltipMetrics=off` must never suppress user-authored Tooltip
Detail content. It only removes plugin-generated statistics. Tooltip Detail can
accept attributes or measures, but this OAC/OAD grammar surface does not allow
both data families to be mixed in the same populated Tooltip Detail bucket at
the same time.
Edge tooltips show user-authored detail directly. Node tooltips stay concise by
default (`Node` only) because aggregated node-level detail can collapse many
distinct pathways into noisy comma-separated lists; node detail rollups return
only when derived metrics are explicitly enabled.

### Marking behavior
- **Edge click** marks all source rows contributing to that aggregated edge.
- **Node click** marks all source rows where that node appears in any rendered
  stage.
- Start-node focus follows downstream paths.
- End-node focus follows upstream contributors.
- Intermediate-node focus shows both upstream and downstream relationships.
- Marking must use retained source-row references, not only aggregated ids.
- Legend items are click-active focus controls when rendered.

---

## 8. Property Panel Layout (current, with control types)

These are the logical control groups. On host versions that do not render
custom property panels reliably, the plugin falls back to the General panel
while keeping the same controls available.

### General
- `intermediatePolicy` (switcher)
- `maxIntermediateDepth` (slider)
- `tooltipPercentMode` (switcher)
- `showDerivedTooltipMetrics` (toggle)
- `includeIncompletePaths` (toggle)
- `routeMissingEndToIncomplete` (toggle)
- `colorSource` (switcher)
- `colorBy` (switcher)
- `customPalette` (text field)
- `unknownStartLabel` (text field)
- `unknownEndLabel` (text field)
- `incompleteEndLabel` (text field)

### Order & Rules
- `xSortDirection` (switcher)
- `termCodeDirection` (switcher)
- `disallowSelfLinks` (toggle)
- `dropOrphans` (toggle)
- `requireMonotonicStep` (toggle)
- `requireUniquePathKey` (toggle)
- `strictStageBoundaries` (toggle)
- `showWarnings` (toggle)

### Noise Control
- `minFlowThreshold` (text/number field)
- `thresholdMode` (switcher)
- `topNPerStage` (slider)
- `collapseOther` (toggle)

### Style
- `nodeWidth` (slider)
- `nodeGap` (slider)
- `autoNodeGap` (toggle)
- `minNodeHeight` (slider)
- `stagePadding` (slider)
- `chartLeftPadding` (slider)
- `chartRightPadding` (slider)
- `chartBottomPadding` (slider)
- `linkOpacity` (slider)
- `linkCurve` (slider)
- `valueDecimals` (slider)
- `nodeLabelFontSize` (slider)
- `nodeLabelMaxChars` (slider)
- `linkLabelFontSize` (slider)
- `nodeFillColor` (text field)
- `showNodeLabels` (toggle)
- `showLinkLabels` (toggle)
- `highlightIncompletePaths` (toggle)
- `incompletePathColor` (text field)
- `showLegend` (toggle)
- `legendPosition` (switcher)
- `showStageTitles` (toggle)
- `startStageTitle` (text field)
- `endStageTitle` (text field)
- `stageTitleColor` (text field)
- `stageTitleFontSize` (slider)
- `stageTitleOffset` (slider)
- `stageTitleBold` (toggle)
- `stageTitleItalic` (toggle)
- `stageTitleOrientation` (switcher)

### Stage-title use cases
- `startStageTitle`: examples include `Beginning Academic Interest` or
  `Beginning Math Course`.
- `endStageTitle`: examples include `Academic Plan at Graduation` or
  `Target Math Course`.
- Titles are chart-frame annotations positioned like vertical axis titles,
  not data nodes and not tooltip text.

---

## 9. Implementation Sequence (Golden Path)

1. Scaffold plugin identity, manifests, datamodel handler, and icon.
2. Implement explicit Start/End with direct links.
3. Add Intermediate Nodes grammar support (0..5) with bucket-order staging.
4. Add Term Code ordering evidence and precedence behavior.
5. Implement threshold/top-N/collapse and validation warnings.
6. Implement tooltip percent modes and source-row-aware marking.
7. Polish visuals and finalize OAC property panel wiring.

---

## 10. Validation Checklist

- [ ] Plugin registers and appears in gallery with icon.
- [ ] Start/End-only Sankey renders without unintended intermediate nodes.
- [ ] Intermediate layers follow grammar bucket order exactly.
- [ ] `maxIntermediateDepth` never exceeds 5.
- [ ] STRM/Term Code behavior affects ordering evidence, not stage-layer order.
- [ ] `flow_weight` aggregation matches expected totals.
- [ ] Threshold and Top-N controls reduce noise deterministically.
- [ ] Self-link/orphan/monotonic rules behave per toggle definitions.
- [ ] Tooltip percent modes (`off|stage|total|both`) are correct.
- [ ] Edge and node marking return expected contributing rows.
- [ ] Raw missing End values route to `No Completion` when routing/inclusion are enabled.
- [ ] COALESCE-authored canonical End values remain incomplete and highlight consistently.
- [ ] Dense views retain visible right/bottom terminals without clipping.
- [ ] Incomplete paths visibly use the configured highlight color in the chart,
      not only in the legend.
- [ ] End-node click focus shows upstream incoming pathways.
- [ ] Tooltip Detail fields remain visible when derived metrics are off.
- [ ] Host behavior is documented: Tooltip Detail can be populated with
      attributes or measures, but mixed attribute+measure drag/drop is not
      supported by this grammar bucket in OAC/OAD.
- [ ] Click-active legend focus works for incomplete paths and real Path Groups.
- [ ] Left/right stage titles render with configured text and styling.

---

## 11. UAT Scenarios (required)

1. **Plan initial -> graduation plan**
   - Start=initial plan, End=graduation plan, Intermediate policy=`none`.
   - Validate clean two-stage Sankey.

2. **Math sequence progression**
   - Start/intermediate/end chain with explicit intermediate bucket order.
   - Validate MATH103 -> MATH106 -> MATH108/216 -> MATH220 -> MATH171.

3. **No-measure fallback**
   - Omit flow weight measure and validate count-based aggregation.

4. **Noise controls**
   - Apply threshold/top-N/collapse-other and verify predictable reduction.

5. **Marking fidelity**
   - Validate edge click and node click mark expected source rows in OAC host.

6. **Validation edge cases**
   - Include rows with missing Start/End, self-links, and 5 intermediate layers.
   - Verify orphan handling, self-link handling, depth cap behavior, and warning
     counts.

7. **Incomplete outcome routing**
   - Use raw End nulls plus values such as whitespace, `null`, `(null)`, and
     `n/a`.
   - Validate canonical `No Completion` routing, highlight color, and
     include/hide behavior.

8. **COALESCE compatibility**
   - Use an End field pre-filled to `No Completion`.
   - Validate the plugin treats it as the same incomplete terminal and does not
     create conflicting semantics.

---

## 12. Deferred Items (post-v1)

- Guided-auto flow mode.
- Infer-sequence intermediate generation.
- Edge-row input grammar contract (`from_node`/`to_node`/`step_index`).
- Edge-level drill action templates.
- Interactive path pinning/focus mode.
- Compare-two-cohort split Sankey in one canvas.

