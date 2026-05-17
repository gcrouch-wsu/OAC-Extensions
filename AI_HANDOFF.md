# AI Handoff

This repository contains public Oracle Analytics custom visualization
extensions. The primary current collaboration target has recently included WSU
Line v2 validation, with WSU Network still an important plugin area.

## Primary Files

- Network plugin source:
  `oac-sdk-dev/src/customviz/com-wsu-network`
- Network design spec:
  `docs/project_spec_wsu_network.md`
- WSU Line source:
  `oac-sdk-dev/src/customviz/com-wsu-line`
- WSU Line design spec and v2 build notes:
  `docs/project_spec_wsu_line.md`
  `docs/wsu-line-v2.md`
- Cross-plugin review notes:
  `docs/all_plugins.md`
- Math reviewer guide:
  `docs/instructions_math.md`
- Synthetic test data:
  `examples/mock_math_pathway_200_students.csv`

## Ground Rules

- Do not commit real student data or internal institutional exports.
- Preserve OAC grammar compatibility unless the spec is intentionally changed.
- Keep plugin changes scoped; avoid changing other plugins unless requested.
- When changing Network behavior, check repeat self-loops, expanded repeat
  stages, terminal routing, edge labels, tooltips, and large-graph behavior.
- Prefer design-spec updates before implementing major UX changes.

## Current WSU Line Handoff

- WSU Line v2 has been built locally and packaged successfully.
- The current package path is:
  `oac-sdk-dev/build/distributions/customviz_com-wsu-line.zip`
- Local validation has covered JavaScript syntax, manifest JSON parsing,
  whitespace checks, and SDK build.
- The remaining required validation is in OAC Dev: the
  `Dynamic Value Label (from data)` bucket must be tested with the workbook
  `Admissions Status Selector` parameter. Confirm the calculated categorical
  label using `@parameter(...)` can be dropped into the bucket and updates the
  Y-axis fallback title plus tooltip value column as the user switches Applied,
  Admitted, Confirmed, and Enrolled.
- Also verify WSU Line's native Color / Manage Color Assignments path in OAC
  Theme mode. Menu text and behavior are host-controlled.

## Cross-Extension Follow-Up

- Review WSU Dumbbell, WSU Lattice Scatter, WSU Network, and WSU Sankey to see
  whether WSU Line's color controls should be applied there too:
  `Color: Source = OAC Theme / Custom Palette`, empty palette default, and
  native Color / Manage Color Assignments menu hook in OAC Theme mode.
- Do this plugin by plugin. Confirm each data model's `Logical.COLOR` mapping,
  current OAC color-service usage, and color-precedence rules before copying
  WSU Line behavior.
- Preserve special color semantics such as Network incomplete-path highlighting
  or Sankey node/edge role colors if they intentionally override generic series
  assignment.

## Network Design Priorities

- Full unfiltered networks are exploratory, not the recommended first reviewer
  view.
- Scoped views should be easy: local neighborhood, repeat bottlenecks, forward
  progression, and terminal-only.
- Link labels should be off by default in broad views.
- Self-loop repeat rendering should be the default bottleneck mode.
- Expanded repeat stages should remain available as a deliberate view mode.
- Property panel controls should be reordered around reviewer workflow.
