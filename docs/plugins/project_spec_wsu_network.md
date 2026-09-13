# WSU Network — Plugin Reference

Canonical reference for the **WSU Network** custom visualization
(`com-wsu-network`). Read this plus `../oac_design.md` to pick up WSU Network
development or fork it without re-deriving design decisions.

---

## 1. Overview

### Identity
- **Display name**: WSU Network
- **Short name**: WSU Network
- **Category**: WSU
- **Root id**: `com-wsu-network`
- **Version constant**: `WsuNetworkViz.VERSION = "1.2.0"` (see `CHANGELOG.md`)
- **Source**: `oac-sdk-dev/src/customviz/com-wsu-network/`
- **Build output**: `oac-sdk-dev/build/distributions/customviz_com-wsu-network.zip`

### What WSU Network is
A directed graph (network) visualization specialized for student course
pathways. It maps transitions between courses, explicitly emphasizing
"repeat loops" (self-transitions) as visual bottlenecks. Based on the
`vis-network` prototype, it uses a physics-driven layout to reveal course
clusters and bottleneck courses where students frequently repeat or stall.

### Course-centered analytical use cases
WSU Network is the primary structural map for **course-centered pathway
analysis**. It is not intended for fixed-stage milestone journeys such as
annual academic-interest snapshots; those belong in WSU Sankey.

#### Use case A — “How did students get to this course?”
Anchor the analysis on a selected **target course** such as `MATH 220`.
Shape the dataset upstream so each retained row is a prior observed transition
on a student path that terminates at the selected target attempt. The rendered
network should answer:
- which prior courses route most often into the target cohort,
- which connector courses appear repeatedly on inbound paths,
- where repeat attempts occur before the target,
- which upstream routes appear to be detours or bottlenecks,
- which prior edges deserve student-level drill evidence.

Example conceptual paths:
- `MATH 103 -> MATH 106 -> MATH 171 -> MATH 220`
- `MATH 171 -> MATH 171 -> MATH 220`

#### Use case B — “Where did students go after this course?”
Anchor the analysis on a selected **source course** such as `MATH 103`.
Shape the dataset upstream so each retained row is an observed transition away
from the selected source attempt, optionally within a filtered downstream scope
such as `MATH 106`, `MATH 108`, or `MATH 171`. The rendered network should
answer:
- which immediate next courses students enter,
- which students repeat the source course,
- which downstream routes become common connectors,
- which in-scope students have no subsequent math-course destination,
- which source-to-destination transitions deserve student-level drill evidence.

Recommended semantic default for both use cases:
- `next_course_id` / `previous_course_id` should represent the **immediate next
  or previous in-scope course-family attempt**, not an arbitrary later course.
- Broader downstream target highlighting may be used for filtering or emphasis,
  but the rendered edge itself should remain an observed adjacent transition.

### OAC test-data findings (mock math pathway review)

Findings from `mock_math_pathway_200_students.csv` and initial OAC review should
shape the next version of the authoring guidance and property defaults:

- A full unfiltered course-pathway network is useful as an exploratory topology
  map, but it is too dense for decision review when edge labels and repeat-stage
  expansion are enabled.
- Reviewers understand the graph more quickly when the workbook starts from a
  scoped worksheet, such as:
  - `MATH 220` local neighborhood,
  - repeat bottlenecks only,
  - forward progression only,
  - terminal / `No Further Course` only.
- Filtering on the current-row course field, such as `target_course_id =
  MATH 220`, answers "what happened after MATH 220?" It does **not** answer
  "how did students get to MATH 220?" For inbound analysis, authors need a
  filter on `Destination = MATH 220` or a prepared inbound-target transition
  view.
- Link labels are the fastest path to clutter. In broad views, authored link
  labels should be omitted and edge weight should be available through tooltip
  or a sparse count label only.
- Expanded repeat stages are valuable for explaining repeated attempts, but
  they should be a deliberate view mode. The default bottleneck view should keep
  repeats as self-loops.
- Terminal routing to `No Further Course` reads naturally as a sink node for a
  graph reviewer, but it must be paired with censoring language so reviewers do
  not interpret it as institutional departure.
- Edge sizing controls need guardrails. A user-set minimum edge width greater
  than maximum edge width produced a visually misleading graph during testing.
  vNext should clamp, swap, or warn when `minEdgeWidth > maxEdgeWidth`.

Recommended default workbook story for demonstrations:

1. Start with a table or KPI showing the selected cohort count.
2. Show a scoped Network local-neighborhood view.
3. Show a repeat-only bottleneck view.
4. Use the full Network only as a secondary exploratory map.

### Capabilities at a glance
- **Repeat-loop emphasis** — self-transitions (Source == Destination) are
  rendered as WSU Crimson curved loops with distinct thickness and color
  precedence.
- **Repeat loop labeling** — self-loop edges can optionally display repeat
  count or share so users can see the magnitude of course repeats directly on
  the graph.
