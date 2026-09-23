# Changelog

Each plugin carries its own version in `<Viz>.VERSION` and in its spec under
`docs/plugins/`. Those constants are the versions in this folder. Network
1.2.2, Line 1.2.2, Sankey 1.1.2, Dumbbell 1.1.2, and Lattice Scatter 1.1.2
are on `main`. Glossary Pivot in this folder is 0.14.0, Report Print 1.1.0.
The commit on `origin/main` (`a15f2bf`) is Glossary Pivot 0.10.0 only;
Report Print does not exist there yet. `814a660` (local, not yet on
`origin/main`) is Glossary Pivot 0.13.0 and Report Print 1.0.0 — the
checkpoint immediately before Print Canvas.

The newest git tag is `v1.1.1`. It does not contain the 1.2.x / 1.1.2 work,
Glossary Pivot, or Report Print. Headings below that say "Unreleased" mean
"no git tag". The 1.x commits they describe are on `main`.

Glossary Pivot and Report Print version on their own lines, not on the 1.x
tags.

## 2026-09-23 — WSU Glossary Pivot 0.14.0 and WSU Report Print 1.1.0 — Print Canvas

A second button, Print Canvas, next to each plugin's existing Print PDF.
Print PDF still prints only the one visualization's own table. Print Canvas
prints every print-capable visualization currently on the same canvas — this
plugin and the other one, in any mix and any count — as one document, one
table per visualization, in canvas position order, from whichever button
was clicked.

No OAC API lets one visualization read another's data (`docs/oac_design.md`
§2), so this does not attempt to: `window.__wsuPrintCanvas` is a plain,
same-page JS registry, not an OAC mechanism. Each print-capable instance
registers a `{getContainer, build}` entry on init and removes it on stop;
`build()` reuses the exact fragment-building path Print PDF already used
for that instance alone. A section that fails to build (missing layout,
zero columns, a thrown exception) is skipped, not fatal to the rest of the
canvas. Sections are ordered by DOM position, not registration order.
Orientation and the document title come from whichever instance's button
was clicked — `@page` is document-wide, so two instances with different
Page Orientation settings cannot both have their own orientation in one
combined document.

Not verified on the tenant: whether `iframe.contentWindow.print()` opens a
dialog scoped to the iframe's own document across browsers, Safari
specifically — already open for the single-table print, more consequential
now since a combined document is larger and more likely to span pages.
Full mechanism: `docs/plugins/project_spec_wsu_glossary_pivot.md` §3a.

`node tests/run.js` from `oac-sdk-dev/`: 48 passed (4 new tests for the
pure section-joining function, two per plugin, mirroring the existing
`_expandBodyRowspans` test style). Currency lint clean.

## 2026-09-23 — WSU Glossary Pivot 0.13.0

Print PDF is on the pivot. The button stays on the canvas. The printed
document is this table: hidden columns, display labels, number formats, and
whichever total rows are turned on. Collapsed groups are expanded for the
print. Row labels repeat on every body row, and column headers repeat on
each page. Properties: Print: Show Button (default on), Print: Report Title
(default Report), and Print: Page Orientation (default Landscape).

## 2026-09-23 — WSU Report Print 1.0.0

New visualization, `com-wsu-report-print`. A bar for the top of a canvas.
**Print PDF** opens the browser print dialog on a document that is only the
table bound to this visualization. Column headers repeat on each page. The
bar is not in the document. It cannot read a neighboring pivot; the report
fields are dropped on this visualization too. Print with nothing dropped
on the visualization shows that message on the bar. A report with no row
fields still prints the word Total. The visualization list uses the short
name, so Glossary Pivot and Report Print now show as WSU Glossary Pivot and
WSU Report Print, matching the other extensions. Spec:
`docs/plugins/project_spec_wsu_report_print.md`.

## 2026-09-22 — WSU Glossary Pivot 0.12.0

- **Number** format inserts thousands separators (`1,234`, and `1,234.50`
  when a decimal count is set). Auto is unchanged: it still shows OAC's own
  text. Currency still adds the dollar sign on top of the same grouping.
- Tooltip chips for Live and Workbook override are off until
  **Tooltip: Source Badges** is on. The Bundled fallback chip still shows.
- The dotted underline on headers that have a description is off until
  **Tooltip: Underline Headers** is on. The tooltip, hover, and focus stay.
- **Tooltip: Text Align** is Left (default), Center, or Right. That aligns
  the text inside the tooltip. The bubble stays centered under the header.

## 2026-09-22 — WSU Glossary Pivot 0.11.0

New visualization, `com-wsu-glossary-pivot`. Spec:
`docs/plugins/project_spec_wsu_glossary_pivot.md`. Zip:
`oac-sdk-dev/build/distributions/customviz_com-wsu-glossary-pivot.zip`.

