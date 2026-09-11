# WSU Math Pathway Diagnostics — Plugin Spec

> **STATUS: PROPOSAL — NOT BUILT.** This describes a sixth plugin that has not been
> implemented. It is kept for design continuity. Section 16 refers to a Flask
> prototype that is not part of this repository.

Canonical planning spec for a new WSU custom visualization focused on student
math-course journeys, progression bottlenecks, and prerequisite adequacy.
The design should remain reusable for other course families after v1.

---

## 1. Purpose

### Problem this plugin solves

Sankey-style flow charts were not sufficiently useful for this analysis because
they obscure timing, repeats, and prerequisite quality. This plugin is designed
to answer operational advising questions directly:

- Where do students stall in the math sequence?
- Which transitions (A -> B) are weak, delayed, or lossy?
- Do prerequisite rules predict success in the next course?
- Where do entry-test/placement decisions appear misaligned with outcomes?

### Primary users

- Institutional research
- Math department leadership
- Advising and student-success teams

### Outcome

Provide actionable evidence for intervention design (curriculum sequencing,
support services, prerequisite policy updates, entry-test cut-score tuning).

---

## 2. Identity (proposed)

- **Display name**: WSU Math Pathway
- **Short name**: WSU Math Pathway
- **Category**: WSU
- **Proposed root id**: `com-wsu-math-pathway`
- **Version constant**: `1.0.0` (initial)

Source target:
- `oac-sdk-dev/src/customviz/com-wsu-math-pathway/`

Build output target:
- `oac-sdk-dev/build/distributions/customviz_com-wsu-math-pathway.zip`

---

## 3. Core Visual Model

V1 should be a focused two-view plugin: one primary view plus one closely related
toggle view. Additional diagnostics are explicitly deferred to later phases.

### 3.1 Main view: Course Progression Grid

- **X-axis**: term sequence (or normalized term index from student start)
- **Y-axis**: course band / level / pathway group
- **Cell intensity**: student count or progression count
- **Cell overlays**: fail/W/I/repeat percentages
- **Interaction**: hover shows full metric table and top transition outcomes

Why this is preferred over Sankey:
- Preserves time order
- Exposes stalls and repeats by course and term position
- Avoids overplot clutter in high-pathway populations

### 3.2 Secondary view: Transition Matrix

- Rows: source course
- Columns: destination course
- Metric mode switch:
  - count
  - progression rate
  - success in destination
  - median terms-to-next

Purpose:
- Quickly identifies weak links and looping patterns.

Default transition scope:
- `next_course_id` means the immediate next course in the selected course-family
  scope (v1 default).

### 3.3 Deferred view (v2): Prerequisite Adequacy Panel

For each destination course, compare outcomes by entry route:

- passed required prereq only
- ALEKS placement only
- both prereq + ALEKS
- exception/other

Primary output:
- next-course success rate and risk delta by entry route

### 3.4 Deferred view (v2): Journey Strips

Small-multiple student path strips for selected cohorts (sampled), used for:
- visual sanity-check of sequence assumptions
- identifying non-linear loops and stop-outs

### 3.5 Borrowed patterns from comparable applications (design principles)

The following patterns come from higher-ed gateway dashboards, curricular
analytics, and educational process-mining implementations.
Treat these as guidance for phased design (v1 vs v2), not as v1 requirements:

- **Explicit completion criteria controls**: support denominator/numerator
  switches such as `All Required`, `Math Only`, `At Least One Required`,
  and custom grade-threshold completion.
- **Course + term duality**: always provide both a sequence view and a
  term-index view (calendar and relative-to-start).
- **Structure + outcomes together**: pair transition frequencies with
  prerequisite-structure impact (blocking/delay style logic).
- **Passability weighting**: highlight bottlenecks by combining structure and
  observed pass rates, not counts alone.
- **Dropout-risk states**: include an unresolved-failure burden metric
  ("backpack" style) across terms.
- **Compare successful vs unsuccessful pathways** (v2): side-by-side cohort
  mode, same filters/scales, with delta readout.
- **Top-N variant controls** (v2): cap process complexity with top-path and
  max-step controls to keep visuals interpretable.
- **Absolute vs relative frequency toggle**: counts and percentages must be
  switchable in every major view.
- **Low-N reliability handling**: mask or de-emphasize unstable cells/edges.

---

## 4. Data Inputs

Primary data contract:
- `project_spec_wsu_math.md` section `17. Integrated Dataset Contract (Authoritative)`

## 4.1 Required enrollment fields (v1)

