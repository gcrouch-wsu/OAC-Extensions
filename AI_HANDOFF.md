# AI Handoff

Read this first if you are an AI coding agent (or a human in a hurry) picking
up this repository.

## What this is

Five Oracle Analytics custom visualization plugins, each a folder under
`oac-sdk-dev/src/customviz/`, packaged one-zip-per-plugin by the Oracle SDK via
`oac-sdk-dev/build-sdk.ps1`. `README.md` explains the build/install cycle.

## Where things are

| Need | File |
|---|---|
| How OAC plugins work; host constraints; shared patterns | `docs/oac_design.md` |
| One plugin's buckets, config keys, defaults, panel | `docs/plugins/project_spec_wsu_<plugin>.md` |
| What changed, what is unverified | `CHANGELOG.md` (incl. "Known gaps") |
| Synthetic test data + how to review the Network plugin | `examples/`, `docs/guides/instructions_math.md` |
| Past reasoning (not current guidance) | `docs/history/` |
| Unbuilt plugin design | `docs/proposals/` |

## Ground rules

- Never commit real student data or internal institutional exports
  (`SECURITY.md`). Only synthetic data belongs in `examples/`.
- Keep changes scoped to one plugin unless the task says otherwise.
- The spec in `docs/plugins/` is the contract. If you change behavior, change
  the spec in the same commit; if you change a default, note it in
  `CHANGELOG.md` because saved workbooks may be affected.
- Do not rename grammar buckets in a datamodel-handler manifest without a
  migration note — existing workbooks bind fields by bucket name.
- Bump `<Viz>.VERSION` (and the spec's version line) when you change behavior.
- Prefer OAC framework services (logger, color service, marking) over
  hand-rolled equivalents; see `docs/oac_design.md` §6.23.
- Before claiming a change works: `node --check` both JS files, parse both
  manifests, run `node tests/run.js` from `oac-sdk-dev/` (add a test for the
  defect you fixed), then `./build-sdk.ps1`. Host behavior can only be
  confirmed in OAD/OAC; say so if you could not.

## Production host is Oracle Analytics Cloud

OAD is a convenience baseline, deprecated by Oracle (no downloads after
December 2026). Nothing verified on OAD is verified on OAC; see
`docs/guides/oac_dev_verification.md` and `docs/oac_design.md` 6.32 for the
evidence labels ([doc] / [sample] / [OAD]) every compatibility claim must carry.

## Host facts verified against Oracle Analytics Desktop 26.01 (2026-09) — [OAD]

- `helper.getLogicalEdgeName(...)` returns the edge key from the datamodel
  handler manifest. `Logical.CATEGORY` is the string `"detail"`.
- vis-network 10 renders string `title` values with `innerText`; pass a DOM
  element for formatted tooltips.
- `_doInitializeComponent` / `_doStopComponent` are the DataVisualization
  lifecycle hooks; both must call `superClass`.

## Network-specific reviewer priorities

When touching WSU Network, check: repeat self-loops, expanded repeat stages,
terminal routing to the missing-destination node, edge labels (off by default
on broad views), tooltips (now DOM-built), and large-graph stabilization.
