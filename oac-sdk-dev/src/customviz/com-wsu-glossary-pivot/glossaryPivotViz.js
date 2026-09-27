/********************** WSU Glossary Pivot — custom visualization **************
 *
 * A pivot table that shows a column's business-glossary description when the
 * user hovers a column or row HEADER.
 *
 * v0.4 — two-tier description resolution:
 *   1. OAC's own per-viz column-info map (live, exact, cheap): confirmed on
 *      the tenant by the v0.2 runtime probe (2026-09-04) at
 *      renderingContext._properties.vizContext._properties
 *        ["obitech-report/datavisualization#columnInfoMap"][COLUMN_ID]._info.desc
 *      Read on every render before the table is built, so first paint already
 *      carries live text when OAC supplies it.
 *   2. FALLBACK: a bundled map sourced from the WSU Reporting knowledge base's
 *      Student Data Warehouse field dictionary, used only for a column the
 *      live map has no entry for.
 *
 * v0.3 shipped a heuristic object-graph walk and a traced-fetch tier, plus a
 * one-shot diagnostic probe (window.__oacProbe). Both were removed in v0.4:
 * unbounded graph walking on every render is a real cost on a wide pivot, and
 * speculative pairing risked showing the wrong column's description with no
 * way for a viewer to tell.
 *
 * v0.5 — pivot-parity work, scoped conservatively where the platform is
 * underspecified rather than guessed broadly:
 *   - Row-level marking (click a row header or a value cell to cross-filter
 *     other visualizations on the canvas). Scoped to ROW granularity only —
 *     column- and cell-level marking on an AGGREGATED pivot cell have no
 *     precedent anywhere in this plugin family, and it is not confirmed
 *     whether OAC's marking traversal reports column-level detail for a
 *     pivot-shaped DataLayout. Outgoing marks use full (row, col) addressing
 *     (matching the documented setMark(dataLayout, edge, row, col) signature
 *     used by WSU Dumbbell); incoming marks (from other visualizations) are
 *     applied at row granularity, matching the only precedented usage of
 *     traverseDataEdgeMarks in this repo.
 *   - Grand-total row/column and per-outer-group row subtotals. These SUM the
 *     already-rendered cell values — they do not re-run each measure's true
 *     aggregation rule (unknown to the plugin), so a summed subtotal is wrong
 *     for a non-additive measure (an average, a ratio, a GPA). Default OFF,
 *     labeled "Total" rather than implying it reproduces OAC's own subtotal
 *     math, and documented here so a future reader does not assume parity
 *     with the native Pivot Table's totals.
 *   - Per-measure number-format override (text field: "MEASURE_ID:format:dp;
 *     ..."), closer to the native pivot's per-column format than one global
 *     switch, without building a per-column context-menu/dialog UI.
 *   - An opt-in "log column metadata" debug toggle. Current behavior logs
 *     only metadata IDs and description origin labels through the OAC logger
 *     on a full render, never DataLayout rows or the rendering context.
 *
 * v0.6 — the three-source question above is answered (2026-09-22, live tenant
 * test): Subject Area and Dataset columns both carry their description at
 * [id]._info.desc. A workbook Calculated Field does NOT — that property is
 * present but empty for a calc field; its Description (from the "Edit
 * Calculation" dialog) lands at
 * [id]._info.additionalProperties.customColumnDescription.json.text instead.
 * descriptionsFromColumnInfoMap() now checks that per-workbook override first
 * (it is more specific than a catalog description, and applies to any column
 * type, not just calculated fields), falling back to _info.desc — one unified
 * read path for all three sources, per the original requirement. Confirmed to
 * work identically for a calculated MEASURE, not just a calculated attribute.
 *
 * v0.7 — cell color (heat map). Per-measure background gradient on Values
 * cells, from the "field format, color" item in the original requirement.
 * Min/max are computed per measure (never mixed across different measures,
 * same reasoning as the grand-total-column bucketing) over the rendered rows
 * only — total/subtotal cells are excluded from both the range calculation
 * and the coloring itself, since a sum would always read "hottest" and
 * defeat the scale. Default OFF; the two hex Config fields are a magnitude
 * encoding (not a category palette), so hardcoded sequential defaults are
 * appropriate per docs/oac_design.md §6.18's "not governed by this rule"
 * carve-out — same reasoning as WSU Dumbbell's direction colors.
 *
 * v0.8 adds row-group collapse: a click-to-collapse toggle on the outer
 * (layer-0) Row group when 2+ Row layers are dropped. A collapsed group
 * renders as one summary row (same SUM-of-displayed-values as a subtotal)
 * standing in for its hidden detail rows. Collapse state lives on the
 * component instance (this._collapsedGroups), not in Config — it is
 * deliberately session-only rather than a saved, unbounded per-value list,
 * consistent with "load fresh at open." "Filter" and "modification of title"
 * from the same original requirement needed no plugin code at all — both are
 * generic OAC host features already present for every visualization
 * regardless of the plugin's own grammar (confirmed: this plugin's datamodel
 * handler defines no "filter" bucket, yet the Filters shelf is already
 * populated and functional in every test canvas).
 *
 * v0.9 — bugfixes from an independent code review (Cursor), each verified
 * against this file before being applied rather than taken on faith:
 *   - sumBlock/computeMeasureRanges counted a blank cell as 0 (Number(null)
 *     and Number("") are both 0), so a measure with no data showed "0"
 *     instead of blank, and a blank cell dragged a heat-map minimum to 0.
 *   - Heat-map color used an inline background/color, which always beat the
 *     .gp-marked / :hover class rules — row hover and mark-selection were
 *     invisible on any colored cell. Switched to CSS custom properties
 *     (--gp-cell-bg/--gp-cell-fg) read by a same-specificity base rule, so
 *     the already-more-specific marked/hover rules win normally.
 *   - "auto" number format read the DATA edge's raw-id-form value, not what
 *     OAC had already formatted, so a host-formatted currency/percent column
 *     rendered as a bare number by default — the opposite of "auto leaves
 *     OAC's own formatting alone." Now reads both forms and picks based on
 *     whether the Config format is "auto" or an explicit override; heat-map
 *     coloring still always uses the raw numeric form for the actual math.
 *   - Currency formatting's thousands-separator regex required a literal
 *     "." after the digits, which toFixed(0) never produces — 0-decimal
 *     currency lost its grouping entirely, and the sign was placed after
 *     the "$" ("$-1,234.00") instead of before it.
 *   - The tooltip's live-source badge said "Dataset · live" for every live
 *     hit, including Subject Area and Calculated Field columns — nothing
 *     about that property actually says "Dataset." Split into a plain
 *     "Live" badge (a _info.desc read — Subject Area or Dataset, this map
 *     does not distinguish them) and a "Workbook override" badge (the
 *     additionalProperties.customColumnDescription path), which is both
 *     accurate and the confirmed case for a Calculated Field.
 *   - The grand-total-column header showed the raw measure id
 *     (bucketColsByMeasure keys on the id form) instead of the name a
 *     viewer would recognize. computeMeasureIdByCol now also returns
 *     nameById alongside idByCol.
 *   - getDescription() tailed a columnId before ever trying the FULL id,
 *     even though mergeLive indexes both — harmless while every id on the
 *     tenant happens to be a bare name, but two differently-qualified ids
 *     sharing a tail segment would have collided. Full id is tried first.
 *   - Row-group collapse was keyed by the group's label TEXT, so two groups
 *     sharing a label (including two blank labels) collapsed and expanded
 *     together. Now keyed by the group's starting row index, which is
 *     unique and stable across re-renders of the same query result.
 *   - Collapsing a group, or any re-render that replaces the table's HTML,
 *     reset .gp-wrap's scroll position to the top — disruptive on a wide or
 *     tall pivot. Factored into _replaceTableHtml(), which now saves and
 *     restores scroll position across the swap.
 *   - No _doStopComponent, unlike every reference plugin in this family
 *     (though none of them actually unsubscribe their own subscribeToEvent
 *     calls either — checked WSU Dumbbell). Added for lifecycle symmetry.
 *   - The review's icon-file claim was checked and found incorrect —
 *     glossaryPivotVizIcon.png is present and a valid 64×64 PNG.
 * Not changed: the bundled fallback dictionary being WSU-specific data in
 * an otherwise-general plugin, and CSS not being namespaced under one root
 * class — both flagged as real but low-risk/low-priority by the same
 * review, and left as-is rather than churned without being asked.
 *
 * v0.10 — click-to-sort. The DataLayout is a read-only snapshot in the
 * host's delivery order; nothing here can re-query it sorted, so sort is a
 * client-side reorder of a row buffer. Every buffered row keeps its original
 * layout index, and marking attributes plus the collapse key (the outer
 * group's original start row — see v0.9) use that index, never the row's
 * position on screen. Rowspans are recomputed from adjacency in the sorted
 * buffer: getItemEndSlice only describes the host's order, so it is wrong
 * the moment rows move. With 2+ Row layers a measure or inner-layer sort
 * reorders rows inside each layer-0 group and leaves the groups where they
 * are; sorting by the layer-0 header itself reorders the groups, because
 * that value is constant inside a group and a within-group sort would not
 * move anything. State is session-only, same as _collapsedGroups — a saved
 * sort key goes stale the moment the trays change, and the requirement is
 * that the workbook opens fresh.
 *
 * v0.11 — the pivot operations the data team uses on the native table and
 * this plugin did not have. A hidden column stays in the query (so row
 * order and group boundaries still follow it) and is omitted from the
 * drawing: a Rows field drops its header column, a Columns field drops
 * its header row, a measure drops its data columns. Display-header text
 * replaces what the cell shows and does not replace the id the glossary
 * and the sort key use. Header color paints field-name headers; header
 * data color paints column headers whose text is a member value (Fall,
 * Full-Time). Both are a single hex, empty meaning the stylesheet default.
 * Totals are unchanged: still a sum of the numbers on screen, still off
 * until turned on.
 *
 * v0.12 — Number format groups thousands the same way currency already did
 * (1,234), without a dollar sign. Tooltip: the Live and Workbook override
 * chips are off until asked for; the Bundled fallback chip stays, because
 * that one says the text did not come from OAC. The dotted header underline
 * is off until asked for; the tooltip, hover, and focus stay. Tooltip text
 * aligns left, center, or right. The bubble stays centered under the header.
 *
 * v0.13 — Print PDF on the pivot itself. The button stays on the canvas.
 * The printed document is the table: hidden columns, display labels, number
 * formats, and the total rows that are turned on. Collapsed groups are
 * expanded for the print so a page is not missing rows someone folded while
 * looking. Row labels are repeated on every body row so a page break does
 * not open on a blank spanned cell. Column headers repeat on each page.
 *
 * v0.14 — Print Canvas. A plugin instance only ever sees its own bound
 * data (docs/oac_design.md §2) — there is no OAC API for one visualization
 * to read another's DataLayout. window.__wsuPrintCanvas is a plain, same-
 * page JS registry (not an OAC mechanism) that each Glossary Pivot instance
 * on the canvas adds itself to on init
 * and removes itself from on stop. Print Canvas walks that registry, asks
 * every registered instance to build its own table fragment, and assembles
 * them into one print document in canvas (DOM) order. A section that fails
 * to build is skipped, not fatal to the rest. Orientation is whichever
 * instance's own button was clicked; @page is document-wide and there is no
 * per-section override.
 *
 * v0.15 — Print reliability and accessibility pass: font-fit floor with a
 * nonblocking overflow warning, keyboard/ARIA reachability for sort and
 * collapse, sanitized debug logging, and Print Canvas's active-canvas-tab
 * selector reworked around OAC's own panel identity. v0.15.1 fixed that
 * selector for the in-editor tab host (see the note above
 * selectedCanvasPanel).
 *
 * v0.16.0 — FALLBACK_DESCRIPTIONS (the ~30-line hardcoded dictionary of 16
 * Student Data Warehouse column descriptions the v0.4 note above
 * introduced as tier 2/FALLBACK) is removed, at the data team's request:
 * a copy of glossary text hand-maintained inside the renderer's own source,
 * disconnected from the real data dictionary it was captured from, is not
 * maintainable — nothing forces it to be re-checked as the source dictionary
 * changes, and the "Bundled fallback" badge was the only signal that a
 * viewer's tooltip text might be stale. The glossary is now exactly two
 * tiers (live catalog text, workbook override); a column with neither shows
 * no tooltip, same as any column that was never in the removed dictionary.
 * See the removal note at the top of the GLOSSARY section, CHANGELOG.md,
 * and SECURITY.md (which carried a reviewed exception for this dictionary
 * specifically, now removed with it).
 *
 * v0.16.1 / v0.16.2 — a calculated measure (Full-Time, Part-Time, ...) on
 * a live workbook showed no per-measure format even with a syntactically
 * valid override typed for it. v0.16.1 shipped a fix (computeMeasureIdByCol
 * falling back to a measure's display name when its raw id is null) based
 * on a probe that turned out to prove less than it looked like. v0.16.2,
 * after testing 0.16.1 against the actual tenant, found the real
 * mechanism with stack-trace-precise instrumentation: the raw id is not
 * null, it is a real but opaque, UI-invisible code OAC assigns calculated
 * measures ("c34"), which never matches what an author can see to type.
 * The actual fix is in resolveFormat (see its own note). Both fixes ship;
 * neither hurts, only one mattered for the reported bug.
 ******************************************************************************/

