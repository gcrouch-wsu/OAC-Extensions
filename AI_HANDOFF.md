# AI Handoff

This repository contains public Oracle Analytics custom visualization
extensions. The primary current collaboration target is the WSU Network plugin.

## Primary Files

- Network plugin source:
  `oac-sdk-dev/src/customviz/com-wsu-network`
- Network design spec:
  `docs/project_spec_wsu_network.md`
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

## Network Design Priorities

- Full unfiltered networks are exploratory, not the recommended first reviewer
  view.
- Scoped views should be easy: local neighborhood, repeat bottlenecks, forward
  progression, and terminal-only.
- Link labels should be off by default in broad views.
- Self-loop repeat rendering should be the default bottleneck mode.
- Expanded repeat stages should remain available as a deliberate view mode.
- Property panel controls should be reordered around reviewer workflow.
