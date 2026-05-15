# WSU Math Pathway Network Review Instructions

This guide is for reviewing `mock_math_pathway_200_students.csv` in OAC with the
WSU Network visualization. The reviewer can treat the visualization as a
directed weighted graph built from student course-attempt transitions.

The file is mock data for demonstration only. It is shaped to resemble SDW math
enrollment records while adding derived pathway fields that SDW does not provide
directly.

## 1. Graph Interpretation

The Network plugin renders a directed graph:

- A node is a course or terminal pathway state.
- A directed edge is an observed adjacent transition in a student's in-scope
  math history.
- Edge weight is the number of contributing transition rows.
- A self-loop means a repeated attempt in the same course.
- `No Further Course` is an explicit terminal/sink node for students with no
  later observed in-scope math course under the mock observation window.

Conceptually, the dataset begins as a student-level ordered event history:

```text
student -> course attempt 1 -> course attempt 2 -> course attempt 3 -> ...
```

The plugin-facing Network columns collapse that history into weighted directed
edges:

```text
network_source -> network_destination
```

The plugin aggregates duplicate edges client-side, so many row-level transition
events become one rendered edge.

## 2. Recommended First Review Setup

Do not begin with the full network plus all labels. It will be visually busy.

Start with:

```text
network_row_flag = 1
```

Then use one of these focused scopes.

### A. MATH 220 Local Neighborhood

Purpose: see immediate paths into and out of `MATH 220`.

Use either an OR filter:

```text
network_source = MATH 220 OR network_destination = MATH 220
```

If OAC makes OR filtering awkward, make two views:

```text
Inbound:  network_destination = MATH 220
Outbound: network_source = MATH 220
```

This is the best reviewer view for inspecting whether transitions around
`MATH 220` are plausible.

### B. Repeat Bottlenecks

Purpose: see which courses have repeat loops.

Filter:

```text
transition_type = repeat
```

This should produce a compact graph of self-loops. In graph terms, these are
loop edges where `source = destination`.

### C. Forward Progression Only

Purpose: inspect course-to-course movement without repeats or terminal edges.

Filter:

```text
transition_type = forward
```

This is better for reading the main pathway structure.

### D. Non-Progression / Terminal View

Purpose: inspect where student paths terminate in the observation window.

Filter:

```text
network_destination = No Further Course
```

Interpret this carefully. It means no later in-scope math course was observed
in the mock data, not necessarily that the student left WSU.

## 3. WSU Network Grammar

In the OAC grammar panel, use these fields.

| Grammar Bucket | Field | Meaning |
|---|---|---|
| Source, Destination | `network_source`, `network_destination` | Directed edge endpoints. Source comes first; destination comes second. |
| Edge Weight, Node Size | `network_edge_weight` | Additive transition weight. In this mock file it is `1` per transition row; the plugin sums it. |
| Node Group / Color | `network_node_group` | Node emphasis group. Values include `course`, `target`, and `repeat`. |
| Tooltip details | `network_tooltip_detail` | Human-readable row context for hover. |
| Tooltip details | `transition_type` | Edge category: `forward`, `repeat`, or `terminal`. |
| Tooltip details | `target_grade_code` | Grade earned in the source/current course attempt. |
| Tooltip details | `next_outcome_code` | Outcome in the next course attempt, when present. |
| Link Label | usually leave empty | Avoid this in broad views. It creates clutter. |
| Repeat Stage / Attempt Number | `network_repeat_stage` | Attempt number used only when repeat rendering is set to expanded stages. |
| Filters | `network_row_flag` | Use `network_row_flag = 1` for Network rows. |

Important: do not use `target_course_id = MATH 220` when the goal is to see
paths into `MATH 220`. That field filters to rows where the current/source
attempt is `MATH 220`. To see inbound routes, filter on
`network_destination = MATH 220`.

## 4. Property Panel Guidance

The OAC property panel is long and some controls are easy to misread. These are
the relevant controls visible in the current screenshots.

