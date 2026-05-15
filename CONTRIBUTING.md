# Contributing

## Development Focus

The current primary development target is:

```text
oac-sdk-dev/src/customviz/com-wsu-network
```

Use `docs/project_spec_wsu_network.md` as the source of truth for design
intent. Use `docs/instructions_math.md` and
`examples/mock_math_pathway_200_students.csv` for review workflows and test
setup.

## Pull Request Expectations

- Keep changes scoped to the plugin or documentation being modified.
- Do not commit real institutional data.
- Include a short description of the OAC grammar tested.
- Note whether the plugin was built with `.\build-sdk.ps1`.
- For Network changes, describe the effect on self-loops, terminal routing,
  labels, and large-graph behavior when relevant.

## Suggested Branch Names

```text
network-property-panel-vnext
network-repeat-stage-fixes
sankey-stage-validation
docs-review-guide
```

## Agent Collaboration Notes

If using an AI coding agent, point it to `AI_HANDOFF.md` first, then to the
plugin-specific spec in `docs/`.
