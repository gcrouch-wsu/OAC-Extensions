# Changelog

Each plugin carries its own version in `<Viz>.VERSION` and in its spec under
`docs/plugins/`. Those constants are the versions in this folder and are the
source of truth — check them directly (`grep VERSION` in the plugin's own
`.js` file) rather than trusting a number restated in prose here, including
this one. As of commit `0e043f3` (2026-09-27), `main` and `origin/main` agree:
Network 1.2.2, Line 1.2.2, Sankey 1.1.2, Dumbbell 1.1.2, Lattice Scatter
1.1.2, Glossary Pivot 0.16.2. WSU Report Print has been removed; Glossary
Pivot prints its own table and the canvas.

This file's own history below predates that sync — entries before 2026-09-27
were written while local `main` was ahead of `origin/main` by design (see
those entries' own dates and commit references for what was true then). Don't
extend that same gap forward: check `git log -1 origin/main` before trusting
any "local vs. public" claim in this changelog as still current.

The newest git tag is `v1.1.1`. It does not contain the 1.2.x / 1.1.2 work
or Glossary Pivot. Headings below that say "Unreleased" mean "no git tag".
The 1.x commits they describe are on `main`.

Glossary Pivot versions on its own line, not on the 1.x tags.

## 2026-09-29 — WSU Glossary Pivot 0.17.0 — data-team fix list: rate totals, alignment, wrapping and widths

From the data team's fix list, checked against their IPEDS 2026 Spring
screenshot (Glossary Pivot vs. the native pivot on the same canvas).

- **Totals: Measure Rules** (`totalRules`, text). The total line summed
  every measure, so a rate's total was wrong (% Full-Time 89.14 + 63.57 +
  90.34 = 243.05; native 86.29). Each measure can name its rule:
  `sum` (default, unchanged), `avg`, `min`, `max`, `none`, `weighted(W)`,
  or `ratio(N, D[, scale])`. `weighted(Headcount)` = sum(value × Headcount)
  / sum(Headcount), which is sum(numerator) / sum(denominator) when
  Headcount is the rate's denominator, and keeps the column's own scale.
  Reproduces the native totals: % Full-Time 86.29, % Female 54.37. The
  rule applies to the grand total row, subtotals, collapsed groups, and the
  grand total column. Referenced measures must be in the query and may be
  hidden. A rule naming a measure not on the pivot leaves that total blank
  and logs a warning — never a wrong sum. The plugin still cannot request a
  server-side total from OAC.
  - Note for report authors: the native pivot's own totals for % International,
    % Minority, % First Generation and Age in that screenshot are plain
    averages of the three rows (0.10 = mean of 0.02, 0.26, 0.02), not
    sum(numerator) / sum(denominator) (1,174 / 23,460 = 5.0%).
- **Totals under Auto format** copy the look of the measure's own
  OAC-formatted cells ($, %, ×100, decimals, grouping) instead of the raw
  float (`0.30000000000000004`, `1234567.891`). Number format with Auto
  decimals also trims float noise.
- **Layout: alignment** — horizontal (left/center/right) and vertical
  (top/middle/bottom) for row headers, column headers, and values. Print
  follows the same settings.
- **Layout: wrapping and widths** — Wrap Header Text and Wrap Row and Value
  Text (off by default; on-screen text was `nowrap` because an earlier print
  change split words); Value Column Width (px); Column Widths
  (`name: px; ...`, measures or row fields); Table Width (fill tile /
  fit content / fixed px). Wrapping happens at spaces only: no
  `overflow-wrap`/`word-break` permission, automatic table layout (a column
  is never narrower than its longest word), and hyphenated or slashed words
  (`Full-Time`) plus a leading `%`/`#`/`$` are kept whole — a headless
  Chrome layout check caught Chrome breaking `Full-Time` at the hyphen and
  leaving `%` alone on a line before this was added.
- **Print never breaks a word** — `overflow-wrap: break-word` removed from
  the print stylesheet. A table still too wide at the 6pt floor runs past
  the margin with the existing advisory instead of splitting words.
- **Format: Per-Measure Override** accepts any letter case and aliases
  (`percentage`, `pct`, `usd`, `dollars`, `numeric`), parses from the right
  so a measure name may contain a colon, matches a qualified id by its last
  segment (same as hide and rename), and logs rejected entries instead of
  dropping them silently.