- **Expanded repeat stages** — repeat attempts can optionally render as staged
  nodes (`Repeat 1`, `Repeat 2`, etc.) so analysts can see how repeated course
  attempts branch toward progression, further repeats, or non-progression.
- **Node-to-node transitions** — directed edges with arrows showing the
  flow direction between different courses.
- **Volume-driven scaling** — edge thickness represents transition frequency;
  node size uses a supplied node-volume measure when available and otherwise
  falls back to total incident transition weight.
- **Physics-driven layout** — Barnes-Hut simulation with configurable
  stabilization, gravity, and spring length to prevent node overlap and
  reveal clusters.
- **Target course highlighting** — explicitly color a primary course in WSU
  Crimson using a categorical node-group contract in the grammar.
- **Interactive Shared-Node tooltips** — hovering a node shows aggregate
  stats for that course; hovering an edge shows transition N plus optional
  authored categorical pass-rate text when the workbook provides it.
- **Canonical non-progressor routing** — students with a valid completed source
  course but no subsequent pathway destination can be routed to a visible
  terminal node such as `No Further Course`.
- **Standardized WSU Palette** — defaults to WSU Gray for normal flows and
  WSU Crimson for bottlenecks and highlights.
- **Physics control** — toggle between stable (frozen) and active (fluid)
  layouts to allow manual adjustment of node positions.

---

## 2. Bucket Layout

Defined in
`extensions/oracle.bi.tech.plugin.visualizationDatamodelHandler/com-wsu-network.visualizationDatamodelHandler.json`.

| Bucket | Logical | Type | Min | Max | UI Label |
|--------|---------|------|-----|-----|----------|
| `row` | `ROW` | categorical | 2 | 2 | Source, Destination |
| `measures` | `MEASURES` | measures | 1 | 2 | Edge Weight, Node Size |
| `color` | `COLOR` | categorical | 0 | 1 | Node Group / Color |
| `detail` | `CATEGORY` | categorical | 0 | 10 | Tooltip details |
| `glyph` | `GLYPH` | categorical | 0 | 1 | Link Label |
| `size` | `SIZE` | categorical | 0 | 1 | Repeat Stage / Attempt Number |

**Mapping Rules**:
- **Source/Destination**: Required. `row[0]` is `Source`; `row[1]` is
  `Destination`. This ordering is a hard rendering contract.
- **Edge Weight**: Driven by the first Measure. It should be an additive
  transition weight such as student count. If no valid numeric value is
  present, the plugin falls back to `1` per source row before aggregation.
- **Node Size**: Driven by the second Measure when supplied. It should be a
  node-volume value that is consistent for a given node. If omitted, node size
  is derived from total incident aggregated edge weight (`incoming + outgoing`)
  so raw transition rows remain usable without author-side node rollups.
- **Node Group**: Attributes in this bucket drive node coloring and target
  emphasis. Recommended values are:
  - `target` for the primary analyzed course/node
  - `course` for ordinary pathway nodes
  If the same node appears with conflicting group values across rows,
  `target` takes precedence; otherwise the first nonblank value wins.
- **Tooltip details**: categorical-only authored text. Use formatted
  attributes upstream if a measure-like value must appear in hover detail.
- **Link Label**: optional authored text applied to the aggregated edge. If
  duplicate rows for the same `(Source, Destination)` disagree, the plugin
  should fall back to the aggregated edge weight label rather than choosing an
  arbitrary row-level string. Authoring guidance: leave this bucket empty for
  full-network views and use it only in scoped views where the label cardinality
  is small.
- **Repeat Stage / Attempt Number**: optional categorical attribute required
  when expanded repeat-stage rendering is enabled. Recommended values are
  attribute-form attempt numbers such as `1`, `2`, `3`, or clean labels whose
  numeric order can be parsed from a leading integer. Leave this bucket empty
  when using self-loop repeat rendering.

### 2.1 Input Grain and Client Aggregation

WSU Network accepts raw transition rows and aggregates them client-side.

Minimum usable input grain:
- one row per observed transition event or one row per pre-aggregated transition
  fact
- categorical `Source`
- categorical `Destination`
- numeric `Edge Weight` (required — the grammar needs at least one measure;
  rows with a null weight count as 1)
- optional numeric `Node Size`

Rendering grain after plugin shaping:
- one edge per `(Source, Destination)`
- one node per unique source or destination id

Aggregation rules:
- `edgeWeight = sum(valid first measure)` per `(Source, Destination)`
- if no valid first-measure value exists for a row, that row contributes `1`
  toward the aggregated edge weight
- `nodeIncidentWeight = incoming edgeWeight + outgoing edgeWeight`
- `nodeSizeValue = second measure` only when that measure is supplied and
  consistent for the node across all contributing rows; otherwise fall back to
  `nodeIncidentWeight`