A pivot table with a glossary tooltip on headers. Rows, Columns, and Values.
Description order is workbook override, then live `_info.desc`, then the
bundled column dictionary. Confirmed on oac.wsu.edu the same day: Subject
Area and Dataset text come from `_info.desc`; a Calculated Field's
Description comes from `customColumnDescription`.

Also in 0.11.0, carried forward from 0.5–0.10: row marking, sum totals
(grand total row, grand total column, outer-group subtotals; default off),
per-measure format override, heat map, row-group collapse, click-to-sort.
0.11 adds hidden columns (the field stays in the query), display-header
overrides (the glossary id does not change), and hex colors for the
field-name band and for member column headers.

Exercised on the tenant the same day: the per-measure override
(`CUM_GPA:currency:2`), grand total row, and row subtotals. The right-hand
total column is past the horizontal scrollbar on a wide table. Hide and
display-label text fields were exercised. Number format does not insert
thousands separators; currency does. Auto shows OAC's own formatted text.

Not in this plugin: column-group collapse, multi-column sort, conditional
formatting, and native drill / export / print. Totals remain a sum of the
displayed numbers.

The NLS test now finds a renderer that is not named `wsu*.js`. The unused
`obitech-report/visualization` import was removed so the currency lint
accepts the file. `node tests/run.js`: 36 passed. Host sections 2–7 of the
verification guide are still unrecorded for this plugin.

## 2026-09-13 — tenant probe of oac.wsu.edu

First verification against the production host itself (`oac-sdk-dev/tests/
oac-probe.wsu.json`, section 0 of the verification guide). **No failures.**

- Every module id in the lint allowlist is defined on the tenant; `d3v6js`
  = D3 6.2.0; all 28 inherited host methods present (`getID` per-instance);
  all six host panel ids present, including `AXIS` and `INTERACTION` that
  the plugins now request.
- `d3js` (D3 v3) is **already absent** on the tenant — Oracle's May 2026
  deprecation has taken effect. Any installed extension that still depends
  on it will fail to load. The probe shows `com-company-bulletViz`,
  `com-company-dumbbellviz` and `com-company-motionChartViz` are installed
  on the tenant; their library versions depend on `d3js`.
- `getProjection` is absent on the cloud as well as OAD; `d3v3` / `d3v7js`
  not defined. Tenant build number is not exposed to the page.
- Still needed from the guide: sections 2 (replacement/cache), 3 (governor),
  4 (interaction), 5 (panels as rendered), 7 (clients/locales).

## Unreleased (round 3) — currency claims re-based on Oracle documentation

The 2026-09-13 adversarial review checked the repository's currency claims
against Oracle's published OAC documentation instead of the desktop install.
Verdict: the plugins were current, but the *evidence* for saying so was
desktop-derived and in two places wrong. Fixed:

### Documentation and policy
- **Oracle Analytics Desktop and its bundled SDK are deprecated** (no
  downloads after December 2026; final version 26.01). `oac_design.md` 6.32
  now states this, the archiving/packager fallback, and that compatibility is
  qualified on OAC Dev — with every claim labeled [doc] / [sample] / [OAD].