### Top / General Properties

| Property | Suggested Review Setting | Notes |
|---|---:|---|
| Title | Auto or custom | A custom title helps when comparing multiple scoped views. |
| Title Font | Auto | Leave alone unless presentation polish is needed. |
| Title Tooltip | Auto | Leave alone. |
| Layout: Physics | `Barnes-Hut` | Good default for this graph type. |
| Layout: Performance | `Auto` | Use `Stabilized` for presentation snapshots if available. |
| Repeats: Loop Label Mode | `Count` for review | `Percent` is useful later but can be harder to interpret. |
| Repeats: Render Mode | `Loop` for bottleneck review; `Expanded Stages` for attempt-stage review | Expanded stages create nodes such as `MATH 220 (Repeat 1)`. |
| Repeats: Overflow Label | `Repeat 3+` | Used when expanded repeat stages exceed the max stage. |
| Visibility | `None` or default | Leave unless intentionally hiding elements. |
| Terminal: Missing Destination Label | `No Further Course` | Must match the dataset terminal label. |

### Color / Style Properties

| Property | Suggested Review Setting | Notes |
|---|---:|---|
| Nodes: Shape | `Dot` | Best for graph layout. |
| Color: Source | `OAC Theme` | Good default. |
| Color: Edge Color Mode | `Default` | Use edge type palette only if transition colors are intentionally configured. |
| Color: Edge Type Palette | blank | Optional hex CSV; leave blank for first review. |
| Color: Node Background | `#8a9aa5` | Default WSU gray. |
| Color: Node Border | `#5e6a71` | Default WSU dark gray. |
| Color: Edge Default | `rgba(94,106,113,0.5)` | Default translucent gray. |
| Color: Repeat Highlight | `#981e32` | WSU crimson repeat emphasis. |
| Color: Target Highlight | `#981e32` | WSU crimson target emphasis. |
| Color: Non-Progressor Terminal | `#f9a825` | Amber terminal/sink emphasis. |
| Legend: Edge Type Legend Position | `Right` | Use only when edge type legend is enabled. |
| Legend: Edge Descriptions | blank initially | Optional text mapping, not needed for first review. |

### Layout / Repeat / Terminal Properties

| Property | Suggested Review Setting | Notes |
|---|---:|---|
| Layout: Stabilization | `On` for presentation; `Off` while exploring | Stabilization gives a steadier graph after layout settles. |
| Repeats: Emphasize Self-Loops | `On` | Critical for repeat bottleneck review. |
| Repeats: Loop Roundness | `45` | Reasonable default. |
| Repeats: Loop Size | `26` | Reasonable default. |
| Repeats: Show Loop Labels | `On` | Useful in repeat-only or local views. |
| Repeats: Max Expanded Stage | `3` | Good default for expanded stage mode. |
| Repeats: Collapse Overflow Stages | `On` | Prevents too many repeat-stage nodes. |
| Terminal: Include Non-Progressors | `On` | Keeps `No Further Course` visible. |
| Terminal: Highlight Non-Progressors | `On` | Makes terminal/sink edges easy to distinguish. |

### Tooltip / Label Properties

| Property | Suggested Review Setting | Notes |
|---|---:|---|
| Tooltip: Show Node Volume | `On` | Useful for node-level aggregate volume. |
| Tooltip: Show Connector Score | `On` | Connector score is `min(incoming weight, outgoing weight)`. |
| Tooltip: Show Edge Weight | `On` | Essential. |
| Tooltip: Show Edge Pass Text | `Off` for first review | The mock field is descriptive, but this can make hovers noisy. |
| Tooltip: Show Terminal Edge Text | `On` | Useful for `No Further Course`. |
| Label: Show Edge Labels | `Off` for full graph; `On` for local graph | Broad views become unreadable with all labels on. |

### Size / Physics / Interaction Properties

The screenshot shows `Edges: Min Width = 10` and `Edges: Max Width = 8`.
That is inverted and makes edges too thick. For review, use:

