# START HERE - Prototype First

This repo now starts with Python prototyping first, then moves to OAC plugin implementation.

## 1) Start with Python prototype (first stop)

Work in:
- `prototype_flask/`

Run locally:

```powershell
cd "C:\Python Projects\wsu-gradschool-oac\prototype_flask"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Prototype scope:
- Validate faculty/chair workflow and visual clarity before plugin build
- Test filter behavior, denominator definitions, and journey interpretation
- Iterate on visuals and fake data realism with stakeholder feedback

Note:
- Image/static assets for the prototype are now located under `prototype_flask/`.

## 2) Then choose OAC plugin path

- **Extend existing plugin** when your change fits current geometry/interaction.
- **Fork a new plugin** when the use case is fundamentally different (new chart type or interaction model).

Primary references:
- `oac_design.md` (master architecture + patterns)
- `plugin_training/_LIBRARY_INDEX.md` (read-only pattern library)

## 3) If forking, do the rename checklist immediately

Before touching behavior, make all identifiers unique (silent collisions are common in OAC):

- New root folder under `oac-sdk-dev/src/customviz/<new-root-id>/`
- New `viz:chart.type` (must match root id exactly)
- New visualization manifest and datamodel handler manifest filenames
- New AMD/module ids, CSS root class namespace, DOM ids, NLS key prefix, icon filename
- New `host.script.module` and `dataModelHandler` mapping

If any one of these is missed, the plugin may upload but not appear.

## 4) Build in this sequence every time

From plugin directory, syntax/manifest validation first:

```powershell
node --check <viz>.js
node --check <viz>datamodelhandler.js
Get-Content extensions\oracle.bi.tech.plugin.visualization\<root-id>.json -Raw | ConvertFrom-Json -ErrorAction Stop
Get-Content extensions\oracle.bi.tech.plugin.visualizationDatamodelHandler\<root-id>.visualizationDatamodelHandler.json -Raw | ConvertFrom-Json -ErrorAction Stop
```

Then build:

```powershell
cd "C:\Python Projects\wsu-gradschool-oac\oac-sdk-dev"
.\build-sdk.ps1
```

Expected output:
- `oac-sdk-dev/build/distributions/customviz_<root-id>.zip`

## 5) Install + verify loop in OAD

1. OAD -> Console -> Extensions -> Upload zip
2. **Restart OAD** (required; registry cache)
3. Open workbook and check gallery category
4. Open DevTools and filter for `[CUSTOM_VIZ]`

If uploaded but hidden:
1. Restart OAD again
2. Check for `viz:chart.type` collisions
3. Re-check root id / type match
4. Last resort: rename root id fully and rebuild

## 6) Use these defaults unless you have a reason not to

- Keep palette default empty and use `colorSource: "oac"` so workbook themes work
- Use OAC logger service instead of ad-hoc `console.log`
- Keep strings centralized for NLS readiness
- Group property panel gadgets with stable prefixes (`Chart:`, `Tooltip:`, `Format:`, etc.)
- Keep plugin domain-agnostic; prefer dataset/workbook calculations over plugin-specific business logic

## 7) Choose the best starter reference quickly

- Shared-X line/time-series: fork the closest line-style plugin in `oac-sdk-dev/src/customviz/`
- Paired pre/post comparison: fork the closest comparison-style plugin in `oac-sdk-dev/src/customviz/`
- Network graph: see `plugin_training/com-company-forceDirectedGraph/`
- Org/hierarchy: see `plugin_training/com-company-orgchartviz-v2/`
- Map: see `plugin_training/com-company-linesOnMap/`

Use training plugins as read-only references; do not modify them.

## 8) First 30-minute implementation plan

1. Pick extend vs fork
2. If forking, complete full rename checklist
3. Add a minimal render stub and confirm gallery registration
4. Implement `_generateData` and validate bucket mapping
5. Add base SVG render
6. Add tooltip + one interaction
7. Build/upload/restart/verify in OAD

Only add advanced features (legend interaction, zoom variants, dynamic controls, compare columns) after the registration + data flow are stable.

## 9) Project spec workflow

- Keep each project-specific implementation plan in its own `project_spec_*.md` file.
- Project spec sheets should reference `oac_design.md` for shared architecture guidance.