- consistency means:
  - collect all finite numeric second-measure values for that node
  - if every collected value is exactly equal, use that value
  - if values differ, or if no finite numeric value exists, fall back to
    `nodeIncidentWeight`
- row-level tooltip details do not concatenate across duplicate edges or nodes;
  only aggregate-safe authored labels should be shown

This preserves the Flask prototype's grouped-edge semantics while remaining
usable inside OAC without requiring a pre-aggregated network payload.

### 2.2 Missing Destination and Non-Progressor Routing

By default, WSU Network should support explicit terminal routing for students
who completed a source-course event but do not have a next-course destination
in the provided pathway scope.

Routing contract:
- Missing Destination includes:
  - null / undefined
  - empty string
  - whitespace-only string
  - safe null-like literals such as `null`, `(null)`, `n/a`, and `na`
- Literal matching is normalized in this exact order:
  1. convert to string only after null / undefined checks
  2. trim surrounding whitespace
  3. compare the trimmed value case-insensitively against the supported
     null-like literals
- When terminal routing is enabled, missing destination values are rewritten to
  the configured terminal label before edge aggregation.
- When terminal routing is disabled, rows with missing Destination are dropped.
- The terminal node participates in edge aggregation and tooltip summaries but
  is never treated as a repeat loop.

Recommended terminal label:
- `No Further Course`

### 2.3 Dataset architecture for course-centered pathway analysis

WSU Network does **not** infer course chronology from raw enrollment facts.
The data architect should create an attempt-grain pathway fact and then derive a
network transition view from it.

#### Recommended upstream attempt fact
One row per:
- `student_id`
- `course_id`
- `term_index`
- `attempt_number`

Recommended attempt-fact columns:
- `student_id`
- `course_id`
- `term_label`
- `term_index` — numeric sortable chronology such as STRM
- `attempt_number` — 1-based repeat attempt within the course
- `grade_code`
- `grade_points` when available
- `outcome_code` (`pass`, `fail`, `withdraw`, `incomplete`, `other`)
- `pass_flag`
- `course_sort_order`
- `repeat_flag`
- `next_course_id`
- `next_term_index`
- `next_outcome_code`
- `next_pass_flag`
- `previous_course_id`
- `previous_term_index`
- `transition_type` (`forward`, `repeat`, `backward`, `unknown`)
- `terms_to_next_course_family`
- `stopout_flag`
- `observation_end_term_index`
- `stopout_censor_flag`

Term ordering must come from explicit numeric order evidence. Do not sort course
history by term label strings. If multiple in-scope courses occur in the same
term, publish the same-term ordering policy used upstream, for example:
- `timestamp`
- `enrollment_sequence`
- `course_sort_order`
- `course_number` fallback

#### Derived network transition view
The plugin-facing Network dataset should be one row per observed transition
event or one pre-aggregated transition fact with:

| Plugin Concept | Recommended Source |
|---|---|
| `Source` | previous/current course id, depending on trace direction |
| `Destination` | current/next course id, depending on trace direction |
| `Edge Weight` | `1` per event or a pre-aggregated student count |
| `Node Group / Color` | `target`, `source`, or `course` emphasis category |
| `Link Label` | aggregate-safe transition label such as `repeat` or authored edge category; omit for broad views |
| `Tooltip Detail` | formatted detail such as destination pass context or cohort scope |
| `Repeat Stage / Attempt Number` | attempt number when expanded repeat-stage mode is required |

Recommended OAC grammar for the mock math pathway test file:

| Bucket | Mock field |
|---|---|
| Source | `network_source` |
| Destination | `network_destination` |
| Edge Weight | `network_edge_weight` |
| Node Group / Color | `network_node_group` |
| Tooltip Detail | `network_tooltip_detail`, `transition_type`, `target_grade_code`, `next_outcome_code` |
| Link Label | leave empty for first review |
| Repeat Stage / Attempt Number | leave empty for self-loop mode; use `network_repeat_stage` only for expanded stages |
| Filter | `network_row_flag = 1` |

Recommended scoped worksheets for course-pathway review:

| Worksheet | Required filter | Purpose |
|---|---|---|
| Local neighborhood | `Source = anchor OR Destination = anchor` | immediate inbound and outbound transitions around a course |
| Inbound target | `Destination = anchor` | "how did students get to this course?" |
| Outbound source | `Source = anchor` | "where did students go after this course?" |
| Repeat bottlenecks | `transition_type = repeat` | self-loop burden by course |
| Forward progression | `transition_type = forward` | course-to-course progression without repeats or terminal rows |
| Terminal view | `Destination = No Further Course` | sink/terminal behavior under declared censoring policy |

##### Backward-target trace shaping
For “How did students get to this course?”:
- select an anchor course and anchor attempt policy upstream,
- retain transitions on each selected student path up to that anchor attempt,
- emit those adjacent transitions in chronological order,
- mark the selected target course with Color bucket value `target`,
- do not manufacture skip-links that jump across omitted intermediate attempts.

