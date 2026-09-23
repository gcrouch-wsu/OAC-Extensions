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
 *   - An opt-in "log column metadata" debug toggle. Off by default; when a
 *     viewer turns it on, EVERY render (including a resize; _rerenderTable
 *     after a group-collapse toggle does not, since it never touches
 *     descriptions) dumps the live column-info map and the rendering context
 *     to the console so the three-source description question (Subject Area
 *     vs. Dataset vs. workbook Calculated Field) can be investigated on a
 *     real tenant without a second temporary build.
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
      SRC_BUNDLED: L("GLOSSARYPIVOT_LBL_SRC_BUNDLED", "Bundled fallback"),
      TOTAL: L("GLOSSARYPIVOT_LBL_TOTAL", "Total"),
      PRINT: L("GLOSSARYPIVOT_LBL_PRINT", "Print PDF"),
      PRINT_ERROR: L("GLOSSARYPIVOT_LBL_PRINT_ERROR", "Print could not open. Use the browser print dialog if it appears, or allow this page to print.")
   };

   GlossaryPivotViz.VERSION = "0.13.0";

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
         printTitle: "Report",
         printOrientation: "landscape",    // landscape | portrait
         showPrintButton: "on",            // on | off — the Print PDF bar on the canvas. The printed pages never include it.
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
         showSourceBadges: "off",           // on | off — Live and Workbook override chips. Bundled fallback still shows.
         showHeaderUnderline: "off",        // on | off — dotted underline on headers that have a description
         tooltipAlign: "left",              // left | center | right — text inside the tooltip, not the bubble's position
         // Debug
         debugLogMetadata: "off"            // on | off — console-dump the live column-info map once per render, for investigating the 3-source description question
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
      live column-info map, the bundled fallback) fill the index behind it
      without the renderer knowing which one supplied a given column.
      ========================================================================= */

   /* FALLBACK ONLY. Used for a column only when the live column-info map has
      no entry for it. Sourced from the WSU Reporting knowledge base's Student
      Data Warehouse field dictionary (Student_DW_Baseline.xlsx), captured
      2026-09-22 — each entry cites the KB field-map group page and workbook
      row so it can be re-checked against the live dictionary later rather
      than trusted forever. The tooltip badge says "Bundled fallback" when
      this is the source, so stale text is visible as such.

      Columns that appeared in the v0.3 map but could not be confirmed against
      the dictionary (AMOUNT — ambiguous, several unrelated columns share that
      exact name across tables, per the KB's own "repeated presentation names
      can be different mappings" warning; NEGATIVE_SERVICE_INDICATORS(_DESCR),
      SERVICE_IMPACT_CODES, SERVICE_IMPACTS — pipe-joined aggregates that read
      like a report-specific calculation, not a raw Student Data Warehouse
      column; STUDENT, ACADEMIC_LEVEL, FULL_PART_TIME, DEGREE_CHKOUT_STATUS —
      no column by that exact name in the dictionary) are intentionally left
      out rather than carried forward as unverified guesses. */
   var FALLBACK_DESCRIPTIONS = {
      // Student Records: enrollment and standing fields — Student Enrolled (ESG_STDNT_CAR_TERM)
      "STRM": "This is the term code in YYYT format, where YYY is the year, and T is the term type of the season (3 = Spring, 5 = Summer, 7 = Fall).", // row 3
      "TERM": "Short description of the term.", // TERM_DESCRSHORT, rows 5 & 716 — one logical column shared by Student Enrolled and Class Registration
      "ACAD_CAREER": "This is the academic career code of the student. (UGRD = Undergraduate; GRAD = Graduate; BUSN = Business; PHAR = Pharmacy; VETM = Veterinary Medicine; MEDI = WA...)", // row 7
      "ACADEMIC_LOAD": "Field displays students academic load. (i.e. F = Full-time, L = Less than 1/2 time, etc.)", // row 18
      "ACAD_LEVEL_BOT": "Term Start Academic Level Code.", // row 28
      "UNT_TAKEN_PRGRSS": "Term Credit Hours.", // row 43
      "TOT_CUMULATIVE": "Total cumulative transfer units of all accepted work.", // row 68 — business label "Cumulative Credit Hours"
      "CUM_GPA": "Cumulative GPA for WSU work.", // row 69

      // Student Records: program, plan, and requirement fields — Student Academic Program (ESG_ACAD_PROG)
      "CAMPUS": "5 character code associated with the Academic Program (e.g. PULLM = Pullman, VANCO = Vancouver).", // row 141
      "ACAD_GROUP": "5 character academic group code (e.g. EBUSN, ECOMM, OGRAD).", // row 147
      "ACAD_PROG": "5 digit academic program code (e.g. D0000 = Undergraduate Degree-Seeking, D0005 = Business Administration, BA).", // row 144
      "ADMIT_TERM": "Term of Admission.", // row 161
      "EXP_GRAD_TERM": "Expected Graduation Term (if applied).", // row 170
      "DEGR_CHKOUT_STAT": "Degree Application Status Code (e.g. AG = Applied, EG = Eligible, AP = Approved).", // row 173

      // Student Records: program, plan, and requirement fields — Student Academic Plan (ESG_ACAD_PLAN)
      "ACAD_PLAN": "9 digit academic plan code (ie. - P6500_0005).", // row 190

      // Person Data fields — Student Name (ESG_NAMES)
      "NAME_DISPLAY": "First, Last Name." // row 2129
   };

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
      by column id — and outranks the bundled fallback. "override" (an
      explicit per-workbook description, e.g. a Calculated Field's) outranks
      a plain catalog-level "live" read, since it is more specific to what
      this workbook's author actually meant for this column. */
   var ORIGIN_RANK = { bundled: 0, live: 1, override: 2 };

   function buildGlossary(map) {
      var index = Object.create(null);
      Object.keys(map).forEach(function (k) {
         index[exactKey(k)] = { text: map[k], origin: "bundled" };
      });

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
      _properties second); any failure yields {} and the bundled fallback
      stays in play for OAC builds where the path differs.
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

   function resolveFormat(Config, overrides, measureId) {
      var o = measureId != null ? overrides[String(measureId).toUpperCase()] : null;
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
      var dp = fmtSpec.decimalPlaces === "auto" ? null : parseInt(fmtSpec.decimalPlaces, 10);
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
         var idStr = id == null ? "__single__" : String(id);
         idByCol[c] = idStr;
         if (!(idStr in nameById)) {
            var name = null;
            try { name = dl.getValue(PHYS_COLUMN, mLayer, c, false); } catch (e) {}
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

   /* Empty or invalid hex paints nothing, so the stylesheet default stays.
      Custom properties, not an inline background: the glossary hover rule
      is more specific and must still be able to cover the header. */
   function headerPaint(hex) {
      var rgb = hexToRgb(hex);
      if (!rgb) return { cls: "", style: "" };
      var luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      var fg = luminance > 0.55 ? "#1b1f24" : "#ffffff";
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
      var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return { bg: "rgb(" + r + "," + g + "," + b + ")", fg: luminance > 0.55 ? "#1b1f24" : "#ffffff" };
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
      var elContainer = this.getContainerElem();
      if (!elContainer) return;

      this.loadConfig();

      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      if (!oDataLayout) {
         $(elContainer).html("<div class='gp-empty'>" + escapeHtml(LBL.EMPTY_STATE) + "</div>");
         return;
      }
      this._lastDataLayout = oDataLayout;

      if (!this._glossary) {
         this._glossary = buildGlossary(FALLBACK_DESCRIPTIONS);
      }

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
                  degrade to bundled text silently. */
               this._mapMissingLogged = true;
               _logger.warning("column-info map not found on the rendering context — falling back to the bundled glossary");
            }
         } catch (e) {
            _logger.warning("column-info map read failed: " + (e && e.message ? e.message : e));
         }
      }

      /* Opt-in diagnostic for the 3-source description question (Subject
         Area vs. Dataset column vs. workbook Calculated Field). Off by
         default; a viewer flips it on in the property panel, opens DevTools,
         and expands the logged objects — nothing here decides or guesses at
         an answer, it just surfaces what OAC actually handed the plugin. */
      if (this.Config.debugLogMetadata === "on") {
         try {
            _logger.info("[debug] column-info map (raw):");
            console.log(infoMap);
            _logger.info("[debug] resolved live descriptions:");
            console.log(infoMap ? descriptionsFromColumnInfoMap(infoMap) : null);
            _logger.info("[debug] rendering context (expand 'vizContext' and try other keys if the map above is empty for a Dataset/Calculated-Field column):");
            console.log(oTransientRenderingContext);
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
         while (si < src.length || waiting(col)) {
            if (waiting(col)) {
               var hold = pending[col];
               dst.push({ html: hold.html, colspan: hold.colspan, tag: hold.tag, className: hold.className, style: hold.style });
               hold.left -= 1;
               if (hold.left <= 0) pending[col] = null;
               col += hold.colspan;
            } else {
               var cell = src[si++];
               var colspan = cell.colspan || 1;
               var rowspan = cell.rowspan || 1;
               dst.push({ html: cell.html, colspan: colspan, tag: cell.tag, className: cell.className, style: cell.style });
               if (rowspan > 1) {
                  pending[col] = {
                     html: cell.html, colspan: colspan, left: rowspan - 1,
                     tag: cell.tag, className: cell.className, style: cell.style
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
            if (cell.colspan > 1) el.colSpan = cell.colspan;
            el.innerHTML = cell.html;
            tr.appendChild(el);
         }
         body.appendChild(tr);
      }
   }

   function tableHtmlForPrint(tableHtml, title, orient) {
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
         titleCell.className = "gp-print-title";
         titleCell.colSpan = span;
         titleCell.appendChild(document.createTextNode(title));
         titleRow.appendChild(titleCell);
         head.insertBefore(titleRow, head.firstChild);
      }
      return "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" +
         escapeHtml(title) + "</title><style>" +
         "@page { size: " + orient + "; margin: 0.5in; }" +
         "body { margin: 0; color: #1b1f24; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }" +
         "table { border-collapse: collapse; width: 100%; }" +
         "th, td { border: 1px solid #b7bcc2; padding: 3px 6px; vertical-align: top; white-space: normal; }" +
         "thead { display: table-header-group; }" +
         "tr { break-inside: avoid; page-break-inside: avoid; }" +
         "th { background: #f0f2f4; font-weight: 700; text-align: center; }" +
         "th.gp-print-title { background: #ffffff; font-size: 13pt; text-align: left; border: 0; padding: 0 0 8px; }" +
         "th.gp-rowhdr, th.gp-corner { text-align: left; background: #f7f8f9; }" +
         "td.gp-val { text-align: right; font-variant-numeric: tabular-nums; }" +
         "tr.gp-total-row th, tr.gp-total-row td { font-weight: 700; background: #eef2f4; }" +
         "td.gp-heat { background: var(--gp-cell-bg); color: var(--gp-cell-fg); }" +
         "th, tr.gp-total-row td, td.gp-heat { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" +
         "</style></head><body>" + table.outerHTML + "</body></html>";
   }

   function openGlossaryPrint(self, html) {
      try {
         if (self._printFrame && self._printFrame.parentNode) {
            self._printFrame.parentNode.removeChild(self._printFrame);
         }
         var iframe = document.createElement("iframe");
         iframe.setAttribute("title", "Report print");
         iframe.setAttribute("style", "position:fixed;width:0;height:0;border:0;right:0;bottom:0;");
         document.body.appendChild(iframe);
         self._printFrame = iframe;
         var win = iframe.contentWindow;
         var doc = win.document;
         doc.open();
         doc.write(html);
         doc.close();
         win.focus();
         win.print();
         win.onafterprint = function () {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (self._printFrame === iframe) self._printFrame = null;
         };
         return true;
      } catch (e) {
         _logger.error("print failed: " + (e && e.message ? e.message : e));
         return false;
      }
   }

   GlossaryPivotViz.prototype._printTable = function () {
      var dl = this._lastDataLayout;
      if (!dl) return { ok: false, error: "empty" };
      var saved = this._collapsedGroups;
      this._collapsedGroups = Object.create(null);
      var tableHtml = null;
      try {
         tableHtml = this._buildTable(dl);
      } catch (e) {
         _logger.error("print build failed: " + (e && e.message ? e.message : e));
      } finally {
         this._collapsedGroups = saved;
      }
      if (!tableHtml || tableHtml.indexOf("<table") < 0) return { ok: false, error: "empty" };
      var title = (this.Config.printTitle && String(this.Config.printTitle).trim()) || "Report";
      var orient = this.Config.printOrientation === "portrait" ? "portrait" : "landscape";
      var docHtml = tableHtmlForPrint(tableHtml, title, orient);
      if (!docHtml) return { ok: false, error: "empty" };
      if (!openGlossaryPrint(this, docHtml)) return { ok: false, error: "print" };
      return { ok: true };
   };

   GlossaryPivotViz.prototype._wirePrint = function ($c) {
      var self = this;
      $c.find(".gp-printbtn").off("click.gpprint").on("click.gpprint", function () {
         var $err = $c.find(".gp-printerr");
         $err.hide();
         var result = self._printTable();
         if (result.ok) return;
         $err.text(result.error === "print" ? LBL.PRINT_ERROR : LBL.EMPTY_STATE).show();
      });
   };

   GlossaryPivotViz.prototype._replaceTableHtml = function (elContainer, html) {
      var $c = $(elContainer);
      var $oldWrap = $c.find(".gp-wrap");
      var scrollTop = $oldWrap.length ? $oldWrap.scrollTop() : 0;
      var scrollLeft = $oldWrap.length ? $oldWrap.scrollLeft() : 0;
      var bar = "";
      if (this.Config.showPrintButton !== "off") {
         bar = "<div class='gp-printbar'>" +
                  "<span class='gp-printerr' style='display:none'></span>" +
                  "<button type='button' class='gp-printbtn'>" + escapeHtml(LBL.PRINT) + "</button>" +
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
      this._wireGroupToggle(elContainer);
      this._wireSort(elContainer);
      this._applyMarkedRows();
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
         var attrs = " class='" + cls + (d ? " gp-has-desc" : "") + (sortKey ? " gp-sortable" : "") + paint.cls + "'" + paint.style;
         if (span > 1) attrs += " " + spanAttr + "='" + span + "'";
         if (d) {
            attrs += " data-gp-name='" + escapeHtml(lookupName == null ? "" : lookupName) + "'";
            if (columnId != null) attrs += " data-gp-key='" + escapeHtml(columnId) + "'";
            attrs += " tabindex='0'";
         }
         if (markRows) attrs += " data-gp-mark-rows='" + markRows[0] + ":" + markRows[1] + "'";
         var ind = "";
         if (sortKey) {
            attrs += " data-gp-sort='" + escapeHtml(sortKey) + "'";
            if (sortIsActive(sortKey)) {
               var desc = sortState.dir === "desc";
               ind = "<span class='gp-sort-ind'>" + (desc ? "▼" : "▲") + "</span>";
               attrs += " aria-sort='" + (desc ? "descending" : "ascending") + "'";
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
               out.push("<th class='gp-corner" + cornerPaint.cls + "'" + cornerPaint.style +
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
               out.push("<th class='gp-colhdr gp-total-colhdr" + totalPaint.cls + "'" + totalPaint.style + rs + ">" +
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
            cells.push("<th class='gp-rowhdr gp-total-label'" +
                       (nVisRows > 1 ? " colspan='" + nVisRows + "'" : "") +
                       ">" + escapeHtml(labelText) + "</th>");
         }
         for (var cc = 0; cc < nCols; cc++) {
            if (colHidden[cc]) continue;
            var mId = measureIdByCol[cc];
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId);
            var val = sumBlock(dl, rStart, rEnd, [cc]);
            cells.push("<td class='gp-val gp-total-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
         }
         if (wantTotalCol) {
            buckets.order.forEach(function (bid) {
               var fmt = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid);
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
            cells.push("<th class='gp-rowhdr gp-group-label'" +
                       (nVisRows > 1 ? " colspan='" + nVisRows + "'" : "") +
                       " data-gp-toggle-group='" + groupKey + "'>" +
                       "<span class='gp-group-toggle'>▸</span><span class='gp-lbl'>" +
                       escapeHtml(labelText) + "</span></th>");
         }
         for (var cc = 0; cc < nCols; cc++) {
            if (colHidden[cc]) continue;
            var mId = measureIdByCol[cc];
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId);
            var val = sumBlock(dl, rStart, rEnd, [cc]);
            cells.push("<td class='gp-val gp-group-val'>" + escapeHtml(val == null ? "" : formatValue(val, fmt)) + "</td>");
         }
         if (wantTotalCol) {
            buckets.order.forEach(function (bid) {
               var fmt = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid);
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
            var fmt = resolveFormat(self.Config, overrides, mId === "__single__" ? null : mId);
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
               var fmt2 = resolveFormat(self.Config, overrides, bid === "__single__" ? null : bid);
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
                     toggle = "<span class='gp-group-toggle' data-gp-toggle-group='" + lead.groupKey + "'>▾</span>";
                  }
                  var span = spanEnd - rowi + 1;
                  out.push("<th class='gp-rowhdr' data-gp-mark-rows='" + markRowsAttr(indices) + "'" +
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
      this._$tip = $tip;

      function show(el) {
         var $el = $(el);
         var name = $el.attr("data-gp-name") || "";
         var key  = $el.attr("data-gp-key") || null;
         var d = null;
         try { d = self._glossary.getDescription(name, key); } catch (e) {}
         if (!d) { hide(); return; }
         /* Live and Workbook override chips are optional. Bundled fallback
            stays visible: it is the chip that says the text is not from OAC. */
         var showBadge = d.origin === "bundled" || self.Config.showSourceBadges === "on";
         var srcLabel = d.origin === "override" ? LBL.SRC_OVERRIDE
                       : d.origin === "live"     ? LBL.SRC_LIVE
                       :                           LBL.SRC_BUNDLED;
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

      function hide() { $tip.removeClass("gp-on"); }

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
         self._markRows(rows, !!event.ctrlKey);
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
        /* Glossary headers are already focusable (tabindex, for the tooltip).
           Enter/Space sorts that same cell; a non-glossary header has no tab
           stop, so this does not add one. */
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
      var service = this.getMarkingService();
      function callback() {
         self._markedRows = Object.create(null);
         if (!self.isStarted()) return;
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
      addToggle(pGen, "showPrintButtonGadget", "Print: Show Button", this.Config.showPrintButton);
      addText(pGen, factory, "printTitleGadget", "Print: Report Title", this.Config.printTitle);
      addSwitcher(pGen, "printOrientationGadget", "Print: Page Orientation", this.Config.printOrientation,
         [{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }], nx("FMT"));
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
         printTitleGadget: "printTitle",
         printOrientationGadget: "printOrientation",
         showPrintButtonGadget: "showPrintButton",
         debugLogMetadataGadget: "debugLogMetadata"
      };
      var key = map[sGadgetID];
      if (!key) return false;
      var TOGGLE_GADGETS = {
         showGrandTotalRowGadget: 1, showRowSubtotalsGadget: 1, showGrandTotalColumnGadget: 1,
         rowGroupCollapseGadget: 1, cellColorGadget: 1, showDescriptionsGadget: 1,
         showSourceBadgesGadget: 1, showHeaderUnderlineGadget: 1, showPrintButtonGadget: 1, debugLogMetadataGadget: 1
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
   };

   /**
    * Every reference plugin in this family implements this and calls the
    * superclass, even though none of them explicitly unsubscribe their own
    * subscribeToEvent calls either (checked: WSU Dumbbell's _doStopComponent
    * only tears down its own body-attached tooltip and D3-specific state
    * before calling super — INTERACTION_HIGHLIGHT is never unsubscribed
    * there). This plugin has no DOM attached outside its own container (the
    * tooltip div lives inside elContainer, not body), so there is nothing
    * extra to clean up here — this exists for lifecycle symmetry with the
    * rest of the family, not because a specific leak was found.
    */
   GlossaryPivotViz.prototype._doStopComponent = function () {
      if (this._printFrame && this._printFrame.parentNode) {
         this._printFrame.parentNode.removeChild(this._printFrame);
      }
      this._printFrame = null;
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
      _expandBodyRowspans: expandBodyRowspans
   };
});