| Property | Suggested Review Setting | Notes |
|---|---:|---|
| Nodes: Min Size | `8` | Good default. |
| Nodes: Max Size | `34` | Good default. |
| Edges: Min Width | `1` or `2` | Use a low minimum so smaller edges remain secondary. |
| Edges: Max Width | `8` | Good upper bound. |
| Physics: Gravity | around `3200` if shown as positive | Higher magnitude spreads nodes more. |
| Physics: Spring Length | `160` to `220` for broad graph; `120` for local graph | Increase when labels or nodes crowd. |
| Interaction: Hover Effects | `On` | Needed for review. |
| Interaction: Drag Nodes | `On` | Useful for manual graph inspection. |
| Interaction: Large Graph Edge Cap | `120` | Default is fine. |
| Interaction: Large Graph Node Cap | `150` | Default is fine. |
| Legend: Show | `On` | Useful if color grouping is meaningful. |
| Legend: Show Edge Type Legend | `Off` initially | Turn on only after edge type colors are configured. |

## 5. How To Read The Current Full-Network View

The full graph with only `network_row_flag = 1` is a weighted directed transition
network. It is useful for topology, not for precise reading of every label.

Look for:

- High-volume connector nodes: large nodes with both incoming and outgoing flow.
- Bottlenecks: self-loops with high count.
- Sinks: edges into `No Further Course`.
- Branching points: one source course with multiple outgoing destinations.
- Detours: backward or unexpected transitions if present in a real extract.

For presentation or decision discussion, use scoped views rather than the full
network. The full graph is an exploratory map.

## 6. Column Dictionary

### Original SDW-Style Columns

| Column | Description |
|---|---|
| `TERM CODE` | SDW-style term code in YYYT form. |
| `Term Desc` | Full term label, such as `2025 Fall Semester`. |
| `Term` | Short term label, such as `2025 Fall`. |
| `PERSON ID` | Mock WSU-style student/person identifier. |
| `Subject` | Course subject, always `MATH` in this file. |
| `Catalog Number` | Course number without subject. |
| `Subject Catalog Number` | Combined course label, such as `MATH 220`. |
| `Campus Code` | Mock campus code. |
| `Course Grade Official` | Official grade code for the attempt. |
| `Class GPA` | Numeric grade points when applicable. |

### Attempt-Level Pathway Columns

| Column | Description |
|---|---|
| `student_id` | Alias of `PERSON ID` using the dataset contract naming style. |
| `target_course_id` | Current row's course attempt. |
| `target_term_label` | Current row's short term label. |
| `target_term_index` | Current row's sortable term code. |
| `target_attempt_number` | Attempt number within the same student and course. |
| `target_grade_code` | Current row's grade code. |
| `target_grade_points` | Current row's numeric grade points when available. |
| `target_outcome_code` | Normalized outcome: `pass`, `fail`, `withdraw`, `incomplete`, or `other`. |
| `target_pass_flag` | `1` when grade points are at least the pass threshold; otherwise `0`. |
| `course_sort_order` | Stable course order for pathway displays. |
| `course_level` | Broad level such as `gateway` or `advanced`. |
| `pathway_band` | Broad route/family such as `calculus`, `algebra`, or `linear_algebra`. |
| `student_start_term_index` | First observed in-scope math term for the student. |
| `relative_term_index` | Term offset from the student's first observed math term. |
| `math_path_sequence_number` | Ordered sequence number across the student's math attempts. |
| `prior_attempt_count_course_family` | Count of prior in-scope math attempts before this row. |
| `prior_fail_count_course_family` | Count of prior failed in-scope math attempts before this row. |
| `prior_withdraw_count_course_family` | Count of prior withdrawals before this row. |
| `repeat_flag` | `1` when `target_attempt_number > 1`. |
| `previous_course_id` | Immediately previous observed in-scope math course. |
| `previous_term_index` | Term code for the previous observed math course. |
| `next_course_id` | Immediately next observed in-scope math course. |
| `next_term_index` | Term code for the next observed math course. |
| `next_outcome_code` | Normalized outcome in the next observed course. |
| `next_pass_flag` | Pass flag for the next observed course. |
| `transition_type` | `forward`, `repeat`, or `terminal` in this mock file. |
| `terms_to_next_course_family` | Number of term steps to the next observed math course. |
| `stopout_flag` | Mock flag for no later math course outside the censor window. |
| `stopout_censor_flag` | `1` when a terminal claim is too recent to evaluate reliably. |
| `observation_end_term_index` | Latest term represented in the mock extract. |