##### Forward-source trace shaping
For “Where did students go after this course?”:
- select a source course and source-attempt policy upstream,
- retain immediate adjacent transitions after that source attempt,
- optionally continue forward for `N` additional steps when the analysis scope
  calls for downstream route discovery,
- mark the selected source node distinctly upstream when workbook emphasis is
  desired,
- allow missing destinations only when the absence means “no subsequent
  in-scope course observed under the declared censoring policy.”

#### Terminal and censoring guidance
`No Further Course` is analytically valid only when the data extract and
observation window make that claim supportable. If later in-scope course
attempts may exist outside the extract boundary, upstream shaping should retain
an explicit censoring field and avoid treating the row as a true terminal event.

#### Current plugin fit and required changes
The current Network plugin already supports the shaped transition view needed
for both course-centered use cases:
- Source/Destination edge rendering,
- repeat self-loops,
- expanded repeat stages when attempt number is supplied,
- target-node emphasis,
- non-progressor terminal routing,
- aggregate edge labels/tooltips,
- student-count weighting.

No datamodel-handler change is required for the initial course-centered use
cases. Any need for explicit in-plugin direction toggles, source-node emphasis
separate from target emphasis, or automated backward/forward path expansion
would be **future plugin scope**. In v1, those semantics should be resolved in
the prepared dataset/workbook layer, not inferred inside the visualization.

---

## 3. Config Schema (Full Reference)

### Layout
| Key | Default | Values |
|-----|---------|--------|
| `stabilization` | `"off"` | on / off |
| `gravity` | `-3200` | -1000 to -5000 |
| `springLength` | `120` | 50 to 300 |
| `solver` | `"barnesHut"` | barnesHut / forceAtlas2Based |
| `performanceMode` | `"auto"` | auto / interactive / stabilized |
| `largeGraphEdgeCap` | `120` | 25 to 500 |
| `largeGraphNodeCap` | `150` | 25 to 500 |

### Terminal Routing
| Key | Default | Values |
|-----|---------|--------|
| `includeNonProgressors` | `"on"` | on / off |
| `missingDestinationLabel` | `"No Further Course"` | text |
| `highlightNonProgressors` | `"on"` | on / off |
| `nonProgressorColor` | `"#f9a825"` | hex |

### Visuals
| Key | Default | Values |
|-----|---------|--------|
| `nodeShape` | `"dot"` | dot / circle / box / square / triangle |
| `minNodeSize` | `8` | 4 to 20 |
| `maxNodeSize` | `34` | 20 to 60 |
| `minEdgeWidth` | `1` | 0.5 to 5 |
| `maxEdgeWidth` | `8` | 5 to 20 |
| `arrows` | `"to"` | to / from / middle / off |

Edge width is computed by the plugin from the Edge Weight measure and mapped
linearly onto `[minEdgeWidth, maxEdgeWidth]`. As of 1.1.2 the edge item no
longer carries a vis-network `value`, which had caused the library to rescale
width with its own defaults and ignore these two settings.

vNext visual guardrails:
- If `minEdgeWidth > maxEdgeWidth`, clamp or swap the values and surface a
  warning. Testing showed that inverted edge-width settings make low-signal
  edges visually dominant and confuse review.
- Keep broad-network edge labels off by default. Edge counts should remain
  available through hover, self-loop count labels, and scoped worksheet modes.
- Consider a future `viewPreset` property with values such as
  `localNeighborhood`, `repeatBottlenecks`, `forwardProgression`, and
  `terminalOnly`. Presets would not change data semantics; they would set
  sensible label, repeat, terminal, and sizing defaults.

### Repeats (Self-Loops)
| Key | Default | Values |
|-----|---------|--------|
| `emphasizeRepeats` | `"on"` | on / off |
| `repeatColor` | `"#981e32"` | WSU Crimson |
| `repeatSize` | `26` | 10 to 50 |
| `showRepeatLoopLabels` | `"on"` | on / off |
| `repeatLoopLabelMode` | `"count"` | count / percent / off |
| `repeatRenderMode` | `"loop"` | loop / expandedStages |
| `maxExpandedRepeatStage` | `3` | 1 to 5 |
| `collapseOverflowRepeatStages` | `"on"` | on / off |
| `overflowRepeatLabel` | `"Repeat 3+"` | text |

### Style — Color
| Key | Default | Values |
|-----|---------|--------|
| `colorSource` | `"oac"` | oac / custom |
| `nodeBackground` | `"#8a9aa5"` | WSU Gray (Light) |
| `nodeBorder` | `"#5e6a71"` | WSU Gray (Dark) |
| `edgeColor` | `"rgba(94,106,113,0.5)"` | WSU Gray (Translucent) |
| `highlightColor` | `"#981e32"` | WSU Crimson |

Color behavior:
- `colorSource = "oac"` uses the platform color service when a Color bucket is
  supplied, with explicit repeat-loop and target-node highlight precedence.