define(['jquery',
        'obitech-framework/jsx',
        'obitech-report/datavisualization',
        'obitech-reportservices/datamodelshapes',
        'obitech-reportservices/events',
        'obitech-reportservices/interactionservice',
        'obitech-reportservices/markingservice',
        'obitech-application/gadgets',
        'obitech-report/gadgetdialog',
        'obitech-application/extendable-ui-definitions',
        'obitech-appservices/logger',
        'ojL10n!com-wsu-glossary-pivot/nls/messages',
        'obitech-reportservices/data',
        'skin!css!com-wsu-glossary-pivot/glossaryPivotVizstyles'],
        function($,
                 jsx,
                 dataviz,
                 datamodelshapes,
                 events,
                 interactions,
                 marking,
                 gadgets,
                 gadgetdialog,
                 euidef,
                 logger,
                 messages,
                 data) {
   "use strict";

   var MODULE_NAME = 'com-wsu-glossary-pivot/glossaryPivotViz';
   var _logger = new logger.Logger(MODULE_NAME);
   _logger.info("Initializing WSU Glossary Pivot plugin");

   // Symbol pinning — fail fast if OAC renames any internal constant.
   jsx.assertObject(datamodelshapes.Physical, MODULE_NAME + " datamodelshapes.Physical");
   jsx.assertObject(dataviz.SettingsNS, MODULE_NAME + " dataviz.SettingsNS");
   jsx.assertObject(dataviz.DataContextProperty, MODULE_NAME + " dataviz.DataContextProperty");
   jsx.assertObject(data.LayerMetadata, MODULE_NAME + " data.LayerMetadata");
   var SETTINGS_CHART = dataviz.SettingsNS.CHART;
   var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
   var PHYS_DATA = datamodelshapes.Physical.DATA;
   var PHYS_ROW = datamodelshapes.Physical.ROW;
   var PHYS_COLUMN = datamodelshapes.Physical.COLUMN;

   // User-facing strings come from nls/root/messages.js (ojL10n bundle); the
   // English text here is the fallback when a key is missing from the bundle.
   function L(key, fallback) {
      var v = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
      return typeof v === "string" && v !== "" ? v : fallback;
   }

   var LBL = {
      EMPTY_STATE: L("GLOSSARYPIVOT_LBL_EMPTY_STATE", "No data. Add fields to Rows, Columns and Values."),
      RENDER_ERROR: L("GLOSSARYPIVOT_LBL_RENDER_ERROR", "Render error: "),
      /* Two live tiers, not one: "Live" for a straight read of _info.desc
         (Subject Area OR Dataset — this map does not tell them apart), and
         "Workbook override" for the additionalProperties.customColumnDescription
         path (confirmed for a workbook Calculated Field; could also be a
         manual override on any other column type). The old single "Dataset ·
         live" badge was shown for all three sources, which is wrong for two
         of them — never claim "Dataset" specifically since that is not
         actually known from this property alone. */
      SRC_LIVE: L("GLOSSARYPIVOT_LBL_SRC_LIVE", "Live"),
      SRC_OVERRIDE: L("GLOSSARYPIVOT_LBL_SRC_OVERRIDE", "Workbook override"),
      /* SRC_BUNDLED ("Bundled fallback") removed in v0.16.0 along with the
         bundled dictionary it labeled — see FALLBACK_DESCRIPTIONS' removal
         note near the top of the GLOSSARY section. */
      TOTAL: L("GLOSSARYPIVOT_LBL_TOTAL", "Total"),
      PRINT: L("GLOSSARYPIVOT_LBL_PRINT", "Print PDF"),
      PRINT_CANVAS: L("GLOSSARYPIVOT_LBL_PRINT_CANVAS", "Print Canvas"),
      PRINT_CANVAS_HELP: L("GLOSSARYPIVOT_LBL_PRINT_CANVAS_HELP", "Print the WSU Glossary Pivot tables on this canvas tab."),
      PRINT_NONE: L("GLOSSARYPIVOT_LBL_PRINT_NONE", "No tables on this canvas could be printed."),
      PRINT_ERROR: L("GLOSSARYPIVOT_LBL_PRINT_ERROR", "Print could not open. Use the browser print dialog if it appears, or allow this page to print."),
      PRINT_BUSY: L("GLOSSARYPIVOT_LBL_PRINT_BUSY", "A print preview is already open. Close it before printing again."),
      PRINT_OVERFLOW: L("GLOSSARYPIVOT_LBL_PRINT_OVERFLOW", "Printed. One table is still wide at the smallest print text size (6pt); for a single fully readable page, try fewer columns, shorter labels, landscape, or a smaller margin."),
      PRINT_MIXED_ORIENTATION: L("GLOSSARYPIVOT_LBL_PRINT_MIXED_ORIENTATION", "Tables use different page orientations; Print Canvas uses the orientation of the table whose button you clicked.")
   };

   GlossaryPivotViz.VERSION = "0.16.2";

   /**
    * @constructor
    * @extends {module:obitech-report/datavisualization.DataVisualization}
    */
   function GlossaryPivotViz(sID, sDisplayName, sOrigin, sVersion) {
      GlossaryPivotViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);
      this._glossary = null;
      this._mapMissingLogged = false;
      this._markedRows = Object.create(null);   // rowIndex -> true, applied from local clicks or incoming marks
      this._collapsedGroups = Object.create(null);   // outer row-group's starting DataLayout row index -> true, session-only (not saved to Config)
      /* {kind:"row"|"col", key:number, layer:number (col only), dir:"asc"|"desc"} or null.
         Session-only, same reason as _collapsedGroups — not written to Config.
         _doInitializeComponent does not reset _collapsedGroups (a new instance
         already starts empty), so sort state is not reset there either. */
      this._sortState = null;
      this._printFrame = null;
      this._lastDataLayout = null;
      this._renderRevision = 0;

      this.Config = {
         // Format
         numberFormat: "auto",             // auto | number | percent | currency | compact
         decimalPlaces: "auto",            // auto | "0" | "1" | "2" | "3" | "4"
         measureFormatOverrides: "",        // "MEASURE_ID:format:decimals; MEASURE_ID:format:decimals; ..." — wins over the two switches above for the named measure
         // Header — the field stays in the layout either way. Hidden columns
         // still order and group; display labels change the text, not the
         // glossary id. Empty hex means the stylesheet color.
         headerLabels: "",                 // "COLUMN_ID: Display text; COLUMN_ID: Display text; ..."
         hiddenColumns: "",                // "STRM; REPORTING_SEQUENCE; ..."
         headerColor: "",                  // hex for field-name headers (corner, measure names)
         headerDataColor: "",              // hex for column headers that show a member value
         printOrientation: "landscape",    // landscape | portrait
         showPrintPdf: "off",              // on | off — Print PDF on this visualization. Off until switched on.
         showPrintCanvas: "off",           // on | off — Print Canvas. Leave off except on one visualization.
         printMargin: "normal",            // narrow | normal | wide — @page margin, repeated on every page
         printTableSize: "margins",        // margins | content — margins fills the page; content keeps header width
         printCanvasSpacing: "perReport",   // perReport | compact — Print Canvas only. perReport (default) forces every
                                            // report onto its own new page, even a one-row report with a mostly blank
                                            // page left under it. compact packs reports together instead, breaking to
                                            // a new page only when one does not fit (its own thead still repeats if
                                            // it spans pages on its own).
         printFollowTheme: "on",           // on | off — print buttons use the host accent. Off keeps the green.
         // Totals (SUM of displayed values — see the v0.5 header note on why this is not the same as re-running each measure's aggregation rule)
         showGrandTotalRow: "off",
         showRowSubtotals: "off",           // only takes effect with 2+ Row layers
         showGrandTotalColumn: "off",
         rowGroupCollapse: "off",           // on | off — adds a click-to-collapse toggle to the outer Row group; only takes effect with 2+ Row layers
         // Style
         cellColor: "off",                  // off | on — per-measure heat-map background on Values cells
         cellColorLow: "#eff6ff",           // background at the measure's minimum value
         cellColorHigh: "#1e3a8a",          // background at the measure's maximum value
         // Tooltip
         showDescriptions: "on",            // on | off — glossary hover tooltips on headers
         showSourceBadges: "off",           // on | off — Live and Workbook override chips
         showHeaderUnderline: "off",        // on | off — dotted underline on headers that have a description
         tooltipAlign: "left",              // left | center | right — text inside the tooltip, not the bubble's position
         // Debug
         debugLogMetadata: "off"            // on | off — log metadata IDs and source labels, never cell values
      };

      this._saveSettings = function () {
         this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
      };

      this.loadConfig = function () {
         var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
         Object.keys(this.Config).forEach(function (key) {
            if (!jsx.isNull(conf[key]) && typeof conf[key] !== "undefined") this.Config[key] = conf[key];
         }, this);
      };
   }
   jsx.extend(GlossaryPivotViz, dataviz.DataVisualization);

   /* =========================================================================
      1. GLOSSARY — the seam.
      Every lookup goes through getDescription(); the two providers (OAC's
      live column-info map and a workbook-level override) fill the index
      behind it without the renderer knowing which one supplied a given
      column. A column neither provider has text for gets no tooltip.

      REMOVED in v0.16.0: a third, lowest-ranked tier, FALLBACK_DESCRIPTIONS —
      a ~30-line hardcoded dictionary of 16 Student Data Warehouse column
      descriptions (STRM, CUM_GPA, ACAD_PROG, and others), sourced from the
      WSU Reporting knowledge base and used only when a column had neither
      live nor override text. Removed at the data team's request: a
      hand-maintained copy of glossary text living inside the renderer's
      source, disconnected from the actual data dictionary it was copied
      from, could silently drift out of date with no way for a viewer to
      know it needed re-checking beyond the "Bundled fallback" badge. A
      column that only ever had bundled text now shows no tooltip, the same
      as any column that was never in that dictionary. See CHANGELOG.md's
      v0.16.0 entry and SECURITY.md for the removed data-exception note. */

   /**
    * Strips a trailing " Attr" (the dataset's attribute-variant suffix) so
    * "CUM_GPA Attr" still finds "CUM_GPA".
    */
   function normaliseName(s) {
      if (s == null) return "";
      return String(s).replace(/\s+Attr$/i, "").trim();
   }

   /**
    * Last identifier segment of a column reference, so a stable ID can serve
    * as a fallback lookup key when the display name was changed in the
    * workbook. 'XSA('o'.'ds').CUM_GPA' -> CUM_GPA ; '"SA"."T"."Col"' -> Col.
    */
   function tailName(id) {
      if (id == null) return "";
      var seg = String(id).split(".").pop() || "";
      return seg.replace(/^["']+|["']+$/g, "").trim();
   }

   /* Index keys: EXACT (trimmed, upper-cased, " Attr" kept) so "CUM_GPA Attr"
      and "CUM_GPA" are distinct entries — a base column must never inherit
      its Attr variant's text. Lookups try exact first, then the " Attr"-
      stripped form, so an Attr header still falls back to its base column. */
   function exactKey(s) { return s == null ? "" : String(s).trim().toUpperCase(); }
   function baseKey(s)  { return normaliseName(s).toUpperCase(); }

   /* Confidence ranking. "live" is OAC's own column-info map — exact, keyed
      by column id. "override" (an explicit per-workbook description, e.g.
      a Calculated Field's) outranks a plain catalog-level "live" read,
      since it is more specific to what this workbook's author actually
      meant for this column. A third, lowest-ranked "bundled" tier (a
      hardcoded dictionary) was removed in v0.16.0 — see the note at the
      top of this section. */
   var ORIGIN_RANK = { live: 0, override: 1 };

   function buildGlossary() {
      var index = Object.create(null);

      function put(key, entry) {
         if (!key) return;
         var cur = index[key];
         var newRank = ORIGIN_RANK[entry.origin] || 0;
         var oldRank = cur ? (ORIGIN_RANK[cur.origin] || 0) : -1;
         /* Replace on strictly higher confidence — or on SAME origin with
            different text, so a description edited in the dataset mid-session
            refreshes instead of being frozen by the first read. */
         if (!cur || newRank > oldRank ||
             (newRank === oldRank && cur.origin === entry.origin && cur.text !== entry.text)) {
            index[key] = entry;
         }
      }

      return {
         /** @param {Object} entries { NAME: {text, origin} } */
         mergeLive: function (entries) {
            Object.keys(entries).forEach(function (k) {
               var e = entries[k];
               if (!e || typeof e.text !== "string") return;
               put(exactKey(k), e);
               /* a qualified key ("SA"."T"."STRM") is also reachable by tail */
               var t = exactKey(tailName(k));
               if (t && t !== exactKey(k)) put(t, e);
            });
         },

         /**
          * Resolution order — the stable column ID FIRST (map keys ARE the
          * ids, so this is exact), then the display name. Within each, exact
          * key before the " Attr"-stripped key. The id itself is tried
          * before its tail-name form — mergeLive indexes both, but this
          * lookup used to go straight to the tail, so two differently-
          * qualified ids sharing the same tail segment ("SA"."STRM" vs
          * "OTHER"."STRM") would collide and the later merge would win,
          * even though the exact, unambiguous key was sitting in the index
          * the whole time.
          *
          * @param {string} displayName the header text
          * @param {string=} columnId the LAYER_ID / measure id, when available
          * @returns {{text:string, origin:string}|null}
          */
         getDescription: function (displayName, columnId) {
            var hit = null;
            if (columnId != null) {
               hit = index[exactKey(columnId)] || index[baseKey(columnId)];
               if (!hit) {
                  var tid = tailName(columnId);
                  hit = index[exactKey(tid)] || index[baseKey(tid)];
               }
            }
            if (!hit) hit = index[exactKey(displayName)] || index[baseKey(displayName)];
            if (!hit) return null;
            return { text: hit.text, origin: hit.origin };
         }
      };
   }

   /* =========================================================================
      LIVE — OAC's own column-info map.
      CONFIRMED on the tenant (2026-09-22, via Config.debugLogMetadata against
      a live workbook) at:
        renderingContext._properties.vizContext._properties
          ["obitech-report/datavisualization#columnInfoMap"][COLUMN_ID]
      Keys are plain column IDs ("UNT_TAKEN_PRGRSS", "STRM", "GlossaryTestCalc")
      — identical to LAYER_ID and to the measure IDs — so the join is exact.

      The three-source question is answered: a Subject Area column's
      Presentation-layer description AND a Dataset column's description both
      land in [id]._info.desc directly (confirmed: STRM sourced from an XSA
      Dataset carried its real description there). A workbook-level
      Calculated Field is different — [id]._info.desc is present but EMPTY
      for a calc field; its Description (as typed in the "Edit Calculation"
      dialog) instead lands at
        [id]._info.additionalProperties.customColumnDescription.json.text
      An explicit per-workbook override in that same additionalProperties bag
      is more specific than a source's catalog-level description, so it is
      checked FIRST for every column (not just calculated fields) with
      _info.desc as the fallback — this is what makes the lookup a single
      unified path regardless of source, per the "consistent glossary
      experience" requirement.

      The map is read defensively (property-bag getter first, raw
      _properties second); any failure yields {}, and every header on that
      render simply shows no tooltip (no bundled tier to fall back to since
      v0.16.0) for OAC builds where the path differs.
      ========================================================================= */
   var COLUMN_INFO_MAP_KEY = "obitech-report/datavisualization#columnInfoMap";
   /* LAYER_ID OAC was observed to assign the measure-labels layer. */
   var MEASURE_LAYER_ID = "DM!MEASURE_DIMENSION";

   function readBag(bag, key) {
      if (!bag) return null;
      try { if (typeof bag.get === "function") { var v = bag.get(key); if (v != null) return v; } } catch (e) {}
      try { if (bag._properties && bag._properties[key] != null) return bag._properties[key]; } catch (e) {}
      try { if (bag[key] != null) return bag[key]; } catch (e) {}
      return null;
   }

   /* Sources are tried in order, cheapest and best-attested first:
        1. the rendering context's own "vizContext" property (probe-observed)
        2. viz.assertOrCreateVizContext() — zero-arg, used by the reference
           dumbbell plugin, so its signature is known
        3. viz.getVizContextFromRenderingContext(rc) — signature guessed;
           only reached if 1 and 2 yielded no map */
   function readColumnInfoMap(rc, vizInstance) {
      var sources = [
         function () { return readBag(rc, "vizContext"); },
         function () { return vizInstance && typeof vizInstance.assertOrCreateVizContext === "function"
                              ? vizInstance.assertOrCreateVizContext() : null; },
         function () { return vizInstance && typeof vizInstance.getVizContextFromRenderingContext === "function"
                              ? vizInstance.getVizContextFromRenderingContext(rc) : null; }
      ];
      for (var i = 0; i < sources.length; i++) {
         var ctx = null;
         try { ctx = sources[i](); } catch (e) { ctx = null; }
         if (!ctx) continue;
         var map = readBag(ctx, COLUMN_INFO_MAP_KEY);
         if (map && typeof map === "object") return map;
      }
      return null;
   }

   /** @returns {Object} { COLUMN_ID: {text, origin:'live'} } — {} when unavailable */
   function descriptionsFromColumnInfoMap(map) {
      var out = {};
      if (!map || typeof map !== "object") return out;
      var ks; try { ks = Object.keys(map); } catch (e) { return out; }
      ks.forEach(function (id) {
         var info = null; try { info = map[id]; } catch (e) {}
         if (!info || typeof info !== "object") return;
         var meta = info._info || null;
         var desc = null, origin = "live";
         /* A description set explicitly on this column IN THIS WORKBOOK (the
            "Edit Calculation" dialog's Description field for a Calculated
            Field, or a manual override on any other column) is more specific
            than the source's own catalog description, so it wins when
            present. Confirmed 2026-09-22: this is the ONLY place a workbook
            Calculated Field's description lives — its _info.desc is present
            but empty. Tagged with its own origin ("override") so the tooltip
            badge does not claim it came from the same place as a plain
            catalog read. */
         try {
            var cd = meta && meta.additionalProperties && meta.additionalProperties.customColumnDescription;
            var t = cd && cd.json && cd.json.text;
            if (typeof t === "string" && t.trim()) { desc = t; origin = "override"; }
         } catch (e) {}
         if (desc == null) { try { desc = meta && meta.desc; } catch (e) {} }
         if (desc == null) { try { desc = info.desc; } catch (e) {} }
         if (typeof desc === "string" && desc.trim()) {
            out[id] = { text: desc.trim(), origin: origin };
         }
      });
      return out;
   }

   /* =========================================================================
      2. FORMAT-AS-CONFIG
      Only applied to values that parse as numeric; text/date pivot cells pass
      through with whatever formatting OAC already applied. A per-measure
      override (Config.measureFormatOverrides) wins over the two global
      switches for the named measure id.
      ========================================================================= */

   function parseMeasureFormatOverrides(str) {
      var out = Object.create(null);
      if (!str) return out;
      String(str).split(";").forEach(function (seg) {
         seg = seg.trim();
         if (!seg) return;
         var parts = seg.split(":");
         var id = (parts[0] || "").trim();
         if (!id) return;
         var fmt = (parts[1] || "auto").trim() || "auto";
         var dp = (parts[2] || "auto").trim() || "auto";
         if (parts.length > 3 || !/^(auto|number|percent|currency|compact)$/.test(fmt) ||
             !/^(auto|[0-4])$/.test(dp)) return;
         out[id.toUpperCase()] = { numberFormat: fmt, decimalPlaces: dp };
      });
      return out;
   }

   /* Keys a column can be named by: the id OAC stored, the last segment of
      a qualified id, and the display name. Hidden-column and display-label
      lists are matched against all three so "STRM" hits a row layer whose
      id is a qualified subject-area path. */
   function nameKeys(id, name) {
      var keys = [];
      function add(s) {
         var k = exactKey(s);
         if (k && keys.indexOf(k) < 0) keys.push(k);
      }
      if (id != null && id !== "") { add(id); add(tailName(id)); }
      if (name != null && name !== "") add(name);
      return keys;
   }

   function parseHiddenColumns(str) {
      var out = Object.create(null);
      if (!str) return out;
      String(str).split(";").forEach(function (seg) {
         nameKeys(seg.trim(), null).forEach(function (k) { out[k] = true; });
      });
      return out;
   }

   function columnListed(set, id, name) {
      if (!set) return false;
      var keys = nameKeys(id, name);
      for (var i = 0; i < keys.length; i++) if (set[keys[i]]) return true;
      return false;
   }

   /* "ID: Display text" split on the first colon so a label may contain
      one. The glossary lookup keeps the original name; only the painted
      header text changes. */
   function parseHeaderLabels(str) {
      var out = Object.create(null);
      if (!str) return out;
      String(str).split(";").forEach(function (seg) {
         var idx = seg.indexOf(":");
         if (idx <= 0) return;
         var id = seg.slice(0, idx).trim();
         var label = seg.slice(idx + 1).trim();
         if (!id || !label) return;
         nameKeys(id, null).forEach(function (k) { out[k] = label; });
      });
      return out;
   }

   function resolveHeaderLabel(map, id, name, fallback) {
      if (!map) return fallback;
      var keys = nameKeys(id, name);
      for (var i = 0; i < keys.length; i++) if (map[keys[i]]) return map[keys[i]];
      return fallback;
   }

   /* A calculated measure's raw id is real, not null — confirmed live with
      stack-trace-precise instrumentation (a synthetic "id is null" fallback
      was tried first and shipped as 0.16.1; live testing after deploying it
      proved that premise wrong before it fixed anything). OAC assigns it an
      opaque, auto-generated code ("c34", not "CUM_GPA"-style) that is never
      shown anywhere in the UI, so an author can only ever type the printed
      header text into Format: Per-Measure Override, not this id — the two
      never matched. Falls back to matching by measure name (confirmed live:
      the same override text that failed to match "c34" matches "Full-Time"
      directly) only when the id lookup misses, so a real id match — the
      documented, primary behavior for a native measure — still wins. */
   function resolveFormat(Config, overrides, measureId, measureName) {
      var o = measureId != null ? overrides[String(measureId).toUpperCase()] : null;
      if (!o && measureName != null) o = overrides[String(measureName).toUpperCase()];
      return o || { numberFormat: Config.numberFormat, decimalPlaces: Config.decimalPlaces };
   }

   function compactNumber(n, dp) {
      var abs = Math.abs(n), sign = n < 0 ? "-" : "", suffix = "", scaled = abs;
      if (abs >= 1e9) { scaled = abs / 1e9; suffix = "B"; }
      else if (abs >= 1e6) { scaled = abs / 1e6; suffix = "M"; }
      else if (abs >= 1e3) { scaled = abs / 1e3; suffix = "K"; }
      var places = dp == null ? (suffix ? 1 : 0) : dp;
      return sign + scaled.toFixed(places) + suffix;
   }

   function formatValue(raw, fmtSpec) {
      if (raw == null || raw === "") return raw;
      var n = Number(raw);
      if (isNaN(n)) return raw;   // not numeric — leave as OAC formatted it
      var dp = /^[0-4]$/.test(String(fmtSpec.decimalPlaces)) ? parseInt(fmtSpec.decimalPlaces, 10) : null;
      switch (fmtSpec.numberFormat) {
         case "percent":  return (n * 100).toFixed(dp == null ? 1 : dp) + "%";
         case "currency":
            /* Group the integer part only — the previous regex required a
               literal "." after the digit groups, which toFixed(0) never
               produces, so 0-decimal currency lost its thousands separator
               entirely. Sign goes before the $, not after it. */
            var sign = n < 0 ? "-" : "";
            var parts = Math.abs(n).toFixed(dp == null ? 2 : dp).split(".");
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            return sign + "$" + parts.join(".");
         case "compact":  return compactNumber(n, dp);
         case "number":
            /* Same thousands grouping as currency, without the $. Auto
               decimals keep the number's own fraction; an explicit count
               uses toFixed. */
            var nSign = n < 0 ? "-" : "";
            var nBody = dp == null ? String(Math.abs(n)) : Math.abs(n).toFixed(dp);
            var nParts = nBody.split(".");
            nParts[0] = nParts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            return nSign + nParts.join(".");
         default:         return raw;   // "auto" — leave OAC's own formatting alone
      }
   }

   /* =========================================================================
      3. TOTALS — client-side SUM over already-rendered cell values.
      See the v0.5 header note: this is a display convenience, not a
      re-aggregation, and is wrong for a non-additive measure. Default off.
      ========================================================================= */

   /** Sums dl.getValue(DATA, r, cc) over rStart..rEnd × the given column indices. Returns null if nothing numeric was found. */
   function sumBlock(dl, rStart, rEnd, colIndices) {
      var total = 0, any = false;
      for (var r = rStart; r <= rEnd; r++) {
         for (var i = 0; i < colIndices.length; i++) {
            var cc = colIndices[i];
            var v = null;
            try { v = dl.getValue(PHYS_DATA, r, cc, true); } catch (e) {}
            if (v == null) { try { v = dl.getValue(PHYS_DATA, r, cc); } catch (e) {} }
            /* A blank cell is ABSENT, not zero — Number(null) and Number("")
               both evaluate to 0, so this check must happen before the
               numeric conversion or a measure with no data at all would
               render "0" instead of blank, and an empty cell would drag a
               heat-map's minimum down to 0. */
            if (v == null || v === "") continue;
            var n = Number(v);
            if (!isNaN(n)) { total += n; any = true; }
         }
      }
      return any ? total : null;
   }

   /**
    * Which measure each DATA column index belongs to, so a grand-total COLUMN
    * sums only within one measure's own columns (summing GPA into a credit-
    * hours total would be nonsense). Falls back to a single shared bucket
    * when there is no separate measure-labels layer to read (a single-measure
    * pivot never renders one) — correct, since there is then only one measure
    * to total across. Also captures each distinct id's DISPLAY name in the
    * same pass (nameById) — the grand-total-column header needs the name a
    * viewer recognizes ("Cumulative GPA"), not the raw measure id
    * ("CUM_GPA") that the bucket keys are built from.
    *
    * CORRECTED in 0.16.2: 0.16.1 shipped believing a calculated measure's
    * raw id (getValue(..., true)) comes back null, based on a probe that
    * only proved no FULL/PART/FTE/-style string ever reached the format
    * lookup — not that the id itself was null. Stack-trace-precise
    * instrumentation against the actual reported workbook after 0.16.1 was
    * deployed proved that premise wrong: the id is real, just an opaque,
    * auto-generated code ("c34") never shown anywhere in the UI — see
    * resolveFormat's own note for the fix that actually mattered
    * (a name-based fallback there, not here). This null-to-name fallback
    * is kept as defensive handling for the case its own name suggests —
    * genuinely null — which was never disproven to be impossible, just not
    * what caused the reported bug. If it never fires in practice, that is
    * expected; do not treat it as the fix for an "opaque but non-null id"
    * complaint — that one is resolveFormat's.
    *
    * @returns {{idByCol: Array, nameById: Object}}
    */
   function computeMeasureIdByCol(dl, LM, nColLayers, nCols) {
      var idByCol = new Array(nCols);
      var nameById = Object.create(null);
      var mLayer = -1;
      for (var cl = 0; cl < nColLayers; cl++) {
         var isM = false;
         try { isM = !!dl.getLayerMetadata(PHYS_COLUMN, cl, LM.LAYER_ISMEASURE_LABELS); } catch (e) {}
         if (!isM) { try { isM = tailName(dl.getLayerMetadata(PHYS_COLUMN, cl, LM.LAYER_ID)) === MEASURE_LAYER_ID; } catch (e) {} }
         if (isM) { mLayer = cl; break; }
      }
      for (var c = 0; c < nCols; c++) {
         if (mLayer === -1) { idByCol[c] = "__single__"; continue; }
         var id = null;
         try { id = dl.getValue(PHYS_COLUMN, mLayer, c, true); } catch (e) {}
         var name = null;
         try { name = dl.getValue(PHYS_COLUMN, mLayer, c, false); } catch (e) {}
         var idStr = id != null ? String(id) : (name != null && name !== "" ? String(name) : "__single__");
         idByCol[c] = idStr;
         if (!(idStr in nameById)) {
            nameById[idStr] = name == null ? idStr : String(name);
         }
      }
      return { idByCol: idByCol, nameById: nameById };
   }

   /** Ordered, de-duplicated column-index buckets, one per distinct measure id. */
   function bucketColsByMeasure(measureIdByCol) {
      var order = [], map = Object.create(null);
      measureIdByCol.forEach(function (id, cc) {
         if (!map[id]) { map[id] = []; order.push(id); }
         map[id].push(cc);
      });
      return { order: order, map: map };
   }

   /* =========================================================================
      3b. CELL COLOR — per-measure heat-map background on Values cells.
      A magnitude encoding, not a category palette, so a hardcoded sequential
      default is appropriate here (same reasoning as WSU Dumbbell's direction
      colors — see docs/oac_design.md §6.18, "not governed by this rule").
      Min/max are computed PER MEASURE (never across different measures, for
      the same reason totals are bucketed by measure) over the actual rendered
      rows only — not total/subtotal rows, which would always read "hottest"
      as a sum and defeat the scale.
      ========================================================================= */

   function computeMeasureRanges(dl, nRows, nCols, measureIdByCol, colHidden) {
      var ranges = Object.create(null);
      for (var cc = 0; cc < nCols; cc++) {
         if (colHidden && colHidden[cc]) continue;
         var mId = measureIdByCol[cc];
         var range = ranges[mId] || (ranges[mId] = { min: null, max: null });
         for (var r = 0; r < nRows; r++) {
            var v = null;
            try { v = dl.getValue(PHYS_DATA, r, cc, true); } catch (e) {}
            if (v == null) { try { v = dl.getValue(PHYS_DATA, r, cc); } catch (e) {} }
            if (v == null || v === "") continue;   // a blank cell is absent, not zero
            var n = Number(v);
            if (!isNaN(n)) {
               if (range.min == null || n < range.min) range.min = n;
               if (range.max == null || n > range.max) range.max = n;
            }
         }
      }
      return ranges;
   }

   function hexToRgb(hex) {
      var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
      return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
   }

   function relativeLuminance(rgb) {
      function linear(channel) {
         var value = channel / 255;
         return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
   }

   function readableForeground(rgb) {
      var bg = relativeLuminance(rgb);
      var darkContrast = (bg + 0.05) / 0.05;
      var lightContrast = 1.05 / (bg + 0.05);
      return darkContrast >= lightContrast ? "#000000" : "#ffffff";
   }

   /* Empty or invalid hex paints nothing, so the stylesheet default stays.
      Custom properties, not an inline background: the glossary hover rule
      is more specific and must still be able to cover the header. */
   function headerPaint(hex) {
      var rgb = hexToRgb(hex);
      if (!rgb) return { cls: "", style: "" };
      var fg = readableForeground(rgb);
      return {
         cls: " gp-hdr-paint",
         style: " style='--gp-hdr-bg:rgb(" + rgb.r + "," + rgb.g + "," + rgb.b + ");--gp-hdr-fg:" + fg + "'"
      };
   }

   /** @returns {{bg:string, fg:string}|null} background + a readable foreground for it, or null on bad input */
   function interpolateColor(lowHex, highHex, t) {
      var lo = hexToRgb(lowHex), hi = hexToRgb(highHex);
      if (!lo || !hi) return null;
      t = Math.max(0, Math.min(1, t));
      var r = Math.round(lo.r + (hi.r - lo.r) * t);
      var g = Math.round(lo.g + (hi.g - lo.g) * t);
      var b = Math.round(lo.b + (hi.b - lo.b) * t);
      return { bg: "rgb(" + r + "," + g + "," + b + ")", fg: readableForeground({ r: r, g: g, b: b }) };
   }

   /* =========================================================================
      3c. SORT — client-side reorder of a row buffer.
      The host hands over a read-only DataLayout in query order. Sort never
      changes what a layout row index means: marking (setMark) and collapse
      (_collapsedGroups) both address that index, so every buffered row
      carries it. getItemEndSlice is consulted only while the rows are still
      in delivery order, to learn outer-group membership; after the reorder,
      spans come from adjacency in the buffer.
      ========================================================================= */

   /* A sort key that no longer matches this render (a tray change dropped
      the layer or the column) is ignored rather than applied to whatever
      now sits at that index. The stored state is left alone so the next
      click on a real header replaces it cleanly. */
   function usableSort(state, nRowLayers, nCols, nColLayers) {
      if (!state) return null;
      if (state.kind === "row") {
         return state.key >= 0 && state.key < nRowLayers ? state : null;
      }
      if (state.kind === "col") {
         var layerOk = nColLayers === 0 ? state.layer === 0 : (state.layer >= 0 && state.layer < nColLayers);
         return layerOk && state.key >= 0 && state.key < nCols ? state : null;
      }
      return null;
   }

   function compareText(a, b) {
      var as = a == null ? "" : String(a);
      var bs = b == null ? "" : String(b);
      /* Both sides numeric: "10" must sort after "2". A mixed pair (a code
         and a name) stays a text compare so Number("Fall") === NaN doesn't
         collapse the name into a blank. */
      var an = Number(as), bn = Number(bs);
      if (as.trim() !== "" && bs.trim() !== "" && isFinite(an) && isFinite(bn)) {
         if (an < bn) return -1;
         if (an > bn) return 1;
         return 0;
      }
      return as.localeCompare(bs);
   }

   function compareNumeric(a, b) {
      var an = Number(a), bn = Number(b);
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
   }

   /* Blanks (and non-numeric measure cells) stay at the bottom in BOTH
      directions — multiplying the blank result by the direction would put
      every empty cell first as soon as the user clicks once more. Equal
      keys fall back to the original layout index, which is what "off"
      returns to and what keeps Array.sort stable without relying on the
      engine's sort being stable (it isn't, in ES5). */
   function sortCompare(a, b, state) {
      var av, bv, aBlank, bBlank, c;
      if (state.kind === "row") {
         av = a.rowVals[state.key];
         bv = b.rowVals[state.key];
         aBlank = av == null || String(av) === "";
         bBlank = bv == null || String(bv) === "";
         c = (aBlank || bBlank) ? 0 : compareText(av, bv);
      } else {
         av = a.raw[state.key];
         bv = b.raw[state.key];
         aBlank = av == null || av === "" || isNaN(Number(av));
         bBlank = bv == null || bv === "" || isNaN(Number(bv));
         c = (aBlank || bBlank) ? 0 : compareNumeric(av, bv);
      }
      if (aBlank || bBlank) {
         if (aBlank && bBlank) return a.r - b.r;
         return aBlank ? 1 : -1;
      }
      if (c === 0) return a.r - b.r;
      return state.dir === "desc" ? -c : c;
   }

   /**
    * One entry per DataLayout row, in delivery order. groupKey/groupStart/
    * groupEnd are the original outer-group span (getItemEndSlice on layer 0
    * while that call is still meaningful). groupKey is the collapse key.
    */
   function buildRowBuffer(dl, nRows, nRowLayers, nCols) {
      var groupKey = new Array(nRows);
      var groupStart = new Array(nRows);
      var groupEnd = new Array(nRows);
      var r = 0;
      while (r < nRows) {
         var end = r;
         if (nRowLayers > 0) {
            try { end = dl.getItemEndSlice(PHYS_ROW, 0, r); } catch (e) { end = r; }
            if (end == null || end < r) end = r;
            if (end >= nRows) end = nRows - 1;
         }
         for (var i = r; i <= end; i++) {
            groupKey[i] = r;
            groupStart[i] = r;
            groupEnd[i] = end;
         }
         r = end + 1;
      }

      var rows = new Array(nRows);
      for (var rr = 0; rr < nRows; rr++) {
         var rowVals = new Array(nRowLayers);
         for (var l = 0; l < nRowLayers; l++) {
            var rv = null;
            try { rv = dl.getValue(PHYS_ROW, l, rr, false); } catch (e) {}
            rowVals[l] = rv == null ? "" : String(rv);
         }
         var raw = new Array(nCols);
         var formatted = new Array(nCols);
         for (var cc = 0; cc < nCols; cc++) {
            var vRaw = null, vFormatted = null;
            try { vRaw = dl.getValue(PHYS_DATA, rr, cc, true); } catch (e) {}
            try { vFormatted = dl.getValue(PHYS_DATA, rr, cc); } catch (e) {}
            raw[cc] = vRaw;
            formatted[cc] = vFormatted;
         }
         rows[rr] = {
            r: rr,
            rowVals: rowVals,
            raw: raw,
            formatted: formatted,
            groupKey: groupKey[rr],
            groupStart: groupStart[rr],
            groupEnd: groupEnd[rr]
         };
      }
      return rows;
   }

   /**
    * With one Row layer (or none) this is a flat sort. With 2+ layers, a
    * layer-0 sort reorders the groups and leaves each group's internal
    * order alone — the layer-0 value does not vary inside the group, so
    * sorting inside it would not move a row. Every other key sorts inside
    * each layer-0 group and does not move the groups: that is what keeps
    * an outer rowspan, and the collapse key, meaningful after the reorder.
    * Intermediate layers (3+) can fragment; their spans are recomputed
    * from the buffer rather than preserved.
    */
   function orderRowsForSort(rows, state, nRowLayers) {
      if (!state || !rows.length) return rows;
      if (nRowLayers < 2) {
         var flat = rows.slice();
         flat.sort(function (a, b) { return sortCompare(a, b, state); });
         return flat;
      }

      var byR = new Array(rows.length);
      for (var i = 0; i < rows.length; i++) byR[rows[i].r] = rows[i];

      var groups = [];
      var seen = Object.create(null);
      for (var j = 0; j < rows.length; j++) {
         var k = rows[j].groupKey;
         if (seen[k]) continue;
         seen[k] = 1;
         groups.push(rows[j]);
      }

      var out = [];
      if (state.kind === "row" && state.key === 0) {
         var ordered = groups.slice();
         ordered.sort(function (a, b) { return sortCompare(a, b, state); });
         for (var g = 0; g < ordered.length; g++) {
            var rep = ordered[g];
            for (var rr = rep.groupStart; rr <= rep.groupEnd; rr++) out.push(byR[rr]);
         }
         return out;
      }

      for (var g2 = 0; g2 < groups.length; g2++) {
         var rep2 = groups[g2];
         var chunk = [];
         for (var rr2 = rep2.groupStart; rr2 <= rep2.groupEnd; rr2++) chunk.push(byR[rr2]);
         chunk.sort(function (a, b) { return sortCompare(a, b, state); });
         for (var t = 0; t < chunk.length; t++) out.push(chunk[t]);
      }
      return out;
   }

   /* A visual span whose original indexes still form an unbroken range
      stays "start:end" — that is what an outer group always is, and what
      _wireMarking already understood. A span that sort pulled apart (two
      rows with the same inner label, no longer neighbors in layout order)
      lists the indexes, because start:end would mark the rows in between
      that now belong to a different header. */
   function markRowsAttr(indices) {
      if (!indices.length) return "";
      var min = indices[0], max = indices[0];
      for (var i = 1; i < indices.length; i++) {
         if (indices[i] < min) min = indices[i];
         if (indices[i] > max) max = indices[i];
      }
      if (max - min + 1 === indices.length) return min + ":" + max;
      return indices.join(",");
   }

   function sameHeaderRun(prev, cur, layer) {
      if (!prev || prev.groupKey !== cur.groupKey) return false;
      for (var a = 0; a <= layer; a++) {
         if (prev.rowVals[a] !== cur.rowVals[a]) return false;
      }
      return true;
   }

   /* =========================================================================
      4. RENDER
      Reads data ONLY through the documented DataLayout methods, so this is the
      same logic proven in prototype/pivot-hover-preview.html.
      ========================================================================= */

   GlossaryPivotViz.prototype._render = function (oTransientRenderingContext) {
      /* try/finally with _setIsRendered mirrors the dumbbell — without it OAC
         may treat the viz as perpetually unrendered (stuck busy indicator,
         unreliable export/ready signalling). */
      try {
         this._doRender(oTransientRenderingContext);
      } finally {
         try { this._setIsRendered(true); } catch (e) {}
      }
   };

   GlossaryPivotViz.prototype._doRender = function (oTransientRenderingContext) {
      /* Resilience net for _doInitializeComponent, see _registerPrintCanvas —
         called unconditionally, before the early returns below, so a canvas
         whose init hook was skipped is still print-capable the moment it
         renders anything, even an empty state. */
      this._registerPrintCanvas();
      this._renderRevision++;
      var elContainer = this.getContainerElem();
      if (!elContainer) return;

      this.loadConfig();

      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      if (!oDataLayout) {
         this._lastDataLayout = null;
         this._markedRows = Object.create(null);
         $(elContainer).html("<div class='gp-empty'>" + escapeHtml(LBL.EMPTY_STATE) + "</div>");
         return;
      }
      this._lastDataLayout = oDataLayout;

      /* The live map is a snapshot, not an append-only feed. Rebuilding the
         index lets a deleted or changed workbook description disappear. */
      this._glossary = buildGlossary();

      /* Live source: a synchronous, cheap map read on EVERY render, because
         OAC fills the column-info map as columns are added. Runs before the
         table build so first paint already shows live text. Skipped entirely
         when the viewer turned descriptions off. */
      var infoMap = null;
      if (this.Config.showDescriptions !== "off" || this.Config.debugLogMetadata === "on") {
         try {
            infoMap = readColumnInfoMap(oTransientRenderingContext, this);
            if (infoMap && this.Config.showDescriptions !== "off") {
               this._glossary.mergeLive(descriptionsFromColumnInfoMap(infoMap));
            } else if (!infoMap && !this._mapMissingLogged) {
               /* Loud, once: a future OAC build renaming the path must not
                  silently drop every tooltip on this pivot — live text and
                  workbook overrides both come from this one map, and there
                  is no bundled tier left to fall back to since v0.16.0. */
               this._mapMissingLogged = true;
               _logger.warning("column-info map not found on the rendering context — no glossary tooltips will show");
            }
         } catch (e) {
            _logger.warning("column-info map read failed: " + (e && e.message ? e.message : e));
         }
      }

      /* Opt-in metadata diagnostic. Log IDs and origins only; the complete
         rendering context can contain student-level DataLayout values. */
      if (this.Config.debugLogMetadata === "on") {
         try {
            _logger.info("[debug] column-info ids: " + (infoMap ? Object.keys(infoMap).join(", ") : "none"));
            var debugDescriptions = infoMap ? descriptionsFromColumnInfoMap(infoMap) : {};
            _logger.info("[debug] description origins: " + Object.keys(debugDescriptions).map(function (id) {
               return id + "=" + debugDescriptions[id].origin;
            }).join(", "));
         } catch (e) {}
      }

      var html;
      try {
         html = this._buildTable(oDataLayout);
      } catch (e) {
         html = "<div class='gp-empty'>" + escapeHtml(LBL.RENDER_ERROR) +
                escapeHtml("" + (e && e.message || e)) + "</div>";
         _logger.error("render failed: " + (e && e.stack || e));
      }

      this._replaceTableHtml(elContainer, html);
      if (this.Config.showDescriptions !== "off") this._wireTooltips(elContainer);
      this._wireMarking(elContainer);
      this._wireKeyboardRows(elContainer);
      this._wireGroupToggle(elContainer);
      this._wireSort(elContainer);
      this._applyMarkedRows();
   };

   /**
    * Swaps in new table HTML while preserving .gp-wrap's scroll position.
    * innerHTML replacement resets scroll to (0,0) by default — on a wide or
    * tall pivot, a group-collapse click or a resize would otherwise always
    * jump the viewer back to the top-left, discarding wherever they were.
    */
   /**
    * Repeats a rowspan's text on each body row it covered, then drops the
    * span. A page break otherwise opens on the blank cells under a span
    * that started on the previous page. `rows` is an array of cell arrays.
    * A cell is {html, colspan, rowspan}. Colspan is unchanged.
    */
   function expandBodyRowspans(rows) {
      var pending = [];
      var out = [];
      function waiting(col) { return pending[col] && pending[col].left > 0; }
      for (var r = 0; r < rows.length; r++) {
         var src = rows[r];
         var dst = [];
         var col = 0;
         var si = 0;
         var steps = 0;
         var cap = (src.length + 1) * 8 + 32;
         while ((si < src.length || waiting(col)) && steps < cap) {
            steps++;
            if (waiting(col)) {
               var hold = pending[col];
               dst.push({ html: hold.html, colspan: hold.colspan, tag: hold.tag, className: hold.className, style: hold.style, scope: hold.scope });
               hold.left -= 1;
               if (hold.left <= 0) pending[col] = null;
               col += hold.colspan;
            } else {
               var cell = src[si++];
               var colspan = cell.colspan || 1;
               var rowspan = cell.rowspan || 1;
               dst.push({ html: cell.html, colspan: colspan, tag: cell.tag, className: cell.className, style: cell.style, scope: cell.scope });
               if (rowspan > 1) {
                  pending[col] = {
                     html: cell.html, colspan: colspan, left: rowspan - 1,
                     tag: cell.tag, className: cell.className, style: cell.style, scope: cell.scope
                  };
               }
               col += colspan;
            }
         }
         out.push(dst);
      }
      return out;
   }

   function stripInteractive(el) {
      if (!el.querySelectorAll) return;
      var junk = el.querySelectorAll(".gp-group-toggle, .gp-sort-ind");
      for (var i = junk.length - 1; i >= 0; i--) {
         if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
      }
   }

   function cellsFromRow(tr) {
      var cells = tr.cells;
      var out = [];
      for (var i = 0; i < cells.length; i++) {
         var el = cells[i];
         stripInteractive(el);
         out.push({
            tag: el.tagName.toLowerCase(),
            className: el.className || "",
            style: el.getAttribute("style") || "",
            scope: el.getAttribute("scope") || "",
            html: el.innerHTML,
            colspan: el.colSpan || 1,
            rowspan: el.rowSpan || 1
         });
      }
      return out;
   }

   function rebuildBody(body, flat, classNames) {
      while (body.firstChild) body.removeChild(body.firstChild);
      for (var r = 0; r < flat.length; r++) {
         var tr = document.createElement("tr");
         if (classNames[r]) tr.className = classNames[r];
         var cells = flat[r];
         for (var c = 0; c < cells.length; c++) {
            var cell = cells[c];
            var el = document.createElement(cell.tag || "td");
            if (cell.className) el.className = cell.className;
            if (cell.style) el.setAttribute("style", cell.style);
            if (cell.scope) el.setAttribute("scope", cell.scope);
            if (cell.colspan > 1) el.colSpan = cell.colspan;
            el.innerHTML = cell.html;
            tr.appendChild(el);
         }
         body.appendChild(tr);
      }
   }

   /**
    * DOM half of print prep: expand rowspans, stamp a title row into the
    * table's own thead (so it repeats per page for THIS table, same as the
    * column headers), and hand back the table's own outerHTML — nothing
    * document-level yet. Returns null when tableHtml has no <table> (mirrors
    * _buildTable's empty-state markup, which is a <div>, not a table).
    * Reused for both a single-table print and one section of a canvas print;
    * the canvas case calls this once per registered instance so every
    * section's headers repeat on their own pages independently.
    */
   function preparePrintTable(tableHtml, title) {
      var holder = document.createElement("div");
      holder.innerHTML = tableHtml;
      var table = holder.getElementsByTagName("table")[0];
      if (!table) return null;
      var bodies = table.getElementsByTagName("tbody");
      if (bodies.length) {
         var body = bodies[0];
         var trs = body.getElementsByTagName("tr");
         var model = [];
         var classNames = [];
         for (var i = 0; i < trs.length; i++) {
            classNames.push(trs[i].className || "");
            model.push(cellsFromRow(trs[i]));
         }
         rebuildBody(body, expandBodyRowspans(model), classNames);
      }
      var heads = table.getElementsByTagName("thead");
      if (heads.length) {
         var head = heads[0];
         var first = head.getElementsByTagName("tr")[0];
         var span = 1;
         if (first && first.cells) {
            span = 0;
            for (var h = 0; h < first.cells.length; h++) span += first.cells[h].colSpan || 1;
            if (!span) span = 1;
         }
         var titleRow = document.createElement("tr");
         var titleCell = document.createElement("th");
         titleCell.setAttribute("scope", "colgroup");
         if (title && String(title).trim()) {
            titleCell.className = "gp-print-title";
            titleCell.colSpan = span;
            titleCell.appendChild(document.createTextNode(String(title).trim()));
            titleRow.appendChild(titleCell);
            head.insertBefore(titleRow, head.firstChild);
         }
      }
      return table.outerHTML;
   }

   /**
    * Joins one or more prepared (preparePrintTable output) table sections
    * into one print body — so a single-table print (one section) and a
    * canvas print (several) share the exact same document wrapper below.
    * Pure string work, no DOM; unit-tested directly (tests/run.js).
    *
    * forceBreaks true puts a page break before every section after the
    * first (Print: Canvas Page Breaks = "One page per report") — a short
    * report still gets a whole page to itself. false (the compact option)
    * adds no break at all: sections just flow one after another, and a
    * section only starts a new page when it does not fit on what is left
    * of the current one. Either way, a section's own thead (title + column
    * headers, from preparePrintTable) still repeats if THAT section alone
    * spans more than one page — that repeat comes from
    * `thead { display: table-header-group }` in wrapPrintDocument's CSS,
    * not from anything here.
    *
    * The break style, when applied, is set on the <table> element itself,
    * not on a wrapping <div>. A forced break on an ancestor that takes no
    * part in the table's own pagination is a known Chrome source of an
    * extra blank page between sections, or a break landing inside the
    * header instead of before it — the table is the element actually being
    * paginated, so the break belongs on it.
    */
   function joinPrintSections(tableHtmls, forceBreaks) {
      return tableHtmls.map(function (html, i) {
         if (i === 0 || !forceBreaks) return html;
         return html.replace(/^<table\b/, "<table style='page-break-before:always;break-before:page'");
      }).join("");
   }

   /** Letter paper. @page margin repeats on every page; body padding does not. */
   function marginInches(value) {
      if (value === "narrow") return 0.25;
      if (value === "wide") return 1;
      return 0.5;
   }

   function printPageBox(marginValue, orient) {
      var inches = marginInches(marginValue);
      var landscape = orient !== "portrait";
      var pageWidth = landscape ? 11 : 8.5;
      var pageHeight = landscape ? 8.5 : 11;
      return {
         margin: inches + "in",
         padding: "0",
         orient: landscape ? "landscape" : "portrait",
         /* Explicit inches. "letter landscape" is ignored when the print
            frame itself is a wide rectangle, and the dialog stays on
            whichever orientation was used last. */
         size: pageWidth + "in " + pageHeight + "in",
         contentWidthIn: pageWidth - inches * 2,
         contentHeightIn: pageHeight - inches * 2
      };
   }

   /** 1 when the table already fits. Otherwise the scale that fits the page width. */
   function fitScale(contentPx, marginValue, orient) {
      var target = printPageBox(marginValue, orient).contentWidthIn * 96;
      if (!contentPx || contentPx <= target) return 1;
      return Math.round((target / contentPx) * 1000) / 1000;
   }

   /* Matches the body font-size in wrapPrintDocument. fitPrintedReport scales
      a too-wide table's own font-size down from this base — a table's own
      inline style always wins the cascade over the body rule, so setting it
      only on tables that need it leaves every other table at the base size. */
   var BASE_FONT_PT = 9;
   /* At this floor the author must reduce columns or labels, or change the
      selected orientation or margins. The plugin does not squeeze further. */
   var MIN_FONT_PT = 6;

   /**
    * An initial size estimate. fitPrintedReport remeasures after each font
    * change because cell padding and title text do not shrink with it.
    * Automatic table layout preserves readable column widths.
    */
   function printTableLayout(contentPx, marginValue, orient, tableSize) {
      var scale = Math.max(MIN_FONT_PT / BASE_FONT_PT, fitScale(contentPx, marginValue, orient));
      return {
         scale: scale,
         width: scale >= 1 && tableSize !== "content" ? "100%" : "max-content",
         layout: "auto"
      };
   }

   function measuredTableWidth(table) {
      var rect = table.getBoundingClientRect();
      return Math.max(rect ? rect.width || 0 : 0, table.scrollWidth || 0);
   }

   function fitPrintedReport(doc, orient, marginValue, tableSizes) {
      var tables = doc.getElementsByTagName("table");
      var target = printPageBox(marginValue, orient).contentWidthIn * 96;
      var overflowCount = 0;
      var i;
      for (i = 0; i < tables.length; i++) {
         var table = tables[i];
         var size = tableSizes && tableSizes[i] === "content" ? "content" : "margins";
         table.style.width = "max-content";
         table.style.tableLayout = "auto";
         table.style.fontSize = BASE_FONT_PT + "pt";
         var natural = measuredTableWidth(table);
         if (natural > target) {
            var lower = MIN_FONT_PT * 10;
            var upper = BASE_FONT_PT * 10;
            table.style.fontSize = MIN_FONT_PT + "pt";
            if (measuredTableWidth(table) > target) {
               overflowCount++;
               continue;
            }
            while (lower < upper) {
               var mid = Math.ceil((lower + upper + 1) / 2);
               table.style.fontSize = (mid / 10) + "pt";
               if (measuredTableWidth(table) <= target) lower = mid;
               else upper = mid - 1;
            }
            table.style.fontSize = (lower / 10) + "pt";
         }
         if (size === "margins") table.style.width = "100%";
      }
      return overflowCount;
   }

   function usableCssColor(value) {
      if (value == null) return "";
      var v = String(value).replace(/\s+/g, " ").trim();
      if (!v || v === "initial" || v === "inherit" || v === "unset" || v === "transparent" || v === "rgba(0, 0, 0, 0)") return "";
      var rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb && +rgb[1] > 245 && +rgb[2] > 245 && +rgb[3] > 245) return "";
      return v;
   }

   /** A host call-to-action button, skipping anything inside this viz. */
   function readHostButtonColor(fromEl) {
      if (!document.querySelector) return null;
      var selectors = [
         "button.oj-button-cta",
         ".oj-button-cta .oj-button-button",
         ".oj-button-primary .oj-button-button"
      ];
      var i;
      for (i = 0; i < selectors.length; i++) {
         var node = null;
         try { node = document.querySelector(selectors[i]); } catch (e) { node = null; }
         if (!node) continue;
         try { if (fromEl && (fromEl === node || fromEl.contains(node))) continue; } catch (e2) { continue; }
         try {
            var st = window.getComputedStyle(node);
            var bg = usableCssColor(st.backgroundColor);
            if (!bg) continue;
            return { bg: bg, fg: usableCssColor(st.color) || "#ffffff" };
         } catch (e3) {}
      }
      return null;
   }

   /**
    * Follow Theme leaves --wsu-btn-bg unset so the stylesheet can use the
    * host accent variables. A sampled host button wins when one is on the
    * page. Off pins the original green.
    */
   function applyPrintTheme(el, follow) {
      if (!el || !el.style) return;
      if (follow !== "on") {
         el.style.setProperty("--wsu-btn-bg", "#1f6f6b");
         el.style.setProperty("--wsu-btn-fg", "#ffffff");
         return;
      }
      var accent = null;
      try { accent = readHostButtonColor(el); } catch (e) { accent = null; }
      if (!accent) {
         el.style.removeProperty("--wsu-btn-bg");
         el.style.removeProperty("--wsu-btn-fg");
         return;
      }
      el.style.setProperty("--wsu-btn-bg", accent.bg);
      el.style.setProperty("--wsu-btn-fg", accent.fg);
   }

   function wrapPrintDocument(title, orient, bodyHtml, marginValue) {
      var box = printPageBox(marginValue, orient);
      return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
         escapeHtml(title) + "</title><style>" +
         "@page { size: " + box.size + "; margin: " + box.margin + "; }" +
         "html, body { margin: 0; padding: 0; width: " + box.contentWidthIn + "in; color: #1b1f24; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }" +
         "table { border-collapse: collapse; width: max-content; }" +
         /* Prefer a word boundary; force a mid-word break only when one word
            exceeds its column. Keep automatic table layout for print. */
         "th, td { border: 1px solid #b7bcc2; padding: 3px 6px; vertical-align: top; white-space: normal; word-break: normal; overflow-wrap: break-word; }" +
         "thead { display: table-header-group; }" +
         "tr { break-inside: avoid; page-break-inside: avoid; }" +
         "th { background: #f0f2f4; font-weight: 700; text-align: center; }" +
         "th.gp-print-title, th.title { background: #ffffff; color: #1b1f24; font-size: 13pt; font-weight: 700; text-align: left; border: none; border-bottom: 1px solid #b7bcc2; padding: 0 0 8px; }" +
         "th.gp-rowhdr, th.gp-corner, td.rh { text-align: left; background: #f7f8f9; }" +
         "td.gp-val, td.num, td.total { text-align: right; font-variant-numeric: tabular-nums; }" +
         "tr.gp-total-row th, tr.gp-total-row td, tr.total td { font-weight: 700; background: #eef2f4; }" +
         "td.total .lbl { display: block; text-align: left; }" +
         "td.gp-heat { background: var(--gp-cell-bg); color: var(--gp-cell-fg); }" +
         "th, tr.gp-total-row td, tr.total td, td.gp-heat { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
         "</style></head><body>" + bodyHtml + "</body></html>";
   }

   /**
    * A hidden iframe, not a real window/tab. Tried a real window in between
    * (0.14.9–0.14.11) so the report was visible before printing — the
    * visible surface it created (a tab with normal browser chrome) was
    * itself the complaint: an extra tab to manage, on top of the print
    * dialog. Back to invisible: the only thing a viewer ever sees now is
    * the print dialog itself.
    *
    * The frame's own box must never be shorter than the document it holds.
    * @page { size: ... }, already in the document, is what Chrome measures
    * pagination and orientation against — the frame's pixel box only needs
    * to be tall enough that no content sits outside it. Pinning it to
    * exactly one page's worth of pixels (the version before 0.14.9) is
    * what clipped a multi-page report down to a single printed page.
    */
   var activePrintJob = null;
   /* Some engines return from print() before the preview is dismissed.
      afterprint is the normal cleanup; this is only a recovery gate when an
      engine never sends it, not a timer that destroys the live frame. */
   var PRINT_RECOVERY_MS = 30000;

   function cleanupPrintJob(job) {
      if (!job || job.cleaned) return;
      job.cleaned = true;
      try { job.win.onafterprint = null; } catch (e) {}
      try { if (job.iframe.parentNode) job.iframe.parentNode.removeChild(job.iframe); } catch (e2) {}
      if (job.owner._printFrame === job.iframe) job.owner._printFrame = null;
      if (activePrintJob === job) activePrintJob = null;
   }

   function openGlossaryPrint(self, html, orient, marginValue, tableSizes) {
      var job = null;
      try {
         if (activePrintJob) {
            /* A fast second click must not remove the frame while a browser
               is still creating its print preview. */
            if (!activePrintJob.printReturned || Date.now() - activePrintJob.started < PRINT_RECOVERY_MS) {
               return { ok: false, busy: true };
            }
            cleanupPrintJob(activePrintJob);
         }
         var box = printPageBox(marginValue, orient);
         var pageW = Math.max(1, Math.round(box.contentWidthIn * 96));
         var pageH = Math.max(1, Math.round(box.contentHeightIn * 96));
         var iframe = document.createElement("iframe");
         iframe.setAttribute("title", "Report print");
         iframe.setAttribute("aria-hidden", "true");
         iframe.setAttribute("tabindex", "-1");
         /* Measure in a wide frame so a long table reports its real width. */
         iframe.setAttribute("style",
            "position:fixed;width:2400px;height:900px;border:0;left:-12000px;top:0;");
         document.body.appendChild(iframe);
         self._printFrame = iframe;
         job = { owner: self, iframe: iframe, win: null, started: Date.now(), printReturned: false, cleaned: false };
         activePrintJob = job;
         var win = iframe.contentWindow;
         job.win = win;
         var doc = win.document;
         doc.open();
         doc.write(html);
         doc.close();
         if (doc.body) doc.body.getBoundingClientRect();
         var overflowCount = fitPrintedReport(doc, orient, marginValue, tableSizes);
         iframe.style.width = pageW + "px";
         /* Force layout at the narrower print width before measuring — a
            table that now wraps onto more lines needs to report the height
            it actually has at this width, not the one it measured in the
            2400px-wide frame above. */
         if (doc.body) doc.body.getBoundingClientRect();
         var contentHeightPx = pageH;
         try {
            var measuredHeight = Math.max(
               doc.documentElement ? doc.documentElement.scrollHeight : 0,
               doc.body ? doc.body.scrollHeight : 0
            );
            if (measuredHeight > contentHeightPx) contentHeightPx = measuredHeight;
         } catch (eH) {}
         iframe.style.height = contentHeightPx + "px";
         if (doc.body) doc.body.getBoundingClientRect();
         win.onafterprint = function () { cleanupPrintJob(job); };
         win.focus();
         win.print();
         job.printReturned = true;
         return { ok: true, overflowCount: overflowCount };
      } catch (e) {
         cleanupPrintJob(job);
         _logger.error("print failed: " + (e && e.message ? e.message : e));
         return { ok: false };
      }
   }

   function plainTitle(s) {
      var text = String(s == null ? "" : s);
      var prev = "";
      var i;
      /* Decode first, then strip tags, and repeat. A rich-text title arrives
         either as <p><strong>Dataset</strong></p> or as the escaped form of
         that same markup. */
      for (i = 0; i < 3 && text !== prev; i++) {
         prev = text;
         text = text
            .replace(/&nbsp;/gi, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/<[^>]*>/g, "");
      }
      return text.replace(/\s+/g, " ").trim();
   }

   function stringTitle(v) {
      try {
         if (v == null) return "";
         if (typeof v === "string" || typeof v === "number") return plainTitle(v);
         if (typeof v.text === "string") return plainTitle(v.text);
         if (typeof v.html === "string") return plainTitle(v.html);
         if (Object.prototype.toString.call(v) === "[object Array]") {
            var parts = [];
            var i;
            for (i = 0; i < v.length; i++) {
               var piece = stringTitle(v[i]);
               if (piece) parts.push(piece);
            }
            return plainTitle(parts.join(" "));
         }
      } catch (e) {}
      return "";
   }

   function titleFromObject(obj) {
      if (!obj) return "";
      var direct = "";
      try {
         direct = stringTitle(obj.title) || stringTitle(obj.vizTitle) || stringTitle(obj.caption) || stringTitle(obj.viewTitle);
      } catch (e) { direct = ""; }
      if (direct) return direct;
      var names = ["getVisualizationTitle", "getVizTitle", "getViewTitle", "getTitle", "getCaption"];
      var i;
      for (i = 0; i < names.length; i++) {
         if (typeof obj[names[i]] !== "function") continue;
         try {
            var called = stringTitle(obj[names[i]]());
            if (called) return called;
         } catch (e) {}
      }
      if (typeof obj.getProperty === "function") {
         var keys = ["title", "vizTitle", "caption", "viewTitle"];
         for (i = 0; i < keys.length; i++) {
            try {
               var prop = stringTitle(obj.getProperty(keys[i]));
               if (prop) return prop;
            } catch (e2) {}
         }
      }
      return "";
   }

   /**
    * The visualization title set in the editor. That title is host chrome,
    * outside this plugin's container, so it is not Config. A blank editor
    * title means the printed section has no title row.
    */
   function editorTitle(self) {
      var fromHost = titleFromObject(self);
      if (!fromHost) {
         try { fromHost = titleFromObject(self.getViewModel && self.getViewModel()); } catch (e) {}
      }
      if (!fromHost) {
         try {
            var settings = self.getSettings && self.getSettings();
            var ns = dataviz.SettingsNS || {};
            var keys = [ns.GENERAL, ns.VIEW, "general", "view"];
            for (var k = 0; k < keys.length && !fromHost; k++) {
               if (!keys[k] || !settings || !settings.getViewConfigJSON) continue;
               try { fromHost = titleFromObject(settings.getViewConfigJSON(keys[k])); } catch (e2) {}
            }
         } catch (e3) {}
      }
      if (fromHost) return fromHost;
      var el = null;
      try { el = self.getContainerElem(); } catch (e4) { el = null; }
      if (!el || !el.parentNode || !document.querySelectorAll) return "";
      var node = el.parentNode;
      var hops = 0;
      while (node && hops < 8 && node !== document.documentElement) {
         var nodes = [];
         try { nodes = node.querySelectorAll("[class*='title'], [class*='Title']"); } catch (e5) { nodes = []; }
         for (var n = 0; n < nodes.length; n++) {
            var candidate = nodes[n];
            var inside = false;
            try { inside = (el.contains && el.contains(candidate)) || (candidate.contains && candidate.contains(el)); } catch (e6) { inside = false; }
            if (!candidate || candidate === el || inside) continue;
            var tag = candidate.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SCRIPT") continue;
            var text = plainTitle(candidate.textContent || "");
            if (!text || text.length > 180) continue;
            if (text === "Title" || text === "Print PDF" || text === "Print Canvas") continue;
            return text;
         }
         node = node.parentNode;
         hops++;
      }
      return "";
   }

   /**
    * Builds this instance's own printable fragment: raw table markup (not
    * yet rowspan-expanded — preparePrintTable does that) plus the title to
    * stamp on it. Collapsed groups are expanded for the duration of the
    * build only; the finally restores _collapsedGroups even if _buildTable
    * throws, so a failed print build never leaves the on-screen pivot
    * showing a different collapse state than the viewer left it in. Shared
    * by _printTable (this instance alone) and the Print Canvas registry
    * entry (see _doInitializeComponent) — same fragment either way, only
    * the document wrapper differs.
    */
   GlossaryPivotViz.prototype._buildPrintFragment = function () {
      var container = null;
      try { container = this.getContainerElem(); } catch (e0) { return null; }
      if (!container || (document.documentElement && document.documentElement.contains &&
          !document.documentElement.contains(container))) return null;
      var dl = this._lastDataLayout;
      var saved = this._collapsedGroups;
      var tableHtml = null;
      if (dl) {
         this._collapsedGroups = Object.create(null);
         try {
            tableHtml = this._buildTable(dl);
         } catch (e) {
            _logger.error("print build failed: " + (e && e.message ? e.message : e));
         } finally {
            this._collapsedGroups = saved;
         }
      }
      if (!tableHtml || tableHtml.indexOf("<table") < 0) {
         try { tableHtml = tableHtmlFromDom(this); } catch (e2) { tableHtml = ""; }
      }
      if (!tableHtml || tableHtml.indexOf("<table") < 0) return null;
      var title = "";
      try { title = editorTitle(this); } catch (e3) { title = ""; }
      return { title: title, html: tableHtml };
   };

   /** The table currently on screen. Used when a second layout read fails. */
   function tableHtmlFromDom(self) {
      var el = null;
      try { el = self.getContainerElem(); } catch (e) { return ""; }
      if (!el || !el.querySelector) return "";
      var table = el.querySelector("table.gp-table");
      return table ? table.outerHTML : "";
   }

   function printCanvasKey(self, prefix) {
      var id = "";
      try { id = String(self.getID() || ""); } catch (e) { id = ""; }
      return prefix + id + "-" + Math.random().toString(36).slice(2);
   }

   GlossaryPivotViz.prototype._printTable = function () {
      try {
         var fragment = this._buildPrintFragment();
         if (!fragment) return { ok: false, error: "empty" };
         var prepared = null;
         try { prepared = preparePrintTable(fragment.html, fragment.title); } catch (e) { prepared = null; }
         var html = prepared || fragment.html;
         if (!html || html.indexOf("<table") < 0) return { ok: false, error: "empty" };
         var orient = this.Config.printOrientation === "portrait" ? "portrait" : "landscape";
         /* Single section — forceBreaks is moot (there is no "before the
            first section" break either way) but false documents that
            Print: Canvas Page Breaks does not apply to a solo Print PDF. */
         var docHtml = wrapPrintDocument(fragment.title || "Report", orient, joinPrintSections([html], false), this.Config.printMargin);
         var printed = openGlossaryPrint(this, docHtml, orient, this.Config.printMargin, [this.Config.printTableSize]);
         if (!printed.ok) return { ok: false, error: printed.busy ? "busy" : "print" };
         return { ok: true, warning: printed.overflowCount ? LBL.PRINT_OVERFLOW : "" };
      } catch (e) {
         _logger.error("print failed: " + (e && e.message ? e.message : e));
         return { ok: false, error: "print" };
      }
   };

   /**
    * Print Canvas: every print-capable instance currently registered in
    * window.__wsuPrintCanvas (see _doInitializeComponent) — including this
    * one — is asked to build its own fragment. A section whose build()
    * throws or returns nothing is skipped, not fatal to the rest of the
    * canvas. Sections are ordered by panel-relative top/left position, with
    * DOM position as a tie breaker, so the printed order matches the layout
    * regardless of which viz mounted first. Orientation and the overall
    * document title come from the instance whose button was clicked — @page
    * is document-wide, there is no per-section override.
    */
   function canvasPanelFor(el) {
      var node = el;
      while (node && node !== document.documentElement) {
         if (typeof node.className === "string" &&
             (" " + node.className + " ").indexOf(" bitech-rui-tab-panel-wrapper ") >= 0) return node;
         node = node.parentNode;
      }
      return null;
   }

   /* The selected tab's own DOM id is built from a DIFFERENT template
      depending on which widget is currently hosting the canvas tabs:
      confirmed live on the tenant, the read/view host
      (insightComponentManager_N) ids its selected tab
      "<mgr>-tabitem-snapshot!<suffix>", but the in-place editor host that
      is live for the entire time a property panel is open
      (canvasComponentManager_N — a different manager id, not just a
      different id on the same one) ids the same tab
      "<mgr>-tabitem-<suffix>", with no "snapshot!" infix. A template that
      only matched the first form made every Print Canvas click taken
      while editing properties (Print Orientation, or any other property)
      see zero selected tabs and fail closed, even on the tab actually on
      screen. `data-bi-item-id` is stable across both hosts: it is exactly
      the panel suffix in the editor host, and "snapshot!" + the panel
      suffix in the read host. Matching on that (with the optional
      "snapshot!" prefix stripped) instead of reconstructing the id
      string is what survives both conventions; re-check both hosts' live
      DOM before changing this again. */
   function selectedCanvasPanel(panel) {
      if (!panel || !panel.id || !panel.parentNode || !panel.parentNode.parentNode) return false;
      var manager = panel.parentNode.parentNode;
      if (!manager.id || panel.id.indexOf(manager.id + "-") !== 0 || !manager.querySelector) return false;
      var selected = manager.querySelector("[role='tab'][aria-selected='true']") ||
         manager.querySelector("[role='tab'].bitech-rui-tab-selected");
      if (!selected) return false;
      var suffix = panel.id.slice(manager.id.length + 1);
      var itemId = selected.getAttribute ? (selected.getAttribute("data-bi-item-id") || "") : "";
      if (itemId) return itemId === suffix || itemId === "snapshot!" + suffix;
      /* No data-bi-item-id on this host: fall back to the original id
         template rather than fail open. */
      return selected.id === manager.id + "-tabitem-snapshot!" + suffix;
   }

   function inVisibleCanvasTree(el, panel) {
      if (!el || !el.getBoundingClientRect) return false;
      if (document.documentElement && document.documentElement.contains &&
          !document.documentElement.contains(el)) return false;
      var node = el;
      while (node) {
         if (node.hidden || (node.getAttribute &&
             (node.getAttribute("aria-hidden") === "true" || node.getAttribute("inert") !== null))) return false;
         try {
            var css = window.getComputedStyle(node);
            if (css && (css.display === "none" || css.visibility === "hidden" || css.visibility === "collapse")) return false;
         } catch (e) { return false; }
         if (node === panel) break;
         node = node.parentNode;
      }
      var rect;
      try { rect = el.getBoundingClientRect(); } catch (e2) { return false; }
      return !!rect && rect.width > 0 && rect.height > 0;
   }

   function collectPrintCanvasEntries(selfEl, registry) {
      var panel = canvasPanelFor(selfEl);
      if (panel && !selectedCanvasPanel(panel)) return [];
      var panelRect = { top: 0, left: 0 };
      if (panel) {
         try { panelRect = panel.getBoundingClientRect(); } catch (e0) { return []; }
         if (!panelRect) return [];
      }
      var entries = [];
      Object.keys(registry || {}).forEach(function (id) {
         var entry = registry[id];
         if (!entry || typeof entry.build !== "function" || typeof entry.getContainer !== "function") return;
         var el;
         try { el = entry.getContainer(); } catch (e) { return; }
         if (!el || (panel ? canvasPanelFor(el) !== panel : el !== selfEl)) return;
         if (!inVisibleCanvasTree(el, panel || el)) return;
         var rect;
         try { rect = el.getBoundingClientRect(); } catch (e2) { return; }
         entries.push({ entry: entry, el: el, top: rect.top - panelRect.top, left: rect.left - panelRect.left });
      });
      entries.sort(function (a, b) {
         if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
         if (a.left !== b.left) return a.left - b.left;
         try {
            var pos = a.el.compareDocumentPosition(b.el);
            if (pos & 4) return -1;
            if (pos & 2) return 1;
         } catch (e) {}
         return 0;
      });
      return entries.map(function (item) { return item.entry; });
   }

   GlossaryPivotViz.prototype._printCanvas = function () {
      try {
      var registry = window.__wsuPrintCanvas || {};
      var entries = collectPrintCanvasEntries(this.getContainerElem(), registry);
      if (!entries.length) return { ok: false, error: "empty" };

      var tableHtmls = [];
      var tableSizes = [];
      var mixedOrientation = false;
      var orient = this.Config.printOrientation === "portrait" ? "portrait" : "landscape";
      entries.forEach(function (entry) {
         var fragment = null;
         try { fragment = entry.build(); } catch (e) {
            _logger.error("canvas print: a section failed to build: " + (e && e.message ? e.message : e));
         }
         /* build() already returned the table Print PDF would place in the
            document. Joining that html is the whole step. */
         if (fragment && fragment.html && fragment.html.indexOf("<table") >= 0) {
            tableHtmls.push(fragment.html);
            tableSizes.push(fragment.printTableSize === "content" ? "content" : "margins");
            if (fragment.printOrientation && fragment.printOrientation !== orient) mixedOrientation = true;
         }
      });
      if (!tableHtmls.length) return { ok: false, error: "empty" };

      var docTitle = "Report";
      try { docTitle = editorTitle(this) || "Report"; } catch (e) { docTitle = "Report"; }
      var forceBreaks = this.Config.printCanvasSpacing === "perReport";
      var docHtml = wrapPrintDocument(docTitle, orient, joinPrintSections(tableHtmls, forceBreaks), this.Config.printMargin);
      var printed = openGlossaryPrint(this, docHtml, orient, this.Config.printMargin, tableSizes);
      if (!printed.ok) return { ok: false, error: printed.busy ? "busy" : "print" };
      var warnings = [];
      if (mixedOrientation) warnings.push(LBL.PRINT_MIXED_ORIENTATION);
      if (printed.overflowCount) warnings.push(LBL.PRINT_OVERFLOW);
      return { ok: true, warning: warnings.join(" ") };
      } catch (e) {
         _logger.error("canvas print failed: " + (e && e.message ? e.message : e));
         return { ok: false, error: "print" };
      }
   };

   GlossaryPivotViz.prototype._wirePrint = function ($c) {
      var self = this;
      /* A too-wide-at-6pt table or a mixed-orientation canvas are not
         failures: printing already proceeded (openGlossaryPrint returned
         ok, the dialog opened). gp-printnote overrides gp-printerr's red
         with a neutral color so the message reads as an advisory, not an
         error — a real failure (no tables, print blocked, busy) keeps the
         plain gp-printerr red. */
      function showPrintResult($err, result, emptyLabel) {
         if (result.ok) {
            $err.addClass("gp-printnote");
            if (result.warning) $err.text(result.warning).show();
            return;
         }
         $err.removeClass("gp-printnote");
         $err.text(result.error === "busy" ? LBL.PRINT_BUSY :
            (result.error === "print" ? LBL.PRINT_ERROR : emptyLabel)).show();
      }
      $c.find(".gp-printbtn").off("click.gpprint").on("click.gpprint", function () {
         var $err = $c.find(".gp-printerr");
         $err.hide();
         var result = self._printTable();
         showPrintResult($err, result, LBL.EMPTY_STATE);
      });
      $c.find(".gp-printcanvasbtn").off("click.gpprintcanvas").on("click.gpprintcanvas", function () {
         var $err = $c.find(".gp-printerr");
         $err.hide();
         var result = self._printCanvas();
         showPrintResult($err, result, LBL.PRINT_NONE);
      });
   };

   GlossaryPivotViz.prototype._replaceTableHtml = function (elContainer, html) {
      var $c = $(elContainer);
      var $oldWrap = $c.find(".gp-wrap");
      var scrollTop = $oldWrap.length ? $oldWrap.scrollTop() : 0;
      var scrollLeft = $oldWrap.length ? $oldWrap.scrollLeft() : 0;
      var showPdf = this.Config.showPrintPdf === "on";
      var showCanvas = this.Config.showPrintCanvas === "on";
      var bar = "";
      if (showPdf || showCanvas) {
         bar = "<div class='gp-printbar'>" +
                  "<span class='gp-printerr' role='status' aria-live='polite' style='display:none'></span>" +
                  (showCanvas ? "<button type='button' class='gp-printcanvasbtn' title='" + escapeHtml(LBL.PRINT_CANVAS_HELP) + "'>" + escapeHtml(LBL.PRINT_CANVAS) + "</button>" : "") +
                  (showPdf ? "<button type='button' class='gp-printbtn'>" + escapeHtml(LBL.PRINT) + "</button>" : "") +
               "</div>";
      }
      $c.html(
         "<div class='gp-shell'>" + bar +
            "<div class='gp-wrap'>" + html + "</div>" +
         "</div>"
      );
      if (scrollTop || scrollLeft) {
         $c.find(".gp-wrap").scrollTop(scrollTop).scrollLeft(scrollLeft);
      }
      if (bar) this._wirePrint($c);
      applyPrintTheme($c.find(".gp-shell")[0], this.Config.printFollowTheme);
   };

   /**
    * Rebuilds just the table markup from the last-seen DataLayout — used after
    * a group-collapse toggle or a sort click, which change only how
    * already-fetched rows are grouped for DISPLAY, not what was queried.
    * Cheaper than a full _render: no column-info-map re-read, no debug dump.
    */
   GlossaryPivotViz.prototype._rerenderTable = function () {
      var elContainer = this.getContainerElem();
      if (!elContainer || !this._lastDataLayout) return;
      var focusAttr = null, focusValue = null;
      var active = document.activeElement;
      if (active && elContainer.contains && elContainer.contains(active)) {
         var focusAttrs = ["data-gp-toggle-group", "data-gp-sort", "data-gp-row"];
         for (var fi = 0; fi < focusAttrs.length; fi++) {
            if (active.getAttribute && active.getAttribute(focusAttrs[fi]) !== null) {
               focusAttr = focusAttrs[fi];
               focusValue = active.getAttribute(focusAttr);
               break;
            }
         }
      }
      var html;
      try {
         html = this._buildTable(this._lastDataLayout);
      } catch (e) {
         html = "<div class='gp-empty'>" + escapeHtml(LBL.RENDER_ERROR) +
                escapeHtml("" + (e && e.message || e)) + "</div>";
         _logger.error("re-render failed: " + (e && e.stack || e));
      }
      this._replaceTableHtml(elContainer, html);
      if (this.Config.showDescriptions !== "off") this._wireTooltips(elContainer);
      this._wireMarking(elContainer);
      this._wireKeyboardRows(elContainer);
      this._wireGroupToggle(elContainer);
      this._wireSort(elContainer);
      this._applyMarkedRows();
      if (focusAttr && elContainer.querySelectorAll) {
         var focusable = elContainer.querySelectorAll("[" + focusAttr + "]");
         for (var f = 0; f < focusable.length; f++) {
            if (focusable[f].getAttribute(focusAttr) !== focusValue) continue;
            if (focusAttr === "data-gp-row") {
               var rowStops = elContainer.querySelectorAll("tbody tr[data-gp-row]");
               for (var rs = 0; rs < rowStops.length; rs++) rowStops[rs].setAttribute("tabindex", "-1");
               focusable[f].setAttribute("tabindex", "0");
            }
            if (focusable[f].focus) focusable[f].focus();
            break;
         }
      }
   };

   function escapeHtml(s) {
      if (s == null) return "";
      /* Includes single quotes: header attributes are built single-quoted, and
         real descriptions contain apostrophes ("the student's..."). */
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                      .replace(/'/g, "&#39;");
   }

   /**
    * Builds the pivot markup. Column-header spans still come from
    * getItemEndSlice — the column edge is not sorted. Row-header spans are
    * computed from the sorted row buffer (section 3c); getItemEndSlice on
    * the row edge only describes the host's delivery order.
    */
   GlossaryPivotViz.prototype._buildTable = function (dl) {
      var ROW  = PHYS_ROW,
          COL  = PHYS_COLUMN,
          DATA = PHYS_DATA,
          LM   = data.LayerMetadata,
          self = this;

      var nRowLayers = dl.getLayerCount(ROW)  || 0,
          nColLayers = dl.getLayerCount(COL)  || 0,
          nRows      = dl.getEdgeExtent(ROW)  || 0,
          nCols      = dl.getEdgeExtent(COL)  || 0;

      if (!nRows && !nCols) {
         return "<div class='gp-empty'>" + escapeHtml(LBL.EMPTY_STATE) + "</div>";
      }

      var overrides = parseMeasureFormatOverrides(this.Config.measureFormatOverrides);
      var measureInfo = computeMeasureIdByCol(dl, LM, nColLayers, nCols);
      var measureIdByCol = measureInfo.idByCol;
      var measureNameById = measureInfo.nameById;
      var wantRowSubtotals = this.Config.showRowSubtotals === "on" && nRowLayers > 1;
      var wantGrandTotalRow = this.Config.showGrandTotalRow === "on";
      var wantTotalCol = this.Config.showGrandTotalColumn === "on" && nColLayers > 0 && nCols > 0;
      var buckets = wantTotalCol ? bucketColsByMeasure(measureIdByCol) : null;
      var wantCellColor = this.Config.cellColor === "on";
      var colorRanges = null;
      var wantCollapse = this.Config.rowGroupCollapse === "on" && nRowLayers > 1;
      var sortState = usableSort(this._sortState, nRowLayers, nCols, nColLayers);
      var hiddenSet = parseHiddenColumns(this.Config.hiddenColumns);
      var headerLabelMap = parseHeaderLabels(this.Config.headerLabels);

      /* A hidden field stays in the layout. Rows: the header column is not
         drawn, and grouping/sort still use its values so two groups that
         share a visible label do not merge. Columns: the header row is not
         drawn, and the data columns stay split by that dimension. A measure
         is hidden as data columns, not by dropping the measure-labels layer
         (that layer's name is every measure). */
      var rowLayerHidden = [];
      var visibleRowLayers = [];
      for (var rli = 0; rli < nRowLayers; rli++) {
         var hid = false;
         try {
            hid = columnListed(hiddenSet,
               dl.getLayerMetadata(ROW, rli, LM.LAYER_ID),
               dl.getLayerMetadata(ROW, rli, LM.LAYER_DISPLAY_NAME));
         } catch (e) {}
         rowLayerHidden[rli] = hid;
         if (!hid) visibleRowLayers.push(rli);
      }
      var nVisRows = visibleRowLayers.length;
      var firstVisibleRowLayer = nVisRows ? visibleRowLayers[0] : -1;
      if (!nVisRows) wantCollapse = false;

      var colLayerHidden = [];
      var colLayerIsMeasure = [];
      var colLayerName = [];
      for (var cli = 0; cli < nColLayers; cli++) {
         var cIsM = false, cName = null, cId = null;
         try { cIsM = !!dl.getLayerMetadata(COL, cli, LM.LAYER_ISMEASURE_LABELS); } catch (e) {}
         try { cId = dl.getLayerMetadata(COL, cli, LM.LAYER_ID); } catch (e) {}
         if (!cIsM) { try { cIsM = tailName(cId) === MEASURE_LAYER_ID; } catch (e) {} }
         try { cName = dl.getLayerMetadata(COL, cli, LM.LAYER_DISPLAY_NAME); } catch (e) {}
         colLayerIsMeasure[cli] = cIsM;
         colLayerName[cli] = cName;
         colLayerHidden[cli] = !cIsM && columnListed(hiddenSet, cId, cName);
      }
      var headerLayerIdx = [];
      for (cli = 0; cli < nColLayers; cli++) if (!colLayerHidden[cli]) headerLayerIdx.push(cli);
      /* No visible column layer (none existed, or every attribute layer is
         hidden): one pad row so the corner names and the body columns still
         line up. */
      if (!headerLayerIdx.length) headerLayerIdx = [-1];
      var nHeaderRows = headerLayerIdx.length;

      var colHidden = [];
      for (var hc = 0; hc < nCols; hc++) {
         var hMid = measureIdByCol[hc];
         colHidden[hc] = hMid !== "__single__" &&
            columnListed(hiddenSet, hMid, measureNameById[hMid]);
      }
      if (wantCellColor) colorRanges = computeMeasureRanges(dl, nRows, nCols, measureIdByCol, colHidden);
      if (wantTotalCol && buckets) {
         var keptBuckets = [];
         buckets.order.forEach(function (bid) {
            var cols = [];
            buckets.map[bid].forEach(function (cc) { if (!colHidden[cc]) cols.push(cc); });
            if (!cols.length) return;
            buckets.map[bid] = cols;
            keptBuckets.push(bid);
         });
         buckets.order = keptBuckets;
         if (!keptBuckets.length) wantTotalCol = false;
      }

      function visibleSpan(c, end) {
         var n = 0, one = -1;
         for (var i = c; i <= end; i++) {
            if (colHidden[i]) continue;
            n++;
            one = i;
         }
         return { n: n, sortCol: n === 1 ? one : -1 };
      }

      /* Collapsed and subtotal labels use the first VISIBLE row layer. When
         the outer layer is hidden (STRM sitting under Term), printing
         rowVals[0] would put the hidden code back on screen. */
      function visibleGroupLabel(row) {
         if (firstVisibleRowLayer < 0) return "";
         return row.rowVals[firstVisibleRowLayer] || "";
      }

      /* Header cell. `label` is what the cell SHOWS; `lookupName` is the
         COLUMN it belongs to — on a column-edge layer they differ (the cell
         reads "Full-Time" but the column is FULL_PART_TIME, and the glossary
         is keyed by the column).

         The cell bakes IDENTITY only (name + stable id); the description is
         resolved from the current glossary right here at build time (the
         live column-info map was already merged in _doRender before this
         runs, so first paint already reflects it). markRows, when given, is
         a [startRow, endRow] pair wired to click-to-mark. sortKey, when
         given, is "row:<layer>" or "col:<headerLayer>:<dataCol>" — the
         click target for click-to-sort. Hover (tooltip) and click (sort)
         are different events on the same cell; the sort marker is a sibling
         of .gp-lbl so the glossary underline stays on the name only. */
      function sortIsActive(sortKey) {
         if (!sortKey || !sortState) return false;
         var p = sortKey.split(":");
         if (p[0] !== sortState.kind) return false;
         if (p[0] === "row") return parseInt(p[1], 10) === sortState.key;
         return parseInt(p[1], 10) === sortState.layer && parseInt(p[2], 10) === sortState.key;
      }

      function headerCell(tag, label, lookupName, columnId, span, spanAttr, cls, markRows, sortKey, paintHex) {
         var d = null;
         if (self.Config.showDescriptions !== "off") {
            try { d = self._glossary.getDescription(lookupName, columnId); } catch (e) {}
         }
         var paint = headerPaint(paintHex);
         var attrs = " class='" + cls + (d ? " gp-has-desc" : "") + (sortKey ? " gp-sortable" : "") + paint.cls + "' scope='col'" + paint.style;
         if (span > 1) attrs += " " + spanAttr + "='" + span + "'";
         if (d) {
            attrs += " data-gp-name='" + escapeHtml(lookupName == null ? "" : lookupName) + "'";
            if (columnId != null) attrs += " data-gp-key='" + escapeHtml(columnId) + "'";
         }
         if (d || sortKey) attrs += " tabindex='0'";
         if (markRows) attrs += " data-gp-mark-rows='" + markRows[0] + ":" + markRows[1] + "'";
         var ind = "";
         if (sortKey) {
            attrs += " data-gp-sort='" + escapeHtml(sortKey) + "'";
            attrs += " aria-sort='none'";
            if (sortIsActive(sortKey)) {
               var desc = sortState.dir === "desc";
               ind = "<span class='gp-sort-ind' aria-hidden='true'>" + (desc ? "▼" : "▲") + "</span>";
               attrs = attrs.replace(" aria-sort='none'", " aria-sort='" + (desc ? "descending" : "ascending") + "'");
            }
         }
         return "<" + tag + attrs + "><span class='gp-lbl'>" +
                escapeHtml(label) + "</span>" + ind + "</" + tag + ">";
      }

      /* The underline is a border on .gp-has-desc. That class also opens the
         tooltip, so turning the line off must not remove the class. */
      var tableClass = "gp-table" + (this.Config.showHeaderUnderline === "on" ? "" : " gp-no-underline");
      var out = ["<table class='" + tableClass + "'>"];

      /* ---- column headers, one row per VISIBLE column layer ---- */
      out.push("<thead>");
      for (var hi = 0; hi < nHeaderRows; hi++) {
         var cl = headerLayerIdx[hi];
         var lastHeaderRow = hi === nHeaderRows - 1;
         out.push("<tr>");

         /* corner: spans the visible row-header gutter. The LAST header row
            carries the row layers' own names, which is where row-header
            descriptions live. A hidden row layer has no corner cell. */
         if (nVisRows > 0) {
            if (!lastHeaderRow) {
               var cornerPaint = headerPaint(self.Config.headerColor);
               out.push("<th class='gp-corner" + cornerPaint.cls + "' scope='colgroup'" + cornerPaint.style +
                        (nVisRows > 1 ? " colspan='" + nVisRows + "'" : "") + "></th>");
            } else {
               for (var vri = 0; vri < nVisRows; vri++) {
                  var rl = visibleRowLayers[vri];
                  var rName = dl.getLayerMetadata(ROW, rl, LM.LAYER_DISPLAY_NAME);
                  var rId   = dl.getLayerMetadata(ROW, rl, LM.LAYER_ID);
                  var rTxt  = rName == null ? "" : String(rName);
                  var rShown = resolveHeaderLabel(headerLabelMap, rId, rTxt, rTxt);
                  out.push(headerCell("th", rShown, rTxt, rId, 1, "colspan", "gp-corner", null, "row:" + rl, self.Config.headerColor));
               }
            }
         }

         if (cl >= 0) {
            var isMeasureLayer = colLayerIsMeasure[cl];
            var layerName = colLayerName[cl];
            var c = 0;
            while (c < nCols) {
               var end = c;
               try { end = dl.getItemEndSlice(COL, cl, c); } catch (e) { end = c; }
               if (end == null || end < c) end = c;
               var span = visibleSpan(c, end);
               /* A slice whose data columns are all hidden measures leaves
                  no cell. Colspan counts only the columns still drawn, so
                  a parent header still covers the visible children. */
               if (span.n > 0) {
                  var label = null;
                  try { label = dl.getValue(COL, cl, c, false); } catch (e) {}

                  var colId = null;
                  try {
                     colId = isMeasureLayer ? dl.getValue(COL, cl, c, true)
                                            : dl.getLayerMetadata(COL, cl, LM.LAYER_ID);
                  } catch (e) {}

                  /* Measure-label cells ARE the column (label = CUM_GPA), so
                     look up by label and honor a display-header override.
                     Categorical cells show a VALUE (Fall 2024) that belongs
                     to the layer's column — the override does not rename the
                     member, and the glossary looks up the layer. */
                  var lookup = isMeasureLayer ? label : (layerName ? layerName : label);
                  var shown = label == null ? "" : String(label);
                  var paintHex = self.Config.headerDataColor;
                  if (isMeasureLayer) {
                     shown = resolveHeaderLabel(headerLabelMap, colId, shown, shown);
                     paintHex = self.Config.headerColor;
                  }

                  /* A header that spans several visible data columns has no
                     single value to sort by. A leaf (one visible column)
                     sorts by that column's raw number. */
                  var sortKey = span.sortCol >= 0 ? ("col:" + cl + ":" + span.sortCol) : null;
                  out.push(headerCell("th", shown,
                                      lookup == null ? "" : lookup, colId,
                                      span.n, "colspan", "gp-colhdr", null, sortKey, paintHex));
               }
               c = end + 1;
            }
         } else if (nCols > 0) {
            /* No column layer to label (or every attribute layer is hidden):
               pad so thead stays aligned with the body's value cells. */
            for (var cp = 0; cp < nCols; cp++) {
               if (colHidden[cp]) continue;
               out.push(headerCell("th", "", "", null, 1, "colspan", "gp-colhdr", null, "col:0:" + cp, self.Config.headerDataColor));
            }
         }

         /* Grand-total column header(s): one per distinct measure that still
            has a visible column, spanning every header row via rowspan
            (emitted once, on the first row). The label uses the display
            header, not the raw measure id. */
         if (wantTotalCol && hi === 0) {
            buckets.order.forEach(function (bid) {
               var measureName = measureNameById[bid] || bid;
               var shownName = resolveHeaderLabel(headerLabelMap, bid === "__single__" ? null : bid, measureName, measureName);
               var lbl = buckets.order.length > 1 && bid !== "__single__" ? shownName + " " + LBL.TOTAL : LBL.TOTAL;
               var rs = nHeaderRows > 1 ? " rowspan='" + nHeaderRows + "'" : "";
               var totalPaint = headerPaint(self.Config.headerColor);
               out.push("<th class='gp-colhdr gp-total-colhdr" + totalPaint.cls + "' scope='col'" + totalPaint.style + rs + ">" +
                        "<span class='gp-lbl'>" + escapeHtml(lbl) + "</span></th>");
            });
         }
         out.push("</tr>");
      }
      out.push("</thead>");

      /* ---- body ---- */
      out.push("<tbody>");

      function totalRowHtml(labelText, rStart, rEnd) {
         var cells = ["<tr class='gp-total-row'>"];
         if (nVisRows > 0) {
            cells.push("<th class='gp-rowhdr gp-total-label' scope='row'" +
                       (nVisRows > 1 ? " colspan='" + nVisRows + "'" : "") +
                       ">" + escapeHtml(labelText) + "</th>");
         }
         for (var cc = 0; cc < nCols; cc++) {
            if (colHidden[cc]) continue;
            var mId = measureIdByCol[cc];
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId, measureNameById[mId]);
            var val = sumBlock(dl, rStart, rEnd, [cc]);
            cells.push("<td class='gp-val gp-total-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
         }
         if (wantTotalCol) {
            buckets.order.forEach(function (bid) {
               var fmt = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid, measureNameById[bid]);
               var val = sumBlock(dl, rStart, rEnd, buckets.map[bid]);
               cells.push("<td class='gp-val gp-total-val gp-grand-total-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
            });
         }
         cells.push("</tr>");
         return cells.join("");
      }

      /* A collapsed outer group renders as ONE row standing in for all of its
         hidden detail rows — the label cell spans every Row layer (there is
         no single per-inner-layer value to show once the detail is hidden),
         and the value cells are the same SUM-of-displayed-values used for
         totals (see the v0.5/v0.7 header notes on why that is a display
         convenience, not a re-aggregation). Deliberately does NOT also emit
         a "Label Total" subtotal row for this group — this row already is
         one. */
      function collapsedGroupRowHtml(labelText, rStart, rEnd, groupKey) {
         var cells = ["<tr class='gp-group-row gp-collapsed'>"];
         if (nVisRows > 0) {
            cells.push("<th class='gp-rowhdr gp-group-label' scope='row'" +
                       (nVisRows > 1 ? " colspan='" + nVisRows + "'" : "") +
                       ">" +
                       "<button type='button' class='gp-group-toggle' data-gp-toggle-group='" + groupKey +
                       "' aria-expanded='false' aria-label='Expand group " + escapeHtml(labelText) + "'>▸</button><span class='gp-lbl'>" +
                       escapeHtml(labelText) + "</span></th>");
         }
         for (var cc = 0; cc < nCols; cc++) {
            if (colHidden[cc]) continue;
            var mId = measureIdByCol[cc];
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId, measureNameById[mId]);
            var val = sumBlock(dl, rStart, rEnd, [cc]);
            cells.push("<td class='gp-val gp-group-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
         }
         if (wantTotalCol) {
            buckets.order.forEach(function (bid) {
               var fmt = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid, measureNameById[bid]);
               var val = sumBlock(dl, rStart, rEnd, buckets.map[bid]);
               cells.push("<td class='gp-val gp-group-val gp-grand-total-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
            });
         }
         cells.push("</tr>");
         return cells.join("");
      }

      /* Value cells for one layout row. `row.r` is the DataLayout index —
         marking and the per-row total column both need that, not the row's
         position in the sorted display. raw vs formatted is the v0.9 split:
         heat-map and an explicit format need the number; "auto" shows what
         OAC already rendered. */
      function dataCellsHtml(row) {
         var parts = [];
         var layoutRow = row.r;
         for (var cc = 0; cc < nCols; cc++) {
            if (colHidden[cc]) continue;
            var vRaw = row.raw[cc];
            var vFormatted = row.formatted[cc];
            var mId = measureIdByCol[cc];
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId, measureNameById[mId]);
            var styleAttr = "", heatClass = "";
            if (wantCellColor) {
               var range = colorRanges[mId];
               var nColor = Number(vRaw);
               if (range && range.min != null && range.max != null && range.max > range.min &&
                   vRaw != null && vRaw !== "" && !isNaN(nColor)) {
                  var col = interpolateColor(self.Config.cellColorLow, self.Config.cellColorHigh,
                     (nColor - range.min) / (range.max - range.min));
                  /* CSS custom properties, not a direct background/color —
                     an inline style beats any class selector, which silently
                     hid the row-hover and mark-selection backgrounds
                     wherever the heat map was on. The base .gp-heat rule
                     reads these variables at normal class specificity, so
                     .gp-marked / :hover (already more specific — see the
                     stylesheet) win the cascade normally. */
                  if (col) {
                     styleAttr = " style='--gp-cell-bg:" + col.bg + ";--gp-cell-fg:" + col.fg + "'";
                     heatClass = " gp-heat";
                  }
               }
            }
            var displayVal = fmt.numberFormat === "auto"
               ? (vFormatted != null && vFormatted !== "" ? vFormatted : vRaw)
               : (vRaw != null && vRaw !== "" ? vRaw : vFormatted);
            parts.push("<td class='gp-val" + heatClass + "'" + styleAttr + " data-gp-mark-rows='" + layoutRow + ":" + layoutRow + "'>" +
                       escapeHtml(formatValue(displayVal, fmt)) + "</td>");
         }
         if (wantTotalCol) {
            buckets.order.forEach(function (bid) {
               var fmt2 = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid, measureNameById[bid]);
               var val = sumBlock(dl, layoutRow, layoutRow, buckets.map[bid]);
               parts.push("<td class='gp-val gp-total-val gp-grand-total-val' data-gp-mark-rows='" + layoutRow + ":" + layoutRow + "'>" +
                          escapeHtml(val == null ? "" : formatValue(val, fmt2)) + "</td>");
            });
         }
         return parts.join("");
      }

      /* An empty Rows tray (columns + measures only) still needs one body
         row — same guard as before. There is nothing to sort. */
      if (!nRows) {
         var phantomRaw = new Array(nCols), phantomFmt = new Array(nCols);
         for (var pc = 0; pc < nCols; pc++) {
            try { phantomRaw[pc] = dl.getValue(DATA, 0, pc, true); } catch (e) {}
            try { phantomFmt[pc] = dl.getValue(DATA, 0, pc); } catch (e) {}
         }
         out.push("<tr data-gp-row='0'>" + dataCellsHtml({ r: 0, raw: phantomRaw, formatted: phantomFmt }) + "</tr>");
      } else {
         var displayRows = orderRowsForSort(buildRowBuffer(dl, nRows, nRowLayers, nCols), sortState, nRowLayers);
         var di = 0;
         while (di < displayRows.length) {
            var lead = displayRows[di];
            var gLast = di;
            while (gLast + 1 < displayRows.length && displayRows[gLast + 1].groupKey === lead.groupKey) gLast++;

            /* Collapse stays keyed by the group's ORIGINAL start index
               (lead.groupKey), not by whichever row sort put first and not
               by the label — two groups can still share a label. */
            if (wantCollapse && self._collapsedGroups[lead.groupKey]) {
               out.push(collapsedGroupRowHtml(visibleGroupLabel(lead), lead.groupStart, lead.groupEnd, lead.groupKey));
               di = gLast + 1;
               continue;
            }

            for (var rowi = di; rowi <= gLast; rowi++) {
               var cur = displayRows[rowi];
               out.push("<tr data-gp-row='" + cur.r + "'>");
               for (var l = 0; l < nRowLayers; l++) {
                  if (rowLayerHidden[l]) continue;
                  /* Span from adjacency in the sorted buffer. getItemEndSlice
                     would still report the host's grouping, which is no longer
                     the order on screen. groupKey and the hidden ancestor
                     values are part of the comparison so two groups that
                     share a visible label do not merge. */
                  if (rowi > 0 && sameHeaderRun(displayRows[rowi - 1], cur, l)) continue;
                  var spanEnd = rowi;
                  while (spanEnd + 1 <= gLast && sameHeaderRun(displayRows[spanEnd], displayRows[spanEnd + 1], l)) spanEnd++;
                  var indices = [];
                  for (var k = rowi; k <= spanEnd; k++) indices.push(displayRows[k].r);
                  var toggle = "";
                  /* Collapse still keys the outer group. When that layer is
                     hidden the toggle sits on the first visible layer, and
                     only on the group's first row so it is not repeated. */
                  if (wantCollapse && l === firstVisibleRowLayer && rowi === di) {
                     toggle = "<button type='button' class='gp-group-toggle' data-gp-toggle-group='" + lead.groupKey +
                        "' aria-expanded='true' aria-label='Collapse group " + escapeHtml(visibleGroupLabel(lead)) + "'>▾</button>";
                  }
                  var span = spanEnd - rowi + 1;
                  out.push("<th class='gp-rowhdr' scope='row' data-gp-mark-rows='" + markRowsAttr(indices) + "'" +
                           (span > 1 ? " rowspan='" + span + "'" : "") +
                           ">" + toggle + "<span class='gp-lbl'>" + escapeHtml(cur.rowVals[l]) + "</span></th>");
               }
               /* No phantom column when the COLUMN edge is empty — a rows-only
                  drop renders headers alone, keeping thead and tbody aligned. */
               out.push(dataCellsHtml(cur));
               out.push("</tr>");
            }

            /* groupStart..groupEnd is still a contiguous DataLayout slice:
               within-group sort changes display order, not membership, so
               sumBlock over that slice is the group's rows and not a
               display-index range. */
            if (wantRowSubtotals) {
               out.push(totalRowHtml((visibleGroupLabel(lead) || "") + " " + LBL.TOTAL, lead.groupStart, lead.groupEnd));
            }
            di = gLast + 1;
         }
      }
      /* Grand total covers every layout row. Order does not change the sum. */
      if (wantGrandTotalRow && nRows > 0) {
         out.push(totalRowHtml(LBL.TOTAL, 0, nRows - 1));
      }
      out.push("</tbody></table>");

      return out.join("");
   };

   /* =========================================================================
      5. HEADER TOOLTIP
      A styled div, never the title attribute — title timing and styling are
      uncontrollable. Bound on hover AND focus so it is keyboard reachable.
      ========================================================================= */

   GlossaryPivotViz.prototype._wireTooltips = function (elContainer) {
      var $c = $(elContainer);
      var self = this;

      var $tip = $c.find(".gp-tip");
      if (!$tip.length) {
         $tip = $("<div class='gp-tip' role='tooltip'></div>").appendTo($c);
      }
      if (!this._tooltipId) this._tooltipId = printCanvasKey(this, "gp-tip-");
      $tip.attr("id", this._tooltipId);
      this._$tip = $tip;
      var activeEl = null;

      function show(el) {
         var $el = $(el);
         var name = $el.attr("data-gp-name") || "";
         var key  = $el.attr("data-gp-key") || null;
         var d = null;
         try { d = self._glossary.getDescription(name, key); } catch (e) {}
         if (!d) { hide(); return; }
         if (activeEl && activeEl !== el) $(activeEl).removeAttr("aria-describedby");
         activeEl = el;
         $el.attr("aria-describedby", self._tooltipId);
         /* Live and Workbook override chips are both optional now that
            there is no third, always-shown "not from OAC" source to
            distinguish them from. */
         var showBadge = self.Config.showSourceBadges === "on";
         var srcLabel = d.origin === "override" ? LBL.SRC_OVERRIDE : LBL.SRC_LIVE;
         var $name = $("<div class='gp-tip-name'></div>").text(name);
         if (showBadge) $name.append($("<span class='gp-tip-src'></span>").text(srcLabel));
         var align = self.Config.tooltipAlign;
         if (align !== "center" && align !== "right") align = "left";
         $tip.empty()
             .append($name)
             .append($("<div class='gp-tip-desc'></div>").text(d.text))
             .removeClass("gp-align-left gp-align-center gp-align-right")
             .addClass("gp-align-" + align)
             .addClass("gp-on");

         /* Viewport coordinates: .gp-tip is position:fixed, so these are valid
            regardless of which ancestor of the container happens to be
            positioned, and the tip is not clipped by the wrap's overflow. */
         var er = el.getBoundingClientRect();
         var tw = $tip.outerWidth(), th = $tip.outerHeight();
         var left = er.left + er.width / 2 - tw / 2;
         left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
         var top = er.bottom + 6;
         if (top + th > window.innerHeight - 8) top = er.top - th - 6;
         top = Math.max(8, top);
         $tip.css({ left: left + "px", top: top + "px" });
         /* A transformed ancestor (OAC canvas zoom / Present mode) becomes
            the containing block for position:fixed, skewing the coordinate
            space. Measure where the tip actually landed and correct once. */
         try {
            var r2 = $tip[0].getBoundingClientRect();
            var dx = r2.left - left, dy = r2.top - top;
            if (dx || dy) $tip.css({ left: (left - dx) + "px", top: (top - dy) + "px" });
         } catch (e) {}
      }

      function hide() {
         if (activeEl) $(activeEl).removeAttr("aria-describedby");
         activeEl = null;
         $tip.removeClass("gp-on");
      }

      $c.off(".gptip")
        .on("mouseenter.gptip", "th.gp-has-desc", function () { show(this); })
        .on("mouseleave.gptip", "th.gp-has-desc", hide)
        .on("focusin.gptip",    "th.gp-has-desc", function () { show(this); })
        .on("focusout.gptip",   "th.gp-has-desc", hide);
   };

   /* =========================================================================
      6. MARKING — row-level cross-viz selection.
      Scoped to ROW granularity only; see the v0.5 header note for why column-
      and cell-level marking on an aggregated pivot cell are not attempted.
      ========================================================================= */

   GlossaryPivotViz.prototype._wireMarking = function (elContainer) {
      var $c = $(elContainer);
      var self = this;
      $c.off(".gpmark").on("click.gpmark", "[data-gp-mark-rows]", function (event) {
         /* A click on the group-collapse toggle bubbles up to this same
            header cell (it lives inside it) — that is a collapse action, not
            a mark action. _wireGroupToggle's own handler also stops
            propagation, but a target-based guard here does not depend on
            jQuery's delegated-handler ordering to be correct. */
         if ($(event.target).closest(".gp-group-toggle").length) return;
         /* "start:end" when the marked layout rows are still a contiguous
            range (an outer group always is). A comma list when sort has
            pulled an inner span's rows apart in layout order — start:end
            would then mark the rows that now sit under a different header. */
         var spec = $(this).attr("data-gp-mark-rows");
         if (!spec) return;
         var rows = [];
         if (spec.indexOf(",") !== -1) {
            spec.split(",").forEach(function (part) {
               var n = parseInt(part, 10);
               if (!isNaN(n)) rows.push(n);
            });
         } else {
            var range = spec.split(":");
            var rStart = parseInt(range[0], 10), rEnd = parseInt(range[1], 10);
            if (isNaN(rStart) || isNaN(rEnd)) return;
            for (var r = rStart; r <= rEnd; r++) rows.push(r);
         }
         if (!rows.length) return;
         self._markRows(rows, !!(event.ctrlKey || event.metaKey));
      });
   };

   /* One row is in the tab sequence. Arrow keys move that stop; Enter/Space
      marks the focused layout row without adding thousands of tab stops. */
   GlossaryPivotViz.prototype._wireKeyboardRows = function (elContainer) {
      var $c = $(elContainer);
      var self = this;
      var $rows = $c.find("tbody tr[data-gp-row]");
      $rows.attr("tabindex", "-1");
      if ($rows.length) $rows.first().attr("tabindex", "0");
      $c.off(".gprowkeys").on("keydown.gprowkeys", "tbody tr[data-gp-row]", function (event) {
         if (event.target !== this) return;
         if (event.which === 38 || event.which === 40) {
            var index = $rows.index(this);
            var next = index + (event.which === 40 ? 1 : -1);
            if (next < 0 || next >= $rows.length) return;
            event.preventDefault();
            $(this).attr("tabindex", "-1");
            $rows.eq(next).attr("tabindex", "0").focus();
         } else if (event.which === 13 || event.which === 32) {
            var row = parseInt($(this).attr("data-gp-row"), 10);
            if (isNaN(row)) return;
            event.preventDefault();
            self._markRows([row], !!(event.ctrlKey || event.metaKey));
         }
      });
   };

   /* =========================================================================
      6b. ROW GROUP COLLAPSE — session-only (not persisted to Config; resets
      on reopen, matching the "load fresh at open" description philosophy
      rather than growing an unbounded per-value list in saved settings).
      ========================================================================= */

   GlossaryPivotViz.prototype._wireGroupToggle = function (elContainer) {
      var $c = $(elContainer);
      var self = this;
      $c.off(".gpgroup").on("click.gpgroup", "[data-gp-toggle-group]", function (event) {
         event.stopPropagation();
         var label = $(this).attr("data-gp-toggle-group");
         if (self._collapsedGroups[label]) delete self._collapsedGroups[label];
         else self._collapsedGroups[label] = true;
         self._rerenderTable();
      });
   };

   /* =========================================================================
      6c. CLICK-TO-SORT — session-only, same as collapse. Asc → desc → off.
      One header at a time. The click target is the header cell itself
      (data-gp-sort); the ▲/▼ is only an indicator. Hover-for-tooltip is a
      different event, so the two coexist on a glossary header. The collapse
      triangle is not inside these cells, but the same target guard is here
      so a nested click cannot start a sort.
      ========================================================================= */

   GlossaryPivotViz.prototype._wireSort = function (elContainer) {
      var $c = $(elContainer);
      var self = this;

      function apply(el) {
         var p = String($(el).attr("data-gp-sort") || "").split(":");
         var kind = p[0];
         var layer = null, key = null;
         if (kind === "row") {
            key = parseInt(p[1], 10);
         } else if (kind === "col") {
            layer = parseInt(p[1], 10);
            key = parseInt(p[2], 10);
         } else {
            return;
         }
         if (isNaN(key) || (kind === "col" && isNaN(layer))) return;
         var cur = self._sortState;
         var same = cur && cur.kind === kind && cur.key === key && (kind !== "col" || cur.layer === layer);
         if (same && cur.dir === "asc") {
            self._sortState = { kind: kind, key: key, layer: layer, dir: "desc" };
         } else if (same) {
            self._sortState = null;
         } else {
            self._sortState = { kind: kind, key: key, layer: layer, dir: "asc" };
         }
         self._rerenderTable();
      }

      $c.off(".gpsort")
        .on("click.gpsort", "[data-gp-sort]", function (event) {
           if ($(event.target).closest(".gp-group-toggle").length) return;
           event.stopPropagation();
           apply(this);
        })
        /* Every sortable header is focusable, including those without a
           glossary description. Enter and Space activate the sort. */
        .on("keydown.gpsort", "[data-gp-sort]", function (event) {
           if (event.which !== 13 && event.which !== 32) return;
           event.preventDefault();
           apply(this);
        });
   };

   /** @param {Array.<number>} rowIndexes @param {boolean} extend ctrl-click adds to the current selection instead of replacing it */
   GlossaryPivotViz.prototype._markRows = function (rowIndexes, extend) {
      var dl = this._lastDataLayout;
      if (!dl) return;
      var service = this.getMarkingService();
      if (!extend) {
         try { service.clearMarksForDataLayout(dl); } catch (e) {}
         this._markedRows = Object.create(null);
      }
      var nCols = 0;
      try { nCols = dl.getEdgeExtent(PHYS_COLUMN) || 0; } catch (e) {}
      rowIndexes.forEach(function (r) {
         this._markedRows[r] = true;
         /* Mark every DATA column for the row — matches the dumbbell's
            per-row marking, generalized from its fixed 2 measure columns to
            however many columns this pivot currently has. */
         if (nCols > 0) {
            for (var cc = 0; cc < nCols; cc++) {
               try { service.setMark(dl, PHYS_DATA, r, cc); } catch (e) {}
            }
         } else {
            try { service.setMark(dl, PHYS_DATA, r, 0); } catch (e) {}
         }
      }, this);
      this._publishMarkEvent(dl);
      this._applyMarkedRows();
   };

   GlossaryPivotViz.prototype._publishMarkEvent = function (dl) {
      try {
         var markingEvent = new interactions.MarkingEvent(this.getID(), this.getViewName(), dl, null, null);
         var eventRouter = this.getEventRouter();
         if (eventRouter) eventRouter.publish(markingEvent);
      } catch (e) {
         _logger.warning("Error during mark publish: " + (e && e.message ? e.message : e));
      }
   };

   GlossaryPivotViz.prototype._applyMarkedRows = function () {
      var el = this.getContainerElem();
      if (!el) return;
      var $el = $(el);
      $el.find(".gp-marked").removeClass("gp-marked");
      var self = this;
      Object.keys(this._markedRows || {}).forEach(function (r) {
         $el.find("tr[data-gp-row='" + r + "']").addClass("gp-marked");
      });
   };

   /**
    * Marks received from another visualization on the canvas. Row-only:
    * traverseDataEdgeMarks only reports the row index in every precedented
    * usage in this repo (WSU Dumbbell); it is not confirmed whether a finer
    * grain is available for a pivot-shaped DataLayout.
    */
   GlossaryPivotViz.prototype._syncIncomingMarks = function (oTransientRenderingContext) {
      var dl = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      if (!dl) return;
      var self = this;
      var revision = this._renderRevision;
      var service = this.getMarkingService();
      function callback() {
         if (!self.isStarted() || self._renderRevision !== revision || self._lastDataLayout !== dl) return;
         self._markedRows = Object.create(null);
         try {
            service.traverseDataEdgeMarks(dl, function (nRow) { self._markedRows[nRow] = true; });
         } catch (e) {}
         self._applyMarkedRows();
      }
      try { service.getUpdatedMarkingSet(dl, marking.EMarkOperation.MARK_RELATED, callback); } catch (e) {}
   };

   GlossaryPivotViz.prototype.onHighlight = function () {
      this._syncIncomingMarks(this.createRenderingContext(this.assertOrCreateVizContext()));
   };

   GlossaryPivotViz.prototype._addVizSpecificMenuOptions = function (oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext) {
      GlossaryPivotViz.superClass._addVizSpecificMenuOptions.call(this, oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext);
      if (sMenuType === euidef.CM_TYPE_VIZ_PROPS && !this.isViewOnlyLimit()) {
         if (!oTransientRenderingContext) oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
         if (typeof this._addFilterMenuOption === 'function') this._addFilterMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
         if (typeof this._addRemoveSelectedMenuOption === 'function') this._addRemoveSelectedMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
      }
   };

   /* =========================================================================
      7. PROPERTY PANEL
      ========================================================================= */

   function addSwitcher(panel, id, labelText, value, options, order) {
      var infos = options.map(function (o) { return new gadgets.OptionInfo(o.value, o.label); });
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_SWITCHER, value);
      panel.addChild(new gadgets.TextSwitcherGadgetInfo(id, labelText, labelText, gvp, order, false, infos));
   }

   // TEXT_TOGGLE checkbox gadget for boolean on/off Config keys. Internal
   // Config stays as "on"/"off" strings (gadget-boundary translation only) —
   // saved workbooks load identically.
   function addToggle(panel, id, labelText, configValue) {
      var isOn = configValue !== "off";
      var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, isOn);
      panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
   }

   function addText(panel, factory, id, labelText, value) {
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_FIELD, value);
      panel.addChild(factory.createGadgetInfo(id, labelText, labelText, gvp));
   }

   GlossaryPivotViz.prototype._addVizSpecificPropsDialog = function (oTabbedPanelsGadgetInfo) {
      this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
      GlossaryPivotViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
   };

   GlossaryPivotViz.prototype.doAddVizSpecificPropsDialog = function (oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
      jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
      jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
      this.loadConfig();
      var factory = this.getGadgetFactory();

      var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
      var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
      var ord = { FMT: base + 100, TOT: base + 200 };
      var nx = function (g) { return ord[g]++; };

      addSwitcher(pGen, "numberFormatGadget", "Format: Number Format", this.Config.numberFormat,
         [{ value: "auto", label: "Auto" }, { value: "number", label: "Number" },
          { value: "percent", label: "Percent (×100)" }, { value: "currency", label: "Currency (USD)" },
          { value: "compact", label: "Compact (K/M/B)" }], nx("FMT"));
      addSwitcher(pGen, "decimalPlacesGadget", "Format: Decimal Places", this.Config.decimalPlaces,
         [{ value: "auto", label: "Auto" }, { value: "0", label: "0" }, { value: "1", label: "1" },
          { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }], nx("FMT"));
      addText(pGen, factory, "measureFormatOverridesGadget",
         "Format: Per-Measure Override (id:format:decimals; ...)", this.Config.measureFormatOverrides);
      addText(pGen, factory, "headerLabelsGadget",
         "Header: Display Label (id: label; ...)", this.Config.headerLabels);
      addText(pGen, factory, "hiddenColumnsGadget",
         "Header: Hidden Columns (id; id; ...)", this.Config.hiddenColumns);

      addToggle(pGen, "showGrandTotalRowGadget", "Totals: Grand Total Row", this.Config.showGrandTotalRow);
      addToggle(pGen, "showRowSubtotalsGadget", "Totals: Row Subtotals (2+ Row layers)", this.Config.showRowSubtotals);
      addToggle(pGen, "showGrandTotalColumnGadget", "Totals: Grand Total Column", this.Config.showGrandTotalColumn);
      addToggle(pGen, "rowGroupCollapseGadget", "Totals: Row Group Collapse (2+ Row layers)", this.Config.rowGroupCollapse);

      addToggle(pGen, "cellColorGadget", "Style: Cell Color (heat map)", this.Config.cellColor);
      addText(pGen, factory, "cellColorLowGadget", "Style: Cell Color Low (hex)", this.Config.cellColorLow);
      addText(pGen, factory, "cellColorHighGadget", "Style: Cell Color High (hex)", this.Config.cellColorHigh);
      addText(pGen, factory, "headerColorGadget", "Style: Header Color (hex)", this.Config.headerColor);
      addText(pGen, factory, "headerDataColorGadget", "Style: Header Data Color (hex)", this.Config.headerDataColor);

      addToggle(pGen, "showDescriptionsGadget", "Tooltip: Glossary Descriptions", this.Config.showDescriptions);
      addToggle(pGen, "showSourceBadgesGadget", "Tooltip: Source Badges (Live / Workbook)", this.Config.showSourceBadges);
      addToggle(pGen, "showHeaderUnderlineGadget", "Tooltip: Underline Headers", this.Config.showHeaderUnderline);
      addToggle(pGen, "showPrintPdfGadget", "Print: Show PDF Button", this.Config.showPrintPdf);
      addToggle(pGen, "showPrintCanvasGadget", "Print: Show Canvas Button", this.Config.showPrintCanvas);
      addSwitcher(pGen, "printOrientationGadget", "Print: Page Orientation", this.Config.printOrientation,
         [{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }], nx("FMT"));
      addSwitcher(pGen, "printMarginGadget", "Print: Margins", this.Config.printMargin,
         [{ value: "narrow", label: "Narrow (0.25 in)" }, { value: "normal", label: "Normal (0.5 in)" },
          { value: "wide", label: "Wide (1 in)" }], nx("FMT"));
      addSwitcher(pGen, "printTableSizeGadget", "Print: Table Width", this.Config.printTableSize,
         [{ value: "margins", label: "To margins" }, { value: "content", label: "To content" }], nx("FMT"));
      addSwitcher(pGen, "printCanvasSpacingGadget", "Print: Canvas Page Breaks", this.Config.printCanvasSpacing,
         [{ value: "compact", label: "Minimize blank space" }, { value: "perReport", label: "One page per report" }], nx("FMT"));
      addToggle(pGen, "printFollowThemeGadget", "Print: Follow Theme", this.Config.printFollowTheme);
      addSwitcher(pGen, "tooltipAlignGadget", "Tooltip: Text Align", this.Config.tooltipAlign,
         [{ value: "left", label: "Left" }, { value: "center", label: "Center" },
          { value: "right", label: "Right" }], nx("FMT"));

      addToggle(pGen, "debugLogMetadataGadget", "Debug: Log Column Metadata (Console)", this.Config.debugLogMetadata);

      if (GlossaryPivotViz.superClass.doAddVizSpecificPropsDialog) GlossaryPivotViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
   };

   GlossaryPivotViz.prototype._handlePropChange = function (sGadgetID, oPropChange, oViewSettings, oActionContext) {
      var updateSettings = GlossaryPivotViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
      if (updateSettings) return updateSettings;
      var map = {
         numberFormatGadget: "numberFormat",
         decimalPlacesGadget: "decimalPlaces",
         measureFormatOverridesGadget: "measureFormatOverrides",
         headerLabelsGadget: "headerLabels",
         hiddenColumnsGadget: "hiddenColumns",
         showGrandTotalRowGadget: "showGrandTotalRow",
         showRowSubtotalsGadget: "showRowSubtotals",
         showGrandTotalColumnGadget: "showGrandTotalColumn",
         rowGroupCollapseGadget: "rowGroupCollapse",
         cellColorGadget: "cellColor",
         cellColorLowGadget: "cellColorLow",
         cellColorHighGadget: "cellColorHigh",
         headerColorGadget: "headerColor",
         headerDataColorGadget: "headerDataColor",
         showDescriptionsGadget: "showDescriptions",
         showSourceBadgesGadget: "showSourceBadges",
         showHeaderUnderlineGadget: "showHeaderUnderline",
         tooltipAlignGadget: "tooltipAlign",
         printOrientationGadget: "printOrientation",
         showPrintPdfGadget: "showPrintPdf",
         showPrintCanvasGadget: "showPrintCanvas",
         printMarginGadget: "printMargin",
         printTableSizeGadget: "printTableSize",
         printCanvasSpacingGadget: "printCanvasSpacing",
         printFollowThemeGadget: "printFollowTheme",
         debugLogMetadataGadget: "debugLogMetadata"
      };
      var key = map[sGadgetID];
      if (!key) return false;
      var TOGGLE_GADGETS = {
         showGrandTotalRowGadget: 1, showRowSubtotalsGadget: 1, showGrandTotalColumnGadget: 1,
         rowGroupCollapseGadget: 1, cellColorGadget: 1, showDescriptionsGadget: 1,
         showSourceBadgesGadget: 1, showHeaderUnderlineGadget: 1,
         showPrintPdfGadget: 1, showPrintCanvasGadget: 1,
         printFollowThemeGadget: 1, debugLogMetadataGadget: 1
      };
      if (TOGGLE_GADGETS[sGadgetID]) {
         this.Config[key] = oPropChange.checked ? "on" : "off";
      } else {
         this.Config[key] = oPropChange.value;
      }
      if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
      else this._saveSettings();
      return true;
   };

   /* =========================================================================
      8. LIFECYCLE
      ========================================================================= */

   GlossaryPivotViz.prototype.render = function (oTransientRenderingContext) {
      this._render(oTransientRenderingContext);
   };

   GlossaryPivotViz.prototype.resizeVisualization = function (oVizDimensions, oTransientVizContext) {
      var oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._render(oTransientRenderingContext);
   };

   /**
    * Registers this instance in window.__wsuPrintCanvas — a plain, same-page
    * registry (not an OAC API; see the v0.14 file-header note) — so a Print
    * Canvas click on any Glossary Pivot on the page can ask this instance
    * for its own fragment. The closure only captures `self`; build() reads
    * self._lastDataLayout/self.Config lazily, at print time, so the entry
    * never goes stale between registration and a later click. Safe to call
    * more than once: the key is generated once and reused
    * (this._wsuPrintKey), so a repeat call overwrites the same registry
    * entry instead of adding a duplicate.
    *
    * Called from both _doInitializeComponent and _doRender, not just the
    * first. Confirmed on the tenant: switching to a canvas tab that had
    * never been visited in the session left its Glossary Pivot registered
    * nowhere and its own Print Canvas click pulling in a different,
    * already-visited canvas's tables instead — _doInitializeComponent did
    * not fire for it (no warning logged either, so not a thrown error, just
    * never called), while _doRender demonstrably did, since its print bar
    * was on screen. Registering again here costs nothing on the common path
    * and is what makes a canvas whose init hook was skipped still
    * print-capable.
    */
   GlossaryPivotViz.prototype._registerPrintCanvas = function () {
      var self = this;
      try {
         window.__wsuPrintCanvas = window.__wsuPrintCanvas || {};
         /* Keyed per instance, not by getID() alone. Two canvases can hand
            two visualizations the same id, and the one that stops last would
            delete the one still on screen. */
         if (!this._wsuPrintKey) this._wsuPrintKey = printCanvasKey(this, "gp-");
         window.__wsuPrintCanvas[this._wsuPrintKey] = {
            getContainer: function () { return self.getContainerElem(); },
            build: function () {
               var fragment = null;
               try { fragment = self._buildPrintFragment(); } catch (e) { fragment = null; }
               if (!fragment || !fragment.html) return null;
               var prepared = null;
               try { prepared = preparePrintTable(fragment.html, fragment.title); } catch (e2) { prepared = null; }
               return {
                  title: fragment.title,
                  html: prepared || fragment.html,
                  printTableSize: self.Config.printTableSize,
                  printOrientation: self.Config.printOrientation === "portrait" ? "portrait" : "landscape"
               };
            }
         };
      } catch (e) {
         _logger.warning("Print Canvas registration failed: " + (e && e.message ? e.message : e));
      }
   };

   /**
    * One-time init. NOTE: there is no data model here — no rendering context,
    * no columns. Anything that needs data belongs in the first render() pass.
    */
   GlossaryPivotViz.prototype._doInitializeComponent = function () {
      GlossaryPivotViz.superClass._doInitializeComponent.call(this);
      try {
         this.subscribeToEvent(events.types.INTERACTION_HIGHLIGHT, this.onHighlight,
            this.getViewName() + "." + events.types.INTERACTION_HIGHLIGHT);
      } catch (e) {
         _logger.warning("Could not subscribe to INTERACTION_HIGHLIGHT: " + (e && e.message ? e.message : e));
      }
      this._registerPrintCanvas();
   };

   /**
    * Every reference plugin in this family implements this and calls the
    * superclass, even though none of them explicitly unsubscribe their own
    * subscribeToEvent calls either (checked: WSU Dumbbell's _doStopComponent
    * only tears down its own body-attached tooltip and D3-specific state
    * before calling super — INTERACTION_HIGHLIGHT is never unsubscribed
    * there). Two things ARE attached outside elContainer as of v0.13/v0.14
    * and are cleaned up below: the print iframe (document.body) and this
    * instance's window.__wsuPrintCanvas registry entry.
    */
   GlossaryPivotViz.prototype._doStopComponent = function () {
      if (activePrintJob && activePrintJob.owner === this) cleanupPrintJob(activePrintJob);
      else if (this._printFrame && this._printFrame.parentNode) this._printFrame.parentNode.removeChild(this._printFrame);
      this._printFrame = null;
      this._lastDataLayout = null;
      this._renderRevision++;
      try {
         if (window.__wsuPrintCanvas && this._wsuPrintKey) delete window.__wsuPrintCanvas[this._wsuPrintKey];
      } catch (e) {}
      GlossaryPivotViz.superClass._doStopComponent.apply(this, arguments);
   };

   /**
    * Factory method declared in the plugin configuration.
    */
   function createClientComponent(sID, sDisplayName, sOrigin) {
      return new GlossaryPivotViz(sID, sDisplayName, sOrigin, GlossaryPivotViz.VERSION);
   }

   return {
      createClientComponent: createClientComponent,
      _expandBodyRowspans: expandBodyRowspans,
      _joinPrintSections: joinPrintSections,
      _plainTitle: plainTitle,
      _printPageBox: printPageBox,
      _fitScale: fitScale,
      _printTableLayout: printTableLayout,
      _fitPrintedReport: fitPrintedReport,
      _parseMeasureFormatOverrides: parseMeasureFormatOverrides,
      _formatValue: formatValue,
      _headerPaint: headerPaint,
      _interpolateColor: interpolateColor,
      _buildGlossary: buildGlossary,
      _collectPrintCanvasEntries: collectPrintCanvasEntries,
      _openGlossaryPrint: openGlossaryPrint,
      _computeMeasureIdByCol: computeMeasureIdByCol,
      _resolveFormat: resolveFormat
   };
});
