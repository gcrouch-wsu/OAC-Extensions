# Changelog

Each plugin carries its own version in `<Viz>.VERSION` and in its spec under
`docs/plugins/`. Repository tags mark the state of all five together.

## Unreleased (round 2) — second review of the v1.2.0 candidate

The 2026-09-13 review of PR #10 rated 7 of the 35 fixes Partial and 4
Regresses, and found 8 new items. All addressed. Still **not verified in
OAD**. 30 model tests pass (was 24); two tests the review called
non-discriminating were rewritten so they fail on the old code.

### WSU Sankey 1.1.1
- **Fixed (regression from 1.1.0):** a link spanning an empty stage was
  drawn straight through whatever real node sat in that stage. Spanning
  edges now get an invisible *transit* node in every crossed stage; the
  stage is laid out around it and the link is drawn through it. Transit
  flow is excluded from `% of Stage`.
- **Fixed (regression):** the path-weight denominator counted rows whose
  every segment was rejected (orphan/self-link), which could filter out all
  valid traffic. Only rows that emit an edge count.
- **Fixed (regression):** edge-click focus pruned upstream edges but left
  their nodes highlighted; the node set is rebuilt from the kept edges.
- **Fixed (partial):** focus re-floored every active link to 2.5 px, undoing
  the node-capacity fit; links that were shrunk to fit are not boosted.
- **Fixed (partial):** dictionary keys are JSON tuples (a label containing
  U+001F could still collide with the separator approach).
- Tooltip carries a validation note when flows were dropped or collapsed
  (the spec promised this; the warning strip alone was not it).
- `Logical.COLOR` pinned like the other symbols.
- Spec: processing order rewritten for stage-position edges, status-split
  aggregation, transit layout; documents that Top N now counts
  status-separated edges (visible upgrade effect on saved workbooks).

### WSU Line 1.2.1
- **Fixed (partial):** the 14 px minimum hit width still overlapped on dense
  axes (40 categories in 400 px); hit rectangles are exactly one step wide.
- **Fixed (partial):** rank sort in descending direction put unranked rows
  first; they are last in both directions.
- **Fixed (regression):** a white header font color produced white-on-white
  chips; with a foreground override chips drop their fixed white fill.
- **Fixed (partial):** a nonempty→empty redraw bypassed `_draw()` and left
  the document Escape listener attached; it is detached at render entry.

### WSU Dumbbell 1.1.1
- **Fixed (partial):** the small-multiples SVG grew but nothing scrolled;
  `.chart-area` now scrolls vertically.
- **Fixed (partial):** same Escape-listener gap as Line; also the cleanup
  nulled the local handler before comparing it with the instance field.
- Spec: duplicate-role rule says "first row carrying a numeric value wins".

### WSU Lattice Scatter 1.1.1
- **Fixed (partial):** progress classification did not trim the letter, so
  `" W "` with points displayed `W` but was classed Eligible.

### WSU Network 1.2.1
- **Fixed (partial):** edge keys are JSON tuples (see Sankey).

### Docs
- `oac_design.md` §6.18.3 no longer prescribes `fit({padding})` (vis-network
  ignores it; describes the post-fit scale instead); §6.19 hit-area recipe
  uses `x.step()` with no minimum.

## Unreleased — branch `fix/data-correctness` (candidate v1.2.0)

Every valid finding from the 2026-09-12 code review (Codex, 35 numbered items
plus 15 spec-drift rows), fixed one commit per plugin with the spec updated
in the same commit. **No defaults change.** Verified by `node --check`, the
new model-test harness (`oac-sdk-dev/tests`, 24 tests), and `build-sdk.ps1`;
**not yet verified in OAD**.