- `student_id`
- `target_course_id` (canonicalized course code)
- `target_term_label`
- `target_term_index` (numeric chronology)
- `target_attempt_number`
- `target_grade_code`
- `target_grade_points`
- `target_outcome_code`
- `target_pass_flag`
- `course_sort_order`
- `course_level`
- `pathway_band`
- `next_course_id`
- `next_term_index`
- `next_outcome_code`
- `next_pass_flag`
- `transition_type`
- `terms_to_next_course_family`
- `observation_end_term_index`
- `stopout_flag`
- `stopout_censor_flag`

### 4.2 Strongly recommended additional fields

- `attempt_number` (if available; otherwise derived)
- `student_start_term`
- cohort flags (first-gen, transfer, gateway cohort, etc.)
- `entry_test_score` or `entry_test_band` (ALEKS is one instance)
- `days_of_week` and `meeting_time` (tooltip-only in v1; schedule analysis deferred)

### 4.3 Required external map inputs

- **Prerequisite logic should be precomputed in the dataset** (recommended):
  - `prereq_status` (met / not_met / exception)
  - `placement_status` (met / not_met / not_applicable)
  - optional `entry_route` (prereq_only / placement_only / both / neither)

Rationale:
- OAC property panels are not suitable for maintaining complex prerequisite maps.
- Keeping rule logic in Data Flow/RPD improves maintainability and auditability.

---

## 5. Derived Model (plugin-side or precomputed)

Build a normalized event model per student:

- ordered course attempts by term (and within-term tie-break policy)
- transition edges: `(course_a, term_t) -> (course_b, term_t+k)`
- repeat flags for same course
- term-gap / time-to-next metrics
- prerequisite-satisfied flags at destination enrollment

Grade normalization:

- numeric grades 0.0-4.0 remain numeric
- `W`, `I` retained as categorical outcomes
- `pass/fail` derived from configurable passing threshold

Recommended defaults:

- passing grade threshold = `2.0`
- stall window = `2 terms` with no next math enrollment
- stopout threshold = configurable (`N` terms with no math enrollment), default `2`

Required ordering input:

- `term_index` numeric field required for chronology (example `202340`, `202410`)
- do not rely on lexical ordering of term labels

Policy definitions required before coding:

- **Stopout**: default definition is `N` terms with no math enrollment
  (`N = stopoutTermThreshold`, default 2). Confirm whether this should be
  "no enrollment anywhere" or "no next required math course" for your institution.
- **Same-term sequencing**: when two math courses are in the same term, use
  `attempt_timestamp` if present; otherwise fall back to deterministic
  lexical course sort and mark as "same-term ambiguous" in QA checks.
- **Repeat semantics**: v1 supports `allAttempts` (flow) and
  `terminalAttemptOnly` (outcome summary). Additional modes deferred.
- **Transfer/test/credit-by-exam handling**: require precomputed flags to prevent
  phantom-prereq violations in plugin-side logic.

---

## 5A. Prereq Attempt Semantics (dataset design requirement)

When analyzing downstream performance (example `MATH 172`) relative to a
prerequisite (example `MATH 171`), using only the latest prerequisite grade is
useful but incomplete. It can hide repeat burden and recovery patterns.

For each downstream enrollment event (each `student_id + target_course + term_index`)
precompute the following fields:

- `prereq_terminal_grade_points`:
  grade points of the final prerequisite attempt before the target-course attempt.
- `prereq_terminal_grade_code`:
  raw terminal grade code (`A/B/C/D/F/W/I/...`) before target-course attempt.
- `prereq_first_grade_points`:
  first prerequisite attempt grade points.
- `prereq_first_grade_code`:
  first prerequisite attempt grade code.
- `prereq_attempt_count_before_target`:
  total prerequisite attempts up to (and including) satisfying attempt before target.
- `prereq_failed_attempts_before_target`:
  count of non-pass prerequisite attempts before target.
- `prereq_terms_to_satisfy`:
  terms between first prerequisite attempt and satisfying attempt.
- `prereq_recovery_flag`:
  `1` if student had one or more failed prerequisite attempts and later satisfied prerequisite.
- `prereq_satisfied_flag`:
  `1` if prerequisite requirement satisfied under institutional rule at target enrollment.
- `prereq_entry_mode`:
  `course_prereq` | `placement_only` | `both` | `exception`.

Recommended reporting modes:

- **Snapshot mode (default)**:
  uses `prereq_terminal_grade_*` to match current faculty mental model.
- **Journey-aware mode**:
  stratifies by attempt-history burden (`prereq_attempt_count_before_target`,
  `prereq_failed_attempts_before_target`, `prereq_recovery_flag`).

Interpretation guideline:

- "B in prerequisite" is not equivalent across students.
- Distinguish "B on first attempt" from "B after multiple attempts" in tooltips
  and cohort breakdowns to expose hidden bottlenecks.

---