- **`d3v3` correction.** It is not a cloud-only host alias. Oracle's
  re-published samples map it themselves to a cdnjs URL through the
  `oracle.bi.tech.plugin.requirejsConfig` extension point, which is Oracle's
  documented interim guidance for the D3 v3 deprecation ("planned for
  deprecation in May 2026"). Still forbidden here (D3 v3 + external CDN).
  `requirejsConfig` is documented as the bring-your-own-library route.
- New `docs/guides/oac_dev_verification.md`: the seven tests only a live
  tenant can settle (dependency baseline, replacement/cache behavior, data
  governor limits, interaction contract, panels, ESM/worker/CSP, clients and
  locales).
- README: the "replaces in place, workbooks keep working" statement is now
  qualified as tested behavior for 1.0.0 → 1.1.1 on OAD, not a contract;
  the SDK deprecation is stated under Prerequisites.

### All five plugins (Network 1.2.2, Line 1.2.2, Sankey 1.1.2, Dumbbell 1.1.2, Lattice 1.1.2)
- **Localization:** the `LBL` string tables are loaded from
  `nls/root/messages.js` through `ojL10n!<plugin>/nls/messages` (Oracle's NLS
  guidance requires externalized UI strings), with the English text in code
  as fallback. A test asserts every key exists in the bundle.
- **Container id:** `getSubElementIdFromParent` (undocumented host
  convenience) is feature-detected and try/caught; its absence can no longer
  break render — previously the `|| getID()` fallback was unreachable.
- **Property panels:** custom string panel ids are no longer requested.
  `forcePanelByID` creates an unusable panel for an unknown id rather than
  failing, so the try/catch fallback could not detect that case. Plugins now
  use General plus the host-defined `GD_PANEL_ID_AXIS` /
  `GD_PANEL_ID_INTERACTION` panels where present.
- **Line, Dumbbell:** `_addFilterMenuOption` / `_addRemoveSelectedMenuOption`
  are feature-detected (they were called unconditionally while the lint
  claimed otherwise).

### Lint
- ES5 rule also catches default parameters, spread/rest, destructuring,
  for-of and async/await; `import()` is the sanctioned exception.
- Semi-private calls through `this` aliases (`oViz._x()`) are scanned.
- Host methods absent from the OAD baseline must be guarded within 400
  characters of each call, not anywhere in the file.
- 35 tests + lint pass. All negative-tested.

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

- **Source in this folder:** Network 1.2.2, Line 1.2.2, Sankey 1.1.2,
  Dumbbell 1.1.2, Lattice Scatter 1.1.2 (those five are on `main`). Glossary
  Pivot 0.14.0 and WSU Report Print 1.1.0 (Print Canvas) are in the working
  tree, not yet committed. `origin/main` still has only Glossary Pivot
  0.10.0 (`a15f2bf`); no Report Print at all. Commit `814a660` (on `main`
  locally, not yet pushed) is the checkpoint just before Print Canvas:
  Glossary Pivot 0.13.0, Report Print 1.0.0.
- **Newest tag `v1.1.1`:** Network 1.1.1, Line 1.1.0, Sankey 1.0.1, Dumbbell
  1.0.1, Lattice Scatter 1.0.1. No Glossary Pivot. Behind `main`.
- **Tag `v1.1.0`:** superseded by v1.1.1. Do not deploy it.
- **Production OAC, five 1.x plugins (recorded 2026-09-11):** 1.0.0. No later
  upload of those five has been recorded.
- **WSU Glossary Pivot 0.11.0 (2026-09-22):** uploaded and exercised on
  oac.wsu.edu. Spec: `docs/plugins/project_spec_wsu_glossary_pivot.md`.

## Known gaps

Each item below is tracked as a GitHub issue; the issue carries the file and
line pointers. This list is a summary only.

| Issue | Item |
|---|---|
| [#1](https://github.com/gcrouch-wsu/OAC-Extensions/issues/1) | Host-verify the source on `main` (Network 1.2.2, Line 1.2.2, Sankey 1.1.2, Dumbbell 1.1.2, Lattice 1.1.2) before a production upload. The issue title still names v1.1.1, which is an older tag. |
| [#3](https://github.com/gcrouch-wsu/OAC-Extensions/issues/3) | WSU Line: `@parameter(...)` in a categorical calc for Dynamic Value Label |
| [#4](https://github.com/gcrouch-wsu/OAC-Extensions/issues/4) | WSU Line: native Color / Manage Color Assignments menu |
| [#5](https://github.com/gcrouch-wsu/OAC-Extensions/issues/5) | Apply the Color: Source pattern to the plugins other than WSU Line. The issue text still says four plugins; Glossary Pivot is a sixth and does not have that switcher. |
| [#6](https://github.com/gcrouch-wsu/OAC-Extensions/issues/6) | WSU Dumbbell: aggregate mode + viewer controls persisting to view settings |
| [#7](https://github.com/gcrouch-wsu/OAC-Extensions/issues/7) | Which OAC/OAD versions honor custom property-panel tabs |
| [#8](https://github.com/gcrouch-wsu/OAC-Extensions/issues/8) | Consolidate duplicated helper code |
| — | **Toolchain expiry.** OAD/SDK deprecated (no downloads after Dec 2026). Archive the 26.01 installer; a manifest→`plugin.xml` packager is the fallback if the SDK stops installing. Ask Oracle for the replacement. |
| — | **Verification guide sections 2–7 are still open.** A tenant module probe (2026-09-13) and a Glossary Pivot exercise (2026-09-22, glossary text, format, totals, hide, display labels) are recorded above. They are not a pass of `docs/guides/oac_dev_verification.md` §2–7. |
| — | **Data-model governor behavior unknown.** Manifests cap rows (10k–70k); whether OAC truncates, warns or refuses above the cap is undocumented. The plugins' warning strips report only their own drops. Guide §3. |
| — | **Localization is partial.** `LBL` tables are externalized; gadget labels and inline tooltip fragments are still literals; only the `root` bundle exists. |
| — | **Marking uses undocumented, sample-precedented services** (`setMark`, `MarkingEvent`, `MARK_RELATED`). Brushing is documented as a user feature, not as a plugin API. Guide §4. Data actions are *not* a substitute (they consume marked context; documented event is `INVOKE_DATA_ACTION`). |

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
