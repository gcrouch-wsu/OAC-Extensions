# Changelog

Each plugin carries its own version in `<Viz>.VERSION` and in its spec under
`docs/plugins/`. Repository tags mark the state of all five together.

## 2026-09-11 — tag `v1.1.0`

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
- **Changed defaults:** *Label: Show Edge Labels* and *Tooltip: Show Edge Pass
  Text* now default to **off**, per the spec. Workbooks that saved a value keep
  it; workbooks that never touched these properties will change.

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
- **v1.1.0:** released on GitHub; not yet uploaded to production. Blocked on
  [#1](https://github.com/gcrouch-wsu/OAC-Extensions/issues/1) (verification)
  and [#2](https://github.com/gcrouch-wsu/OAC-Extensions/issues/2) (Network
  default decision).

## Known gaps

Each item below is tracked as a GitHub issue; the issue carries the file and
line pointers. This list is a summary only.

| Issue | Item |
|---|---|
| [#1](https://github.com/gcrouch-wsu/OAC-Extensions/issues/1) | Verify v1.1.0 fixes in OAD/OAC before production upload |
| [#2](https://github.com/gcrouch-wsu/OAC-Extensions/issues/2) | Decide Network edge-label / pass-text defaults for rollout |
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