- `colorSource = "custom"` uses the configured node and edge color overrides.
- Repeat loops and target nodes keep their emphasis color precedence in either
  mode so bottlenecks remain visible.

Deterministic color precedence:
1. Repeat-loop edge color, when `emphasizeRepeats = on`
2. Non-progressor terminal edge / node color, when
   `highlightNonProgressors = on`
3. Target-node highlight color from the `target` group contract
4. OAC color-service assignment when `colorSource = "oac"`
5. Configured custom/default node and edge colors

Repeat-loop precedence applies to edges only. Target-node precedence applies to
nodes only. Non-progressor precedence applies to the canonical terminal node
and its inbound edges.

### Labels and Edge Types
| Key | Default | Values |
|-----|---------|--------|
| `showEdgeLabels` | `"on"` | on / off — **recommended `off` for full networks** |
| `edgeColorMode` | `"default"` | default / linkLabel |
| `edgeTypePalette` | `""` | comma-separated hex list used when `edgeColorMode = linkLabel` |
| `edgeLegendDescriptions` | `""` | `type=description|type=description` |
| `showEdgeTypeLegend` | `"off"` | on / off |
| `edgeTypeLegendPosition` | `"right"` | right / top / bottom |

When `edgeColorMode = "linkLabel"`, each aggregated edge takes its color from
its Link Label value (`Unlabeled` and `Mixed Link Labels` are synthesized when
the bucket is empty or an aggregated edge carries more than one label). The
optional edge-type legend is click-to-focus: selecting a type fades every
other edge and node. Repeat-loop and non-progressor colors still take
precedence over the edge-type color.

The default stays `on` so that upgrading the extension does not change
existing workbooks that never touched the property. Authors should turn edge
labels **off** on full networks: a populated Link Label bucket on a full
network was unreadable in review. When on, an aggregated edge shows its
authored Link Label if it has exactly one, otherwise the edge weight.

### Interaction
| Key | Default | Values |
|-----|---------|--------|
| `hoverEffects` | `"on"` | on / off |
| `dragNodes` | `"on"` | on / off |

### Tooltip
| Key | Default | Values |
|-----|---------|--------|
| `showNodeVolume` | `"on"` | on / off |
| `showConnectorScore` | `"on"` | on / off |
| `showEdgeWeight` | `"on"` | on / off |
| `showEdgePassRateText` | `"on"` | on / off — recommended `off` for first review |
| `showTerminalEdgeText` | `"on"` | on / off |

`showEdgePassRateText` refers only to an authored categorical tooltip-detail
field such as `"Pass at destination: 48/63 (76.2%)"`. WSU Network does not
derive pass rates from measures unless a future spec revision adds an explicit
measure contract for pass counts and denominators.

`showTerminalEdgeText` controls whether canonical missing-destination edges
render a brief tooltip phrase such as `No further course in pathway scope`.

---

## 4. Property Panel — Four-Tab Layout

Implemented via `gadgetdialog.forcePanelByID`:
- General panel uses `euidef.GD_PANEL_ID_GENERAL`
- custom tabs use try/catch fallback to General if unsupported by the host
- expected custom panel IDs:
  - `wsuNetworkStyle`
  - `wsuNetworkInteraction`
  - `wsuNetworkAxisLegend`

### GENERAL TAB
- **Layout: Stabilization** (on/off) — freezes the graph once settled.
- **Layout: Physics Mode** (Barnes-Hut / ForceAtlas2Based) — vis-network
  solver choice.
- **Layout: Performance Mode** (Auto / Interactive / Stabilized) —
  large-graph behavior policy.
- **Repeats: Emphasize Self-Loops** (on/off) — uses curved Crimson edges.
- **Repeats: Loop Size** — slider for self-loop geometry. (*Loop Roundness*
  was removed in 1.2.0: vis-network self-loops have no roundness parameter,
  so the control never had an effect.)
- **Repeats: Show Loop Labels** (on/off).
- **Repeats: Loop Label Mode** (Count / Percent / Off).
- **Repeats: Render Mode** (Loop / Expanded Stages).
- **Repeats: Max Expanded Stage** — slider.
- **Repeats: Collapse Overflow Stages** (on/off).
- **Repeats: Overflow Label** — text.
- **Terminal: Include Non-Progressors** (on/off).
- **Terminal: Missing Destination Label** — text.
- **Terminal: Highlight Non-Progressors** (on/off).
- **Tooltip: Show Node Volume / Connector Score / Edge Weight / Edge Pass Text /
  Terminal Edge Text** — checkboxes.
- **Label: Show Edge Labels** (on/off; default on, recommended off for full networks).