## 6. Metrics

### 6.1 MVP metrics (v1)

- `enrollment_count`
- `progression_count` (A -> B)
- `progression_rate`
- `stopout_rate`
- `repeat_rate`
- `w_rate`
- `i_rate`
- `pass_rate`
- `median_terms_to_next`

MVP denominator defaults:

- `pass_rate` denominator includes `pass` and `fail` outcomes only
- `wi_rate` denominator includes all outcome rows unless filtered
- `repeat_rate` denominator is all rows in selected grain
- `progression_rate` denominator is rows with `target_pass_flag = 1` (default)
- `stopout_rate` denominator excludes rows with `stopout_censor_flag = 1`

### 6.2 Deferred metrics (v2+)

- `prereq_satisfied_rate`
- `prereq_satisfied_but_not_pass_next_rate`
- `placement_mismatch_index` (defined below)
- `bottleneck_index` (structure x passability weighted)
- `unresolved_failed_required_count` (backpack size)
- `stopout_with_unresolved_required_rate`
- `top_path_coverage_rate` (share captured by top-N displayed variants)

Placement mismatch (proposed formula):

- cohort expected-ready by ALEKS
- minus observed pass rate in first target course
- reported as percentage-point gap

Bottleneck index (proposed formula):

- `blocking_factor(course) x (1 / pass_rate(course))`
- optional extension: multiply by observed enrollment share to prioritize scale

Backpack burden:

- unresolved required courses not yet passed at each term boundary
- trend over terms used as risk signal (flat/high, increasing, or decreasing)

---

## 7. Bucket Layout (proposed for OAC datamodel handler)

| Bucket | Logical | Type | Min | Max | Label |
|---|---|---|---|---|---|
| `student` | `ROW` / `CATEGORY` | categorical | 1 | 1 | `student_id` |
| `course` | `ROW` / `CATEGORY` | categorical | 1 | 1 | `target_course_id` |
| `term` | `ROW` / `CATEGORY` | categorical | 1 | 1 | `target_term_label` |
| `termIndex` | `DETAIL` | numeric | 1 | 1 | `target_term_index` (sortable) |
| `gradePoints` | `MEASURES` | numeric | 0 | 1 | `target_grade_points` |
| `outcome` | `DETAIL` | categorical | 1 | 1 | `target_outcome_code` |
| `passFlag` | `DETAIL` | numeric | 1 | 1 | `target_pass_flag` |
| `courseOrder` | `DETAIL` | numeric | 1 | 1 | `course_sort_order` |
| `courseLevel` | `DETAIL` | categorical | 0 | 1 | `course_level` |
| `pathwayBand` | `DETAIL` | categorical | 0 | 1 | `pathway_band` |
| `nextCourse` | `DETAIL` | categorical | 0 | 1 | `next_course_id` |
| `nextTermIndex` | `DETAIL` | numeric | 0 | 1 | `next_term_index` |
| `nextOutcome` | `DETAIL` | categorical | 0 | 1 | `next_outcome_code` |
| `nextPassFlag` | `DETAIL` | numeric | 0 | 1 | `next_pass_flag` |
| `termsToNext` | `DETAIL` | numeric | 0 | 1 | `terms_to_next_course_family` |
| `stopout` | `DETAIL` | numeric | 0 | 1 | `stopout_flag` |
| `stopoutCensor` | `DETAIL` | numeric | 0 | 1 | `stopout_censor_flag` |
| `relativeTermIndex` | `DETAIL` | numeric | 0 | 1 | `relative_term_index` |
| `schedule` | `DETAIL` | categorical | 0 | 2 | Days/Time (tooltip only) |
| `entryTest` | `DETAIL` | both | 0 | 2 | entry-test / placement |
| `cohort` | `GLYPH` | categorical | 0 | 5 | Cohort filters (v2 priority) |
| `detail` | `CATEGORY` | both | 0 | 20 | Tooltip details |

Note:
- If OAC classifies grade as numeric measure, plugin must still support `W/I`
  records via raw-text detail field fallback.
- Grid Y-axis must be ordered by `course_sort_order` (hidden sort field), not
  by lexical course labels.

---

## 8. Config Schema (proposed)

### View (v1)
- `viewMode`: `grid` | `transitionMatrix`
- `metricMode`: `count` | `passRate` | `repeatRate` | `wiRate` | `progressionRate` | `stopoutRate` | `medianTermsToNext`
- `normalizeTerm`: `calendar` | `relativeToStart`
- `frequencyMode`: `absolute` | `relative`

