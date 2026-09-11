# Contributing

Thanks for looking. This repo is small and the maintainers are part-time, so
the bar is: keep changes scoped, say what you tested, and keep real data out.

## Before you start

- Read `README.md` (build/install cycle) and `docs/oac_design.md` (how OAC
  plugins work and the constraints the host imposes).
- Each plugin has a spec in `docs/plugins/`. That spec is the contract; a
  behavior change and its spec change belong in the same PR.
- Check `CHANGELOG.md` → "Known gaps" for open items that need someone with
  OAC access.

## Pull requests

- One plugin per PR unless the change is genuinely cross-cutting.
- In the description, say:
  - which OAC grammar you tested with (buckets and field types),
  - whether `.\build-sdk.ps1` produced the zip,
  - whether you verified in OAD, OAC, or neither.
- Bump `<Viz>.VERSION` and the spec's version line for behavior changes; add
  a `CHANGELOG.md` entry. Call out changed defaults explicitly — saved
  workbooks keep old values, new ones get the new default.
- Do not rename grammar buckets in a datamodel-handler manifest; existing
  workbooks bind by bucket name.
- Run `node --check` on both JS files and parse both manifests before pushing.

## Data

Only synthetic data may be committed (`examples/`). Never commit student-level
data, production OAC/SDW exports, data dictionaries not cleared for
publication, credentials, or internal server names. See `SECURITY.md`.

## Adding a new plugin

Fork the closest existing plugin by geometry (line-like, comparison, network,
flow, grid), then follow the rename checklist in `docs/oac_design.md` §6.2
*before* changing behavior — a missed identifier makes a plugin upload but
never appear. Add a `docs/plugins/project_spec_wsu_<name>.md` using the
existing specs as a template.

## Branch names

```text
network-<topic>
sankey-<topic>
line-<topic>
dumbbell-<topic>
lattice-<topic>
docs-<topic>
```

## Using an AI coding agent

Point it at `AI_HANDOFF.md` first, then the relevant spec.