### STYLE TAB
- **Nodes: Min/Max Size** — sliders for scaling.
- **Edges: Min/Max Width** — sliders for scaling.
- **Nodes: Shape** — switcher (dot/circle/box/square/triangle).
- **Color: Source** (OAC Theme / Custom).
- **Color: Edge Color Mode** (Default / By Link Label).
- **Color: Edge Type Palette (hex csv)** — text.
- **Color: Node Background / Border** — hex text.
- **Color: Edge Default** — hex text.
- **Color: Repeat Highlight** — hex text.
- **Color: Target Highlight** — hex text.
- **Color: Non-Progressor Terminal** — hex text.

### INTERACTION TAB
- **Physics: Gravity** — slider (repulsion force).
- **Physics: Spring Length** — slider (preferred edge distance).
- **Interaction: Hover Effects** (on/off) — activates shared-node tooltips.
- **Interaction: Drag Nodes** (on/off) — allows manual re-layout.
- **Interaction: Large Graph Edge Cap / Node Cap** — sliders used when
  `Performance Mode = Auto`.

### AXIS & LEGEND TAB (Legend only)
- **Legend: Show Edge Type Legend** (on/off) — only rendered when
  `Color: Edge Color Mode = By Link Label`.
- **Legend: Edge Type Legend Position** (Right / Top / Bottom).
- **Legend: Edge Descriptions (type=desc|...)** — text.

There is no node-group legend; node color is explained by the workbook's
OAC color assignments when `Color: Source = OAC Theme`.

### vNext property-panel reordering recommendation

> **Status: proposal.** Everything from here to the end of section 4 describes
> a *possible* reorganization and new controls (`Analysis: View Preset`,
> `Labels: Edge Label Mode`, `Legend: Group Legend`, `Advanced: *`). None of
> it is implemented. The tabs documented above are what ships.

The current panel exposes many useful controls, but test use showed that the
most important authoring decisions are buried among style and implementation
controls. vNext should reorder properties around the reviewer workflow:

1. **Analysis Preset / Scope**
2. **Labels & Tooltips**
3. **Repeats**
4. **Terminal Nodes**
5. **Layout**
6. **Size**
7. **Color**
8. **Interaction**
9. **Legend**
10. **Advanced / Diagnostics**

#### 4.1 Proposed GENERAL tab

Put the workflow-defining controls first.

- **Analysis: View Preset**:
  - `Full Network`
  - `Local Neighborhood`
  - `Repeat Bottlenecks`
  - `Forward Progression`
  - `Terminal / No Further Course`
- **Labels: Show Edge Labels** (proposed default `off` for full network; current default is `on`, see §3).
- **Labels: Edge Label Mode**:
  - `off`
  - `weight`
  - `authored label`
  - `repeat only`
- **Tooltip: Show Edge Weight** (default `on`).
- **Tooltip: Show Node Volume** (default `on`).
- **Tooltip: Show Connector Score** (default `on`).
- **Tooltip: Show Edge Pass Text** (default `off` for first review).
- **Tooltip: Show Terminal Edge Text** (default `on`).

Rationale:
- The first authoring decision is not color or physics; it is the analytic
  question and label density.
- During mock testing, a populated Link Label bucket plus `Show Edge Labels =
  on` made the full network unreadable.

#### 4.2 Proposed REPEATS tab

Group all repeat-specific controls together.

- **Repeats: Emphasize Self-Loops** (default `on`).
- **Repeats: Render Mode**:
  - `Loop` (recommended default)
  - `Expanded Stages`
- **Repeats: Show Loop Labels** (default `on`).
- **Repeats: Loop Label Mode**:
  - `count` (recommended review default)
  - `percent`
  - `off`
- **Repeats: Loop Size**.
- **Expanded Stages: Max Stage**.
- **Expanded Stages: Collapse Overflow Stages**.
- **Expanded Stages: Overflow Label**.

Rationale:
- Self-loops and expanded stages are different interpretations of repeat
  burden. Reviewers should pick one deliberately.
- Percent loop labels are useful after scoping, but counts are more legible
  during first review.

#### 4.3 Proposed TERMINAL tab

Terminal behavior should not be hidden in the middle of General.

- **Terminal: Include Non-Progressors**.
- **Terminal: Missing Destination Label**.
- **Terminal: Highlight Non-Progressors**.
- **Terminal: Terminal Color**.
- **Terminal: Censoring Note** (future text/derived note if a censor field is
  present).

Rationale:
- `No Further Course` is graph-theoretically a sink node, but analytically it
  can mean either a true terminal state or a censored observation. The property
  grouping should keep that distinction visible.

#### 4.4 Proposed LAYOUT tab

Keep physics controls together, but below the analytic controls.

- **Layout: Performance Mode**.
- **Layout: Stabilization**.
- **Layout: Physics Solver**.
- **Physics: Gravity**.
- **Physics: Spring Length**.
- **Interaction: Drag Nodes**.
- **Interaction: Hover Effects**.
- **Interaction: Large Graph Edge Cap**.
- **Interaction: Large Graph Node Cap**.

Rationale:
- These controls improve readability, but they should not be the first controls
  authors tune.

#### 4.5 Proposed SIZE tab

