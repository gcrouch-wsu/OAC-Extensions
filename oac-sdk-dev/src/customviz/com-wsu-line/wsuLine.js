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
        'obitech-reportservices/data',
        'obitech-appservices/logger',
        'd3v6js',
        'skin!css!com-wsu-line/wsuLinestyles'],
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
                 data,
                 logger,
                 d3) {
   "use strict";

   var MODULE_NAME = 'com-wsu-line/wsuLine';
   jsx.assertAllNotNullExceptLastN(arguments, MODULE_NAME + " arguments", 1);

   var _logger = new logger.Logger(MODULE_NAME);
   _logger.info("Initializing WSU Line plugin");

   jsx.assertObject(datamodelshapes.Physical, MODULE_NAME + " datamodelshapes.Physical");
   jsx.assertObject(datamodelshapes.Logical, MODULE_NAME + " datamodelshapes.Logical");
   jsx.assertObject(dataviz.SettingsNS, MODULE_NAME + " dataviz.SettingsNS");
   jsx.assertObject(dataviz.DataContextProperty, MODULE_NAME + " dataviz.DataContextProperty");
   jsx.assertObject(data.LayerMetadata, MODULE_NAME + " data.LayerMetadata");
   var PHYS_DATA = datamodelshapes.Physical.DATA;
   var PHYS_ROW = datamodelshapes.Physical.ROW;
   var PHYS_COLUMN = datamodelshapes.Physical.COLUMN;
   var LOGICAL_COLOR = datamodelshapes.Logical.COLOR;
   var LAYER_DISPLAY_NAME = data.LayerMetadata.LAYER_DISPLAY_NAME;
   var SETTINGS_CHART = dataviz.SettingsNS.CHART;
   var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
   var DCP_DATA_LAYOUT_HELPER = dataviz.DataContextProperty.DATA_LAYOUT_HELPER;

   var LBL = {
      COMPARE_VS_AVG: "Vs Avg",
      COMPARE_RANK: "Rank",
      COMPARE_CHANGE: "Δ 1 Year",
      COMPARE_PCT_CHANGE: "Δ% 1 Year",
      DELTA_3Y_VALUE: "Δ 3 Years",
      DELTA_3Y_PCT: "Δ% 3 Years",
      AVG_PREFIX: "Average",
      ROW_LIMIT_FOOTER: "Showing {0} of {1} series",
      COL_LIMIT_FOOTER_ONE: "+{0} more column not shown",
      COL_LIMIT_FOOTER_MANY: "+{0} more columns not shown",
      RESET_ZOOM: "Reset Zoom",
      HEADER_NONE: "—",
      HEADER_MORE: "+{0} more",
      EMPTY_BUCKETS: "No rows to display. Drop a measure on Value (Y-Axis), an attribute on Category (X-Axis), and optionally a field on Series / Color.",
      EMPTY_NO_NUMERIC: "Source data has rows but no numeric values for the selected measure. Verify the Y-axis field is treated as a Measure (not Attribute) on the dataset."
   };

   // Map config string -> d3 symbol generator. Using d3.symbol() lets us match
   // legend markers to chart points using one shape source of truth.
   function symbolType(name) {
      switch (name) {
         case "square":   return d3.symbolSquare;
         case "triangle": return d3.symbolTriangle;
         case "diamond":  return d3.symbolDiamond;
         case "cross":    return d3.symbolCross;
         case "star":     return d3.symbolStar;
         case "wye":      return d3.symbolWye;
         default:         return d3.symbolCircle;
      }
   }

   // Map config string -> stroke-dasharray scaled by line width.
   function dashArrayFor(pattern, width) {
      var w = Math.max(Number(width) || 2, 1);
      switch (pattern) {
         case "dashed":  return (w * 4) + " " + (w * 2);
         case "dotted":  return (w * 1) + " " + (w * 2);
         case "dashdot": return (w * 4) + " " + (w * 2) + " " + (w * 1) + " " + (w * 2);
         default:        return null; // solid
      }
   }

   function curveFor(name) {
      switch (name) {
         case "smooth":  return d3.curveMonotoneX;
         case "step":    return d3.curveStepAfter;
         case "stepBefore": return d3.curveStepBefore;
         default:        return d3.curveLinear;
      }
   }

   function WsuLineViz(sID, sDisplayName, sOrigin, sVersion) {
      WsuLineViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);

      this.Config = {
         tooltipMode: "sharedX",
         tooltipSortColumn: "",
         tooltipSortDirection: "auto",
         tooltipLimit: 20,
         tooltipColumnLimit: 20,
         headerChipLimit: 6,
         xSort: "natural",
         aggregation: "sum",
         legend: "on",
         legendPosition: "auto",
         legendMarkerShape: "match",
         legendMarkerSize: 5,
         legendFontSize: 11,
         legendLabelMaxLength: 18,
         legendOrder: "chronoAsc",
         showPoints: "on",
         showGridlines: "on",
         showGuide: "on",
         showAverage: "on",
         showXInTitle: "on",
         showXPerRow: "on",
         showSeriesCol: "on",
         showValueCol: "on",
         xLabels: "auto",
         xAxisTitle: "",
         yAxisTitle: "",
         yAxisTitleSource: "auto",
         xAxisTitleFontSize: 11,
         yAxisTitleFontSize: 11,
         xAxisTitleColor: "",
         yAxisTitleColor: "",
         axisTitleBold: "on",
         axisTitleItalic: "off",
         valueLabel: "",
         seriesLabel: "",
         palette: "",
         colorSource: "oac",
         currentColor: "#1e88e5",
         backgroundOpacity: 0.45,
         lineWidth: 2,
         linePattern: "solid",
         lineSmoothing: "linear",
         pointSize: 4,
         pointShape: "circle",
         compareMode: "average",
         delta3Mode: "off",
         clickBehavior: "sharedX",
         privacyMode: "off",
         zoomMode: "x",
         numberFormat: "auto",
         decimalPlaces: "auto",
         valuePrefix: "",
         valueSuffix: "",
         missingValueMode: "hide",
         headerPreset: "default",
         headerBackgroundColor: "",
         headerFontSize: 11,
         headerFontBold: "off",
         headerFontItalic: "off",
         headerFontUnderline: "off",
         headerFontColor: ""
      };

      var selectedRows = new Map();
      var zoomState = null;
      var lastDatasetMeta = null;
      var legendActiveSeries = null;

      this._saveSettings = function() {
         this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
      };

      this.loadConfig = function() {
         var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
         Object.keys(this.Config).forEach(function(key) {
            if (!jsx.isNull(conf[key]) && typeof conf[key] !== "undefined") this.Config[key] = conf[key];
         }, this);
         this.Config.lineWidth = Number(this.Config.lineWidth) || 2;
         this.Config.pointSize = Number(this.Config.pointSize) || 4;
         this.Config.tooltipLimit = Number(this.Config.tooltipLimit) || 20;
         this.Config.tooltipColumnLimit = Number(this.Config.tooltipColumnLimit);
         if (isNaN(this.Config.tooltipColumnLimit) || this.Config.tooltipColumnLimit < 1) this.Config.tooltipColumnLimit = 20;
         this.Config.headerChipLimit = Number(this.Config.headerChipLimit);
         if (isNaN(this.Config.headerChipLimit) || this.Config.headerChipLimit < 1) this.Config.headerChipLimit = 6;
         this.Config.headerFontSize = Number(this.Config.headerFontSize);
         if (isNaN(this.Config.headerFontSize) || this.Config.headerFontSize < 8) this.Config.headerFontSize = 11;
         this.Config.legendMarkerSize = Number(this.Config.legendMarkerSize);
         if (isNaN(this.Config.legendMarkerSize) || this.Config.legendMarkerSize < 4) this.Config.legendMarkerSize = 5;
         this.Config.legendFontSize = Number(this.Config.legendFontSize);
         if (isNaN(this.Config.legendFontSize) || this.Config.legendFontSize < 8) this.Config.legendFontSize = 11;
         this.Config.legendLabelMaxLength = Number(this.Config.legendLabelMaxLength);
         if (isNaN(this.Config.legendLabelMaxLength) || this.Config.legendLabelMaxLength < 6) this.Config.legendLabelMaxLength = 18;
         this.Config.backgroundOpacity = Number(this.Config.backgroundOpacity);
         if (isNaN(this.Config.backgroundOpacity)) this.Config.backgroundOpacity = 0.45;
         this.Config.xAxisTitleFontSize = Number(this.Config.xAxisTitleFontSize);
         if (isNaN(this.Config.xAxisTitleFontSize) || this.Config.xAxisTitleFontSize < 8) this.Config.xAxisTitleFontSize = 11;
         this.Config.yAxisTitleFontSize = Number(this.Config.yAxisTitleFontSize);
         if (isNaN(this.Config.yAxisTitleFontSize) || this.Config.yAxisTitleFontSize < 8) this.Config.yAxisTitleFontSize = 11;
         this.Config.yAxisTitleSource = this.Config.yAxisTitleSource === "hidden" ? "hidden" : "auto";
      };

      this.getSelectedRows = function() { return selectedRows; };
      this.clearSelectedRows = function() { selectedRows = new Map(); };
      this.getZoomState = function() { return zoomState; };
      this.setZoomState = function(state) { zoomState = state; };
      this.clearZoomState = function() { zoomState = null; };
      this.getLastDatasetMeta = function() { return lastDatasetMeta; };
      this.setLastDatasetMeta = function(meta) { lastDatasetMeta = meta; };
      this.getLegendActiveSeries = function() { return legendActiveSeries; };
      this.setLegendActiveSeries = function(s) { legendActiveSeries = s; };
   }

   WsuLineViz.VERSION = "1.1.1";
   jsx.extend(WsuLineViz, dataviz.DataVisualization);

   function str(value) {
      if (jsx.isNull(value) || typeof value === "undefined") return "";
      return String(value);
   }

   function esc(value) {
      return str(value)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#39;");
   }

   // Accept hex, rgb()/rgba(), hsl()/hsla(), or a CSS named color the browser
   // recognizes; anything else (including stray CSS declarations) becomes "".
   function safeCssColor(value) {
      var c = str(value).trim();
      if (!c) return "";
      if (/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(c)) return c;
      if (/^(rgb|hsl)a?\([\d.,\s%]+\)$/i.test(c)) return c;
      if (/^[a-z]+$/i.test(c)) {
         try {
            if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("color", c)) return c;
         }
         catch (e) { /* fall through */ }
      }
      return "";
   }

   function decimalsRange(opts) {
      var raw = opts && opts.decimalPlaces;
      var format = (opts && opts.numberFormat) || "auto";
      if (raw === undefined || raw === null || raw === "" || raw === "auto") {
         return {min: 0, max: format === "percent" ? 1 : 2};
      }
      var d = Number(raw);
      if (isNaN(d) || d < 0) return {min: 0, max: 2};
      d = Math.min(Math.max(Math.round(d), 0), 6);
      return {min: d, max: d};
   }

   function formatCompact(n, dec) {
      var abs = Math.abs(n);
      var sign = n < 0 ? "-" : "";
      var a = abs, u = "";
      if (abs >= 1e9) { a = abs / 1e9; u = "B"; }
      else if (abs >= 1e6) { a = abs / 1e6; u = "M"; }
      else if (abs >= 1e3) { a = abs / 1e3; u = "K"; }
      var maxFrac = u ? Math.max(dec.max, 1) : dec.max;
      try {
         return sign + a.toLocaleString(undefined, {minimumFractionDigits: dec.min, maximumFractionDigits: maxFrac}) + u;
      }
      catch (e) {
         return sign + a + u;
      }
   }

   function formatValue(value, opts) {
      if (jsx.isNull(value) || value === "" || isNaN(value)) return "";
      var n = Number(value);
      var format = (opts && opts.numberFormat) || "auto";
      var prefix = (opts && opts.valuePrefix) || "";
      var suffix = (opts && opts.valueSuffix) || "";
      var dec = decimalsRange(opts);
      var formatted;
      try {
         if (format === "percent") {
            formatted = n.toLocaleString(undefined, {style: "percent", minimumFractionDigits: dec.min, maximumFractionDigits: dec.max});
         }
         else if (format === "currency") {
            formatted = n.toLocaleString(undefined, {style: "currency", currency: "USD", minimumFractionDigits: dec.min, maximumFractionDigits: dec.max});
         }
         else if (format === "compact") {
            formatted = formatCompact(n, dec);
         }
         else {
            formatted = n.toLocaleString(undefined, {minimumFractionDigits: dec.min, maximumFractionDigits: dec.max});
         }
      }
      catch (e) {
         formatted = String(n);
      }
      return prefix + formatted + suffix;
   }

   function formatDelta(value, opts) {
      if (jsx.isNull(value) || value === "" || isNaN(value)) return "";
      var formatted = formatValue(value, opts);
      return (Number(value) > 0 ? "+" : "") + formatted;
   }

   function label(value, limit) {
      var text = str(value);
      if (text.length <= limit) return text;
      return text.substr(0, Math.max(limit - 3, 1)) + "...";
   }

   function tokens(value) {
      return str(value).split(',').map(function(part) { return part.trim(); }).filter(function(part) { return part !== ""; });
   }

   function compareNatural(a, b) {
      var an = Number(a);
      var bn = Number(b);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return str(a).localeCompare(str(b), undefined, {numeric: true, sensitivity: "base"});
   }

   function academicTermKey(value) {
      var text = str(value);
      var yearMatch = text.match(/\b(?:19|20)\d{2}\b/);
      if (!yearMatch) return null;
      var lower = text.toLowerCase();
      var terms = [
         {pattern: /\b(winter|win|wi)\b/, order: 0},
         {pattern: /\b(spring|spr|sp)\b/, order: 1},
         {pattern: /\b(summer|sum|su)\b/, order: 2},
         {pattern: /\b(fall|autumn|fal|fa)\b/, order: 3}
      ];
      for (var i = 0; i < terms.length; i++) {
         if (terms[i].pattern.test(lower)) {
            return {year: Number(yearMatch[0]), term: terms[i].order};
         }
      }
      return null;
   }

   function compareChronologicalLabel(a, b) {
      var ak = academicTermKey(a);
      var bk = academicTermKey(b);
      if (ak && bk) {
         if (ak.year !== bk.year) return ak.year - bk.year;
         if (ak.term !== bk.term) return ak.term - bk.term;
      }
      return compareNatural(a, b);
   }

   function parseStrmTermCode(value) {
      var text = str(value).trim();
      if (!/^\d{4,}$/.test(text)) return null;
      var code = Number(text);
      return isNaN(code) ? null : code;
   }

   function isValidStrmTermCode(value) {
      return typeof value === "number" && !isNaN(value);
   }

   function sameSeasonPriorCodes(termCode, yearsBack) {
      var codes = [];
      for (var i = 1; i <= yearsBack; i++) codes.push(termCode - (i * 10));
      return codes;
   }

   function measureName(oDataLayout, aAllMeasures) {
      var value = "";
      try { value = oDataLayout.getValue(PHYS_COLUMN, 0, 0, false); }
      catch (e) { value = ""; }
      return str(value || aAllMeasures[0] || "Value");
   }

   function resolveDynamicValueLabel(raw) {
      var labels = new Set();
      (raw || []).forEach(function(row) {
         var label = str(row.dynamicValueLabel).trim();
         if (label !== "") labels.add(label);
      });
      return labels.size === 1 ? Array.from(labels)[0] : "";
   }

   WsuLineViz.prototype._configText = function(key, fallback) {
      var value = str(this.Config[key]);
      return value === "" ? fallback : value;
   };

   WsuLineViz.prototype._formatOpts = function() {
      return {
         numberFormat: this.Config.numberFormat,
         decimalPlaces: this.Config.decimalPlaces,
         valuePrefix: this.Config.valuePrefix,
         valueSuffix: this.Config.valueSuffix
      };
   };

   WsuLineViz.prototype._axisTitleStyle = function(axis) {
      var sizeKey = axis === "x" ? "xAxisTitleFontSize" : "yAxisTitleFontSize";
      var colorKey = axis === "x" ? "xAxisTitleColor" : "yAxisTitleColor";
      return {
         size: Number(this.Config[sizeKey]) || 11,
         color: str(this.Config[colorKey]).trim() || null,
         bold: this.Config.axisTitleBold !== "off",
         italic: this.Config.axisTitleItalic === "on"
      };
   };

   WsuLineViz.prototype._resolvedYAxisTitle = function(dataset) {
      if (this.Config.yAxisTitleSource === "hidden") return "";
      return this._configText("yAxisTitle", dataset.valueLabel);
   };

   WsuLineViz.prototype._palette = function() {
      var parsed = tokens(this.Config.palette);
      // No WSU-flavored defaults; defer to OAC themes by default. The neutral
      // d3.schemeCategory10 is used only when colorSource = 'custom' AND the
      // palette field is empty (or as last-resort when OAC returns nothing).
      return parsed.length ? parsed : d3.schemeCategory10.slice();
   };

   WsuLineViz.prototype._buildSortColumnOptions = function() {
      var meta = this.getLastDatasetMeta();
      var seriesLabel = (meta && meta.seriesLabel) ? meta.seriesLabel : "Series";
      var valueLabel = (meta && meta.valueLabel) ? meta.valueLabel : "Value";
      var termCodeLabel = (meta && meta.termCodeLabel) ? meta.termCodeLabel : "Sorting Term Code (STRM)";
      var detailLabels = (meta && meta.detailLabels) ? meta.detailLabels : [];
      var options = [
         {value: "", label: "Value (Desc — default)"},
         {value: "series", label: "Series (" + seriesLabel + ")"},
         {value: "value", label: "Value (" + valueLabel + ")"},
         {value: "rank", label: "Rank"}
      ];
      if (!meta || meta.termCodeBucketPresent || meta.hasTermCode) {
         options.push({value: "termCode", label: "STRM (" + termCodeLabel + ")"});
      }
      detailLabels.forEach(function(lab) {
         if (str(lab).trim()) options.push({value: lab, label: "Detail: " + lab});
      });
      var current = str(this.Config.tooltipSortColumn);
      if (current) {
         var match = options.some(function(o) { return o.value === current; });
         if (!match) options.push({value: current, label: current + " (not in current data)"});
      }
      return options;
   };

   WsuLineViz.prototype._generateData = function(oDataLayout, oTransientRenderingContext) {
      if (!oDataLayout) {
         oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      }
      var oDataModel = this.getRootDataModel();
      if (!oDataModel || !oDataLayout) return null;

      var helper = oTransientRenderingContext.get(DCP_DATA_LAYOUT_HELPER);
      var aAllMeasures = oDataModel.getColumnIDsIn(PHYS_DATA);
      var nRows = oDataLayout.getEdgeExtent(PHYS_ROW);
      var nRowLayerCount = oDataLayout.getLayerCount(PHYS_ROW);
      var layers = [];
      var xLabel = "Category";
      var seriesLabel = "Series";
      var termCodeLabel = "Sorting Term Code (STRM)";
      var termCodeBucketPresent = false;
      var dynamicValueLabelBucketLabel = "Dynamic Value Label (from data)";
      var dynamicValueLabelBucketPresent = false;
      var detailLabels = [];
      var headerLabels = [];

      // Honor Color Source: 'oac' uses the platform color service; 'custom' bypasses
      // it entirely so the palette config wins.
      var useOacColors = this.Config.colorSource !== "custom";
      var oColorContext = null;
      var oColorInterpolator = null;
      var colorServiceAvailable = useOacColors;
      if (useOacColors) {
         try {
            oColorContext = this.getColorContext(oTransientRenderingContext);
            oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, LOGICAL_COLOR);
         }
         catch (e) {
            colorServiceAvailable = false;
         }
      }

      for (var layerIndex = 0; layerIndex < nRowLayerCount; layerIndex++) {
         var key = "";
         try { key = helper.getLogicalEdgeName(PHYS_ROW, layerIndex); }
         catch (e) { key = ""; }
         var displayName = oDataLayout.getLayerMetadata(PHYS_ROW, layerIndex, LAYER_DISPLAY_NAME);
         layers.push({key: key, displayName: displayName || key, index: layerIndex});
         if (key === "row") xLabel = displayName || xLabel;
         if (key === "color") seriesLabel = displayName || seriesLabel;
         if (key === "size") {
            termCodeLabel = displayName || termCodeLabel;
            termCodeBucketPresent = true;
         }
         if (key === "item") {
            dynamicValueLabelBucketLabel = displayName || dynamicValueLabelBucketLabel;
            dynamicValueLabelBucketPresent = true;
         }
         if (key === "detail") detailLabels.push(displayName || ("Detail " + (detailLabels.length + 1)));
         if (key === "glyph") headerLabels.push(displayName || ("Header " + (headerLabels.length + 1)));
      }

      var raw = [];
      var seriesColors = new Map();
      var headerValues = headerLabels.map(function() { return new Set(); });
      var missingMode = this.Config.missingValueMode || "hide";
      var dataRowsSeen = 0;
      var skippedNonNumeric = 0;
      var rawMeasureLabel = measureName(oDataLayout, aAllMeasures);

      for (var rowIndex = 0; rowIndex < Math.max(nRows, 0); rowIndex++) {
         dataRowsSeen++;
         var meta = this._readRowMeta(oDataLayout, layers, rowIndex, detailLabels, headerLabels);
         var rawValue = oDataLayout.getValue(PHYS_DATA, rowIndex, 0);
         var value = parseFloat(rawValue);
         if (isNaN(value)) {
            skippedNonNumeric++;
            if (missingMode === "hide") continue;
            if (missingMode === "zero") value = 0;
            // gap: keep row, NaN value
         }

         meta.headers.forEach(function(h, i) {
            if (h && h.value !== "") headerValues[i].add(h.value);
         });

         if (meta.series && !seriesColors.has(meta.series)) {
            if (colorServiceAvailable) {
               try {
                  var colorInfo = this.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
                  seriesColors.set(meta.series, colorInfo.sColor || colorInfo.sSeriesColor || null);
               }
               catch (e) {
                  colorServiceAvailable = false;
                  seriesColors.set(meta.series, null);
               }
            }
            else {
               seriesColors.set(meta.series, null);
            }
         }

         raw.push({
            row: rowIndex,
            x: meta.x || ("Row " + (rowIndex + 1)),
            series: meta.series || this._configText("seriesLabel", "Value"),
            termCode: meta.termCode,
            dynamicValueLabel: meta.dynamicValueLabel,
            value: value,
            details: meta.details,
            xLabel: xLabel,
            seriesLabel: seriesLabel,
            valueLabel: this._configText("valueLabel", rawMeasureLabel),
            sourceRows: [rowIndex]
         });
      }

      var dynamicValueLabel = resolveDynamicValueLabel(raw);
      var valueLabel = dynamicValueLabel || this._configText("valueLabel", rawMeasureLabel);
      var rows = this._aggregateRows(raw);
      var hasTermCode = rows.some(function(row) { return isValidStrmTermCode(row.termCode); });
      var xValues = this._xValues(rows);
      var seriesValues = Array.from(new Set(rows.map(function(d) { return d.series; }))).sort(compareChronologicalLabel);
      var byX = new Map();
      rows.forEach(function(row) {
         if (!byX.has(row.x)) byX.set(row.x, []);
         byX.get(row.x).push(row);
      });

      var palette = this._palette();
      seriesValues.forEach(function(val, i) {
         if (!seriesColors.get(val)) seriesColors.set(val, palette[i % palette.length]);
      });

      var xDomKeys = new Map();
      var xOrder = new Map();
      xValues.forEach(function(val, i) {
         xDomKeys.set(val, "x" + i);
         xOrder.set(val, i);
      });

      var headerAttrs = headerLabels.map(function(name, i) {
         return {label: name, values: Array.from(headerValues[i]).sort(compareChronologicalLabel)};
      });

      return {
         rows: rows,
         xValues: xValues,
         seriesValues: seriesValues,
         byX: byX,
         xLabel: xLabel,
         seriesLabel: this._configText("seriesLabel", seriesLabel),
         valueLabel: valueLabel,
         dynamicValueLabel: dynamicValueLabel,
         dynamicValueLabelBucketLabel: dynamicValueLabelBucketLabel,
         dynamicValueLabelBucketPresent: dynamicValueLabelBucketPresent,
         termCodeLabel: termCodeLabel,
         termCodeBucketPresent: termCodeBucketPresent,
         detailLabels: detailLabels,
         headerAttrs: headerAttrs,
         hasTermCode: hasTermCode,
         seriesColors: seriesColors,
         xDomKeys: xDomKeys,
         xOrder: xOrder,
         dataRowsSeen: dataRowsSeen,
         skippedNonNumeric: skippedNonNumeric
      };
   };

   WsuLineViz.prototype._readRowMeta = function(oDataLayout, layers, rowIndex, detailLabels, headerLabels) {
      var meta = {x: "", series: "", termCode: null, dynamicValueLabel: "", details: [], headers: []};
      var detailCount = 0;
      var headerCount = 0;
      layers.forEach(function(layer) {
         var value = str(oDataLayout.getValue(PHYS_ROW, layer.index, rowIndex, false));
         if (layer.key === "row") meta.x = value;
         else if (layer.key === "color") meta.series = value;
         else if (layer.key === "detail") {
            meta.details.push({label: detailLabels[detailCount] || layer.displayName || ("Detail " + (detailCount + 1)), value: value});
            detailCount++;
         }
         else if (layer.key === "glyph") {
            meta.headers.push({label: headerLabels[headerCount] || layer.displayName || ("Header " + (headerCount + 1)), value: value});
            headerCount++;
         }
         else if (layer.key === "size") {
            meta.termCode = parseStrmTermCode(value);
         }
         else if (layer.key === "item") {
            meta.dynamicValueLabel = value.trim();
         }
      });
      return meta;
   };

   WsuLineViz.prototype._aggregateRows = function(raw) {
      var grouped = new Map();
      raw.forEach(function(row) {
         var key = row.x + "\u0000" + row.series;
         if (!grouped.has(key)) {
            grouped.set(key, {
               row: row.row,
               x: row.x,
               series: row.series,
               termCode: row.termCode,
               termCodeConflict: false,
               values: [],
               value: row.value,
               details: [],
               xLabel: row.xLabel,
               seriesLabel: row.seriesLabel,
               valueLabel: row.valueLabel,
               sourceRows: []
            });
         }
         var target = grouped.get(key);
         target.values.push(row.value);
         target.details = target.details.concat(row.details || []);
         target.sourceRows = target.sourceRows.concat(row.sourceRows || [row.row]);
         if (!target.termCodeConflict && !isValidStrmTermCode(target.termCode) && isValidStrmTermCode(row.termCode)) {
            target.termCode = row.termCode;
         }
         else if (!target.termCodeConflict && isValidStrmTermCode(target.termCode) && isValidStrmTermCode(row.termCode) && target.termCode !== row.termCode) {
            target.termCode = null;
            target.termCodeConflict = true;
         }
      });
      var mode = this.Config.aggregation;
      return Array.from(grouped.values()).map(function(row) {
         var hasNumeric = row.values.some(function(v) { return !isNaN(v); });
         if (!hasNumeric) {
            row.value = NaN;
         }
         else if (mode === "average") row.value = d3.mean(row.values);
         else if (mode === "max") row.value = d3.max(row.values);
         else if (mode === "min") row.value = d3.min(row.values);
         else if (mode === "first") row.value = row.values[0];
         else row.value = d3.sum(row.values);
         row.details = row.details.slice(0, 20);
         return row;
      });
   };

   WsuLineViz.prototype._xValues = function(rows) {
      var values = Array.from(new Set(rows.map(function(d) { return d.x; })));
      if (this.Config.xSort === "original") return values;
      values.sort(compareChronologicalLabel);
      if (this.Config.xSort === "descending") values.reverse();
      return values;
   };

   WsuLineViz.prototype._legendItems = function(dataset) {
      if (!dataset || !dataset.seriesValues || !dataset.seriesValues.length) return [];
      var oViz = this;
      // dataset.seriesValues is already chronological asc (default).
      // Apply user-chosen legend order on top of that baseline.
      var ordered = dataset.seriesValues.slice();
      var order = this.Config.legendOrder || "chronoAsc";
      var seriesTermCodes = new Map();
      if (order === "strmAsc" || order === "strmDesc") {
         (dataset.rows || []).forEach(function(row) {
            if (!isValidStrmTermCode(row.termCode)) return;
            if (!seriesTermCodes.has(row.series)) {
               seriesTermCodes.set(row.series, row.termCode);
            }
            else {
               seriesTermCodes.set(row.series, Math.min(seriesTermCodes.get(row.series), row.termCode));
            }
         });
      }
      function compareSeriesTermCode(seriesA, seriesB, desc) {
         var aMissing = !seriesTermCodes.has(seriesA);
         var bMissing = !seriesTermCodes.has(seriesB);
         if (aMissing && bMissing) return compareChronologicalLabel(seriesA, seriesB);
         if (aMissing) return 1;
         if (bMissing) return -1;
         var av = seriesTermCodes.get(seriesA);
         var bv = seriesTermCodes.get(seriesB);
         if (av === bv) return compareChronologicalLabel(seriesA, seriesB);
         return desc ? bv - av : av - bv;
      }
      if (order === "chronoDesc") ordered.reverse();
      else if (order === "nameAsc") ordered.sort(function(a, b) { return compareNatural(a, b); });
      else if (order === "nameDesc") ordered.sort(function(a, b) { return compareNatural(b, a); });
      else if (order === "strmAsc") ordered.sort(function(a, b) { return compareSeriesTermCode(a, b, false); });
      else if (order === "strmDesc") ordered.sort(function(a, b) { return compareSeriesTermCode(a, b, true); });
      // "colorOrder" leaves dataset.seriesValues order (which reflects color
      // assignment order from the iteration that built seriesColors).
      // "chronoAsc" is the unmodified default.
      return ordered.map(function(series, i) {
         return {
            label: series,
            color: dataset.seriesColors.get(series) || oViz._palette()[i % oViz._palette().length]
         };
      });
   };

   WsuLineViz.prototype._legendPlacement = function(width, items) {
      if (this.Config.legend === "off" || this.Config.legendPosition === "off" || !items.length) return "off";
      if (this.Config.legendPosition === "right" || this.Config.legendPosition === "bottom") return this.Config.legendPosition;
      return width < 680 || items.length > 6 ? "bottom" : "right";
   };

   // L2: bottom legend column width adapts to actual label length, mirroring
   // _legendRightWidth's logic. Caps at 280px to prevent one long label from
   // forcing a single-column layout for the whole legend.
   WsuLineViz.prototype._legendBottomColumnWidth = function(items) {
      var maxLen = this.Config.legendLabelMaxLength || 18;
      var fontSize = Number(this.Config.legendFontSize) || 11;
      var charPx = fontSize * 0.62;
      var longest = Math.min(d3.max(items, function(d) { return str(d.label).length; }) || 8, maxLen);
      // marker cell (16px) + text + right padding (12px) + char allowance
      return Math.max(110, Math.min(280, Math.round(longest * charPx) + 36));
   };

   WsuLineViz.prototype._legendRightWidth = function(items) {
      var maxLen = this.Config.legendLabelMaxLength || 18;
      var fontSize = Number(this.Config.legendFontSize) || 11;
      var charPx = fontSize * 0.62;
      var longest = Math.min(d3.max(items, function(d) { return str(d.label).length; }) || 8, maxLen);
      return Math.min(280, Math.max(132, Math.round(longest * charPx) + 40));
   };

   WsuLineViz.prototype._legendBottomHeight = function(items, width) {
      var colWidth = this._legendBottomColumnWidth(items);
      var rowHeight = Math.max(16, Number(this.Config.legendFontSize) + 6);
      var columns = Math.max(1, Math.floor(Math.max(width - 86, 120) / colWidth));
      return Math.ceil(items.length / columns) * rowHeight + 24;
   };

   WsuLineViz.prototype._legendMarkerSymbol = function() {
      var shape = this.Config.legendMarkerShape;
      var pointShape = this.Config.pointShape || "circle";
      var resolved = (shape === "match" || !shape) ? pointShape : shape;
      var size = Math.max(Number(this.Config.legendMarkerSize) || 8, 4);
      var area = Math.PI * size * size; // size = visual radius
      return d3.symbol().type(symbolType(resolved)).size(area)();
   };

   WsuLineViz.prototype._drawLegend = function(svg, placement, box, items) {
      var oViz = this;
      var markerPath = this._legendMarkerSymbol();
      var legend;
      var groups;

      function attachClick(sel) {
         sel.style("cursor", "pointer").on("click", function(event, d) {
            event.preventDefault();
            event.stopPropagation();
            var current = oViz.getLegendActiveSeries();
            if (current === d.label) {
               oViz.setLegendActiveSeries(null);
            }
            else {
               oViz.setLegendActiveSeries(d.label);
            }
            oViz._applyLegendActiveSeries();
         });
      }

      var labelMax = this.Config.legendLabelMaxLength || 18;
      var fontSize = Number(this.Config.legendFontSize) || 11;
      var rowHeight = Math.max(16, fontSize + 6);
      if (placement === "bottom") {
         var colWidth = this._legendBottomColumnWidth(items);
         var columns = Math.max(1, Math.floor(Math.max(box.width, 120) / colWidth));
         legend = svg.append("g").attr("class", "legend legend-bottom").attr("transform", "translate(" + box.x + "," + box.legendY + ")");
         groups = legend.selectAll("g").data(items).enter().append("g").attr("class", "legend-item").attr("data-series", function(d) { return d.label; }).attr("transform", function(d, i) {
            return "translate(" + ((i % columns) * colWidth) + "," + (Math.floor(i / columns) * rowHeight) + ")";
         });
         groups.append("path").attr("d", markerPath).attr("transform", "translate(5," + Math.round(rowHeight / 2) + ")").attr("fill", function(d) { return d.color; });
         groups.append("text").attr("x", 16).attr("y", Math.round(rowHeight / 2) + Math.round(fontSize / 3)).style("font-size", fontSize + "px").text(function(d) { return label(d.label, labelMax); });
      }
      else {
         legend = svg.append("g").attr("class", "legend legend-right").attr("transform", "translate(" + (box.svgWidth - box.rightWidth + 12) + "," + box.y + ")");
         groups = legend.selectAll("g").data(items).enter().append("g").attr("class", "legend-item").attr("data-series", function(d) { return d.label; }).attr("transform", function(d, i) { return "translate(0," + (i * rowHeight) + ")"; });
         groups.append("path").attr("d", markerPath).attr("transform", "translate(5," + Math.round(rowHeight / 2) + ")").attr("fill", function(d) { return d.color; });
         groups.append("text").attr("x", 16).attr("y", Math.round(rowHeight / 2) + Math.round(fontSize / 3)).style("font-size", fontSize + "px").text(function(d) { return label(d.label, labelMax); });
      }
      attachClick(groups);
   };

   WsuLineViz.prototype._applyLegendActiveSeries = function() {
      var active = this.getLegendActiveSeries();
      var root = d3.select(this.getContainerElem());
      root.selectAll(".legend-item").classed("legend-active", false).classed("legend-inactive", false);
      // L7: three visual states are needed — default (var(--bg-opacity, 1)),
      // faded (.wsu-faded → 0.18), and active (.wsu-legend-active → 1.0).
      // Without the active class, the clicked line stays at backgroundOpacity
      // (~0.45 default) and looks no different from a default line, just
      // less faded than the others. The class makes the active line jump
      // to fully opaque so the highlight is visually obvious.
      if (!active) {
         root.selectAll(".series-line, .series-point").classed("wsu-faded", false).classed("wsu-legend-active", false);
         return;
      }
      root.selectAll(".legend-item").each(function() {
         var s = d3.select(this).attr("data-series");
         d3.select(this).classed("legend-active", s === active).classed("legend-inactive", s !== active);
      });
      root.selectAll(".series-line").each(function() {
         var match = d3.select(this).attr("data-series") === active;
         d3.select(this).classed("wsu-faded", !match).classed("wsu-legend-active", match);
      });
      root.selectAll(".series-point").each(function() {
         var match = d3.select(this).attr("data-series") === active;
         d3.select(this).classed("wsu-faded", !match).classed("wsu-legend-active", match);
      });
   };

   WsuLineViz.prototype._headerInlineStyle = function() {
      var preset = this.Config.headerPreset || "default";
      var fontSize = Number(this.Config.headerFontSize) || 11;
      var bgOverride = safeCssColor(this.Config.headerBackgroundColor);
      var fgOverride = safeCssColor(this.Config.headerFontColor);
      var bold = this.Config.headerFontBold === "on";
      var italic = this.Config.headerFontItalic === "on";
      var underline = this.Config.headerFontUnderline === "on";
      var styles = ["font-size:" + fontSize + "px"];
      if (preset === "compact") {
         styles.push("background:transparent");
         styles.push("border-bottom:1px solid #d8dde3");
         styles.push("padding:2px 8px");
      }
      else if (preset === "prominent") {
         styles.push("background:#fff8e1");
         styles.push("border:1px solid #f9ab00");
         styles.push("font-weight:700");
         styles.push("padding:6px 10px");
      }
      // default uses CSS defaults; nothing extra needed
      if (bgOverride) {
         styles = styles.filter(function(s) { return s.indexOf("background") !== 0; });
         styles.push("background:" + bgOverride);
      }
      if (fgOverride) styles.push("color:" + fgOverride);
      if (bold) {
         styles = styles.filter(function(s) { return s.indexOf("font-weight") !== 0; });
         styles.push("font-weight:700");
      }
      if (italic) styles.push("font-style:italic");
      if (underline) styles.push("text-decoration:underline");
      return styles.join(";");
   };

   WsuLineViz.prototype._draw = function(elContainer, dataset, oDataLayout) {
      var oViz = this;
      var containerId = this.getSubElementIdFromParent(elContainer, "wsuLine") || this.getID() || ("viz_" + new Date().getTime());
      var rootId = "wsu_line_" + containerId.replace(/[^A-Za-z0-9_-]/g, "_");

      var headerHidden = this.Config.headerPreset === "hidden";
      var hasHeader = !headerHidden && (dataset.headerAttrs || []).length > 0;
      var chipLimit = Math.max(1, Number(this.Config.headerChipLimit) || 6);
      var headerHtml = "";
      if (hasHeader) {
         var headerStyle = this._headerInlineStyle();
         headerHtml = "<div class='wsu-line-header' style='" + esc(headerStyle) + "'>";
         dataset.headerAttrs.forEach(function(attr) {
            var valueHtml;
            if (attr.values.length === 0) {
               valueHtml = "<span class='wsu-v-chip-value muted'>" + esc(LBL.HEADER_NONE) + "</span>";
            }
            else {
               var shown = attr.values.slice(0, chipLimit);
               var more = attr.values.length - shown.length;
               valueHtml = shown.map(function(v) { return "<span class='wsu-v-chip-value'>" + esc(v) + "</span>"; }).join("");
               if (more > 0) {
                  valueHtml += "<span class='wsu-v-chip-more' title='" + esc(attr.values.join(", ")) + "'>" + esc(LBL.HEADER_MORE.replace("{0}", more)) + "</span>";
               }
            }
            headerHtml += "<div class='wsu-v-chip'><span class='wsu-v-chip-label'>" + esc(attr.label) + ":</span> " + valueHtml + "</div>";
         });
         headerHtml += "</div>";
      }

      $(elContainer).html(
         "<div id='" + rootId + "' class='wsu-line'>" +
            headerHtml +
            "<div class='wsu-line-chart'></div>" +
            "<button type='button' class='wsu-line-reset' style='display:none;'>" + esc(LBL.RESET_ZOOM) + "</button>" +
         "</div>"
      );

      var root = d3.select("#" + rootId);
      var chartHost = root.select(".wsu-line-chart").node();
      var resetBtn = root.select(".wsu-line-reset");

      var totalHeight = Math.max($(elContainer).height(), 100);
      var headerHeight = hasHeader ? Math.max($(root.select(".wsu-line-header").node()).outerHeight(true) || 0, 28) : 0;
      var width = Math.max($(chartHost).width() || $(elContainer).width(), 100);
      var height = Math.max(totalHeight - headerHeight, 100);

      var legendItems = this._legendItems(dataset);
      var legendPlacement = this._legendPlacement(width, legendItems);
      var showLegend = legendPlacement !== "off";
      var legendRightWidth = showLegend && legendPlacement === "right" ? this._legendRightWidth(legendItems) : 0;
      var legendBottomHeight = showLegend && legendPlacement === "bottom" ? this._legendBottomHeight(legendItems, width) : 0;
      // L4a: if the user picked Auto and the bottom legend would consume more
      // than 25% of svgHeight (common with many series + zoom), auto-flip to
      // right placement. Right-side scrolls vertically and doesn't eat chart
      // height. Skipped when the user explicitly chose right or bottom.
      if (showLegend && legendPlacement === "bottom" && this.Config.legendPosition === "auto" && legendBottomHeight > height * 0.25) {
         legendPlacement = "right";
         legendRightWidth = this._legendRightWidth(legendItems);
         legendBottomHeight = 0;
      }

      var margin = {
         top: 22,
         right: 24 + legendRightWidth,
         bottom: (this._shouldShowLabels(dataset.xValues.length) ? 86 : 46) + legendBottomHeight,
         left: 62
      };
      var innerWidth = Math.max(width - margin.left - margin.right, 40);
      var innerHeight = Math.max(height - margin.top - margin.bottom, 40);

      var svg = d3.select(chartHost).append("svg")
         .attr("width", width)
         .attr("height", height)
         .attr("viewBox", "0 0 " + width + " " + height)
         .on("click", function(event) {
            if (event.target === this) oViz._clearMarks(oDataLayout, root);
         });

      var tooltip = d3.select("body").selectAll("#" + rootId + "_tooltip").data([null]);
      tooltip = tooltip.enter().append("div").attr("id", rootId + "_tooltip").attr("class", "wsu-line-tooltip").merge(tooltip);
      this._tooltipId = rootId + "_tooltip";

      var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      var fullXValues = dataset.xValues;
      var zoom = oViz.getZoomState();
      var visibleXValues = fullXValues;
      if (zoom && zoom.xValues && zoom.xValues.length) visibleXValues = zoom.xValues;

      var x = d3.scalePoint().domain(visibleXValues).range([0, innerWidth]).padding(0.5);
      var visibleXSet = new Set(visibleXValues);
      var visibleRows = dataset.rows.filter(function(d) { return visibleXSet.has(d.x); });
      var yDomain = zoom && zoom.yDomain ? zoom.yDomain : this._yDomain(visibleRows);
      var y = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]).nice();
      var fmtOpts = oViz._formatOpts();

      var color = d3.scaleOrdinal()
         .domain(dataset.seriesValues)
         .range(dataset.seriesValues.map(function(val) {
            return dataset.seriesColors.get(val) || oViz._palette()[dataset.seriesValues.indexOf(val) % oViz._palette().length];
         }));

      if (this.Config.showGridlines === "on") {
         g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
      }

      var xAxis = d3.axisBottom(x).tickValues(this._tickValues(visibleXValues)).tickFormat(function(d) {
         return oViz.Config.privacyMode === "on" ? "" : label(d, 16);
      });
      g.append("g").attr("class", "x axis").attr("transform", "translate(0," + innerHeight + ")").call(xAxis)
         .selectAll("text")
         .attr("transform", this._shouldShowLabels(visibleXValues.length) ? "rotate(-35)" : null)
         .style("text-anchor", this._shouldShowLabels(visibleXValues.length) ? "end" : "middle");
      g.append("g").attr("class", "y axis").call(d3.axisLeft(y).tickFormat(function(d) { return formatValue(d, fmtOpts); }));

      var xTitleStyle = this._axisTitleStyle("x");
      var yTitleStyle = this._axisTitleStyle("y");
      g.append("text").attr("class", "axis-label").attr("x", innerWidth / 2).attr("y", innerHeight + (this._shouldShowLabels(visibleXValues.length) ? 74 : 38)).attr("text-anchor", "middle")
         .style("font-size", xTitleStyle.size + "px")
         .style("fill", xTitleStyle.color || null)
         .style("font-weight", xTitleStyle.bold ? "600" : "400")
         .style("font-style", xTitleStyle.italic ? "italic" : "normal")
         .text(this._configText("xAxisTitle", dataset.xLabel));
      g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -46).attr("text-anchor", "middle")
         .style("font-size", yTitleStyle.size + "px")
         .style("fill", yTitleStyle.color || null)
         .style("font-weight", yTitleStyle.bold ? "600" : "400")
         .style("font-style", yTitleStyle.italic ? "italic" : "normal")
         .text(this._resolvedYAxisTitle(dataset));

      var activeLayer = g.append("g").attr("class", "active-layer").style("display", "none");
      activeLayer.append("rect").attr("class", "x-highlight").attr("y", 0).attr("height", innerHeight);
      activeLayer.append("line").attr("class", "guide-line").attr("y1", 0).attr("y2", innerHeight);

      var visibleDataset = Object.assign({}, dataset, {rows: visibleRows, xValues: visibleXValues});

      this._drawXHitAreas(g, visibleDataset, x, innerWidth, innerHeight, tooltip, oDataLayout, root, activeLayer, color);
      this._drawLines(g, visibleDataset, x, y, color, innerWidth, innerHeight, tooltip, oDataLayout, root, activeLayer);

      var zoomMode = this.Config.zoomMode || "x";
      if (zoomMode !== "off") {
         this._installZoomBox(svg, g, margin, innerWidth, innerHeight, x, y, visibleXValues, dataset, root, tooltip, activeLayer, zoomMode);
      }

      if (showLegend) this._drawLegend(svg, legendPlacement, {
         x: margin.left,
         y: margin.top,
         width: innerWidth,
         height: innerHeight,
         chartBottom: margin.top + innerHeight,
         legendY: margin.top + innerHeight + (this._shouldShowLabels(visibleXValues.length) ? 86 : 46),
         svgWidth: width,
         svgHeight: height,
         rightWidth: legendRightWidth,
         bottomHeight: legendBottomHeight
      }, legendItems);

      if (zoom) {
         resetBtn.style("display", null).on("click", function(event) {
            event.preventDefault();
            event.stopPropagation();
            oViz.clearZoomState();
            oViz._rerender();
         });
      }

      this._applySelectedRows(root);
      // Re-apply legend fade after redraw if a series was active before render.
      this._applyLegendActiveSeries();
   };

   WsuLineViz.prototype._installZoomBox = function(svg, g, margin, innerWidth, innerHeight, x, y, visibleXValues, dataset, root, tooltip, activeLayer, mode) {
      var oViz = this;
      var xOnly = (mode === "x");
      var zoomGroup = g.append("g").attr("class", "zoom-overlay-group");
      var dragRect = zoomGroup.append("rect")
         .attr("class", "zoom-rect")
         .attr("display", "none")
         .attr("x", 0).attr("y", 0).attr("width", 0).attr("height", 0);

      var dragging = false;
      var startX = 0, startY = 0;
      var DRAG_THRESHOLD = 5;
      var escHandler = null;

      function pointerInChart(event) {
         var pt = d3.pointer(event, g.node());
         return {x: pt[0], y: pt[1]};
      }

      function endDrag() {
         dragging = false;
         dragRect.attr("display", "none");
         svg.classed("wsu-dragging", false);
         if (escHandler) {
            document.removeEventListener("keydown", escHandler);
            escHandler = null;
         }
      }

      svg.on("mousedown.zoom", function(event) {
         if (event.button !== 0) return;
         var pt = pointerInChart(event);
         if (pt.x < 0 || pt.x > innerWidth || pt.y < 0 || pt.y > innerHeight) return;
         dragging = true;
         startX = pt.x;
         startY = pt.y;
         // E3: switch cursor to crosshair while drag is active so the user
         // sees the zoom box gesture is being captured. Cleared on endDrag.
         svg.classed("wsu-dragging", true);
         if (xOnly) {
            dragRect.attr("display", null).attr("x", startX).attr("y", 0).attr("width", 0).attr("height", innerHeight);
         }
         else {
            dragRect.attr("display", null).attr("x", startX).attr("y", startY).attr("width", 0).attr("height", 0);
         }
         escHandler = function(ev) {
            if (ev.key === "Escape" && dragging) {
               ev.preventDefault();
               endDrag();
            }
         };
         document.addEventListener("keydown", escHandler);
      });

      svg.on("mousemove.zoom", function(event) {
         if (!dragging) return;
         var pt = pointerInChart(event);
         var cx = Math.max(0, Math.min(innerWidth, pt.x));
         var cy = Math.max(0, Math.min(innerHeight, pt.y));
         var rx = Math.min(startX, cx);
         var rw = Math.abs(cx - startX);
         if (xOnly) {
            dragRect.attr("x", rx).attr("y", 0).attr("width", rw).attr("height", innerHeight);
         }
         else {
            var ry = Math.min(startY, cy);
            var rh = Math.abs(cy - startY);
            dragRect.attr("x", rx).attr("y", ry).attr("width", rw).attr("height", rh);
         }
         tooltip.style("display", "none");
         activeLayer.style("display", "none");
      });

      svg.on("mouseup.zoom", function(event) {
         if (!dragging) return;
         var pt = pointerInChart(event);
         var cx = Math.max(0, Math.min(innerWidth, pt.x));
         var cy = Math.max(0, Math.min(innerHeight, pt.y));
         var dx = Math.abs(cx - startX);
         var dy = Math.abs(cy - startY);
         var sx = startX, sy = startY;
         endDrag();
         var significantDrag = xOnly ? (dx >= DRAG_THRESHOLD) : (dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD);
         if (!significantDrag) return;
         var rx0 = Math.min(sx, cx);
         var rx1 = Math.max(sx, cx);

         var selectedX = visibleXValues.filter(function(v) {
            var px = x(v);
            return px >= rx0 && px <= rx1;
         });
         if (selectedX.length === 0) return;

         var newState = {xValues: selectedX};
         if (!xOnly) {
            var ry0 = Math.min(sy, cy);
            var ry1 = Math.max(sy, cy);
            newState.yDomain = [y.invert(ry1), y.invert(ry0)];
         }
         oViz.setZoomState(newState);
         oViz._rerender();
      });

      svg.on("mouseleave.zoom", function() {
         if (dragging) endDrag();
      });

      svg.on("dblclick.zoom", function(event) {
         event.preventDefault();
         if (oViz.getZoomState()) {
            oViz.clearZoomState();
            oViz._rerender();
         }
      });
   };

   WsuLineViz.prototype._drawLines = function(g, dataset, x, y, color, innerWidth, innerHeight, tooltip, oDataLayout, root, activeLayer) {
      var oViz = this;
      var bySeries = d3.group(dataset.rows, function(d) { return d.series; });
      var dashArray = dashArrayFor(this.Config.linePattern, this.Config.lineWidth);
      var line = d3.line()
         .defined(function(d) { return !isNaN(d.value); })
         .curve(curveFor(this.Config.lineSmoothing))
         .x(function(d) { return x(d.x); })
         .y(function(d) { return y(d.value); });

      var seriesGroups = g.selectAll(".line-series").data(Array.from(bySeries.entries())).enter().append("g").attr("class", "line-series");
      var paths = seriesGroups.append("path")
         .attr("class", "series-line background")
         .attr("data-series", function(d) { return d[0]; })
         .attr("d", function(d) { return line(d[1].slice().sort(function(a, b) { return dataset.xOrder.get(a.x) - dataset.xOrder.get(b.x); })); })
         .attr("stroke", function(d) { return color(d[0]); })
         .attr("stroke-width", this.Config.lineWidth)
         .style("--bg-opacity", this.Config.backgroundOpacity);
      if (dashArray) paths.attr("stroke-dasharray", dashArray);

      if (this.Config.showPoints === "on") {
         var pointArea = Math.PI * Math.pow(this.Config.pointSize, 2);
         var symGen = d3.symbol().type(symbolType(this.Config.pointShape)).size(pointArea);
         g.selectAll(".series-point")
            .data(dataset.rows.filter(function(d) { return !isNaN(d.value); }))
            .enter()
            .append("path")
            .attr("class", "series-point")
            .attr("data-row", function(d) { return d.row; })
            .attr("data-x-key", function(d) { return dataset.xDomKeys.get(d.x); })
            .attr("data-series", function(d) { return d.series; })
            .attr("transform", function(d) { return "translate(" + x(d.x) + "," + y(d.value) + ")"; })
            .attr("d", symGen())
            .attr("fill", function(d) { return color(d.series); })
            .on("mouseover", function(event, d) { oViz._showAtX(d.x, d.series, dataset, x, y, tooltip, event, activeLayer, color); })
            .on("mousemove", function(event, d) { oViz._moveTooltip(tooltip, event); })
            .on("mouseout", function() { oViz._hideActive(tooltip, activeLayer, root); })
            .on("click", function(event, d) { oViz._handleClick(event, d, dataset, oDataLayout, root); });
      }
   };

   WsuLineViz.prototype._drawXHitAreas = function(g, dataset, x, innerWidth, innerHeight, tooltip, oDataLayout, root, activeLayer, color) {
      var oViz = this;
      // Use the scale's own step so adjacent hit rectangles tile without
      // overlapping (a later rectangle would otherwise capture hovers that
      // belong to the earlier category).
      var step = dataset.xValues.length > 1 ? x.step() : innerWidth;
      var band = Math.max(step, 14);
      g.selectAll(".x-hit")
         .data(dataset.xValues)
         .enter()
         .append("rect")
         .attr("class", "x-hit")
         .attr("x", function(d) { return x(d) - band / 2; })
         .attr("y", 0)
         .attr("width", band)
         .attr("height", innerHeight)
         .on("mouseover", function(event, xValue) { oViz._showAtX(xValue, null, dataset, x, null, tooltip, event, activeLayer, color); })
         .on("mousemove", function(event, xValue) { oViz._showAtX(xValue, null, dataset, x, null, tooltip, event, activeLayer, color); })
         .on("mouseout", function() { oViz._hideActive(tooltip, activeLayer, root); })
         .on("click", function(event, xValue) { oViz._markRows(event, dataset.byX.get(xValue) || [], oDataLayout, root); });
   };

   WsuLineViz.prototype._showAtX = function(xValue, activeSeries, dataset, x, y, tooltip, event, activeLayer, color) {
      var xPos = x(xValue);
      var step = dataset.xValues.length > 1 ? Math.abs(x(dataset.xValues[1]) - x(dataset.xValues[0])) : 30;
      activeLayer.style("display", null);
      activeLayer.select(".x-highlight").attr("x", xPos - step / 2).attr("width", step);
      activeLayer.select(".guide-line").attr("x1", xPos).attr("x2", xPos).style("display", this.Config.showGuide === "on" ? null : "none");
      d3.select(this.getContainerElem()).selectAll(".active-at-x").classed("active-at-x", false);
      d3.select(this.getContainerElem()).selectAll("[data-x-key='" + dataset.xDomKeys.get(xValue) + "']").classed("active-at-x", true);
      tooltip.html(this._tooltipHtml(xValue, activeSeries, dataset, color)).style("display", "block");
      this._moveTooltip(tooltip, event);
      this._appendOverflowFooterIfClipped(tooltip);
   };

   // E2: tooltip CSS uses max-height: 70vh + overflow:hidden, which silently
   // truncates content that exceeds the visible area. After rendering, compare
   // scrollHeight to clientHeight and append a subtle warning footer when
   // content is taller than the visible window.
   WsuLineViz.prototype._appendOverflowFooterIfClipped = function(tooltip) {
      var node = tooltip.node();
      if (!node) return;
      if (node.scrollHeight > node.clientHeight + 4) {
         var existing = tooltip.select(".wsu-overflow-warning");
         if (existing.empty()) {
            tooltip.append("div")
               .attr("class", "subtle wsu-overflow-warning")
               .text("Tooltip clipped — additional rows hidden");
         }
      }
   };

   WsuLineViz.prototype._tooltipRows = function(xValue, activeSeries, dataset) {
      var rows = (dataset.byX.get(xValue) || []).slice();
      var average = d3.mean(rows, function(d) { return d.value; });

      rows.forEach(function(row) {
         row._rank = 0;
         row._delta = row.value - average;
         row._prevDelta = NaN;
         row._prevPercent = NaN;
      });

      rows.filter(function(row) { return isFinite(row.value); })
         .sort(function(a, b) { return b.value - a.value; })
         .forEach(function(row, i) { row._rank = i + 1; });

      if (dataset.hasTermCode) {
         rows.forEach(function(row) {
            if (!isValidStrmTermCode(row.termCode)) return;
            var priorCode = row.termCode - 10;
            var prior = rows.filter(function(other) {
               return other !== row && other.termCode === priorCode;
            })[0];
            if (prior && !isNaN(prior.value)) {
               row._prevDelta = row.value - prior.value;
               row._prevPercent = prior.value !== 0 ? (row._prevDelta / prior.value) * 100 : NaN;
            }
         });
      }

      // Δ 3 Years + Δ% 3 Years: only valid when STRM exists. Same-season
      // PeopleSoft-style term codes differ by 10 across academic years.
      rows.forEach(function(row) {
         row._delta3Value = NaN;
         row._delta3Pct = NaN;
         if (!dataset.hasTermCode || isNaN(row.value) || !isValidStrmTermCode(row.termCode)) return;
         var priorCodes = sameSeasonPriorCodes(row.termCode, 3);
         var priors = rows.filter(function(other) {
            return other !== row && priorCodes.indexOf(other.termCode) >= 0;
         }).sort(function(a, b) {
            return b.termCode - a.termCode;
         });
         var validPriors = priors.filter(function(p) { return !isNaN(p.value); });
         if (validPriors.length === 0) return;
         var avg = d3.mean(validPriors, function(p) { return p.value; });
         if (isNaN(avg)) return;
         row._delta3Value = row.value - avg;
         if (avg !== 0) row._delta3Pct = row._delta3Value / avg * 100;
      });

      var sortColumn = str(this.Config.tooltipSortColumn).trim();
      var detailLabels = dataset.detailLabels || [];
      var detailIndex = -1;
      if (sortColumn) {
         for (var i = 0; i < detailLabels.length; i++) {
            if (detailLabels[i].toLowerCase() === sortColumn.toLowerCase()) {
               detailIndex = i;
               break;
            }
         }
      }

      var sortKind = "value";
      if (sortColumn) {
         if (detailIndex >= 0) sortKind = "detail";
         else {
            var lcSort = sortColumn.toLowerCase();
            if (lcSort === "series" || lcSort === str(dataset.seriesLabel).toLowerCase()) sortKind = "series";
            else if (lcSort === "value" || lcSort === str(dataset.valueLabel).toLowerCase()) sortKind = "value";
            else if (lcSort === "rank") sortKind = "rank";
            else if (lcSort === "termcode" || lcSort === "strm" || lcSort === "sorting term code" || lcSort === str(dataset.termCodeLabel).toLowerCase()) sortKind = "termCode";
         }
      }
      var defaultDir = (sortKind === "series" || sortKind === "detail" || sortKind === "rank" || sortKind === "termCode") ? "asc" : "desc";
      var dirCfg = this.Config.tooltipSortDirection;
      var dir = (dirCfg === "asc" || dirCfg === "desc") ? dirCfg : defaultDir;
      var dirSign = dir === "asc" ? 1 : -1;

      var ascCmp;
      if (sortKind === "detail") {
         ascCmp = function(a, b) {
            var av = a.details && a.details[detailIndex] ? a.details[detailIndex].value : "";
            var bv = b.details && b.details[detailIndex] ? b.details[detailIndex].value : "";
            return compareNatural(av, bv);
         };
      }
      else if (sortKind === "series") ascCmp = function(a, b) { return compareChronologicalLabel(a.series, b.series); };
      else if (sortKind === "rank") ascCmp = function(a, b) {
         // Unranked (missing-value) rows sort after every ranked row.
         var ra = a._rank || Infinity, rb = b._rank || Infinity;
         return ra === rb ? 0 : (ra - rb);
      };
      else if (sortKind === "termCode") ascCmp = function(a, b) { return a.termCode - b.termCode; };
      else ascCmp = function(a, b) { return a.value - b.value; };

      rows.sort(function(a, b) {
         if (activeSeries && a.series === activeSeries) return -1;
         if (activeSeries && b.series === activeSeries) return 1;
         if (sortKind === "termCode") {
            var aValid = isValidStrmTermCode(a.termCode);
            var bValid = isValidStrmTermCode(b.termCode);
            if (!aValid && !bValid) return compareChronologicalLabel(a.series, b.series);
            if (!aValid) return 1;
            if (!bValid) return -1;
         }
         return dirSign * ascCmp(a, b);
      });

      return {rows: rows.slice(0, this.Config.tooltipLimit), average: average, total: rows.length};
   };

   function deltaClass(value) {
      if (isNaN(value) || value === 0) return "delta-flat";
      return value > 0 ? "delta-up" : "delta-down";
   }

   WsuLineViz.prototype._tooltipHtml = function(xValue, activeSeries, dataset, color) {
      var allDetailLabels = dataset.detailLabels || [];
      var colCap = Math.max(1, Number(this.Config.tooltipColumnLimit) || 20);
      var detailLabels = allDetailLabels.slice(0, colCap);
      var hiddenCols = Math.max(0, allDetailLabels.length - detailLabels.length);
      var compareMode = this.Config.compareMode;
      if (!dataset.hasTermCode && (compareMode === "previous" || compareMode === "previousPercent")) compareMode = "off";
      var privacyOn = this.Config.privacyMode === "on";
      var showSeries = this.Config.showSeriesCol !== "off";
      var showValue = this.Config.showValueCol !== "off";
      var showX = this.Config.showXPerRow === "on" && !privacyOn;
      var d3Mode = this.Config.delta3Mode || "off";
      if (!dataset.hasTermCode) d3Mode = "off";
      var showD3Value = d3Mode === "value" || d3Mode === "valuePercent";
      var showD3Pct = d3Mode === "percent" || d3Mode === "valuePercent";
      var fmtOpts = this._formatOpts();
      var showXInTitle = this.Config.showXInTitle !== "off" && !privacyOn;
      var titleText = showXInTitle ? (esc(dataset.xLabel) + ": " + esc(xValue)) : esc(dataset.xLabel);
      var titleHtml = titleText ? "<div class='title'>" + titleText + "</div>" : "";

      if (this.Config.tooltipMode === "single" && activeSeries) {
         var single = (dataset.byX.get(xValue) || []).filter(function(d) { return d.series === activeSeries; })[0];
         if (!single) return "";
         var sHtml = titleHtml;
         sHtml += "<table class='zebra'><tr>";
         if (showSeries) sHtml += "<th>" + esc(dataset.seriesLabel) + "</th>";
         if (showX) sHtml += "<th>" + esc(dataset.xLabel) + "</th>";
         detailLabels.forEach(function(lab) { sHtml += "<th>" + esc(lab) + "</th>"; });
         if (showValue) sHtml += "<th>" + esc(dataset.valueLabel) + "</th>";
         sHtml += "</tr>";
         sHtml += "<tr class='active'>";
         if (showSeries) sHtml += "<td><span class='swatch' style='background:" + esc(color(single.series)) + "'></span>" + esc(single.series) + "</td>";
         if (showX) sHtml += "<td>" + esc(xValue) + "</td>";
         detailLabels.forEach(function(lab, i) { sHtml += "<td>" + esc(single.details && single.details[i] ? single.details[i].value : "") + "</td>"; });
         if (showValue) sHtml += "<td class='value'>" + esc(formatValue(single.value, fmtOpts)) + "</td>";
         sHtml += "</tr></table>";
         if (hiddenCols > 0) {
            var tmpl = hiddenCols === 1 ? LBL.COL_LIMIT_FOOTER_ONE : LBL.COL_LIMIT_FOOTER_MANY;
            sHtml += "<div class='subtle'>" + esc(tmpl.replace("{0}", hiddenCols)) + "</div>";
         }
         return sHtml;
      }

      var packed = this._tooltipRows(xValue, activeSeries, dataset);
      var rows = packed.rows;
      var html = titleHtml;
      html += "<table class='zebra'><tr>";
      if (showSeries) html += "<th>" + esc(dataset.seriesLabel) + "</th>";
      if (showX) html += "<th>" + esc(dataset.xLabel) + "</th>";
      detailLabels.forEach(function(lab) { html += "<th>" + esc(lab) + "</th>"; });
      if (showValue) html += "<th>" + esc(dataset.valueLabel) + "</th>";
      if (compareMode === "average") html += "<th>" + esc(LBL.COMPARE_VS_AVG) + "</th>";
      else if (compareMode === "rank") html += "<th>" + esc(LBL.COMPARE_RANK) + "</th>";
      else if (compareMode === "previous") html += "<th>" + esc(LBL.COMPARE_CHANGE) + "</th>";
      else if (compareMode === "previousPercent") html += "<th>" + esc(LBL.COMPARE_CHANGE) + "</th><th>" + esc(LBL.COMPARE_PCT_CHANGE) + "</th>";
      if (showD3Value) html += "<th>" + esc(LBL.DELTA_3Y_VALUE) + "</th>";
      if (showD3Pct) html += "<th>" + esc(LBL.DELTA_3Y_PCT) + "</th>";
      html += "</tr>";
      rows.forEach(function(row, idx) {
         var rowClass = (idx % 2 === 1 ? "alt" : "");
         if (activeSeries && row.series === activeSeries) rowClass += (rowClass ? " " : "") + "active";
         html += "<tr" + (rowClass ? " class='" + rowClass + "'" : "") + ">";
         if (showSeries) html += "<td><span class='swatch' style='background:" + esc(color(row.series)) + "'></span>" + esc(row.series) + "</td>";
         if (showX) html += "<td>" + esc(xValue) + "</td>";
         detailLabels.forEach(function(lab, i) { html += "<td>" + esc(row.details && row.details[i] ? row.details[i].value : "") + "</td>"; });
         if (showValue) html += "<td class='value'>" + esc(formatValue(row.value, fmtOpts)) + "</td>";
         if (compareMode === "average") html += "<td class='delta " + deltaClass(row._delta) + "'>" + esc(formatDelta(row._delta, fmtOpts)) + "</td>";
         else if (compareMode === "rank") html += "<td class='rank'>" + (row._rank ? esc(row._rank) : "") + "</td>";
         else if (compareMode === "previous") html += "<td class='delta " + deltaClass(row._prevDelta) + "'>" + esc(formatDelta(row._prevDelta, fmtOpts)) + "</td>";
         else if (compareMode === "previousPercent") {
            html += "<td class='delta " + deltaClass(row._prevDelta) + "'>" + esc(formatDelta(row._prevDelta, fmtOpts)) + "</td>";
            html += "<td class='delta " + deltaClass(row._prevPercent) + "'>" + esc(isNaN(row._prevPercent) ? "" : ((row._prevPercent > 0 ? "+" : "") + row._prevPercent.toFixed(1) + "%")) + "</td>";
         }
         if (showD3Value) {
            html += "<td class='delta " + deltaClass(row._delta3Value) + "'>" + esc(formatDelta(row._delta3Value, fmtOpts)) + "</td>";
         }
         if (showD3Pct) {
            html += "<td class='delta " + deltaClass(row._delta3Pct) + "'>" + esc(isNaN(row._delta3Pct) ? "" : ((row._delta3Pct > 0 ? "+" : "") + row._delta3Pct.toFixed(1) + "%")) + "</td>";
         }
         html += "</tr>";
      }, this);
      html += "</table>";
      if (this.Config.showAverage === "on" && !isNaN(packed.average)) html += "<div class='subtle'>" + esc(LBL.AVG_PREFIX) + " " + esc(formatValue(packed.average, fmtOpts)) + "</div>";
      if (packed.total > rows.length) html += "<div class='subtle'>" + esc(LBL.ROW_LIMIT_FOOTER.replace("{0}", rows.length).replace("{1}", packed.total)) + "</div>";
      if (hiddenCols > 0) {
         var tmpl2 = hiddenCols === 1 ? LBL.COL_LIMIT_FOOTER_ONE : LBL.COL_LIMIT_FOOTER_MANY;
         html += "<div class='subtle'>" + esc(tmpl2.replace("{0}", hiddenCols)) + "</div>";
      }
      return html;
   };

   WsuLineViz.prototype._moveTooltip = function(tooltip, event) {
      var node = tooltip.node();
      var ttW = (node && node.offsetWidth) || 0;
      var ttH = (node && node.offsetHeight) || 0;
      var winW = (window.innerWidth || document.documentElement.clientWidth || 0);
      var winH = (window.innerHeight || document.documentElement.clientHeight || 0);
      var pageOffsetX = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var pageOffsetY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var pad = 8;
      var left = event.pageX + 12;
      if (ttW && (event.clientX + 12 + ttW + pad) > winW) {
         left = event.pageX - 12 - ttW;
         if (left < pageOffsetX + pad) left = pageOffsetX + pad;
      }
      var top = event.pageY - 24;
      if (ttH) {
         var minTop = pageOffsetY + pad;
         var maxTop = pageOffsetY + winH - ttH - pad;
         if (top < minTop) top = minTop;
         else if (top > maxTop) top = maxTop;
      }
      tooltip.style("left", left + "px").style("top", top + "px");
   };

   WsuLineViz.prototype._hideActive = function(tooltip, activeLayer, root) {
      tooltip.style("display", "none");
      activeLayer.style("display", "none");
      root.selectAll(".active-at-x").classed("active-at-x", false);
   };

   WsuLineViz.prototype._yDomain = function(rows) {
      var values = rows.map(function(d) { return d.value; });
      var min = d3.min(values);
      var max = d3.max(values);
      if (isNaN(min) || isNaN(max)) return [0, 1];
      if (min > 0) min = 0;
      if (min === max) return [min - 1, max + 1];
      var pad = Math.max((max - min) * 0.06, 1);
      return [min - pad, max + pad];
   };

   WsuLineViz.prototype._shouldShowLabels = function(count) {
      if (this.Config.xLabels === "on") return true;
      if (this.Config.xLabels === "off" || this.Config.privacyMode === "on") return false;
      return count <= 45;
   };

   WsuLineViz.prototype._tickValues = function(xValues) {
      if (this._shouldShowLabels(xValues.length)) return xValues;
      var maxTicks = xValues.length <= 200 ? 12 : 8;
      var step = Math.max(Math.ceil(xValues.length / maxTicks), 1);
      return xValues.filter(function(d, i) { return i === 0 || i === xValues.length - 1 || i % step === 0; });
   };

   WsuLineViz.prototype._handleClick = function(event, row, dataset, oDataLayout, root) {
      if (this.Config.clickBehavior === "single") this._markRows(event, [row], oDataLayout, root);
      else this._markRows(event, dataset.byX.get(row.x) || [row], oDataLayout, root);
   };

   WsuLineViz.prototype._markRows = function(event, rows, oDataLayout, root) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.ctrlKey) {
         this.getMarkingService().clearMarksForDataLayout(oDataLayout);
         this.clearSelectedRows();
      }
      rows.forEach(function(row) {
         this._markDataRows(row.sourceRows || [row.row], oDataLayout);
         this.getSelectedRows().set(row.row, true);
      }, this);
      this._publishMarkEvent(oDataLayout);
      this._applySelectedRows(root);
   };

   WsuLineViz.prototype._markDataRows = function(rowIndexes, oDataLayout) {
      rowIndexes.forEach(function(rowIndex) {
         this.getMarkingService().setMark(oDataLayout, PHYS_DATA, parseInt(rowIndex, 10), 0);
      }, this);
   };

   WsuLineViz.prototype._clearMarks = function(oDataLayout, root) {
      this.getMarkingService().clearMarksForDataLayout(oDataLayout);
      this.clearSelectedRows();
      this._publishMarkEvent(oDataLayout);
      this._applySelectedRows(root);
   };

   WsuLineViz.prototype._applySelectedRows = function(root) {
      var selectedRows = this.getSelectedRows();
      root.selectAll(".series-point").classed("wsu-selected", false);
      selectedRows.forEach(function(value, row) {
         root.selectAll("[data-row='" + row + "']").classed("wsu-selected", true);
      });
   };

   WsuLineViz.prototype._publishMarkEvent = function(oDataLayout, eMarkContext) {
      try {
         var markingEvent = new interactions.MarkingEvent(this.getID(), this.getViewName(), oDataLayout, null, eMarkContext);
         var eventRouter = this.getEventRouter();
         if (eventRouter) eventRouter.publish(markingEvent);
      }
      catch (e) {
         _logger.warning("Error during mark publish: " + (e && e.message ? e.message : e));
      }
   };

   WsuLineViz.prototype._buildSelectedItems = function(oTransientRenderingContext) {
      var oViz = this;
      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      var service = this.getMarkingService();
      function callback() {
         oViz.clearSelectedRows();
         if (!oViz.isStarted()) return;
         service.traverseDataEdgeMarks(oDataLayout, function(nRow) {
            oViz.getSelectedRows().set(nRow, true);
         });
         d3.select(oViz.getContainerElem()).selectAll(".wsu-line").each(function() {
            oViz._applySelectedRows(d3.select(this));
         });
      }
      service.getUpdatedMarkingSet(oDataLayout, marking.EMarkOperation.MARK_RELATED, callback);
   };

   WsuLineViz.prototype.onHighlight = function() {
      this._buildSelectedItems(this.createRenderingContext(this.assertOrCreateVizContext()));
   };

   WsuLineViz.prototype._rerender = function() {
      var oTransientVizContext = this.assertOrCreateVizContext();
      var oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._render(oTransientRenderingContext);
   };

   WsuLineViz.prototype._render = function(oTransientRenderingContext, dataset) {
      try {
         this.loadConfig();
         var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
         if (!oDataLayout) return;
         dataset = dataset || this._generateData(oDataLayout, oTransientRenderingContext);
         if (dataset) {
            this.setLastDatasetMeta({
               detailLabels: (dataset.detailLabels || []).slice(),
               headerLabels: (dataset.headerAttrs || []).map(function(h) { return h.label; }),
               seriesLabel: dataset.seriesLabel,
               valueLabel: dataset.valueLabel,
               dynamicValueLabel: dataset.dynamicValueLabel,
               dynamicValueLabelBucketLabel: dataset.dynamicValueLabelBucketLabel,
               dynamicValueLabelBucketPresent: dataset.dynamicValueLabelBucketPresent,
               termCodeLabel: dataset.termCodeLabel,
               termCodeBucketPresent: dataset.termCodeBucketPresent,
               hasTermCode: dataset.hasTermCode,
               xLabel: dataset.xLabel
            });
         }
         var elContainer = this.getContainerElem();
         if (!dataset || dataset.rows.length === 0) {
            var msg = (dataset && dataset.dataRowsSeen > 0 && dataset.skippedNonNumeric === dataset.dataRowsSeen)
               ? LBL.EMPTY_NO_NUMERIC
               : LBL.EMPTY_BUCKETS;
            $(elContainer).html("<div class='wsu-line'><div class='empty-state'>" + esc(msg) + "</div></div>");
            return;
         }
         this._draw(elContainer, dataset, oDataLayout);
      }
      finally {
         this._setIsRendered(true);
      }
   };

   WsuLineViz.prototype.render = function(oTransientRenderingContext) {
      this.loadConfig();
      var dataset = this._generateData(null, oTransientRenderingContext);
      this._render(oTransientRenderingContext, dataset);
      this._buildSelectedItems(oTransientRenderingContext);
   };

   WsuLineViz.prototype.resizeVisualization = function(oVizDimensions, oTransientVizContext) {
      var oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._render(oTransientRenderingContext);
   };

   WsuLineViz.prototype._addVizSpecificMenuOptions = function(oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext) {
      WsuLineViz.superClass._addVizSpecificMenuOptions.call(this, oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext);
      this.loadConfig();
      if (sMenuType === euidef.CM_TYPE_VIZ_PROPS && !this.isViewOnlyLimit()) {
         if (!oTransientRenderingContext) oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
         this._addFilterMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
         this._addRemoveSelectedMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
         if (this.Config.colorSource !== "custom" && this._addColorMenuOption) {
            this._addColorMenuOption(oTransientVizContext, aResults, oTransientRenderingContext);
         }
      }
   };

   WsuLineViz.prototype._addVizSpecificPropsDialog = function(oTabbedPanelsGadgetInfo) {
      this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
      WsuLineViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
   };

   function addSwitcher(panel, id, labelText, value, options, order) {
      var infos = options.map(function(option) { return new gadgets.OptionInfo(option.value, option.label); });
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_SWITCHER, value);
      panel.addChild(new gadgets.TextSwitcherGadgetInfo(id, labelText, labelText, gvp, order, false, infos));
   }

   function addText(panel, factory, id, labelText, value) {
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_FIELD, value);
      panel.addChild(factory.createGadgetInfo(id, labelText, labelText, gvp));
   }

   // W2: TEXT_TOGGLE checkbox gadget for boolean on/off Config keys.
   // Internal Config stays as "on"/"off" strings (per migration choice —
   // gadget-boundary translation only). Reads boolean from the gadget's
   // checked property and translates back in _handlePropChange.
   function addToggle(panel, id, labelText, configValue) {
      var isOn = configValue !== "off";
      var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, isOn);
      panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
   }

   WsuLineViz.prototype.doAddVizSpecificPropsDialog = function(oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
      jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
      jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
      this.loadConfig();
      var factory = this.getGadgetFactory();

      // Multi-panel attempt: try string IDs for custom tabs. If the SDK doesn't
      // support them on this OAC version, calls fall back to General. The
      // try/catch keeps the build working regardless.
      var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
      function tryPanel(id) {
         try {
            var p = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, id);
            return p || pGen;
         } catch (e) {
            return pGen;
         }
      }
      var pStyle = tryPanel("wsuLineStyle");
      var pHeader = tryPanel("wsuLineHeader");
      var pAxisLegend = tryPanel("wsuLineAxisLegend");

      var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
      var ord = {GEN: base + 100, STY: base + 200, HDR: base + 300, AXL: base + 400};
      var nx = function(g) { return ord[g]++; };

      // ============ GENERAL TAB ============
      addSwitcher(pGen, "aggregationGadget", "Chart: Aggregation", this.Config.aggregation, [{value: "sum", label: "Sum"}, {value: "average", label: "Average"}, {value: "max", label: "Max"}, {value: "min", label: "Min"}, {value: "first", label: "First"}], nx("GEN"));

      addSwitcher(pGen, "tooltipModeGadget", "Tooltip: Mode", this.Config.tooltipMode, [{value: "sharedX", label: "Shared X (multi-row)"}, {value: "single", label: "Single row"}], nx("GEN"));
      addSwitcher(pGen, "compareModeGadget", "Tooltip: Compare", this.Config.compareMode, [{value: "average", label: "Vs Avg"}, {value: "previous", label: "Δ 1 Year"}, {value: "previousPercent", label: "Δ 1 Year + Δ% 1 Year"}, {value: "rank", label: "Rank"}, {value: "off", label: "Off"}], nx("GEN"));
      addSwitcher(pGen, "delta3ModeGadget", "Tooltip: Δ 3 Years", this.Config.delta3Mode, [{value: "off", label: "Off"}, {value: "value", label: "Δ 3 Years"}, {value: "percent", label: "Δ% 3 Years"}, {value: "valuePercent", label: "Δ 3 Years + Δ% 3 Years"}], nx("GEN"));
      addSwitcher(pGen, "tooltipSortColumnGadget", "Tooltip: Sort Column", this.Config.tooltipSortColumn, this._buildSortColumnOptions(), nx("GEN"));
      addSwitcher(pGen, "tooltipSortDirectionGadget", "Tooltip: Sort Direction", this.Config.tooltipSortDirection, [{value: "auto", label: "Auto (smart default)"}, {value: "asc", label: "Ascending"}, {value: "desc", label: "Descending"}], nx("GEN"));
      pGen.addChild(new gadgets.SliderGadgetInfo("tooltipLimitGadget", "Tooltip: Row Limit", "Tooltip: Row Limit", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.tooltipLimit, 5, 50)));
      pGen.addChild(new gadgets.SliderGadgetInfo("tooltipColumnLimitGadget", "Tooltip: Detail Column Cap", "Tooltip: Detail Column Cap", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.tooltipColumnLimit, 1, 20)));
      addToggle(pGen, "showSeriesColGadget", "Tooltip: Show Series Column", this.Config.showSeriesCol);
      addToggle(pGen, "showValueColGadget", "Tooltip: Show Value Column", this.Config.showValueCol);
      addToggle(pGen, "showXPerRowGadget", "Tooltip: Show X Per Row", this.Config.showXPerRow);
      addToggle(pGen, "showXInTitleGadget", "Tooltip: Show X In Title", this.Config.showXInTitle);
      addToggle(pGen, "showAverageGadget", "Tooltip: Show Average Footer", this.Config.showAverage);

      addSwitcher(pGen, "numberFormatGadget", "Format: Number Format", this.Config.numberFormat, [{value: "auto", label: "Auto"}, {value: "number", label: "Number"}, {value: "percent", label: "Percent (×100)"}, {value: "currency", label: "Currency (USD)"}, {value: "compact", label: "Compact (K/M/B)"}], nx("GEN"));
      addSwitcher(pGen, "decimalPlacesGadget", "Format: Decimal Places", this.Config.decimalPlaces, [{value: "auto", label: "Auto"}, {value: "0", label: "0"}, {value: "1", label: "1"}, {value: "2", label: "2"}, {value: "3", label: "3"}, {value: "4", label: "4"}], nx("GEN"));
      addText(pGen, factory, "valuePrefixGadget", "Format: Value Prefix", this.Config.valuePrefix);
      addText(pGen, factory, "valueSuffixGadget", "Format: Value Suffix", this.Config.valueSuffix);

      addSwitcher(pGen, "zoomModeGadget", "Interaction: Zoom Mode", this.Config.zoomMode, [{value: "x", label: "X (horizontal only)"}, {value: "xy", label: "X + Y (both axes)"}, {value: "off", label: "Off"}], nx("GEN"));
      addSwitcher(pGen, "clickBehaviorGadget", "Interaction: Click Marks", this.Config.clickBehavior, [{value: "sharedX", label: "Shared X"}, {value: "single", label: "Single"}], nx("GEN"));
      addToggle(pGen, "privacyModeGadget", "Interaction: Privacy Mode", this.Config.privacyMode);

      // ============ STYLE TAB ============
      addSwitcher(pStyle, "linePatternGadget", "Line: Pattern", this.Config.linePattern, [{value: "solid", label: "Solid"}, {value: "dashed", label: "Dashed"}, {value: "dotted", label: "Dotted"}, {value: "dashdot", label: "Dash-Dot"}], nx("STY"));
      pStyle.addChild(new gadgets.SliderGadgetInfo("lineWidthGadget", "Line: Width", "Line: Width", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.lineWidth, 1, 8)));
      addSwitcher(pStyle, "lineSmoothingGadget", "Line: Smoothing", this.Config.lineSmoothing, [{value: "linear", label: "Linear"}, {value: "smooth", label: "Smooth (curve)"}, {value: "step", label: "Step (after)"}, {value: "stepBefore", label: "Step (before)"}], nx("STY"));
      addSwitcher(pStyle, "missingValueModeGadget", "Line: Treat Nulls As", this.Config.missingValueMode, [{value: "hide", label: "Hide row"}, {value: "zero", label: "Zero"}, {value: "gap", label: "Gap (line break)"}], nx("STY"));

      addToggle(pStyle, "showPointsGadget", "Points: Show", this.Config.showPoints);
      addSwitcher(pStyle, "pointShapeGadget", "Points: Shape", this.Config.pointShape, [{value: "circle", label: "Circle"}, {value: "square", label: "Square"}, {value: "triangle", label: "Triangle"}, {value: "diamond", label: "Diamond"}, {value: "cross", label: "Cross"}, {value: "star", label: "Star"}], nx("STY"));
      pStyle.addChild(new gadgets.SliderGadgetInfo("pointSizeGadget", "Points: Size", "Points: Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.pointSize, 2, 12)));

      addSwitcher(pStyle, "colorSourceGadget", "Color: Source", this.Config.colorSource, [{value: "oac", label: "OAC Theme"}, {value: "custom", label: "Custom Palette"}], nx("STY"));
      addText(pStyle, factory, "paletteGadget", "Color: Custom Palette (comma-separated hex)", this.Config.palette);
      addText(pStyle, factory, "valueLabelGadget", "Value: Display Label (axis + tooltip)", this.Config.valueLabel);
      addText(pStyle, factory, "seriesLabelGadget", "Style: Series Label (override)", this.Config.seriesLabel);

      // ============ HEADER TAB ============
      addSwitcher(pHeader, "headerPresetGadget", "Header: Style Preset", this.Config.headerPreset, [{value: "default", label: "Default"}, {value: "compact", label: "Compact"}, {value: "prominent", label: "Prominent"}, {value: "hidden", label: "Hidden"}], nx("HDR"));
      addText(pHeader, factory, "headerBackgroundColorGadget", "Header: Background Color (hex; overrides preset)", this.Config.headerBackgroundColor);
      addText(pHeader, factory, "headerFontColorGadget", "Header: Text Color (hex)", this.Config.headerFontColor);
      pHeader.addChild(new gadgets.SliderGadgetInfo("headerFontSizeGadget", "Header: Font Size", "Header: Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.headerFontSize, 8, 18)));
      addToggle(pHeader, "headerFontBoldGadget", "Header: Bold", this.Config.headerFontBold);
      addToggle(pHeader, "headerFontItalicGadget", "Header: Italic", this.Config.headerFontItalic);
      addToggle(pHeader, "headerFontUnderlineGadget", "Header: Underline", this.Config.headerFontUnderline);
      pHeader.addChild(new gadgets.SliderGadgetInfo("headerChipLimitGadget", "Header: Chip Cap (per attribute)", "Header: Chip Cap (per attribute)", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.headerChipLimit, 1, 20)));

      // ============ AXIS & LEGEND TAB ============
      addSwitcher(pAxisLegend, "xSortGadget", "Axis: X Sort", this.Config.xSort, [{value: "natural", label: "Natural"}, {value: "descending", label: "Descending"}, {value: "original", label: "Original"}], nx("AXL"));
      addSwitcher(pAxisLegend, "xLabelsGadget", "Axis: X Labels", this.Config.xLabels, [{value: "auto", label: "Auto"}, {value: "off", label: "Off"}, {value: "on", label: "On"}], nx("AXL"));
      addToggle(pAxisLegend, "showGridlinesGadget", "Axis: Gridlines", this.Config.showGridlines);
      addToggle(pAxisLegend, "showGuideGadget", "Axis: Guide Line", this.Config.showGuide);
      addText(pAxisLegend, factory, "xAxisTitleGadget", "Axis: X Title (override)", this.Config.xAxisTitle);
      addText(pAxisLegend, factory, "yAxisTitleGadget", "Axis: Y Title (override)", this.Config.yAxisTitle);
      addSwitcher(pAxisLegend, "yAxisTitleSourceGadget", "Axis: Y Title Source", this.Config.yAxisTitleSource, [{value: "auto", label: "Auto"}, {value: "hidden", label: "Hidden"}], nx("AXL"));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("xAxisTitleFontSizeGadget", "Axis: X Title Font Size", "Axis: X Title Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.xAxisTitleFontSize, 8, 24)));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("yAxisTitleFontSizeGadget", "Axis: Y Title Font Size", "Axis: Y Title Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.yAxisTitleFontSize, 8, 24)));
      addText(pAxisLegend, factory, "xAxisTitleColorGadget", "Axis: X Title Color (hex)", this.Config.xAxisTitleColor);
      addText(pAxisLegend, factory, "yAxisTitleColorGadget", "Axis: Y Title Color (hex)", this.Config.yAxisTitleColor);
      addToggle(pAxisLegend, "axisTitleBoldGadget", "Axis: Title Bold", this.Config.axisTitleBold);
      addToggle(pAxisLegend, "axisTitleItalicGadget", "Axis: Title Italic", this.Config.axisTitleItalic);

      addToggle(pAxisLegend, "legendGadget", "Legend: Show", this.Config.legend);
      addSwitcher(pAxisLegend, "legendPositionGadget", "Legend: Position", this.Config.legendPosition, [{value: "auto", label: "Auto"}, {value: "right", label: "Right"}, {value: "bottom", label: "Bottom"}, {value: "off", label: "Off"}], nx("AXL"));
      addSwitcher(pAxisLegend, "legendOrderGadget", "Legend: Order", this.Config.legendOrder, [{value: "chronoAsc", label: "Chronological (oldest first)"}, {value: "chronoDesc", label: "Chronological (newest first)"}, {value: "strmAsc", label: "STRM (oldest first)"}, {value: "strmDesc", label: "STRM (newest first)"}, {value: "nameAsc", label: "Series Name A→Z"}, {value: "nameDesc", label: "Series Name Z→A"}, {value: "colorOrder", label: "Color order"}], nx("AXL"));
      addSwitcher(pAxisLegend, "legendMarkerShapeGadget", "Legend: Marker Shape", this.Config.legendMarkerShape, [{value: "match", label: "Match Points"}, {value: "circle", label: "Circle"}, {value: "square", label: "Square"}, {value: "triangle", label: "Triangle"}, {value: "diamond", label: "Diamond"}, {value: "cross", label: "Cross"}, {value: "star", label: "Star"}], nx("AXL"));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("legendMarkerSizeGadget", "Legend: Marker Size", "Legend: Marker Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.legendMarkerSize, 3, 12)));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("legendFontSizeGadget", "Legend: Font Size", "Legend: Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.legendFontSize, 8, 18)));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("legendLabelMaxLengthGadget", "Legend: Label Max Length", "Legend: Label Max Length", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.legendLabelMaxLength, 6, 40)));

      if (WsuLineViz.superClass.doAddVizSpecificPropsDialog) WsuLineViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
   };

   WsuLineViz.prototype._handlePropChange = function(sGadgetID, oPropChange, oViewSettings, oActionContext) {
      var updateSettings = WsuLineViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
      if (updateSettings) return updateSettings;
      var map = {
         tooltipModeGadget: "tooltipMode",
         tooltipSortColumnGadget: "tooltipSortColumn",
         tooltipSortDirectionGadget: "tooltipSortDirection",
         zoomModeGadget: "zoomMode",
         compareModeGadget: "compareMode", delta3ModeGadget: "delta3Mode",
         clickBehaviorGadget: "clickBehavior", aggregationGadget: "aggregation",
         xSortGadget: "xSort", xLabelsGadget: "xLabels",
         showPointsGadget: "showPoints", showGridlinesGadget: "showGridlines", showGuideGadget: "showGuide",
         showAverageGadget: "showAverage", showXPerRowGadget: "showXPerRow", showXInTitleGadget: "showXInTitle",
         showSeriesColGadget: "showSeriesCol", showValueColGadget: "showValueCol",
         privacyModeGadget: "privacyMode",
         legendGadget: "legend", legendPositionGadget: "legendPosition",
         legendMarkerShapeGadget: "legendMarkerShape", legendMarkerSizeGadget: "legendMarkerSize",
         legendOrderGadget: "legendOrder", legendFontSizeGadget: "legendFontSize",
         legendLabelMaxLengthGadget: "legendLabelMaxLength",
         lineWidthGadget: "lineWidth",
         linePatternGadget: "linePattern", lineSmoothingGadget: "lineSmoothing",
         pointShapeGadget: "pointShape",
         colorSourceGadget: "colorSource",
         pointSizeGadget: "pointSize", tooltipLimitGadget: "tooltipLimit",
         tooltipColumnLimitGadget: "tooltipColumnLimit", headerChipLimitGadget: "headerChipLimit",
         numberFormatGadget: "numberFormat", decimalPlacesGadget: "decimalPlaces",
         valuePrefixGadget: "valuePrefix", valueSuffixGadget: "valueSuffix",
         missingValueModeGadget: "missingValueMode",
         headerPresetGadget: "headerPreset",
         headerBackgroundColorGadget: "headerBackgroundColor",
         headerFontColorGadget: "headerFontColor",
         headerFontSizeGadget: "headerFontSize",
         headerFontBoldGadget: "headerFontBold",
         headerFontItalicGadget: "headerFontItalic",
         headerFontUnderlineGadget: "headerFontUnderline",
         xAxisTitleGadget: "xAxisTitle",
         yAxisTitleGadget: "yAxisTitle", yAxisTitleSourceGadget: "yAxisTitleSource",
         xAxisTitleFontSizeGadget: "xAxisTitleFontSize", yAxisTitleFontSizeGadget: "yAxisTitleFontSize",
         xAxisTitleColorGadget: "xAxisTitleColor", yAxisTitleColorGadget: "yAxisTitleColor",
         axisTitleBoldGadget: "axisTitleBold", axisTitleItalicGadget: "axisTitleItalic",
         valueLabelGadget: "valueLabel", seriesLabelGadget: "seriesLabel",
         paletteGadget: "palette"
      };
      var key = map[sGadgetID];
      if (!key) return false;
      // W2: TEXT_TOGGLE gadgets emit boolean checked instead of value.
      // Translate at the boundary so internal Config keeps "on"/"off" strings
      // and saved workbooks load identically (zero migration risk).
      var TOGGLE_GADGETS = {
         showSeriesColGadget: 1, showValueColGadget: 1, showXPerRowGadget: 1, showXInTitleGadget: 1, showAverageGadget: 1,
         privacyModeGadget: 1, showPointsGadget: 1,
         headerFontBoldGadget: 1, headerFontItalicGadget: 1, headerFontUnderlineGadget: 1,
         axisTitleBoldGadget: 1, axisTitleItalicGadget: 1,
         showGridlinesGadget: 1, showGuideGadget: 1, legendGadget: 1
      };
      if (TOGGLE_GADGETS[sGadgetID]) {
         this.Config[key] = oPropChange.checked ? "on" : "off";
      } else {
         this.Config[key] = oPropChange.value;
      }
      if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
      else this._saveSettings();
      this.clearZoomState();
      this.setLegendActiveSeries(null);
      return true;
   };

   WsuLineViz.prototype._doStopComponent = function() {
      // Tooltips are attached to <body>; remove ours when the viz is torn down.
      if (this._tooltipId) d3.select("#" + this._tooltipId).remove();
      WsuLineViz.superClass._doStopComponent.apply(this, arguments);
   };

   WsuLineViz.prototype._onDefaultColorsSettingsChanged = function() {
      this._rerender();
   };

   WsuLineViz.prototype._doInitializeComponent = function() {
      WsuLineViz.superClass._doInitializeComponent.call(this);
      this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
      this.subscribeToEvent(events.types.INTERACTION_HIGHLIGHT, this.onHighlight, this.getViewName() + "." + events.types.INTERACTION_HIGHLIGHT);
   };

   function createClientComponent(sID, sDisplayName, sOrigin) {
      return new WsuLineViz(sID, sDisplayName, sOrigin, WsuLineViz.VERSION);
   }

   return {createClientComponent: createClientComponent};
});