### Policy / Audit Columns

| Column | Description |
|---|---|
| `pass_threshold_points_used` | Pass threshold used in the mock derivation, `2.0`. |
| `stopout_term_threshold_used` | Stopout threshold used in the mock derivation, `2`. |
| `repeat_semantics_used` | Repeat policy, `all_attempts`. |
| `next_scope_used` | Next-course policy, `immediate_next_course_family`. |
| `same_term_order_rule_used` | Same-term ordering policy, `course_sort_order`. |
| `term_index_scheme_used` | Term index description, `SDW STRM YYYT`. |

### Network Columns

| Column | Description |
|---|---|
| `network_row_flag` | `1` when the row should be used by WSU Network. |
| `network_source` | Source node for the directed edge. |
| `network_destination` | Destination node for the directed edge. |
| `network_edge_weight` | Additive edge weight. Each mock transition row contributes `1`. |
| `network_node_group` | Node color/emphasis group. |
| `network_link_label` | Optional edge label. Usually leave this out of the Link Label bucket for readability. |
| `network_tooltip_detail` | Human-readable edge detail for hover. |
| `network_repeat_stage` | Attempt number used by expanded repeat-stage rendering. |

### Sankey Columns

These are included for later Sankey demonstrations. They are not needed for the
Network review.

| Column | Description |
|---|---|
| `sankey_row_flag` | `1` for the one path-summary row per student. |
| `sankey_path_key` | Stable mock path identifier. |
| `sankey_anchor_course_id` | Terminal/latest course or terminal label for the path. |
| `sankey_trace_direction` | Path shaping mode, `forward_from_first_math`. |
| `sankey_start_node` | First stage in the flattened path. |
| `sankey_intermediate_1` | Optional second path stage. |
| `sankey_intermediate_2` | Optional third path stage. |
| `sankey_intermediate_3` | Optional fourth path stage. |
| `sankey_intermediate_4` | Optional fifth path stage. |
| `sankey_intermediate_5` | Optional sixth path stage. |
| `sankey_end_node` | Final path stage. |
| `sankey_flow_weight` | Additive Sankey weight, `1` per student path row. |
| `sankey_path_group` | Path color group, such as `Completed/Persisted` or `Repeat/Stopout Risk`. |
| `sankey_sort_key` | Sort/order evidence for the path row. |
| `sankey_tooltip_detail` | Human-readable full path detail. |

## 7. Review Questions For Math

Suggested questions for the math reviewer:

1. Are the directed edges plausible as adjacent course transitions?
2. Are self-loops the right representation for repeated attempts, or are
   expanded repeat stages more interpretable?
3. Should `No Further Course` be treated as a terminal state, a censored state,
   or separated into multiple terminal categories?
4. Which course relationships should be considered expected progression,
   alternate progression, or detour?
5. What minimum edge count should be shown before a transition is considered
   meaningful?
6. Should pass/fail/withdraw outcomes color edges, appear only in tooltips, or
   be handled in separate filtered views?

## 8. Practical Recommendation

For review, use multiple narrow Network worksheets rather than one all-purpose
graph:

- `MATH 220 Neighborhood`
- `Repeat Bottlenecks`
- `Forward Progression`
- `No Further Course`

This keeps the graph mathematically interpretable and operationally useful.
