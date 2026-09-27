# AI Handoff

Read this first if you are an AI coding agent (or a human in a hurry) picking
up this repository.

## What this is

Six Oracle Analytics custom visualization plugins, each a folder under
`oac-sdk-dev/src/customviz/`, packaged one-zip-per-plugin by the Oracle SDK via
`oac-sdk-dev/build-sdk.ps1`. Versions in this folder (`<Viz>.VERSION`):

| Plugin | Version | Where that version is |
|---|---|---|
| WSU Network | 1.2.2 | `main` |
| WSU Line | 1.2.2 | `main` |
| WSU Sankey | 1.1.2 | `main` |
| WSU Dumbbell | 1.1.2 | `main` |
| WSU Lattice Scatter | 1.1.2 | `main` |
| WSU Glossary Pivot | 0.16.2 | working tree, uncommitted; `origin/main` is 0.10.0 (`a15f2bf`) |

Glossary Pivot versions on its own line. Spec:
`docs/plugins/project_spec_wsu_glossary_pivot.md`. The newest git tag is
`v1.1.1`, which is behind this table and has no Glossary Pivot. `README.md`
explains the build/install cycle. A source edit is not in
`build/distributions/customviz_<root id>.zip` until `.\build-sdk.ps1` runs.

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

What has been recorded on https://oac.wsu.edu:

- 2026-09-13: section 0 of the verification guide (module ids, D3 6.2.0, host
  methods, panel ids). No failures. Sections 2–7 were not run.
- 2026-09-11: the five 1.x plugins were installed at 1.0.0. No later install
  of those five is recorded.
- 2026-09-22: Glossary Pivot 0.11.0 was uploaded. Glossary text, the
  per-measure format override, grand total row, row subtotals, hide, and
  display labels were exercised. Sections 2–7 were not run for it either.

What has been recorded on the **dev** tenant
(`wsuaacdevoac-wsucloud.analytics.ocp.oraclecloud.com`, a separate host
from oac.wsu.edu):

- 2026-09-23: Print Canvas's cross-canvas-tab occlusion fix and font-size
  fit fix were verified against the live DOM (see
  `docs/plugins/project_spec_wsu_glossary_pivot.md` §1, §3a). The tenant
  was last confirmed running Glossary Pivot 0.14.14; the fixes ship in the
  0.14.15 build in the working tree and have not yet been re-verified end
  to end after re-upload.
- 2026-09-24: Chrome inspection of the signed-in dev workbook confirmed
  selected tab IDs map to canvas panel IDs under the same manager. That
  structural evidence informed the 0.15.0 selector. 0.15.0 was uploaded and
  confirmed live (fetched from the tenant and version-checked). Live
  testing then found the selector recognized only the read-mode host
  (`insightComponentManager`) and failed closed — "No tables on this
  canvas could be printed" — for the entire time a property panel is open,
  and for Preview/Run, both of which use a different host
  (`canvasComponentManager`) with a different selected-tab id shape.
  Reproduced deterministically live and fixed in 0.15.1 using
  `data-bi-item-id`, which is stable across both hosts; see
  `CHANGELOG.md`'s 0.15.1 entry and
  `docs/plugins/project_spec_wsu_glossary_pivot.md` §3a. 0.15.1 has not
  been uploaded. Also investigated live: the "table wider than the page at
  6pt" warning on the wide Headcount table is not a measurement bug (it
  really is ~47% over the page's content width at the 6pt floor); whether
  Chrome's print dialog auto-scales to avoid visible clipping is still
  pending a live PDF check; regardless of that answer, the overflow
  message was rewritten in 0.15.1 to a neutral-styled readability
  advisory ("Printed. One table is still wide...") rather than wording
  that claimed a failure, since the plugin never actually clips the table
  itself. Browser print output (including Safari) is still pending. See
  `todays_build.md` for the detailed implementation and test handoff.
- 2026-09-24: `FALLBACK_DESCRIPTIONS` (the hardcoded 16-column glossary
  dictionary) removed in v0.16.0 at the data team's request — see
  `CHANGELOG.md`'s v0.16.0 entry, `SECURITY.md`, and
  `docs/plugins/project_spec_wsu_glossary_pivot.md` §3. Not yet uploaded.
- 2026-09-25: reported live — a calculated measure (Full-Time, Part-Time,
  ...) on the "Test census student profile" workbook showed no per-measure
  format even with a valid override typed for it. 0.16.1 shipped a fix
  based on a probe that looked like it proved the raw id was null; it was
  uploaded and confirmed live (version-checked from the served file) the
  same day, and confirmed live to NOT fix the reported bug. Re-diagnosed
  with stack-trace-precise instrumentation against the same live workbook
  and found the real mechanism: the raw id is real, just an opaque code
  ("c34") never shown in the UI. Fixed correctly in 0.16.2 (a name-based
  fallback in `resolveFormat`), verified against the live workbook's exact
  override string and ids before writing the code. See `CHANGELOG.md`'s
  0.16.2 entry, which corrects 0.16.1's diagnosis in place rather than
  silently rewriting it. 0.16.2 not yet uploaded.

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

## Glossary Pivot reviewer priorities

When touching WSU Glossary Pivot, read the spec first. In particular:

- Do not change `viz:chart.type` or the root id `com-wsu-glossary-pivot`.
- The renderer file is `glossaryPivotViz.js`. The NLS test picks the top-level
  JS file that is not the datamodel handler. A `wsu*.js` filter misses it.
- Glossary lookup uses the real column id and the original display name. A
  display-label override changes the painted title only.
- Two description sources only: OAC's live column-info map and a workbook
  override (override outranks live). `FALLBACK_DESCRIPTIONS`, a third,
  hardcoded-dictionary tier, was removed in v0.16.0 as unmaintainable — do
  not reintroduce a bundled/hardcoded glossary dictionary without asking;
  see `SECURITY.md` and `CHANGELOG.md`'s v0.16.0 entry.
- Totals sum the numbers on screen. They do not re-run the measure's
  aggregation. Default off.
- A calculated measure gets a real but **opaque, UI-invisible id** from
  OAC ("c34", never the printed header text) — confirmed live with
  stack-trace-precise instrumentation, correcting a same-day earlier
  diagnosis (v0.16.1) that wrongly believed the id came back null.
  `resolveFormat` tries a real id match first, then falls back to matching
  by the measure's display name — that name-fallback is what actually
  fixes a per-measure format override for a calculated measure; do not
  remove it. Grand Total Column, the heat map, and Header: Hidden Columns
  were checked against this corrected understanding and were NOT found to
  be broken by it (each opaque id is already distinct, and hide/rename
  already matches by name via `nameKeys`). See `CHANGELOG.md`'s v0.16.2
  entry — read it before v0.16.1's, which it corrects — before touching
  `resolveFormat` or `computeMeasureIdByCol` again.
- Sort and row-group collapse are session-only. Both keep the original
  DataLayout row index for marking and for the collapse key.
- The Columns logical edge is probed (`COLUMN`, `COL`, `COLUMNS`) in the
  datamodel handler. Do not hardcode a replacement without a tenant log.
- ES5 in the AMD files. `obitech-report/visualization` is a forbidden
  dependency; use `datavisualization`.