### Outcomes (v1)
- `passingThreshold`: default `2.0`
- `includeW`: `on/off`
- `includeI`: `on/off`
- `repeatRule`: `allAttempts` | `terminalAttemptOnly`
- `stallTermWindow`: default `2`
- `stopoutTermThreshold`: default `2`
- `attemptDisplayRule`: `allAttempts` | `terminalAttemptOnly` (alias of `repeatRule` if needed)

### Deferred config (v2+)
- `cohortCompareMode`: `off` | `sideBySide` | `delta`
- `topPathVariants`: default `20` (range suggested: 5-50)
- `maxPathSteps`: default `6` (range suggested: 3-10)
- `pathScope`: `all` | `earlyPhaseOnly`
- `prereqRuleMode`: `strict` | `expanded`
- `placementRuleMode`: `useIfPresent` | `requiredIfMapped` | `ignore`
- `minCohortSize`: default `15`
- `gatewayCompletionRule`: `allRequired` | `mathOnly` | `atLeastOneRequired`
- `gradeRuleMode`: `institutionDefault` | `custom`

Note:
- In MVP, prerequisite diagnostics consume precomputed fields (`prereq_status`,
  `placement_status`, `entry_route`) rather than parsing author-entered rules.

### Interaction
- `clickBehavior`: `single` | `pathHighlight`
- `privacyMode`: `off` | `on` (hide low-N labels)
- `lowNMask`: default `10`
- `showLowNReliability`: `on` | `off`
- `hideSelfTransitions`: `on` | `off` (default `on` in matrix mode)
- `excludeCensoredRows`: `on` | `off` (default `on`)

### Format
- `numberFormat`: `auto` | `number` | `percent` | `compact`
- `decimalPlaces`: `auto` | `0` | `1` | `2` | `3`
- `valueSuffix` / `valuePrefix`

### Style
- `colorSource`: `oac` | `custom`
- `palette`: default `""`
- `riskRamp`: default red-amber-green

---

## 9. Interaction Design

- Hover cell/edge -> rich tooltip table:
  - counts, rates, W/I/repeat, time-to-next
  - top incoming and outgoing transitions
- Click course or transition -> filter workspace to local neighborhood
- Reset control always visible after drill/filter state set
- When low-N masking is active, masked cells/edges must not emit marking events
  and must suppress sensitive tooltip detail rows.

Deferred interaction (v2+):
- cohort side-by-side compare and delta layers
- sampled journey drill-ins for selected cells

---

## 10. Authoring / Analysis Recipes

### 10.1 Bottleneck scan

- `viewMode = grid`
- `metricMode = repeatRate` or `stopoutRate`
- sort by highest stopout/repeat
- identify courses with high enrollment + poor progression

### 10.2 Prerequisite adequacy check (v2)

- `viewMode = prereqPanel`
- destination = selected gateway course
- compare pass rates across prereq-only vs ALEKS-only vs both

### 10.3 Transition weakness map

- `viewMode = transitionMatrix`
- metric = `progressionRate` (v1) and optionally destination success when available
- filter to top N source courses by volume
- default `hideSelfTransitions = on` to prevent repeat loops dominating matrix

### 10.4 Successful vs struggling cohort comparison (v2)

- `cohortCompareMode = sideBySide`
- cohort A = students with smooth progression (no unresolved backpack beyond 1 term)
- cohort B = students with repeated unresolved required courses
- evaluate divergence in transitions, pass rates, and time-to-next

### 10.5 Early warning pattern scan (v2)

- `pathScope = earlyPhaseOnly`
- `topPathVariants = 20`
- `maxPathSteps = 6`
- flag pathways with high `stopout_with_unresolved_required_rate`

---

## 11. Implementation Phases (recommended)

### Phase 1 - Foundation
- Datamodel handler and plugin registration
- Config scaffold + minimal render stub
- Stable bucket parsing and grade normalization
- Require numeric `term_index` and validate chronology
- Fork source recommendation: `com-wsu-line` (shared interaction and panel patterns)

### Phase 2 - Data engine
- Student sequence ordering
- Transition edge generation
- Core metric computations
- Stopout and time-to-next calculations
- Repeat-policy support (`allAttempts` vs `terminalAttemptOnly`)
- Apply censoring rules for recent terms (`observation_end_term_index`)

### Phase 3 - Main visualization
- Course Progression Grid draw
- Tooltip table and selection state
- Basic filtering + reset interaction
- FERPA-safe low-N masking defaults

### Phase 4 - Diagnostics panels
- Transition Matrix

### Phase 4B - Deferred diagnostics (v2+)
- Prerequisite Adequacy Panel (precomputed prereq fields only)
- Optional sampled Journey Strips
- Cohort side-by-side compare mode
- Bottleneck/backpack metrics if precomputed and validated