Separate sizing from color and add validation.

- **Nodes: Shape**.
- **Nodes: Min Size**.
- **Nodes: Max Size**.
- **Edges: Min Width**.
- **Edges: Max Width**.
- **Arrows**.

Required validation:
- `Min Node Size <= Max Node Size`
- `Min Edge Width <= Max Edge Width`
- If an author enters an invalid pair, the plugin should clamp/swap values and
  show a nonblocking warning.

Rationale:
- The mock review surfaced an inverted edge-width configuration
  (`minEdgeWidth` larger than `maxEdgeWidth`) that made the graph harder to
  interpret.

#### 4.6 Proposed COLOR tab

Keep colors together after analytic and sizing controls.

- **Color: Source**.
- **Color: Node Background**.
- **Color: Node Border**.
- **Color: Edge Default**.
- **Color: Repeat Highlight**.
- **Color: Target Highlight**.
- **Color: Non-Progressor Terminal**.
- **Color: Edge Type Palette**.

Rationale:
- Color is important, but it should follow the analytic defaults for repeats
  and terminals.

#### 4.7 Proposed LEGEND / ADVANCED tab

- **Legend: Show**.
- **Legend: Group Legend**.
- **Legend: Edge Type Legend Position**.
- **Legend: Edge Descriptions**.
- **Advanced: Show Warnings** (future).
- **Advanced: Debug Layout Notes** (future, development-only).

Rationale:
- Legend and diagnostic controls are presentation refinements. They should not
  interrupt the primary authoring path.

### vNext default preset recommendations

Suggested property defaults by view preset:

| Preset | Edge labels | Repeat mode | Loop label mode | Terminal routing | Spring length |
|---|---|---|---|---|---:|
| Full Network | off | loop | count | on | 180 |
| Local Neighborhood | weight | loop | count | on | 140 |
| Repeat Bottlenecks | repeat only | loop | count | off or on by author | 160 |
| Forward Progression | off | loop hidden or de-emphasized | off | off | 180 |
| Terminal / No Further Course | weight | loop | off | on | 160 |

These presets are authoring aids only. They should not filter data unless a
future version adds an explicit, clearly disclosed plugin-side filter model.

---

## 5. Built-in Calculations

- **Self-Loop Detection**: `Source == Destination` triggers the `emphasizeRepeats`
  logic (Crimson color + curved roundness).
- **Self-Loop Stability Contract**:
  - repeat-loop edges use `vis-network` `selfReference` geometry, not dynamic
    smoothing
  - loop angle is deterministic
  - loop radius is derived from rendered node size
  - nodes with self-loops receive a minimum rendered size so the loop attaches
    visibly to the node body
  - initial graph fit padding includes loop radius, node size, and edge width so
    loops do not clip at viewport edges
- **Connector Score**: `min(Incoming Edge Weight, Outgoing Edge Weight)`
  calculated per node after edge aggregation. It appears in the node tooltip
  when `showConnectorScore = on`.
- **Node Volume**:
  - use consistent second-measure node volume when supplied
  - otherwise use total incident aggregated edge weight
- **Edge Pass Text**: optional authored categorical tooltip detail. The plugin
  may show that text on edge hover but does not compute destination pass rate
  numerically from generic measures.
- **Repeat Loop Label**:
  - `count` renders the aggregated self-loop edge weight
  - `percent` renders self-loop weight divided by the total outgoing weight from
    the source node
  - `off` renders no in-graph label
- **Expanded Repeat Stage Node**:
  - active when `repeatRenderMode = "expandedStages"`
  - requires a valid `Repeat Stage / Attempt Number` attribute
  - converts same-course repeat progression into staged pathway nodes rather
    than a collapsed curly self-loop
  - preserves downstream branching to later repeats, other courses, and the
    non-progressor terminal
- **Canonical Non-Progressor Edge**:
  - created when terminal routing is enabled and Destination is missing
  - styled distinctly when `highlightNonProgressors = on`
  - tooltip should identify it as a no-further-course pathway terminal

### 5.1 Empty, Missing, and Conflicting Data

- Blank or whitespace-only `Source` rows are discarded.
- Blank or null-like `Destination` rows are rewritten to
  `missingDestinationLabel` before aggregation when
  `includeNonProgressors = on`.
- Blank or null-like `Destination` rows are discarded when
  `includeNonProgressors = off`.
- Null/NaN first-measure edge weights contribute `1` rather than suppressing the
  transition.
- Rows with valid Source/Destination but no numeric second measure remain valid;
  node sizing falls back to incident edge weight.
- Duplicate edges aggregate by `(Source, Destination)`.
- Conflicting node-group values resolve with `target` first, then first
  nonblank value.
- Conflicting duplicate Link Labels fall back to the aggregated edge weight label.
- Conflicting duplicate Tooltip Detail values are not merged or concatenated.
  Only values that are identical across all contributing duplicate rows may be
  shown on the aggregated mark; otherwise that tooltip field is omitted for the
  aggregated edge or node.