### Decisions taken (were design questions, not bugs)
- **Sankey mixed-status edges (#34):** complete and incomplete traffic between
  the same two nodes are now separate edges, so a mostly-complete flow is not
  painted incomplete. Chosen over a majority rule because it loses nothing.
- **Sankey percent threshold (#35):** the denominator is total path weight
  (one weight per row), not the sum of segments, so adding an intermediate
  stage no longer changes what is filtered. `% of Total` in tooltips uses the
  same denominator.
- **Lattice *Progress Threshold* (#13):** wired in. Every marker carries
  `progress-eligible` / `progress-blocked`; blocked markers are dimmed. No
  tooltip wording is added, so the tooltip contract is unchanged.
- **Network *Repeat Roundness* (#20):** removed. vis-network self-loops have
  no roundness parameter, so the control never had an effect.

### WSU Lattice Scatter 1.1.0
- **Fixed:** null/blank grade points rendered `0.0`; points-without-letter
  rendered `IP`; tooltip field overrode *Sorting Term Code* (all 1.0.2).
- **Fixed:** *Progress Threshold* had no rendered effect (see decisions).
- **Fixed:** the optional measure was read unconditionally; tooltips could
  flip off-screen; threshold switcher value did not match its option values.
- Spec: sort precedence documents the label-parsing tier; panel inventory
  matches Style/Axis panels; presets documented.

### WSU Dumbbell 1.1.0
- **Fixed:** duplicate long-format role spilled into the other endpoint;
  all-missing Sum aggregate became `0`; legend swatches ≠ mark colors;
  `constructor`-style keys (all 1.0.2).
- **Fixed:** saved Filter By selections were not restored; a filter
  combination that emptied the chart hid its own reset controls; small
  multiples overwrote each other's zoom handlers, silently dropped groups
  past 12 and clipped panels; inbound marks ignored non-representative
  aggregate rows; *X Labels: Off* did not hide labels; the document-level
  Escape listener survived an interrupted drag.
- Drift: panel Sort Field offers first/second/delta/absDelta; control
  positions have CSS; unused `performanceMode` removed; reference-line
  value labels use the number format; Count shows on every aggregate row.

### WSU Sankey 1.1.0
- **Fixed:** blank intermediate shifted stages; zero settings reverted;
  `|` key collisions (all 1.0.2).
- **Fixed:** mixed-status edges and percent threshold (see decisions);
  click focus followed graph adjacency and invented cross-path
  relationships (now row membership); right-to-left layout kept
  left-to-right link geometry; `Other` dropped incomplete status, details
  and term code; 1 px link floors overflowed small nodes; optional measure
  read unconditionally; tooltips could flip off-screen; threshold/top-N
  drop counts were not shown.
- Symbol assertions at module top. Spec: bucket label is *Sorting Term
  Code (STRM)*.

### WSU Network 1.2.0
- **Fixed:** vis-network `value` overrode *Min/Max Edge Width*; `||` key
  collisions (both 1.1.2).
- **Fixed:** a detail blank on some contributors was shown as the
  aggregate's value; `fit()` padding was silently ignored (clearance now
  applied by post-fit scaling); a failed re-render left the previous vis
  instance alive; *Repeat Roundness* removed (see decisions).
- Symbol assertions at module top. Spec: Edge Weight documented as required.

### WSU Line 1.2.0
- **Fixed:** shared-X hit areas picked the wrong category; NaN values took
  numeric ranks (both 1.1.1).
- **Fixed:** right legend could not scroll; header color/bold did not reach
  the chips; dynamic-label conflict check skipped hidden null rows; inbound
  marks ignored non-representative aggregate rows; *X Labels: Off* did not
  hide labels; marker-size slider allowed 3 while the renderer floored at 4;
  empty-area click did not clear legend focus; `colorOrder` did nothing;
  the document-level Escape listener survived an interrupted drag.
- Spec: Zoom Mode options are Off / X / X+Y.

### Repository
- **New:** `oac-sdk-dev/tests/` — host-independent regression harness
  (`node tests/run.js`). Loads each plugin in Node with the framework
  stubbed; 24 tests, one per defect above. It caught a defect in one of
  these fixes while being written.
- README and AI_HANDOFF document the test step.

### Not changed
- Manifest `vizSettings._version` stays `1.0.0`: it is a settings-schema
  version (every Oracle sample keeps it at 1.0.0); the `1.0.0.<timestamp>`
  shown in the OAD extension list is the SDK's build stamp.
- Issue #8 (shared helper consolidation) is unchanged — a separate refactor.

## 2026-09-11 — tag `v1.1.1`

### WSU Network 1.1.1
- **Reverted** the two default changes from 1.1.0: *Label: Show Edge Labels*
  and *Tooltip: Show Edge Pass Text* default to **on** again, so uploading
  this build over 1.0.0 changes nothing an author did not set. The spec now
  documents `off` as the *recommended* value for full networks instead of the
  default. Decided in [#2](https://github.com/gcrouch-wsu/OAC-Extensions/issues/2).

Sankey 1.0.1, Line 1.1.0, Dumbbell 1.0.1 and Lattice Scatter 1.0.1 are
unchanged from v1.1.0 and are re-attached to this release for convenience.

## 2026-09-11 — tag `v1.1.0` (superseded by v1.1.1 — do not deploy)

### WSU Network 1.1.0
- **Fixed:** the *Tooltip details* bucket was silently ignored (host reports
  the edge as `detail`, code looked for `category`).
- **Fixed:** node and edge tooltips showed raw `<b>`/`<br>` markup; titles are
  now built as DOM elements, which is what vis-network ≥ 8 requires.
- **Fixed:** node sizes driven by the *Node Size* measure were scaled against
  the incident-weight domain and could fall outside the configured min/max.
- **Fixed:** the vis-network instance is now destroyed before its container is
  replaced and when the viz is removed from the canvas.
- **Removed:** *Legend: Show* toggle (it controlled nothing).
- ~~Changed defaults: Show Edge Labels / Show Edge Pass Text to off.~~
  Reverted in 1.1.1 (see above).

### WSU Line 1.1.0
- Version stamp for the v2 feature set that shipped under 1.0.0: STRM-based
  tooltip sort and legend order, axis title font/color/style controls, separate
  *Show X In Title* / *Show X Per Row*, the *Dynamic Value Label (from data)*
  bucket, and the native OAC color menu hook (see `docs/history/wsu-line-v2.md`).
- **Fixed:** header background/text color overrides now accept only real CSS
  colors.

### WSU Sankey 1.0.1
- **Removed:** *Require Monotonic Step*, *Require Unique Path Key*, *Strict
  Stage Boundaries* from the Rules panel. None were implemented; the first
  emitted a misleading "monotonic not evaluated" warning. Stage order is
  fixed by bucket position, so the rules had nothing to enforce.

### WSU Lattice Scatter 1.0.1
- **Fixed:** the *Sorting Term Code* bucket is now read directly. Previously
  it only worked if the field's display name matched a tooltip-label heuristic.
- Render errors are reported in the container instead of leaving it blank.

### WSU Dumbbell 1.0.1
- Tooltip element removed on teardown (all SVG plugins).

### Repository
- Docs reorganized: `docs/plugins/` (reference), `docs/guides/`,
  `docs/proposals/` (unbuilt), `docs/history/` (completed work orders).
- Build scripts honor an existing `JAVA_HOME`.
- `tools/generate_mock_math_pathway.py` writes to `examples/`.

## 2026-05-16 — initial public release

- WSU Network 1.0.0, WSU Sankey 1.0.0, WSU Line 1.0.0, WSU Dumbbell 1.0.0,
  WSU Lattice Scatter 1.0.0.

---

## Deployment status

- **Production OAC (2026-09-11):** 1.0.0 builds of all five extensions.
- **v1.1.1:** released on GitHub; the build to take to production once
  [#1](https://github.com/gcrouch-wsu/OAC-Extensions/issues/1) (verification
  in OAD/OAC Dev) is done. v1.1.0 is superseded; do not deploy it.

## Known gaps

Each item below is tracked as a GitHub issue; the issue carries the file and
line pointers. This list is a summary only.

| Issue | Item |
|---|---|
| [#1](https://github.com/gcrouch-wsu/OAC-Extensions/issues/1) | Verify v1.1.1 fixes in OAD/OAC before production upload |
| [#3](https://github.com/gcrouch-wsu/OAC-Extensions/issues/3) | WSU Line: `@parameter(...)` in a categorical calc for Dynamic Value Label |
| [#4](https://github.com/gcrouch-wsu/OAC-Extensions/issues/4) | WSU Line: native Color / Manage Color Assignments menu |
| [#5](https://github.com/gcrouch-wsu/OAC-Extensions/issues/5) | Apply the Color: Source pattern to the other four plugins |
| [#6](https://github.com/gcrouch-wsu/OAC-Extensions/issues/6) | WSU Dumbbell: aggregate mode + viewer controls persisting to view settings |
| [#7](https://github.com/gcrouch-wsu/OAC-Extensions/issues/7) | Which OAC/OAD versions honor custom property-panel tabs |
| [#8](https://github.com/gcrouch-wsu/OAC-Extensions/issues/8) | Consolidate duplicated helper code |

Details:

- **WSU Line — `@parameter(...)` in a categorical calculated attribute.** The
  *Dynamic Value Label (from data)* bucket is meant to receive a calculated
  attribute such as `CASE @parameter("Admissions Status") WHEN 'Applied' THEN
  'Applied' … END`. Local build validation passed; whether OAC evaluates the
  parameter inside a categorical calc and the label updates the Y-axis title
  and tooltip column together has not been confirmed on OAC Dev.
- **WSU Line — native Color / Manage Color Assignments menu.** The hook is
  wired when *Color: Source = OAC Theme*; exact menu wording and behavior are
  host-controlled and unconfirmed across OAC versions.
- **Cross-plugin color controls.** WSU Line's *Color: Source* pattern (OAC
  Theme default, empty custom palette, native color menu) has not been
  reviewed for Dumbbell, Lattice Scatter, Network and Sankey. Each has its own
  precedence rules (Network repeat/terminal colors, Sankey incomplete-path
  color) that must be preserved.
- **WSU Dumbbell — Group Aggregate mode.** Aggregated rows drop authored
  tooltip detail and do not retain Sort By / Filter By fields, so the in-chart
  strips may not behave as expected in that mode. The in-chart sort/filter
  strips also persist their state to the workbook's view settings on every
  change.
- **Custom property-panel tabs.** All plugins request custom panel ids
  (`wsuNetworkStyle`, …) with a fallback to the General tab when the host
  ignores them. Which OAC versions honor custom ids is not catalogued.
- **Shared helper code.** `str/esc/num/clamp/colorWithAlpha/sanitizeHex` and
  the gadget helpers are duplicated in all five plugins because OAC packages
  each plugin separately. They have already drifted slightly.