### Phase 5 - Hardening
- Logger integration
- null/low-N privacy handling
- perf tuning for large cohorts
- property panel grouping and fallback behavior
- consistency tests for absolute vs relative frequency modes
- scale locking tests for compare mode

---

## 11A. Strict MVP Scope (must ship first)

To reduce risk and deliver value quickly, MVP is intentionally narrow:

### MVP views
- Course Progression Grid (primary)
- Transition Matrix (toggle mode)

### MVP metrics
- `pass_rate`
- `w_rate`
- `i_rate`
- `repeat_rate`
- `median_terms_to_next` (stall signal)

### MVP controls
- `normalizeTerm` (calendar vs relative-to-start)
- `passingThreshold`
- `repeatRule`
- `stopoutTermThreshold`
- `frequencyMode` (absolute/relative)
- `privacyMode` + low-N masking

### Explicitly deferred to v2
- Author-side prerequisite rule editing in plugin UI
- Full prereq adequacy panel with custom rule parser
- Journey strips at full scale (allow only sampled drill-in subsets)
- ALEKS threshold parsing in JS
- Cohort compare/delta rendering
- Backpack burden if not precomputed upstream

---

## 12. Validation Checklist

- `node --check` passes for JS files
- JSON manifests parse cleanly
- build zip generated in `build/distributions`
- plugin appears in OAD after restart
- no `[CUSTOM_VIZ]` registration errors
- metric spot checks match hand-validated sample students
- prereq route classification validated against provided map
- transition counts match precomputed `next_*` fields
- stopout censoring verified for recent terms

---

## 13. Risks and Mitigations

- **Course code inconsistency** -> add normalization map layer
- **Term ordering ambiguity** -> require explicit sortable term key
- **Grade semantic drift across colleges** -> configurable pass threshold + grading map
- **Sparse cohorts causing misleading rates** -> low-N mask + minimum cohort size
- **Overly complex prereq logic** -> no plugin-side parser in v1; use precomputed statuses
- **Performance with attempt-level data** -> prefer precomputed pathway fields in OAC Data Flow
- **Low-N privacy leakage** -> suppress labels, tooltip details, and marking events when masked

---

## 14. Open Inputs Needed From Author

Before build starts, confirm:

- canonical course ID format
- exact term sort logic
- numeric `term_index` field definition
- `course_sort_order` source of truth (catalog, custom pathway map, or department order)
- passing-grade policy by course (if not universal)
- precomputed prerequisite status field definitions and allowed values
- entry-test rule details (ALEKS and/or other tests: thresholds, expiry windows)
- initial cohort definitions and priority reporting slices
- student identifier policy (`student_id` pseudonymized vs raw institutional ID)
- transition semantics (`next_course` = immediate next in family vs next required)

For implementation, confirm final column names match:
- `project_spec_wsu_math.md` section `17. Integrated Dataset Contract (Authoritative)`

---

## 15. Decision Note

This plugin is intentionally designed as a **pathway diagnostics tool** rather
than a pure flow diagram. The objective is decision support (where to intervene
and why), not only visualizing aggregate movement.

---

## 16. Prototype Implementation Notes

These notes come from the Flask prototype work in `prototype_flask/` and should
guide the OAC build.

### 16.1 Strongest validated direction

- The core value is not the chart type; it is keeping pathway evidence scoped to
  the same selected cohort across every table, metric, tooltip, and visual.
- Faculty workflows need a narrow anchor first: course + term + section /
  instructor. The plugin should not force faculty through a cross-course
  dashboard when they are trying to explain outcomes for one class.
- Chair workflows need threshold controls: minimum N, hurdle threshold, and
  repeat/self-transition visibility. Without these, the view will either
  overreact to small cells or hide bottlenecks caused by repeated attempts.
- Denominator definitions must be visible in the UI. Pass rate, W/I rate,
  repeat rate, progression rate, and stopout rate answer different questions
  and should not be left to inference.

### 16.2 Design cautions for OAC v1

- Do not make Sankey the primary model. It remains useful only as optional
  supporting evidence for top path signatures, and it handles repeat
  self-loops poorly.
- Treat self-transitions explicitly as repeats. Matrix and network views should
  label them as repeat/bottleneck evidence rather than letting them look like
  ordinary forward movement.
- Do not compute complex advising or prerequisite rules in plugin properties.
  OAC property panels are too brittle for rule authoring; prereq/placement
  semantics should be bound as dataset fields.
- Avoid a multi-workspace plugin in v1. The grid and transition matrix are
  enough if they share the same filters, denominators, low-N behavior, and
  marking rules.

### 16.3 Data fields reinforced by prototype

In addition to the required v1 fields above, the prototype suggests these fields
are worth carrying early, even if only for tooltip/filter use:

