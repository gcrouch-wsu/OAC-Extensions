# OAC Dev verification — what only a live tenant can settle

Everything in this repository has been verified against three things: the
model-test harness (`oac-sdk-dev/tests`), Oracle Analytics Desktop 26.01, and
Oracle's published samples. **None of those is the production host.** The
production host is Oracle Analytics Cloud, updated monthly by Oracle, and the
claims below can only be settled there. Run this before calling any build
"verified" and record results against the **tenant build** (Console → About),
not against an OAD version.

Source for this list: the 2026-09-13 adversarial review. Every item is a
question the public documentation does not answer.

## 0. Record the environment

- Tenant build (About dialog), browser + version, date.
- DevTools console:
  `require(["d3v6js"], function(d3){ console.log("d3", d3.version); })` and
  the same for any id you are considering (`d3v7js`, …). Record which resolve.
- `Object.keys(require.s.contexts._.defined).filter(function(k){ return /^d3|^obitech-(report|reportservices|application|appservices|viz)\//.test(k); })`
  gives the module ids the tenant actually defines. Diff against
  `ALLOWED_MODULES` in `tests/lint.js`.

## 1. Dependency and lifecycle baseline

Load all five plugins in one workbook. For each: resize the viz, switch
canvases, delete and re-add, save, reopen the workbook, present mode.

**Pass:** no module-resolution errors, no exceptions in the console, no stale
vis-network instance after delete (Network), no orphaned tooltip `<div>` on
`<body>` after delete (all five).

## 2. Replacement and cache behavior

In an isolated Dev workbook using the currently installed build:

1. Upload the candidate zip over it (same root id). Note whether the Console
   asks to overwrite and what version string it shows afterwards.
2. In an **already-open** browser session, reopen the workbook. Does it run
   the old or the new code? (Check `<Viz>.VERSION` in the console, or a
   behavior that differs between the two builds.)
3. Reload the browser tab. Same check.
4. Sign out and back in. Same check.
5. Roll back by uploading the previous zip. Confirm the workbook still opens
   and the saved property-panel settings survive both directions.
6. Vary the **zip filename** independently of the root id and confirm which
   one the host keys on.

**Pass:** you can state exactly when new code takes effect and confirm the
README's "replaces in place; workbooks keep working" claim for this pair of
versions. Until then the README states it as *tested behavior for specific
versions*, not a contract.

## 3. Data-model governor boundaries

Each manifest sets `dataModelGovernor.dm1.rows` (Network 70 000; Sankey and
Lattice 50 000; Line and Dumbbell 10 000). Build synthetic datasets that yield
N−1, N, N+1 and ≈2N rows for one plugin of each limit.

**Pass:** you can say whether the host rejects the query, truncates silently,
truncates with a visible warning, or fetches everything — and whether the
plugin's own warning strip (which only reports *plugin-side* drops) is
misleading in that state. Do not ship a claim about governor behavior until
this is done.

## 4. Interaction contract

Pair each plugin with a native table and a native bar chart on the same
dataset. Test: click one mark; ctrl-click several; click empty area; brushing
on/off in workbook settings; incoming marks from the native viz; *Use as
Filter* on the native viz; a context-menu data action on the plugin.

**Pass:** the plugin's marks select the right source rows in the native
vizzes and vice versa; clearing works both ways; *Use as Filter* filters
without the plugin misreading it as a highlight. Record inbound-mark gaps
against issue #9 (Network, Sankey, Lattice do not respond to inbound marks;
this is separate from data actions, which consume marked context and are not
a substitute).

## 5. Grammar and property panels

For each plugin: populate every optional bucket; check custom bucket names
render; open the property panel and note which **tab** each gadget lands on
(General, Axis, Interaction, or something else) and its title; change every
gadget; save; reopen the workbook; confirm each value persisted.

**Pass:** every control reachable, every setting round-trips, no blank or
duplicate tabs. The plugins now request only host-defined panel ids
(`GD_PANEL_ID_AXIS`, `GD_PANEL_ID_INTERACTION`) with General as the default;
record whether the cloud host honors them (issue #7).

## 6. ES-module / worker / CSP probe

Only needed before adopting those patterns in a WSU plugin. Build a throwaway
diagnostic extension that (a) lazy-loads a packaged ES module through
`import(requirejs.toUrl(...))` with a relative `import` inside it, (b) starts
a packaged Web Worker, (c) calls `fetch()` against an approved test endpoint
before and after a Safe Domains change and after sign-out/sign-in.

**Pass/fail** is whatever happens; capture the console, network and any CSP
report. No institutional data is involved.

## 7. Clients and locales

Repeat rendering, tooltips, marking and in-chart controls in each browser
the institution supports, in a touch context, and with the OAC user locale
set to a non-English language (the `LBL` tables are externalized to
`nls/root/messages.js`; other locales fall back to English until a
translated bundle is added).

**Pass:** usable in every intended client; the *Limitations* page's mobile
and embedding caveats are reflected in what you promise users.

---

Results go in `CHANGELOG.md` under the release, with the tenant build. A
green harness run and a green OAD session are necessary, not sufficient.