- If no valid edges remain after shaping, render an empty-state message rather
  than a blank canvas.
- Terminal-only and source-only nodes remain valid; their Connector Score is
  `0`.
- The configured missing-destination terminal node is valid and remains visible
  even when it has no outgoing edges.
- Disconnected orphan nodes are not supported because nodes are derived
  strictly from valid Source/Destination pairs. A workbook row that contains no
  valid edge contributes no rendered standalone node.

### 5.2 Expanded Repeat Stage Behavior

Expanded repeat stages are part of the initial build, not a deferred phase.

Stage parsing:
- read the `Repeat Stage / Attempt Number` attribute from the `SIZE` bucket
- trim surrounding whitespace
- parse the first integer found in the value
- treat missing or unparsable values as invalid for expanded-stage rendering

Stage-node naming:
- stage `1` is the base course label, e.g. `103`
- stage `2` renders as `103 (Repeat 1)`
- stage `3` renders as `103 (Repeat 2)`
- higher stages continue the same pattern until
  `maxExpandedRepeatStage`

Overflow behavior:
- if a parsed stage exceeds `maxExpandedRepeatStage` and
  `collapseOverflowRepeatStages = "on"`, map it to the configured overflow node
  label such as `103 (Repeat 3+)`
- if overflow collapse is off, render the explicit stage label until normal
  graph performance caps apply

Edge transformation:
- when `repeatRenderMode = "loop"`, self-transitions stay as curly repeat loops
- when `repeatRenderMode = "expandedStages"`:
  - same-course repeat events are converted into forward edges between staged
    repeat nodes
  - repeat-loop styling is not applied to those transformed edges
  - repeat loop labels are ignored because there is no self-loop edge in this
    mode

Routing examples:
- `103 stage 1 -> 103 stage 2`
- `103 stage 2 -> 103 stage 3`
- `103 stage 2 -> 106`
- `103 stage 2 -> No Further Course`

Analytical safeguard:
- expanded repeat stages must never be inferred from duplicate edge counts
- if `repeatRenderMode = "expandedStages"` but no valid repeat-stage field is
  supplied, the plugin should fall back to `loop` behavior and show a subtle
  in-chart note that expanded stages require `Repeat Stage / Attempt Number`

### 5.3 Large-Graph Stabilization UX

Graphs can become unreadable or computationally noisy at large sizes. WSU
Network should expose a clear performance policy:

- `performanceMode = "interactive"` keeps physics live and drag-friendly.
- `performanceMode = "stabilized"` stabilizes once, then disables physics.
- `performanceMode = "auto"`:
  - stays interactive under the configured caps
  - switches to stabilized behavior when the graph exceeds either cap
  - renders a subtle in-chart note that the graph was stabilized for readability

Default caps should mirror prototype scale expectations:
- `largeGraphEdgeCap = 120`
- `largeGraphNodeCap = 150`

---

## 6. Implementation Patterns (cross-references)

WSU Network will leverage patterns from `../oac_design.md`:

| Pattern | Reference |
|---------|-----------|
| Symbol pinning | §6.3 |
| Missing-data strategy | §6.8 |
| Property panel grouping | §6.9 |
| CSS namespacing | §6.12 — `.wsu-network` prefix |
| Multi-panel try/catch | §6.14 |
| Color source switching | §6.16 |
| vis-network self-loop stability | §6.18.3 |
| Logger usage | §6.27 |
| Tooltip clipping safeguards | §6.30 |

Additional implementation notes:
- Bundle `vis-network` with the plugin package. Do not rely on remote CDN
  fetching from OAC/OAD.
- Use `obitech-appservices/logger` for initialization and caught framework
  warnings.
- Use `.wsu-network` as the CSS namespace root in every selector.

---

## 7. Initial Build Scope

The first implementation should include the full Network contract described in
this document:
- directed transition graph from Source to Destination
- client-side edge aggregation
- repeat self-loop styling and optional loop labels
- expanded repeat stages using the `Repeat Stage / Attempt Number` SIZE bucket
- canonical non-progressor terminal routing
- connector score in node tooltips
- configurable node/edge scaling
- target-node emphasis through the Color bucket
- local `vis-network` packaging
- performance/stabilization controls

---

## 8. Build & Deploy

```powershell
# Validate
cd oac-sdk-dev\src\customviz\com-wsu-network    # from the repo root
node --check wsuNetwork.js
node --check wsuNetworkdatamodelhandler.js
Get-Content extensions\oracle.bi.tech.plugin.visualization\com-wsu-network.json -Raw | ConvertFrom-Json
Get-Content extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\com-wsu-network.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json

# Build
cd ..\..\..    # back to oac-sdk-dev
.\build-sdk.ps1
```

Install in OAD: Console → Extensions → Upload → pick the zip → restart
OAD. Find under category **WSU** as **WSU Network**.