- `instructor_id`
- `section_id`
- `section_label`
- `section_days`
- `section_time`
- `section_time_block`
- `prereq_attempt_count_before_target`
- `prereq_failed_attempts_before_target`
- `prereq_terminal_grade_code`
- `prereq_terminal_grade_points`
- `prereq_entry_mode`
- `entry_test_band`
- `borderline_placement_flag` or equivalent

Rationale:
- Section/instructor/time effects are part of the actual decision workflow.
- Prereq attempt burden is more actionable than terminal prereq grade alone.
- Borderline placement route comparisons are useful, but only if precomputed and
  defined by policy outside the plugin.

### 16.4 UI behavior to preserve in OAC

- Every view must be synchronized to the same filtered dataset.
- Low-N masked cells/edges should suppress labels, tooltip details, and marking.
- Recent-term stopout censoring must be shown or reflected in denominator text.
- Visual views need text/table fallbacks so the analysis remains usable if a
  graph layout is cluttered, slow, or unavailable.
- Defaults should open to a useful state: high-signal gateway course, latest
  reliable term, and a metric that exposes bottlenecks rather than a blank or
  generic chart.

### 16.5 MVP implication

Build the OAC plugin after the dataset contract is locked, but keep the first
extension narrower than the Flask prototype:

- ship grid + transition matrix first
- include denominator text and low-N behavior from day one
- support section/instructor fields as tooltip/filter dimensions if bound
- defer Sankey, journey strips, route-quality panels, and cohort-delta views
  until marking, masking, and performance are proven

### 16.6 Prototype-first delivery model (required)

This project is explicitly two-stage:

1. **Python/Flask prototype stage** (decision validation):
   - prove user value with faculty/chair workflows
   - test filter ergonomics and interpretation
   - validate that visual maps (Sankey/network/path patterns) add value beyond tables
   - refine denominator language and advising narratives
2. **OAC plugin stage** (production delivery):
   - implement only validated workflows
   - preserve rule transparency (no hidden scoring)
   - enforce OAC-safe marking/masking/performance behavior

No major OAC feature should be built unless it has passed prototype validation
with users.

### 16.7 Candidate plugin split after prototype

If prototype feedback shows two distinct user needs, split into two OAC plugins
instead of one overloaded extension:

- **Plugin A: Pathway Core (required first)**
  - course/term progression grid
  - transition matrix
  - denominator and censoring text
  - low-N masking + marking-safe behavior
- **Plugin B: Pathway Visual Explorer (optional second)**
  - Sankey flow
  - network connector map (with repeat-loop emphasis)
  - common-path route quality visuals
  - advising evidence visuals

Split criterion:
- if visual exploration workflows require heavier rendering and different
  interaction patterns than the core diagnostic grid/matrix, keep them separate.

### 16.8 Visual map guidance for production

Visual-first users are a real audience. Preserve this capability, but guard
against misuse:

- Sankey is supportive, not authoritative, especially with repeat loops.
- Network view should explicitly encode self-loop repeats as bottlenecks.
- Every visual map must have an adjacent numeric/table view with the same filter
  scope for auditability.
- Advisor-facing claims should cite simple cohort counts/rates, not only graph
  geometry.

### 16.9 Prototype parity fields (must remain in data contract)

The following fields are now considered parity-critical because they drive
validated prototype workflows:

- `instructor_id`
- `section_id`
- `section_time`
- `section_time_block`
- `next_course_id`
- `transition_type` (including repeat/self-loop)
- `stopout_censor_flag`
- `prereq_entry_mode`
- `prereq_attempt_count_before_target`
- `prereq_failed_attempts_before_target`
- `prereq_terminal_grade_points`
- `entry_test_score` / `entry_test_band`
- `borderline_placement_flag` (or policy-equivalent indicator)

---

## 17. Integrated Dataset Contract (Authoritative)

This section is the implementation contract between data engineering and plugin
code. If there is ever wording conflict elsewhere in this file, this section is
the source of truth for dataset semantics.

### 17.1 Design goal and grain

Create one analytics-ready fact table at **course-family attempt grain**:

- one row per `student_id + target_course_id + target_term_index + target_attempt_number`

Where `target_*` means the current row's course attempt (not a single terminal
destination course). For math, include all in-scope math-course attempts, not
only downstream rows such as `MATH 172`.

### 17.2 Required columns (core)

Identity and grain:

- `student_id` (string)
- `target_course_id` (string, canonicalized)
- `target_term_label` (string, display-only)
- `target_term_index` (int, sortable chronology, e.g. `202410`)
- `target_attempt_number` (int, 1-based attempt within target course)
- `course_sort_order` (int, canonical Y-axis ordering)
- `course_level` (string, e.g. `developmental`, `gateway`, `advanced`)
- `pathway_band` (string, e.g. `algebra`, `calculus`, `statistics`)