- The tooltip heading shows a header's Display Label rename rather than the
  original column name.
- Totals and heat-map ranges read from the row buffer already built for the
  body instead of calling `getValue` again for every total.

New Config keys (all default to the previous behavior, so saved workbooks
render unchanged): `totalRules`, `rowHeaderAlign`, `rowHeaderVAlign`,
`colHeaderAlign`, `colHeaderVAlign`, `valueAlign`, `valueVAlign`,
`wrapHeaders`, `wrapCells`, `columnWidth`, `columnWidths`, `tableWidth`,
`tableWidthPx`. Root id and `viz:chart.type` unchanged.

Verification: `node --check`, `node tests/run.js` (83 passed; 12 new,
including the screenshot's own numbers), `node tests/lint.js` clean.
Wrapping checked in headless Chrome against the screenshot's header text
at 40px and 90px widths: no word split.

Installed on the WSU dev tenant 2026-09-29 and checked live on the data
team's "Test census student profile" workbook: loaded module confirmed
0.17.0; with no new settings the table rendered as before; with the
measure rules set, totals read % Full-Time 86.29, % Female 54.4, % WA
Residency 81.2 (native 86.29 / 54.37 / 81.24), % International 5.0%,
% Minority 37.8%, % First Generation 32.2%, Age 23.6 (headcount-weighted;
native shows the row average 27.28 — pending the data team's choice).
Header wrap + 70px value width + Fit content fit the whole table on the
canvas with no word split (live Range check). Settings saved to that
workbook and confirmed after reopening. Print PDF with the new layout
settings was not exercised.

## 2026-09-25 — WSU Glossary Pivot 0.16.2 — corrects 0.16.1: the real cause was an opaque id, not a null one

0.16.1 (below) was deployed and tested live the same day. It did not fix
the reported bug. Testing it against the actual tenant, with more precise
instrumentation than 0.16.1's own diagnosis used, found the real
mechanism — different from what 0.16.1 believed.

**What 0.16.1 got wrong:** its evidence was a `String.prototype.toUpperCase`
probe that found no `FULL`/`PART`/`FTE`-style string ever reached the
format-override lookup, taken as proof the calculated measures' raw id
was `null`. That probe never actually inspected the id's value — only
whether it matched a search pattern. It was consistent with a null id,
but equally consistent with a *real, non-null* id that just didn't look
like "Full-Time" — which turned out to be the truth.

**What's actually happening**, confirmed by re-running the same live
workbook with a stack-trace-precise probe (recording which line of code
called `.toUpperCase()`, not just what string, and cross-referencing
column order against the rendered header labels): `resolveFormat`
(`glossaryPivotViz.js:663`) received real, non-null measure ids for every
column — `"Headcount"` for the native measure, and `"c34"`, `"c35"`,
`"c36"`, `"c32"`, `"c27"`, `"c28"`, `"c29"` for Full-Time, Part-Time, %
Full-Time, Headcount Converted FTE, Male, Female, and % Female
respectively. OAC assigns a calculated measure an opaque, auto-generated
code as its raw id — never shown anywhere in the UI — instead of a
human-readable one. `computeMeasureIdByCol`'s null-to-"__single__"
collapsing (0.16.1's fix target) was never the active mechanism for this
workbook: the ids were never null, so they were never collapsed into a
shared bucket in the first place. Verified directly: parsed the workbook's
real override string with the shipped `_parseMeasureFormatOverrides` and
checked `overrides["C34"]` (the opaque id, uppercased) — no match — versus
`overrides["FULL-TIME"]` (the display name, uppercased) — matches, with
the exact `{numberFormat:"number", decimalPlaces:"0"}` the workbook author
had typed.

**This also means 0.16.1's claims about Grand Total Column and the heat
map were not confirmed bugs on this workbook** — `bucketColsByMeasure`
and `computeMeasureRanges` key off `measureIdByCol` directly, and since
each calculated measure already had its own distinct (if opaque) id, each
already got its own bucket/range. Likewise, Header: Hidden Columns for a
measure was never actually broken: `columnListed` (called at
`glossaryPivotViz.js` for `colHidden`) already tries both id and display
name via `nameKeys`, so a real, non-null opaque id never blocked a
name-based match — 0.16.1's claim that hiding a calculated measure "had
no effect" does not hold up under this corrected understanding; it was
not independently re-tested live, and should not be trusted. Both
docs/plugins/project_spec_wsu_glossary_pivot.md and this file's own
0.16.1 entry below are corrected in place rather than silently rewritten,
so the record of what was believed and when stays honest.

**The actual fix:** `resolveFormat` (`glossaryPivotViz.js`) now falls back
to matching the override dictionary by the measure's *display name* when
the id lookup misses — a real id match still wins first, matching a
native measure's existing documented behavior. Verified against the live
workbook's exact override string and opaque ids before writing the code
change, not after. The defensive null-to-name fallback 0.16.1 added to
`computeMeasureIdByCol` is kept (harmless, and not disproven to be
impossible for some other pivot shape) but its comment is corrected to
stop claiming it was confirmed live — it wasn't.

`node --check` clean. `node tests/run.js` from `oac-sdk-dev/`: 71 passed
(3 new — the name fallback resolving an opaque id, a real id still
winning over the name fallback, and the global Config still applying
when neither matches). Verified the new test genuinely catches the
regression: temporarily disabled the name-fallback line, confirmed the
test fails, restored it. Verified live end to end after deploying 0.16.1
(which is how this correction was found) — 0.16.2 has not yet been
deployed as of this entry; re-upload and hard-reload before re-testing.

## 2026-09-25 — WSU Glossary Pivot 0.16.1 — calculated measures lost per-measure formatting, totals, hiding, and heat-map ranges

**Correction (0.16.2, same day):** this entry's diagnosis was wrong in a
load-bearing way — see the 0.16.2 entry above before relying on anything
below. The `computeMeasureIdByCol` fix described here is kept (harmless),
but it was not what fixed the reported bug, and the Grand Total
Column / heat map / Hidden Columns claims below were not confirmed bugs.

Reported live (dev tenant, "Test census student profile" workbook):
Full-Time, Part-Time, % Full-Time, and Headcount Converted FTE — all
calculated fields — showed completely raw, unformatted values (no
thousands separator, no `%`, full float precision) while the native
Headcount measure on the same pivot formatted correctly. A per-measure
override was already configured for all four in the workbook's Format:
Per-Measure Override field, syntactically valid for three of them, and
still had no effect.

**Root cause, confirmed by instrumenting the actual running code against
the live workbook (not inferred):** `computeMeasureIdByCol()`
(`glossaryPivotViz.js`) determines each measure column's id via
`dl.getValue(PHYS_COLUMN, mLayer, c, true)` — the raw/id form of the
measure-labels layer. For Headcount this resolves; for every calculated
measure tested, it came back `null`. The old code folded that `null` into
the exact same `"__single__"` sentinel used for the unrelated case of "no
measure-labels layer exists at all" (a true single-measure pivot),
silently merging every calculated measure on the pivot into one shared
bucket. Captured live with a temporary `String.prototype.toUpperCase`
probe around the per-measure lookup: across a full render, `"Headcount"`
was the *only* string ever reaching the override dictionary — every
calculated measure's lookup was short-circuited to the global default
before the override text was ever consulted, regardless of what was typed
for it.

That shared bucket corrupted three other features keyed off the same
array, none of them limited to the reported workbook:
- **Grand Total Column** (`showGrandTotalColumn`) sums "one total per
  measure" via the same buckets — with this bug, turning it on would sum
  *unrelated* calculated measures together into one meaningless total
  (a headcount plus a percentage plus an FTE figure, added). Confirmed by
  reading `bucketColsByMeasure`/`sumBlock`; not yet visibly triggered on
  the reported workbook because that switch is currently off there.
- **Cell Color heat map** (`cellColor`) computes min/max "per measure" the
  same way — every calculated measure would share one min/max range,
  directly contradicting the code's own comment two lines above
  (*"computed PER MEASURE (never across different measures)"*). Also
  currently off on the reported workbook, so also not yet visible there.
- **Header: Hidden Columns** for a measure explicitly refused to check the
  `"__single__"` sentinel against the hidden list at all (`colHidden[hc] =
  hMid !== "__single__" && ...`) — a calculated measure could never be
  hidden by typing its name, silently ignored rather than erroring.

Also found and separately worth fixing in the workbook itself, not in
code: one of the four override entries was `% Full-Time:percentage:2` —
"percentage" isn't one of this plugin's four valid format keywords
(`auto`/`number`/`percent`/`currency`/`compact`, confirmed via
`_parseMeasureFormatOverrides`), so that segment was silently dropped on
its own terms, independent of the id bug. Needs correcting to `percent`
in the workbook's own property value; not something this fix touches.

**Fixed** by having `computeMeasureIdByCol` fall back to the measure's own
display name (already captured correctly via `getValue(..., false)`,
unaffected by the raw-id issue) instead of the `"__single__"` sentinel
when the raw id is null. Every calculated measure now keeps its own
bucket, the same outcome a native measure already got — restoring
per-measure format overrides, Grand Total Column correctness, heat-map
ranges, and Hidden Columns all at once, since all four read this one
array. The genuine single-measure-pivot case (no measure-labels layer at
all) is unaffected — that path never reaches the changed line. Full
detail: `docs/plugins/project_spec_wsu_glossary_pivot.md` §4 (Format,
Totals, Style, and Header sections each note this).

`node --check` clean. `node tests/run.js` from `oac-sdk-dev/`: 68 passed
(2 new — a calculated measure keeps its own bucket instead of merging
into `"__single__"`, and the genuine no-measure-layer case still uses the
sentinel correctly). Verified the new test actually catches the
regression: temporarily reverted the fix, confirmed the test fails,
restored it. Local build only; not yet uploaded to the dev tenant.

## 2026-09-24 — WSU Glossary Pivot 0.16.0 — bundled glossary dictionary removed

At the data team's request: `FALLBACK_DESCRIPTIONS`, a ~30-line hardcoded
dictionary of 16 Student Data Warehouse column descriptions (`STRM`,
`CUM_GPA`, `ACAD_PROG`, and 13 others, sourced from the WSU Reporting
knowledge base and captured 2026-09-22) is deleted. It was the
lowest-priority of three glossary sources, used only when a column had
neither a workbook override nor OAC's own live catalog text, badged
"Bundled fallback" in the tooltip.

**Why:** a copy of glossary text hand-maintained inside the renderer's own
source, disconnected from the real data dictionary it was captured from,
is not maintainable — nothing forces it to be re-checked as the source
dictionary changes, and the badge was the only signal to a viewer that
the text might already be stale.

**Behavior change:** a column that only ever had bundled text (any of the
16 above, on a workbook where the live map and no override supplied
anything for it) now shows no tooltip at all — no badge, no dotted
underline — identical to a column that was never in the dictionary.
Everything else about the glossary is unchanged: workbook override still
outranks live catalog text, and both are still read from OAC's
column-info map exactly as before.

**Also removed as dead weight**: the `GLOSSARYPIVOT_LBL_SRC_BUNDLED`
("Bundled fallback") NLS string and its badge-selection branch;
`ORIGIN_RANK`'s `bundled` tier (now `{ live: 0, override: 1 }`);
`buildGlossary()`'s dictionary-seeding parameter (now called with none).
`SECURITY.md`'s reviewed exception for this specific dictionary is
removed with it — no such data remains in the repository. Full detail:
`docs/plugins/project_spec_wsu_glossary_pivot.md` §3.

`node --check` clean. `node tests/run.js` from `oac-sdk-dev/`: 65 passed
(the "falls back to bundled" test now asserts no tooltip instead; two new
tests cover the 2-tier override-beats-live ranking and the no-match case).
Local build only; not yet uploaded to the dev tenant.

**Independent review (Codex)** on this removal found no implementation
defect, but flagged a real gap: those tests exercised only the pure
glossary-resolution functions, not the actual rendered `<th>` markup — a
future change could leave `gp-has-desc` (and the tooltip hover/focus hooks
it wires) on a no-match header while all three still passed. Added a
fourth test that renders a real table through `_buildTable` and checks
the header HTML directly for a matched and an unmatched row layer.
Verified the test is not a tautology: temporarily forced `gp-has-desc` to
always render, confirmed the new test fails, then reverted. 66 passed.

## 2026-09-24 — WSU Glossary Pivot 0.15.1 — Print Canvas fails closed while editing

Reported against the live 0.15.0 build on the dev tenant: clicking Print
Canvas while a property panel was open, or right after Preview/Run,
showed "No tables on this canvas could be printed" — reproducible every
time, not intermittent. A plain page reload did not clear it (it revisits
the same URL, so an editor-mode URL stays in editor mode); only leaving
the report and reopening it did.

**Root cause, confirmed live on the tenant**: OAC hosts the canvas tabs in
two different widgets depending on context. The read/view host
(`insightComponentManager_N`) ids its selected tab
`<mgr>-tabitem-snapshot!<suffix>` — the only form `selectedCanvasPanel`
recognized. The in-editor host (`canvasComponentManager_N`, live for the
whole time a property panel is open, and for Preview/Run entered from the
editor) ids the same tab `<mgr>-tabitem-<suffix>`, with no `snapshot!`
infix. Every Print Canvas click taken in that second, very common state
saw zero selected tabs and failed closed, even though the clicked panel
was genuinely the one on screen.

**Fixed** by reading the selected tab's `data-bi-item-id` attribute
instead of reconstructing its DOM id: confirmed live, that attribute is
`<suffix>` on the editor host and `snapshot!<suffix>` on the read host —
stable across both. Falls back to the original id template if a host
ever omits the attribute, so an unrecognized host still fails closed
rather than failing open. Verified live in all three states the report
described (property panel open, Preview/Run, and a stale reload) and
confirmed the fail-closed behavior for a genuinely inactive tab is
unchanged. `docs/plugins/project_spec_wsu_glossary_pivot.md` §3a.

Also investigated, not a code defect: the "table is wider than the page
at the 6pt minimum" warning on the wide Subject Area canvas's Headcount
table. Pulled that table's real HTML and ran `_fitPrintedReport` against
it directly (no print triggered): it measures 1480px wide at the 6pt
floor against a 1008px landscape/narrow-margin target — genuinely 47%
over, not a measurement bug. Whether Chrome's print dialog additionally
auto-scales the page to avoid visible clipping was not confirmed either
way (triggering a real print dialog to inspect the output isn't safe to
do under browser automation). Since the plugin never clips the table
itself — no `table-layout: fixed`, no forced shrink past 6pt, printing
always proceeds — the message was rewritten to be accurate regardless of
that unresolved question: it now says the table printed and remains wide
at the readability floor, not that anything needs to be "adjusted" as if
printing failed. The `.gp-printerr` element also gets a new `gp-printnote`
class (neutral gray, `glossaryPivotVizstyles.css`) instead of its default
red for this and the mixed-orientation case, so only a genuine failure
(no tables, print blocked) reads as an error.

`node --check` clean. `node tests/run.js` from `oac-sdk-dev/`: 63 passed
(3 new — the in-editor id shape, the read-mode id shape via
`data-bi-item-id`, and a mismatched-id fail-closed case). Local build only;
not yet uploaded to the dev tenant.

## 2026-09-24 — WSU Glossary Pivot 0.15.0 — print reliability and accessibility

- Print Canvas now selects instances from the clicked pivot's selected OAC
  canvas panel. It includes off-screen active tables, rejects inactive,
  hidden, detached, and unreadable entries, and orders them by their canvas
  position. The selector was checked against the dev tenant's tab and panel
  IDs, but this build has not yet been uploaded for an end-to-end print check.
- Each section carries its own Table Width choice. The clicked pivot still
  controls the document-wide orientation, margin, and page spacing; mixed
  orientations produce a nonblocking warning. Print Canvas includes Glossary
  Pivot instances only, not other WSU plugins or native OAC visualizations.
- Print fitting uses automatic table layout and measures again after reducing
  text from 9pt toward a strict 6pt floor. If the table remains too wide,
  printing proceeds at 6pt and warns the report designer; it is not squeezed
  further. No print CSS zoom, transform, filter, or opacity is used.
- Iframe cleanup is idempotent and tied to `afterprint`, component stop, or
  an exception. Rapid repeat clicks do not remove an in-progress preview;
  a 30-second recovery gate handles engines that omit `afterprint`.
- Empty renders invalidate old print data. Full renders rebuild live glossary
  descriptions from the current metadata snapshot. Late marking callbacks
  cannot overwrite a newer layout. Per-measure formats reject invalid
  precision; debug metadata logs no longer dump the rendering context.
- Sort headers, collapse buttons, tooltips, and row marking received keyboard
  and accessibility semantics. Command-click extends marks on Mac. Hiding
  every row field no longer leaves an unexpandable collapsed group. Custom
  color text uses contrast-based black or white.
- Local verification: syntax and ES5 lint pass; 60 Node tests pass. Safari,
  Firefox, and PDF output on the newly built plugin remain to be checked.

## 2026-09-23 — WSU Glossary Pivot 0.14.9–0.14.15 — Print Canvas fixes and a page-break property

Testing against the WSU dev tenant surfaced five real defects in the
0.14.8 print work above, fixed across this run rather than one version
each:

- **Print surface is a hidden `<iframe>` only.** `window.open()` was tried
  twice (once with a features string, once without) to open the printed
  document in its own window per user feedback; both put a visible browser
  surface — a chromeless popup, then a real tab — on screen that the
  reviewer had not asked for. Reverted: the only thing the viewer ever
  sees is the native print dialog. The iframe's height is set to the
  greater of one page's height or the document's measured `scrollHeight`,
  so a multi-page Print Canvas document is not clipped to page one.
- **New property, Print: Canvas Page Breaks** (`printCanvasSpacing`:
  `perReport` default / `compact`). Print Canvas originally forced a page
  break before every table; for a canvas with several short reports that
  produced mostly blank pages. `compact` concatenates every table with no
  break instead. Default was briefly `compact`, flagged as a judgment
  call, then corrected to `perReport` on review.
- **Fixed: a page break on a wrapping `<div>` produced blank pages and
  split a header from its own table** in Chrome's print layout. The break
  is now set directly on each `<table>` element's own `style` attribute;
  the wrapper div is gone.
- **Fixed: Print Canvas on one canvas tab could include a table from a
  different, inactive canvas tab** ("Canvas 1 bleeds in" from Canvas 2).
  Root cause, confirmed on the tenant: OAC stacks an inactive canvas tab's
  panel at the *same coordinates* as the active one rather than hiding or
  moving it, so neither `getClientRects()` nor a viewport-intersecting
  `getBoundingClientRect()` can tell them apart — both report identical,
  valid, in-viewport geometry. Fixed with `isOnActiveCanvas`, which uses
  `document.elementFromPoint` at a point inside the container and checks
  whether the painted element there is the container (or its descendant);
  an inactive panel's containers resolve to a different element.
- **Fixed: a canvas-tab instance sometimes never registered for Print
  Canvas at all**, with no error logged. `_doInitializeComponent` does not
  reliably fire for every instance on the tenant; registration now also
  runs, idempotently, at the top of `_doRender`, which does.
- **Fixed: `isOnActiveCanvas` itself excluded a genuinely active report**
  that was taller than the remaining viewport ("Canvas 1 is missing a
  report"). The test point was the element's own center, clamped to
  `vh - 1` when the element ran past the fold; for a report starting at
  `top=799` with `height=247` against a measured `vh=855`, that clamped
  point landed on OAC's own bottom-pinned canvas-tab bar
  (`bi_reporttoolbar_environment_footer_container`), not the report.
  Confirmed live before and after: the old point resolved to that toolbar
  element, the new point (near the top of the element's on-screen slice,
  not its clamped center) resolves to a `<th>` inside the report's own
  table.
- **Fixed: a table too wide for the page still wrapped its header text
  mid-word** even after 0.14.8's `overflow-wrap` change. Root cause:
  `printTableLayout` computed the shrink ratio a too-wide table needed but
  discarded it, always returning `scale: 1`; nothing ever shrank the font,
  so `table-layout: fixed` alone could squeeze a column narrower than one
  word. Now the real computed scale is applied as that table's own
  `font-size` (base 9pt), floored at 6pt so text never becomes illegible.
  A table wide enough to need a sub-6pt scale (confirmed live: the
  "Subject Area" table needed 0.37–0.49) still hits that floor and may
  still wrap its longest words — an accepted, disclosed trade-off, not a
  full fix for the widest tables.
- `word-break: normal; overflow-wrap: break-word` (0.14.8's change) is
  unchanged and still correct on its own — it only broke down for tables
  wide enough that `table-layout: fixed` left no viable space-based break
  point, which the font-size fix above now addresses separately.

`node --check` clean. `node tests/run.js` from `oac-sdk-dev/`: 47 passed —
the stale `printTableLayout` test asserting `scale === 1` for an over-wide
table was updated to assert the real computed scale instead.
`fitPrintedReport` and `openGlossaryPrint` remain DOM/window functions
with no fixture in this harness; both fixes above were instead verified
directly against the dev tenant's live DOM (see
`docs/plugins/project_spec_wsu_glossary_pivot.md` §1, §3a). Not yet
re-verified end to end on the tenant after this rebuild — needs a
re-upload and a hard reload (a plain refresh does not bust the cached AMD
module).

## 2026-09-23 — WSU Glossary Pivot 0.14.8

A wide table is fitted by giving it the page width and wrapping the words.
CSS zoom is no longer used. Chrome's PDF printer was painting the zoomed
table as one image, and Adobe reported that file as a scanned document.

## 2026-09-23 — WSU Glossary Pivot 0.14.7

Tooltip text stays left-aligned unless Tooltip: Text Align is Center or Right.
The visualization tile was centering the words inside the bubble.

Print page size is the paper size in inches, and the print frame is resized
to that page before the dialog opens. A wide measurement frame was making
the browser print landscape after Portrait was selected. A section that
fails to prepare still prints its table. Page orientation is the setting
on the visualization whose button was clicked.

## 2026-09-23 — WSU Report Print removed

`com-wsu-report-print` is deleted. Glossary Pivot covers print for one
table and for every Glossary Pivot on the canvas. Delete the installed
extension in the OAC Console; uploading the other zips does not remove it.

Picker icons for Glossary Pivot and Dumbbell are 24×24, the same size as
the other WSU icons, so they sit in the icon grid instead of a full row.

## 2026-09-23 — WSU Report Print 1.1.7

The bar no longer requires a measure. Print Canvas is on by default and
prints the other WSU tables on the canvas. Fields on the bar are optional
and add one more table.

## 2026-09-23 — WSU Glossary Pivot 0.14.6 and WSU Report Print 1.1.6

Print: Table Width defaults to To margins. A table narrower than the page
fills the margin box with fixed columns, so the header text does not set
the width. A wider table scales down to that same box. To content keeps
the header-sized width.

## 2026-09-23 — WSU Glossary Pivot 0.14.5 and WSU Report Print 1.1.5

Print: Margins (Narrow, Normal, Wide) is the page margin on every page.
Portrait and landscape scale the report to the letter page at that margin.

## 2026-09-23 — WSU Glossary Pivot 0.14.4 and WSU Report Print 1.1.4

Print: Browser Header and Footer defaults off, which drops the page margin
Chrome and Edge use for the URL. Print: Follow Theme defaults on, so the
print buttons use the host accent instead of the fixed green.

## 2026-09-23 — WSU Glossary Pivot 0.14.3 and WSU Report Print 1.1.3

Print Canvas keeps each visualization under its own registry key, so one
canvas stopping does not unregister the other. A title read that throws no
longer drops that visualization's table. Hidden canvases are left out of the
print. The editor title is still plain text, including when the host stores
the tags escaped.

## 2026-09-23 — WSU Glossary Pivot 0.14.2 and WSU Report Print 1.1.2

Print PDF and Print Canvas both default off. The editor title is printed as
plain text; tags such as `<p>` and `<strong>` are removed.

## 2026-09-23 — WSU Glossary Pivot 0.14.1 and WSU Report Print 1.1.1

Print PDF and Print Canvas are separate switches. Print PDF defaults on, on
each visualization. Print Canvas defaults off; turn it on for one
visualization so the canvas has a single Print Canvas button. The printed
title is the visualization title from the editor. The print-title field is
gone. A blank editor title leaves that section without a title row.

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
`build()` returns the same table HTML that instance's Print PDF places
in the document. Glossary Pivot expands rowspans and stamps its title
inside that call, so a click on either plugin prints the other's table
the same way. A section that fails to build (missing layout,
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

- **Source in this folder, as of commit `0e043f3` (2026-09-27):** Network
  1.2.2, Line 1.2.2, Sankey 1.1.2, Dumbbell 1.1.2, Lattice Scatter 1.1.2,
  Glossary Pivot 0.16.2 — all six on both `main` and `origin/main`. WSU Report
  Print has been removed entirely. Re-check `git log -1 origin/main` before
  trusting this bullet as still current.
- **Tenant install status is a separate question from git state and is not
  updated by a push.** 0.16.1 was uploaded and tested live 2026-09-25,
  confirmed running (fetched and version-checked), and confirmed live to NOT
  fix the reported calculated-measure format bug — see the 0.16.2 changelog
  entry for the corrected diagnosis. As of this commit, 0.16.2 has not been
  uploaded to any tenant; committing and pushing to GitHub does not install
  anything on OAC or OAD.
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