Target outcome:

- `target_grade_code` (string: `A`, `B`, `C`, `D`, `F`, `W`, `I`, etc.)
- `target_grade_points` (decimal, nullable for non-point outcomes)
- `target_outcome_code` (string: `pass`, `fail`, `withdraw`, `incomplete`, `other`)
- `target_pass_flag` (0/1 under institution rule)

Term normalization:

- `student_start_term_index` (int)
- `relative_term_index` (int; term-distance from student start)

Sequence features:

- `next_course_id` (string, nullable; immediate next course in course-family scope)
- `next_term_index` (int, nullable)
- `next_outcome_code` (string, nullable)
- `next_pass_flag` (0/1, nullable)
- `transition_type` (`forward` | `repeat` | `backward` | `unknown`)
- `terms_to_next_course_family` (int, nullable)
- `stopout_flag` (0/1 under agreed policy)
- `repeat_flag` (0/1, whether this row is a repeat target attempt)
- `observation_end_term_index` (int; dataset censor boundary)
- `stopout_censor_flag` (0/1; true when stopout cannot yet be evaluated reliably)

### 17.3 Prior-history rollups (recommended v1)

All computed using records strictly before `target_term_index` (or before
timestamp if two attempts occur in the same term):

- `prior_attempt_count_all`
- `prior_attempt_count_course_family`
- `prior_fail_count_course_family`
- `prior_withdraw_count_course_family`
- `prior_incomplete_count_course_family`
- `prior_avg_grade_points_course_family`
- `prior_latest_grade_points_course_family`
- `prior_terms_enrolled_course_family_count`

### 17.4 Prereq attempt semantics (per target row)

- `prereq_course_id` (string; if multiple prereqs, see 17.7)
- `prereq_satisfied_flag` (0/1)
- `prereq_entry_mode` (`course_prereq` | `placement_only` | `both` | `exception`)
- `prereq_first_grade_code`
- `prereq_first_grade_points`
- `prereq_terminal_grade_code`
- `prereq_terminal_grade_points`
- `prereq_attempt_count_before_target`
- `prereq_failed_attempts_before_target`
- `prereq_terms_to_satisfy`
- `prereq_recovery_flag` (0/1)

This keeps both snapshot (`terminal`) and journey-aware prereq evidence.

### 17.5 Entry-test, placement, and transfer fields

- `entry_test_type` (e.g., `ALEKS`, `ACCUPLACER`, `NONE`)
- `entry_test_score` (decimal, nullable)
- `entry_test_band` (string)
- `entry_test_met_threshold_flag` (0/1)
- `entry_test_term_index` (int, nullable)
- optional compatibility aliases: `placement_*` when required upstream
- `transfer_credit_flag` (0/1)
- `transfer_prereq_equiv_flag` (0/1)
- `transfer_grade_points_equiv` (decimal, nullable)

Threshold and equivalency logic should be precomputed upstream (SQL/RPD/Data
Flow), not in plugin JavaScript.

### 17.6 Policy fields (required)

Publish policy columns with every extract:

- `pass_threshold_points_used` (decimal)
- `stopout_term_threshold_used` (int)
- `repeat_semantics_used` (`all_attempts` | `terminal_attempt`)
- `next_scope_used` (`immediate_next_course_family` recommended)
- `same_term_order_rule_used` (`timestamp` | `course_lexical` | `course_number`)
- `term_index_scheme_used` (string description)

### 17.7 Handling multi-prereq targets

Preferred approach:
- use a normalized bridge table for prereq rules
- precompute summary booleans into the fact table

Bridge example columns:
- `target_course_id`
- `prereq_group_id`
- `prereq_course_id`
- `min_grade_points`
- `logic_type` (`AND`/`OR`)

Materialized fact columns:
- `prereq_group_satisfied_flag`
- `prereq_group_id_used`
- `entry_route`

Do not parse rule expressions in visualization code.

### 17.8 Minimum viable extract (start here)

Minimum for first production build:

- grain + identity columns from 17.2
- `target_outcome_code`, `target_pass_flag`
- `relative_term_index`
- `repeat_flag`
- `next_course_id`, `next_term_index`
- `next_outcome_code`, `next_pass_flag`
- `transition_type`
- `terms_to_next_course_family`
- `stopout_flag`
- `observation_end_term_index`
- `stopout_censor_flag`

### 17.9 QA checks before plugin use

- no duplicate rows at target grain
- `target_term_index` monotonic within student/course attempts
- `relative_term_index >= 0` for first-time cohorts
- `target_pass_flag` consistent with `target_grade_code` and policy
- `next_course_id` and `next_term_index` match hand-validated transitions
- `stopout_flag` never true when `stopout_censor_flag = 1`
- `prereq_satisfied_flag` consistent with entry mode and source rule
- null handling validated for `W`, `I`, transfer-only, placement-only cases
- low-N cells audited against privacy threshold

### 17.10 Naming conventions

- use reusable prefixes: `target_*`, `prereq_*`, `prior_*`, `placement_*`, `transfer_*`
- avoid hardcoding specific course numbers in column names
- course-specific reporting should filter by `target_course_id`

---

## 18. External Review Disposition (Adopt / Revise / Reject)

This section translates external strategy feedback into implementation-ready
guidance for the prototype stage and downstream OAC delivery.

### 18.1 Adopt as-is

- **Policy-first framing**: position the suite as evidence for curriculum,
  staffing, scheduling, and prerequisite policy decisions (not as a chart pack).
- **Two audience model**: keep a strict split between:
  - faculty operational course view (current section + student context),
  - chair strategic pathway view (multi-course, multi-term, progression maps).
- **Chair-core metrics**:
  - `Sequential Success Rate (SSR)` between prereq and sequel,
  - `Grade Decay Index` (`sequel_grade_points - prereq_grade_points`),
  - instructor variance and section variance over time.
- **Faculty-core workflow**:
  - contextual roster + risk flags,
  - student history drill-through,
  - preparation profile (internal/transfer/entry-test route).
- **Outcome semantics**:
  - keep `W` and `I` separate from letter-grade failure where possible,
  - always display cohort `N` with every percentage.
- **Roadmap shape**:
  - do-now policy audit set,
  - do-next inference/refinement,
  - defer low-signal complexity (for example, LMS-behavior feeds).

### 18.2 Revise before implementation

- **Heatmap recommendation** -> **replace with bar/small-multiple alternatives**.
  - Reason: stakeholder interpretability preference and presentation friction.
  - Replacement patterns:
    - grouped/stacked bars by term and instructor,
    - instructor-over-time dot/line charts,
    - small-multiple instructor panels with shared axes.
- **"C- and below including W/I" phrasing** -> **separate semantics explicitly**.
  - Required reporting defaults:
    - `C and Above` (>= 2.0),
    - `C- and Below` (< 2.0 with numeric grade),
    - `W/I` as distinct category.
  - Provide toggle for letter-grade detail where needed.
- **Small-N threshold `<5`** -> **use project masking policy defaults**.
  - Default prototype and spec guidance should align to stronger masking
    settings used in this project (commonly `N < 10` unless governance says
    otherwise).
- **Sankey emphasis** -> **retain as exploratory, not decision-authoritative**.
  - Require paired numeric companion (table/rates/counts) for auditability.
- **Feeder-school audit** -> **defer to v2 unless transfer institution fields are
  validated and normalized**.
  - Keep schema hooks now; avoid overpromising policy-grade comparisons until
    feeder identity quality is verified.

### 18.3 Reject for v1 scope

- **Any faculty-facing progression map as primary analytic**.
  - Progression/journey maps remain chair-level decision tools in this program.
- **LMS engagement and behavioral telemetry integration**.
  - Out of scope for pathway-policy v1; high complexity, low immediate policy
    signal.
- **Financial/ROI modeling in-pathway dashboard**.
  - Out of scope for first decision cycle; keep focus on student success and
    curricular efficacy.

### 18.4 Implementation-ready analytics requirements

These are mandatory for prototype parity and OAC readiness:

- **Dual outcome mode** everywhere relevant:
  - `grade_view = band` (C-and-above / C-minus-and-below / W/I),
  - `grade_view = letter` (A..F/W/I detail).
- **SSR definition (default)**:
  - numerator: students who pass sequel on first sequel attempt,
  - denominator: students who passed prereq and enrolled in sequel within scope.
- **Grade Decay Index definition**:
  - average of (`sequel_grade_points - prereq_terminal_grade_points`) on matched
    prereq/sequel pairs with non-null grade points.
- **C-threshold audit slice**:
  - explicit `Marginal Foundation` cohort (`B-`, `C+`, `C`) for policy analysis.
- **Multi-term chair lens**:
  - all 100-level pathway trend views must support term-series analysis and
    instructor drill-down.
- **Numeric companions required**:
  - all progression visuals (Sankey/network/path views) must show matching table
    outputs with `N`, numerator, denominator, and rate.

### 18.5 Decision questions to lock with stakeholders

Before production OAC coding, confirm:

- minimum acceptable sequel success for marginal-prereq cohorts,
- governance owner for transfer/feeder intervention decisions,
- intervention playbook expectations for faculty risk flags,
- official privacy threshold for all published chair/faculty views.
