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
        'skin!css!com-wsu-dumbbell/wsuDumbbellstyles'],
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

   var MODULE_NAME = 'com-wsu-dumbbell/wsuDumbbell';
   jsx.assertAllNotNullExceptLastN(arguments, MODULE_NAME + " arguments", 1);

   var _logger = new logger.Logger(MODULE_NAME);
   _logger.info("Initializing WSU Dumbbell plugin");

   // Symbol pinning — fail fast if OAC renames any internal constant.
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
      DIR_IMPROVED: "Improved",
      DIR_WORSE: "Worse",
      DIR_SAME: "Same",
      DIR_INCOMPLETE: "Incomplete",
      MISSING: "Missing",
      AVG_FIRST: "Avg first",
      AVG_SECOND: "Avg second",
      SUMMARY_UP: "Up",
      SUMMARY_DOWN: "Down",
      SUMMARY_FLAT: "Flat",
      SUMMARY_AVG: "Avg Δ",
      SUMMARY_LARGE: "Large drops",
      SORT_LABEL: "Sort",
      ASC_BUTTON: "Asc",
      DESC_BUTTON: "Desc",
      ALL_FILTER: "All",
      ORIGINAL_ORDER: "Original order",
      RESET_ZOOM: "Reset Zoom",
      EMPTY_STATE: "No rows to display. Drop a measure on Value(s), an attribute on Category, and optionally configure missing-value handling or filters.",
      SORTED_BY: " sorted by "
   };

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

   function dashArrayFor(pattern, width) {
      var w = Math.max(Number(width) || 2, 1);
      switch (pattern) {
         case "dashed":  return (w * 4) + " " + (w * 2);
         case "dotted":  return (w * 1) + " " + (w * 2);
         case "dashdot": return (w * 4) + " " + (w * 2) + " " + (w * 1) + " " + (w * 2);
         default:        return null;
      }
   }

   var GROUP_PALETTE = ['#3366cc', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00', '#b82e2e', '#316395'];

   function WsuDumbbellViz(sID, sDisplayName, sOrigin, sVersion) {
      WsuDumbbellViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);

      this.Config = {
         // View
         viewMode: "individual",
         groupAggregation: "mean",
         brushMode: "off",
         viewerControls: "on",
         sortBy: "original",
         sortDirection: "ascending",
         sortControlPosition: "topRight",
         sortControlStyle: "compact",
         controlSpacing: "default",
         jitter: "on",
         performanceMode: "auto",
         longFormatRoleMapping: "keyword",
         // Tooltip
         tooltipLayout: "table",
         showSummary: "on",
         showCategory: "on",
         showFirstValue: "on",
         showSecondValue: "on",
         showDelta: "on",
         showDeltaPercent: "off",
         showDirection: "off",
         showGroup: "on",
         showCount: "on",
         // Format
         numberFormat: "auto",
         decimalPlaces: "auto",
         valuePrefix: "",
         valueSuffix: "",
         missingMode: "hide",
         yScale: "auto",
         // Color
         colorSource: "oac",
         colorMode: "endpoint",
         palette: "",
         firstColor: "",
         secondColor: "",
         connectorColor: "",
         improveColor: "#1b8b3a",
         worseColor: "#c62828",
         sameColor: "#888888",
         // Reference
         referenceLines: "",
         annotations: "",
         averageLines: "off",
         largeChangeThreshold: 1,
         highlightOutliers: "off",
         // Style
         dotSize: 4,
         lineWidth: 2,
         linePattern: "solid",
         endpointShape: "circle",
         // Axis
         xLabels: "auto",
         gridlines: "on",
         xAxisTitle: "",
         yAxisTitle: "",
         // Legend
         legend: "on",
         legendPosition: "auto",
         legendMarkerShape: "match",
         legendMarkerSize: 8,
         // Interaction
         zoomMode: "off",
         clickBehavior: "single",
         // Labels overrides
         entityLabel: "",
         firstLabel: "",
         secondLabel: "",
         groupLabel: ""
      };

      var selectedRows = new Map();
      var lastDatasetMeta = null;
      var legendActiveSeries = null;
      var zoomState = null;

      this._saveSettings = function() {
         this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
      };

      this.loadConfig = function() {
         var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
         Object.keys(this.Config).forEach(function(key) {
            if (!jsx.isNull(conf[key]) && typeof conf[key] !== "undefined") this.Config[key] = conf[key];
         }, this);
         this.Config.dotSize = Number(this.Config.dotSize) || 4;
         this.Config.lineWidth = Number(this.Config.lineWidth) || 2;
         this.Config.largeChangeThreshold = Number(this.Config.largeChangeThreshold) || 1;
         this.Config.legendMarkerSize = Number(this.Config.legendMarkerSize);
         if (isNaN(this.Config.legendMarkerSize) || this.Config.legendMarkerSize < 4) this.Config.legendMarkerSize = 8;
      };

      this.getSelectedRows = function() { return selectedRows; };
      this.clearSelectedRows = function() { selectedRows = new Map(); };
      this.getLastDatasetMeta = function() { return lastDatasetMeta; };
      this.setLastDatasetMeta = function(meta) { lastDatasetMeta = meta; };
      this.getLegendActiveSeries = function() { return legendActiveSeries; };
      this.setLegendActiveSeries = function(s) { legendActiveSeries = s; };
      this.getZoomState = function() { return zoomState; };
      this.setZoomState = function(s) { zoomState = s; };
      this.clearZoomState = function() { zoomState = null; };
   }

   WsuDumbbellViz.VERSION = "1.0.0";
   jsx.extend(WsuDumbbellViz, dataviz.DataVisualization);

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
      } catch (e) { return sign + a + u; }
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
         } else if (format === "currency") {
            formatted = n.toLocaleString(undefined, {style: "currency", currency: "USD", minimumFractionDigits: dec.min, maximumFractionDigits: dec.max});
         } else if (format === "compact") {
            formatted = formatCompact(n, dec);
         } else {
            formatted = n.toLocaleString(undefined, {minimumFractionDigits: dec.min, maximumFractionDigits: dec.max});
         }
      } catch (e) { formatted = String(n); }
      return prefix + formatted + suffix;
   }

   function formatDelta(value, opts) {
      if (jsx.isNull(value) || value === "" || isNaN(value)) return "";
      return (Number(value) > 0 ? "+" : "") + formatValue(value, opts);
   }

   function label(value, limit) {
      var text = str(value);
      if (text.length <= limit) return text;
      return text.substr(0, Math.max(limit - 3, 1)) + "...";
   }

   function tokens(value) {
      return str(value).split(',').map(function(part) { return part.trim(); }).filter(function(part) { return part !== ""; });
   }

   function compareText(a, b) {
      return str(a).localeCompare(str(b), undefined, {numeric: true, sensitivity: "base"});
   }

   function safeNum(value) {
      return isNaN(value) ? Number.POSITIVE_INFINITY : value;
   }

   function getMeasureName(oDataLayout, aAllMeasures, index, fallback) {
      var value = "";
      try { value = oDataLayout.getValue(PHYS_COLUMN, 0, index, false); }
      catch (e) { value = ""; }
      return str(value || aAllMeasures[index] || fallback);
   }

   function direction(delta) {
      if (delta > 0) return LBL.DIR_IMPROVED;
      if (delta < 0) return LBL.DIR_WORSE;
      return LBL.DIR_SAME;
   }

   function parseLabeledValues(text) {
      return tokens(text).map(function(item) {
         var parts = item.split(':');
         var value = parseFloat(parts[0]);
         if (isNaN(value)) return null;
         return {value: value, label: str(parts.slice(1).join(':') || parts[0])};
      }).filter(function(item) { return item !== null; });
   }

   WsuDumbbellViz.prototype._configText = function(key, fallback) {
      var value = str(this.Config[key]);
      return value === "" ? fallback : value;
   };

   WsuDumbbellViz.prototype._formatOpts = function() {
      return {
         numberFormat: this.Config.numberFormat,
         decimalPlaces: this.Config.decimalPlaces,
         valuePrefix: this.Config.valuePrefix,
         valueSuffix: this.Config.valueSuffix
      };
   };

   WsuDumbbellViz.prototype._palette = function() {
      var parsed = tokens(this.Config.palette);
      return parsed.length ? parsed : d3.schemeCategory10.slice();
   };

   // Resolves the first/second/connector colors. When the user hasn't specified
   // an explicit color, falls back to palette positions 0 and 1 (with connector
   // a neutral gray). OAC theme colors come through the color service for
   // groups; endpoint colors here are deliberately user-set or palette-derived.
   WsuDumbbellViz.prototype._endpointDefaultColor = function(which) {
      var palette = this._palette();
      var explicit = this.Config[which + "Color"];
      if (str(explicit).trim()) return explicit;
      if (which === "first") return palette[0] || "#1f77b4";
      if (which === "second") return palette[1] || "#ff7f0e";
      return "#777f87"; // connector default
   };

   WsuDumbbellViz.prototype._buildSortColumnOptions = function() {
      var meta = this.getLastDatasetMeta();
      var sortLabels = (meta && meta.sortLabels) ? meta.sortLabels : [];
      var options = [{value: "original", label: LBL.ORIGINAL_ORDER}];
      sortLabels.forEach(function(lab, i) {
         options.push({value: "sort-" + i, label: lab});
      });
      // Surface saved value if it no longer maps to a current bucket
      var current = str(this.Config.sortBy);
      if (current && current !== "original") {
         var match = options.some(function(o) { return o.value === current; });
         if (!match) options.push({value: current, label: current + " (not in current data)"});
      }
      return options;
   };

   WsuDumbbellViz.prototype._generateData = function(oDataLayout, oTransientRenderingContext) {
      var oDataModel = this.getRootDataModel();
      if (!oDataModel || !oDataLayout) return null;

      var aAllMeasures = oDataModel.getColumnIDsIn(PHYS_DATA);
      var nRows = oDataLayout.getEdgeExtent(PHYS_ROW);
      var nRowLayerCount = oDataLayout.getLayerCount(PHYS_ROW);
      var helper = oTransientRenderingContext.get(DCP_DATA_LAYOUT_HELPER);

      var useOacColors = this.Config.colorSource !== "custom";
      var oColorContext = null;
      var oColorInterpolator = null;
      var colorServiceAvailable = useOacColors;
      if (useOacColors) {
         try {
            oColorContext = this.getColorContext(oTransientRenderingContext);
            oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, LOGICAL_COLOR);
         } catch (e) { colorServiceAvailable = false; }
      }

      var layers = [];
      var entityLabel = "Category";
      var roleLabel = "Role";
      var detailLabels = [];
      var groupLabel = "Color";
      var sortLabels = [];
      var filterLabels = [];

      for (var layerIndex = 0; layerIndex < nRowLayerCount; layerIndex++) {
         var key = "";
         try { key = helper.getLogicalEdgeName(PHYS_ROW, layerIndex); }
         catch (e) { key = ""; }
         var displayName = oDataLayout.getLayerMetadata(PHYS_ROW, layerIndex, LAYER_DISPLAY_NAME);
         layers.push({key: key, displayName: displayName || key, index: layerIndex});
         if (key === "row") entityLabel = displayName || entityLabel;
         if (key === "item") roleLabel = displayName || roleLabel;
         if (key === "detail") detailLabels.push(displayName || ("Detail " + (detailLabels.length + 1)));
         if (key === "color") groupLabel = displayName || groupLabel;
         if (key === "glyph") sortLabels.push(displayName || ("Sort " + (sortLabels.length + 1)));
         if (key === "size") filterLabels.push(displayName || ("Filter " + (filterLabels.length + 1)));
      }

      var rows;
      if (aAllMeasures.length >= 2) {
         rows = this._generateWideData(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, aAllMeasures, layers, nRows, entityLabel, detailLabels, groupLabel, sortLabels, filterLabels);
      }
      else {
         rows = this._generateLongData(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, aAllMeasures, layers, nRows, entityLabel, roleLabel, detailLabels, groupLabel, sortLabels, filterLabels);
      }

      rows = this._applyMissingMode(rows);
      var controlRows = rows.slice();
      rows = this._applyFilters(rows);
      if (this.Config.viewMode === "groupAverage") rows = this._aggregateRows(rows);
      this._allRows = controlRows;
      rows = this._sortRows(rows);
      rows.forEach(function(row, i) {
         row.position = i + 1;
         row.xKey = "pos-" + i + "-row-" + row.rowKey;
      });

      // Cache for property panel dropdown.
      this.setLastDatasetMeta({
         entityLabel: entityLabel,
         groupLabel: groupLabel,
         detailLabels: detailLabels.slice(),
         sortLabels: sortLabels.slice(),
         filterLabels: filterLabels.slice()
      });

      return rows;
   };

   WsuDumbbellViz.prototype._generateWideData = function(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, measures, layers, nRows, entityLabel, detailLabels, groupLabel, sortLabels, filterLabels) {
      var firstName = this._configText("firstLabel", getMeasureName(oDataLayout, measures, 0, "First value"));
      var secondName = this._configText("secondLabel", getMeasureName(oDataLayout, measures, 1, "Second value"));
      var rows = [];
      for (var rowIndex = 0; rowIndex < Math.max(nRows, 0); rowIndex++) {
         var meta = this._readRowMeta(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, layers, rowIndex, detailLabels, sortLabels, filterLabels);
         var first = parseFloat(oDataLayout.getValue(PHYS_DATA, rowIndex, 0));
         var second = parseFloat(oDataLayout.getValue(PHYS_DATA, rowIndex, 1));
         rows.push(this._makeRow(rowIndex, rowIndex, entityLabel, meta.entity || ("Row " + (rowIndex + 1)), firstName, secondName, first, second, meta.details, meta.group, groupLabel, null, meta.groupColor, meta.sortFields, meta.filterFields));
      }
      return rows;
   };

   WsuDumbbellViz.prototype._resolveLongRole = function(role, indexInBucket) {
      var mode = this.Config.longFormatRoleMapping || "keyword";
      if (mode === "bucketOrder") {
         // First two distinct roles encountered = first / second; further roles become first-fill or ignored
         return indexInBucket === 0 ? "first" : "second";
      }
      // keyword (legacy behavior)
      var roleKey = str(role).toLowerCase();
      if (roleKey.indexOf("pre") >= 0 || roleKey.indexOf("first") >= 0 || roleKey.indexOf("before") >= 0) return "first";
      if (roleKey.indexOf("target") >= 0 || roleKey.indexOf("second") >= 0 || roleKey.indexOf("after") >= 0) return "second";
      return null; // caller falls through to first-empty / second-empty
   };

   WsuDumbbellViz.prototype._generateLongData = function(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, measures, layers, nRows, entityLabel, roleLabel, detailLabels, groupLabel, sortLabels, filterLabels) {
      var byEntity = {};
      var oViz = this;
      for (var rowIndex = 0; rowIndex < Math.max(nRows, 0); rowIndex++) {
         var meta = this._readRowMeta(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, layers, rowIndex, detailLabels, sortLabels, filterLabels);
         var role = meta.role || "";
         var value = parseFloat(oDataLayout.getValue(PHYS_DATA, rowIndex, 0));
         var key = meta.entity || ("Row " + rowIndex);
         if (!byEntity[key]) {
            byEntity[key] = {
               sourceRows: [],
               entity: key,
               firstName: "",
               secondName: "",
               first: NaN,
               second: NaN,
               details: meta.details,
               sortFields: meta.sortFields,
               filterFields: meta.filterFields,
               group: meta.group,
               groupColor: meta.groupColor,
               groupLabel: groupLabel,
               rolesSeenCount: 0
            };
         }
         var target = byEntity[key];
         target.sourceRows.push(rowIndex);
         var resolved = oViz._resolveLongRole(role, target.rolesSeenCount);
         target.rolesSeenCount++;
         if (resolved === "first" && isNaN(target.first)) {
            target.first = value;
            target.firstName = oViz._configText("firstLabel", role || "First value");
         }
         else if (resolved === "second" && isNaN(target.second)) {
            target.second = value;
            target.secondName = oViz._configText("secondLabel", role || "Second value");
         }
         else if (isNaN(target.first)) {
            target.first = value;
            target.firstName = oViz._configText("firstLabel", role || "First value");
         }
         else if (isNaN(target.second)) {
            target.second = value;
            target.secondName = oViz._configText("secondLabel", role || "Second value");
         }
      }

      return Object.keys(byEntity).map(function(key, index) {
         var item = byEntity[key];
         return this._makeRow(item.sourceRows[0], index, entityLabel, item.entity, item.firstName, item.secondName, item.first, item.second, item.details, item.group, item.groupLabel, item.sourceRows, item.groupColor, item.sortFields, item.filterFields);
      }, this);
   };

   WsuDumbbellViz.prototype._readRowMeta = function(oDataLayout, helper, oColorContext, oColorInterpolator, colorServiceAvailable, layers, rowIndex, detailLabels, sortLabels, filterLabels) {
      var meta = {entity: "", role: "", details: [], group: "", groupColor: "", sortFields: [], filterFields: []};
      var detailCount = 0, sortCount = 0, filterCount = 0;
      var oViz = this;
      layers.forEach(function(layer) {
         var value = str(oDataLayout.getValue(PHYS_ROW, layer.index, rowIndex, false));
         if (layer.key === "row") meta.entity = value;
         else if (layer.key === "item") meta.role = value;
         else if (layer.key === "detail") {
            meta.details.push({label: detailLabels[detailCount] || layer.displayName || ("Detail " + (detailCount + 1)), value: value});
            detailCount++;
         }
         else if (layer.key === "glyph") {
            meta.sortFields.push({label: sortLabels[sortCount] || layer.displayName || ("Sort " + (sortCount + 1)), value: value});
            sortCount++;
         }
         else if (layer.key === "size") {
            meta.filterFields.push({label: filterLabels[filterCount] || layer.displayName || ("Filter " + (filterCount + 1)), value: value});
            filterCount++;
         }
         else if (layer.key === "color") {
            meta.group = value;
            if (colorServiceAvailable) {
               try {
                  var colorInfo = oViz.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
                  meta.groupColor = colorInfo.sColor || colorInfo.sSeriesColor || "";
                  meta.group = colorInfo.sSeriesColorLabel || meta.group;
               } catch (e) { meta.groupColor = ""; }
            }
         }
      });
      return meta;
   };

   WsuDumbbellViz.prototype._makeRow = function(row, rowKey, entityLabel, entity, firstName, secondName, first, second, details, group, groupLabel, sourceRows, groupColor, sortFields, filterFields) {
      var firstMissing = isNaN(first);
      var secondMissing = isNaN(second);
      var delta = (!firstMissing && !secondMissing) ? (second - first) : NaN;
      return {
         row: row,
         rowKey: rowKey,
         sourceRows: sourceRows || [row],
         entityLabel: entityLabel,
         entity: entity,
         firstName: firstName,
         secondName: secondName,
         first: first,
         second: second,
         firstMissing: firstMissing,
         secondMissing: secondMissing,
         delta: delta,
         absDelta: isNaN(delta) ? NaN : Math.abs(delta),
         direction: isNaN(delta) ? LBL.DIR_INCOMPLETE : direction(delta),
         details: details || [],
         sortFields: sortFields || [],
         filterFields: filterFields || [],
         group: group || "",
         groupLabel: groupLabel || "Group",
         groupColor: groupColor || "",
         count: 1
      };
   };

   WsuDumbbellViz.prototype._applyMissingMode = function(rows) {
      var mode = this.Config.missingMode;
      if (mode === "zero") {
         rows.forEach(function(row) {
            if (row.firstMissing) row.first = 0;
            if (row.secondMissing) row.second = 0;
            row.firstMissing = false;
            row.secondMissing = false;
            row.delta = row.second - row.first;
            row.absDelta = Math.abs(row.delta);
            row.direction = direction(row.delta);
         });
      }
      if (mode === "show") return rows;
      return rows.filter(function(row) { return !row.firstMissing && !row.secondMissing; });
   };

   WsuDumbbellViz.prototype._aggregateRows = function(rows) {
      var groups = {};
      rows.forEach(function(row) {
         var key = row.group || "All";
         if (!groups[key]) groups[key] = {items: [], key: key};
         groups[key].items.push(row);
      });
      var aggMode = this.Config.groupAggregation || "mean";
      var aggFn;
      if (aggMode === "median") aggFn = d3.median;
      else if (aggMode === "sum") aggFn = d3.sum;
      else if (aggMode === "min") aggFn = d3.min;
      else if (aggMode === "max") aggFn = d3.max;
      else aggFn = d3.mean;
      return Object.keys(groups).map(function(key, index) {
         var items = groups[key].items;
         var firstVals = items.filter(function(d) { return !d.firstMissing; }).map(function(d) { return d.first; });
         var secondVals = items.filter(function(d) { return !d.secondMissing; }).map(function(d) { return d.second; });
         var row = this._makeRow(
            items[0].row,
            "group-" + index,
            items[0].groupLabel || "Group",
            key,
            items[0].firstName,
            items[0].secondName,
            aggFn(firstVals),
            aggFn(secondVals),
            [],
            key,
            items[0].groupLabel,
            items.reduce(function(acc, item) { return acc.concat(item.sourceRows); }, []),
            items[0].groupColor,
            this._aggregateSortFields(items),
            []
         );
         row.count = items.length;
         return row;
      }, this);
   };

   WsuDumbbellViz.prototype._aggregateSortFields = function(items) {
      var fieldCount = d3.max(items, function(item) {
         return item.sortFields ? item.sortFields.length : 0;
      }) || 0;
      var aggregated = [];
      for (var i = 0; i < fieldCount; i++) {
         var values = items.map(function(item) {
            return item.sortFields && item.sortFields[i] ? item.sortFields[i].value : "";
         }).filter(function(value) {
            return str(value).trim() !== "";
         });
         var firstField = items[0].sortFields && items[0].sortFields[i] ? items[0].sortFields[i] : null;
         if (!values.length || !firstField) continue;
         var firstValue = values[0];
         var allSame = values.every(function(value) { return str(value) === str(firstValue); });
         if (!allSame) continue;
         aggregated.push({label: firstField.label, value: firstValue});
      }
      return aggregated;
   };

   WsuDumbbellViz.prototype._sortAccessor = function(key) {
      if (typeof key === 'string' && key.indexOf('sort-') === 0) {
         var i = parseInt(key.substring(5), 10);
         return function(r) { return r.sortFields && r.sortFields[i] ? r.sortFields[i].value : ''; };
      }
      if (key === "delta") return function(r) { return r.delta; };
      if (key === "absDelta") return function(r) { return r.absDelta; };
      if (key === "first") return function(r) { return r.first; };
      if (key === "second") return function(r) { return r.second; };
      return function(r) { return r.row; };
   };

   WsuDumbbellViz.prototype._sortRows = function(rows) {
      var sortBy = this.Config.sortBy || 'original';
      var directionMultiplier = this.Config.sortDirection === "descending" ? -1 : 1;
      var accessor = this._sortAccessor(sortBy);
      return rows.slice().sort(function(a, b) {
         var va = accessor(a), vb = accessor(b);
         var na = parseFloat(va), nb = parseFloat(vb);
         var bothNumeric = !isNaN(na) && !isNaN(nb) && va !== '' && vb !== '';
         var cmp = bothNumeric ? safeNum(na) - safeNum(nb) : compareText(va, vb);
         if (cmp === 0) cmp = a.row - b.row;
         return cmp * directionMultiplier;
      });
   };

   WsuDumbbellViz.prototype._draw = function(elContainer, rows, oDataLayout) {
      var oViz = this;
      var containerId = this.getSubElementIdFromParent(elContainer, "wsuDumbbell") || this.getID() || ("viz_" + new Date().getTime());
      var rootId = "wsu_dumbbell_" + containerId.replace(/[^A-Za-z0-9_-]/g, "_");
      $(elContainer).html("<div id='" + rootId + "' class='wsu-dumbbell' data-zoom-mode='" + esc(this.Config.zoomMode || "off") + "' data-brush-mode='" + esc(this.Config.brushMode || "off") + "'></div>");
      var root = d3.select("#" + rootId);
      var width = Math.max($(elContainer).width(), 360);
      var height = Math.max($(elContainer).height(), 260);

      var controlsMode = this.Config.viewerControls !== "off";
      var controlsPosition = this.Config.sortControlPosition || "topRight";
      var controlsInFlowTop = controlsMode && (controlsPosition === "above" || controlsPosition === "topLeft" || controlsPosition === "topRight");
      var controlsInFlowBottom = controlsMode && (controlsPosition === "below" || controlsPosition === "bottomLeft" || controlsPosition === "bottomRight");
      var controlsHeight = 0;

      if (controlsInFlowTop) {
         var topControls = this._drawControls(root, rows, width);
         controlsHeight = topControls && topControls.node() ? topControls.node().offsetHeight : 0;
      }

      var chartArea = root.append("div").attr("class", "chart-area");
      var bottomControls = null;
      if (controlsInFlowBottom) {
         bottomControls = this._drawControls(root, rows, width);
         controlsHeight = bottomControls && bottomControls.node() ? bottomControls.node().offsetHeight : 0;
      }

      var svgHeight = Math.max(height - controlsHeight, 160);
      var summaryHeight = this.Config.showSummary === "on" ? 28 : 0;
      var legendItems = this._legendItems(rows[0], rows);
      var legendPlacement = this._legendPlacement(width, legendItems);
      var showLegend = legendPlacement !== "off";
      var legendRightWidth = showLegend && legendPlacement === "right" ? this._legendRightWidth(legendItems) : 0;
      var legendBottomHeight = showLegend && legendPlacement === "bottom" ? this._legendBottomHeight(legendItems, width) : 0;
      var margin = {
         top: 18 + summaryHeight,
         right: 28 + legendRightWidth,
         bottom: (this._shouldShowLabels(rows.length) ? 92 : 48) + legendBottomHeight,
         left: 58
      };

      if (this.Config.showSummary === "on") this._drawSummary(chartArea, rows);

      var tooltip = d3.select("body").selectAll("#" + rootId + "_tooltip").data([null]);
      tooltip = tooltip.enter().append("div").attr("id", rootId + "_tooltip").attr("class", "wsu-dumbbell-tooltip").merge(tooltip);

      var svg = chartArea.append("svg")
         .attr("width", width)
         .attr("height", svgHeight)
         .attr("viewBox", "0 0 " + width + " " + svgHeight)
         .on("click", function(event) {
            if (event.target === this) {
               oViz._clearMarks(oDataLayout, root);
               // Empty-area click also clears legend fade so users have a
               // recovery path if they're confused about what got greyed out.
               if (oViz.getLegendActiveSeries()) {
                  oViz.setLegendActiveSeries(null);
                  oViz._applyLegendActiveSeries();
               }
            }
         });

      // Apply X-axis zoom by filtering rows to selected entities. yDomain is
      // honored inside _drawPanel via the zoom state directly.
      var zState = this.getZoomState();
      if (zState && zState.entities && zState.entities.length) {
         var entSet = new Set(zState.entities);
         rows = rows.filter(function(r) { return entSet.has(r.entity); });
      }

      if (this.Config.viewMode === "smallMultiples" && this._hasGroups(rows)) {
         this._drawSmallMultiples(svg, rows, margin, width, svgHeight, tooltip, oDataLayout, root);
         return;
      }

      var innerWidth = Math.max(width - margin.left - margin.right, 120);
      var innerHeight = Math.max(svgHeight - margin.top - margin.bottom, 120);
      this._drawPanel(svg, rows, {
         x: margin.left, y: margin.top,
         width: innerWidth, height: innerHeight,
         title: "", showXAxisTitle: true, showYAxisTitle: true
      }, tooltip, oDataLayout, root);

      if (showLegend) this._drawLegend(svg, legendPlacement, {
         x: margin.left, y: margin.top,
         width: innerWidth, height: innerHeight,
         chartBottom: margin.top + innerHeight,
         legendY: margin.top + innerHeight + (this._shouldShowLabels(rows.length) ? 86 : 46),
         svgWidth: width, svgHeight: svgHeight,
         rightWidth: legendRightWidth, bottomHeight: legendBottomHeight
      }, legendItems);

      this._applySelectedRows(root);
      this._applyLegendActiveSeries();
   };

   WsuDumbbellViz.prototype._drawPanel = function(svg, rows, box, tooltip, oDataLayout, root) {
      var oViz = this;
      var fmtOpts = this._formatOpts();
      var g = svg.append("g").attr("transform", "translate(" + box.x + "," + box.y + ")");
      if (box.title) {
         g.append("text").attr("class", "panel-title").attr("x", 0).attr("y", -6).text(label(box.title, 42));
      }

      var zoom = oViz.getZoomState();
      var yDomain = zoom && zoom.yDomain ? zoom.yDomain : this._yDomain(rows);
      var x = d3.scalePoint().domain(rows.map(function(d) { return d.xKey; })).range([0, box.width]).padding(0.5);
      var y = d3.scaleLinear().domain(yDomain).range([box.height, 0]).nice();

      if (this.Config.gridlines === "on") {
         g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-box.width).tickFormat(""));
      }

      var byKey = {};
      rows.forEach(function(row) { byKey[row.xKey] = row; });
      var xAxis = d3.axisBottom(x).tickValues(this._tickValues(rows)).tickFormat(function(xKey) {
         var row = byKey[xKey];
         if (!row) return "";
         if (!oViz._shouldShowLabels(rows.length)) return String(row.position || "");
         return label(row.entity, 16);
      });

      var yAxis = d3.axisLeft(y).tickFormat(function(d) { return formatValue(d, fmtOpts); });

      g.append("g").attr("class", "x axis").attr("transform", "translate(0," + box.height + ")").call(xAxis)
         .selectAll("text")
         .attr("transform", this._shouldShowLabels(rows.length) ? "rotate(-35)" : null)
         .style("text-anchor", this._shouldShowLabels(rows.length) ? "end" : "middle");
      g.append("g").attr("class", "y axis").call(yAxis);

      this._drawReferenceLines(g, rows, y, box.width, fmtOpts);

      if (box.showXAxisTitle) {
         g.append("text").attr("class", "axis-label").attr("x", box.width / 2).attr("y", box.height + (this._shouldShowLabels(rows.length) ? 80 : 38)).attr("text-anchor", "middle").text(this._xAxisTitle(rows));
      }
      if (box.showYAxisTitle) {
         g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -box.height / 2).attr("y", -42).attr("text-anchor", "middle").text(this._configText("yAxisTitle", ""));
      }

      var jitter = this.Config.jitter === "on" ? Math.min(5, Math.max(2, box.width / Math.max(rows.length, 1) * 0.18)) : 0;
      var dashArray = dashArrayFor(this.Config.linePattern, this.Config.lineWidth);
      var symGen = d3.symbol().type(symbolType(this.Config.endpointShape)).size(Math.PI * Math.pow(this.Config.dotSize, 2));

      var group = g.selectAll(".student-dumbbell").data(rows, function(d) { return d.xKey; }).enter().append("g")
         .attr("class", function(d) { return "student-dumbbell " + (oViz._isOutlier(d) ? "outlier" : ""); })
         .attr("data-row", function(d) { return d.row; })
         .attr("data-series-key", function(d) { return oViz._seriesKey(d); });

      var connector = group.append("line")
         .attr("class", function(d) { return "connector dir-" + (isNaN(d.delta) ? "incomplete" : (d.delta > 0 ? "up" : (d.delta < 0 ? "down" : "flat"))); })
         .attr("x1", function(d) { return x(d.xKey) - (oViz._samePoint(d) ? jitter : 0); })
         .attr("x2", function(d) { return x(d.xKey) + (oViz._samePoint(d) ? jitter : 0); })
         .attr("y1", function(d) { return y(d.first); })
         .attr("y2", function(d) { return y(d.second); })
         .attr("stroke", function(d) { return oViz._connectorColor(d); })
         .attr("stroke-width", function(d) { return oViz._isOutlier(d) ? Math.max(oViz.Config.lineWidth, 3) : oViz.Config.lineWidth; })
         .style("display", function(d) { return d.firstMissing || d.secondMissing ? "none" : null; });
      if (dashArray) connector.attr("stroke-dasharray", dashArray);

      group.append("line")
         .attr("class", "connector-hit")
         .attr("x1", function(d) { return x(d.xKey); })
         .attr("x2", function(d) { return x(d.xKey); })
         .attr("y1", function(d) { return y(d.firstMissing ? d.second : d.first); })
         .attr("y2", function(d) { return y(d.secondMissing ? d.first : d.second); })
         .on("mouseover", function(event, d) { oViz._showTooltip(tooltip, event, d, "pair"); })
         .on("mousemove", function(event) { oViz._moveTooltip(tooltip, event); })
         .on("mouseout", function() { tooltip.style("display", "none"); })
         .on("click", function(event, d) { oViz._markRow(event, d, oDataLayout, root); });

      group.append("path")
         .attr("class", "endpoint first")
         .attr("data-row", function(d) { return d.row; })
         .attr("data-series", function(d) { return d.group || ""; })
         .attr("transform", function(d) { return "translate(" + (x(d.xKey) - (oViz._samePoint(d) ? jitter : 0)) + "," + y(d.first) + ")"; })
         .attr("d", symGen())
         .attr("fill", function(d) { return oViz._endpointColor(d, "first"); })
         .style("display", function(d) { return d.firstMissing ? "none" : null; })
         .on("mouseover", function(event, d) { oViz._showTooltip(tooltip, event, d, "first"); })
         .on("mousemove", function(event) { oViz._moveTooltip(tooltip, event); })
         .on("mouseout", function() { tooltip.style("display", "none"); })
         .on("click", function(event, d) { oViz._markRow(event, d, oDataLayout, root); });

      group.append("path")
         .attr("class", "endpoint second")
         .attr("data-row", function(d) { return d.row; })
         .attr("data-series", function(d) { return d.group || ""; })
         .attr("transform", function(d) { return "translate(" + (x(d.xKey) + (oViz._samePoint(d) ? jitter : 0)) + "," + y(d.second) + ")"; })
         .attr("d", symGen())
         .attr("fill", function(d) { return oViz._endpointColor(d, "second"); })
         .style("display", function(d) { return d.secondMissing ? "none" : null; })
         .on("mouseover", function(event, d) { oViz._showTooltip(tooltip, event, d, "second"); })
         .on("mousemove", function(event) { oViz._moveTooltip(tooltip, event); })
         .on("mouseout", function() { tooltip.style("display", "none"); })
         .on("click", function(event, d) { oViz._markRow(event, d, oDataLayout, root); });

      this._drawAnnotations(g, y, box.width);

      // Brush selection wins over zoom on the X drag gesture.
      if (this.Config.brushMode === "on") {
         var brush = d3.brushX().extent([[0, 0], [box.width, box.height]]).on("end", function(event) {
            if (!event.selection) return;
            var selection = event.selection;
            var marked = rows.filter(function(d) {
               var xPos = x(d.xKey);
               return xPos >= selection[0] && xPos <= selection[1];
            });
            oViz._markRows(marked, oDataLayout, root);
         });
         g.append("g").attr("class", "brush").call(brush);
      }
      else if (this.Config.zoomMode && this.Config.zoomMode !== "off") {
         this._installZoomBox(svg, g, box.width, box.height, x, y, rows, this.Config.zoomMode);
         if (zoom) this._renderResetButton(svg, root, box.x, box.y);
      }
   };

   WsuDumbbellViz.prototype._installZoomBox = function(svg, g, innerWidth, innerHeight, x, y, rows, mode) {
      var oViz = this;
      var xMode = mode === "x" || mode === "xy";
      var yMode = mode === "y" || mode === "xy";
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
         if (escHandler) { document.removeEventListener("keydown", escHandler); escHandler = null; }
      }

      svg.on("mousedown.zoom", function(event) {
         if (event.button !== 0) return;
         var pt = pointerInChart(event);
         if (pt.x < 0 || pt.x > innerWidth || pt.y < 0 || pt.y > innerHeight) return;
         dragging = true;
         startX = pt.x;
         startY = pt.y;
         var rectX = xMode ? startX : 0;
         var rectY = yMode ? startY : 0;
         var rectW = xMode ? 0 : innerWidth;
         var rectH = yMode ? 0 : innerHeight;
         dragRect.attr("display", null).attr("x", rectX).attr("y", rectY).attr("width", rectW).attr("height", rectH);
         escHandler = function(ev) { if (ev.key === "Escape" && dragging) { ev.preventDefault(); endDrag(); } };
         document.addEventListener("keydown", escHandler);
      });
      svg.on("mousemove.zoom", function(event) {
         if (!dragging) return;
         var pt = pointerInChart(event);
         var cx = Math.max(0, Math.min(innerWidth, pt.x));
         var cy = Math.max(0, Math.min(innerHeight, pt.y));
         var rx = xMode ? Math.min(startX, cx) : 0;
         var rw = xMode ? Math.abs(cx - startX) : innerWidth;
         var ry = yMode ? Math.min(startY, cy) : 0;
         var rh = yMode ? Math.abs(cy - startY) : innerHeight;
         dragRect.attr("x", rx).attr("y", ry).attr("width", rw).attr("height", rh);
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
         var significant = (xMode && dx >= DRAG_THRESHOLD) || (yMode && dy >= DRAG_THRESHOLD);
         if (!significant) return;
         var newState = {};
         if (xMode) {
            var rx0 = Math.min(sx, cx), rx1 = Math.max(sx, cx);
            // Capture by entity name (stable across view modes) rather than
            // xKey (regenerated per render in small multiples).
            var entities = rows.filter(function(d) {
               var xPos = x(d.xKey);
               return xPos >= rx0 && xPos <= rx1;
            }).map(function(d) { return d.entity; });
            if (entities.length === 0) return;
            newState.entities = entities;
         }
         if (yMode) {
            var ry0 = Math.min(sy, cy), ry1 = Math.max(sy, cy);
            newState.yDomain = [y.invert(ry1), y.invert(ry0)];
         }
         oViz.setZoomState(newState);
         oViz._rerender();
      });
      svg.on("mouseleave.zoom", function() { if (dragging) endDrag(); });
      svg.on("dblclick.zoom", function(event) {
         event.preventDefault();
         if (oViz.getZoomState()) { oViz.clearZoomState(); oViz._rerender(); }
      });
   };

   WsuDumbbellViz.prototype._renderResetButton = function(svg, root, offX, offY) {
      var oViz = this;
      var existing = root.select(".wsu-dumbbell-reset");
      if (!existing.empty()) existing.remove();
      var btn = root.append("button")
         .attr("type", "button")
         .attr("class", "wsu-dumbbell-reset")
         .text(LBL.RESET_ZOOM);
      btn.on("click", function(event) {
         event.preventDefault();
         event.stopPropagation();
         oViz.clearZoomState();
         oViz._rerender();
      });
   };

   WsuDumbbellViz.prototype._drawSmallMultiples = function(svg, rows, margin, width, height, tooltip, oDataLayout, root) {
      var groups = d3.group(rows, function(d) { return d.group || "Ungrouped"; });
      var keys = Array.from(groups.keys()).slice(0, 12);
      var panelGap = 22;
      var availableHeight = Math.max(height - margin.top - margin.bottom, 120);
      var panelHeight = Math.max((availableHeight - panelGap * (keys.length - 1)) / Math.max(keys.length, 1), 70);
      var panelWidth = Math.max(width - margin.left - margin.right, 120);
      keys.forEach(function(key, i) {
         var panelRows = groups.get(key);
         panelRows.forEach(function(row, j) {
            row.xKey = "sm-" + i + "-" + j + "-" + row.rowKey;
            row.position = j + 1;
         });
         this._drawPanel(svg, panelRows, {
            x: margin.left,
            y: margin.top + i * (panelHeight + panelGap),
            width: panelWidth, height: panelHeight,
            title: key,
            showXAxisTitle: i === keys.length - 1,
            showYAxisTitle: i === 0
         }, tooltip, oDataLayout, root);
      }, this);
      this._applySelectedRows(root);
      this._applyLegendActiveSeries();
   };

   WsuDumbbellViz.prototype._drawControls = function(root, rows, width) {
      var oViz = this;
      var position = this.Config.sortControlPosition || "topRight";
      if (this.Config.viewerControls === "off") return null;
      var allRows = this._allRows || rows;
      var sortSample = rows.filter(function(row) { return row.sortFields && row.sortFields.length; })[0] || rows[0] || allRows[0];
      var filterSample = allRows[0] || rows[0];
      var sortOpts = this._sortOptions(sortSample);
      var filterFieldCount = (filterSample && filterSample.filterFields) ? filterSample.filterFields.length : 0;
      var hasSort = sortOpts.length > 1;
      if (!hasSort && filterFieldCount === 0) return null;

      var controls = root.append("div")
         .attr("class", "in-chart-controls pos-" + position + " style-" + (this.Config.sortControlStyle || "compact") + " spacing-" + (this.Config.controlSpacing || "default"));

      if (hasSort) {
         controls.append("span").attr("class", "control-label").text(LBL.SORT_LABEL);
         var sortSelect = controls.append("select").on("change", function(event) {
            oViz.Config.sortBy = event.target.value;
            oViz._saveSettings();
            oViz._rerender();
         });
         sortSelect.selectAll("option").data(sortOpts).enter().append("option").attr("value", function(d) { return d.value; }).property("selected", function(d) { return d.value === oViz.Config.sortBy; }).text(function(d) { return d.label; });

         controls.append("button").attr("type", "button").text(this.Config.sortDirection === "ascending" ? LBL.ASC_BUTTON : LBL.DESC_BUTTON).on("click", function() {
            oViz.Config.sortDirection = oViz.Config.sortDirection === "ascending" ? "descending" : "ascending";
            oViz._saveSettings();
            oViz._rerender();
         });
      }

      for (var i = 0; i < filterFieldCount; i++) {
         (function(idx) {
            var field = filterSample.filterFields[idx];
            var key = 'filter-' + idx;
            var current = (oViz.Config.filterValues && oViz.Config.filterValues[key]) || '__all__';
            var values = oViz._uniqueFilterValues(allRows, idx);
            controls.append("span").attr("class", "control-label").text(field.label || ("Filter " + (idx + 1)));
            var sel = controls.append("select").on("change", function(event) {
               if (!oViz.Config.filterValues) oViz.Config.filterValues = {};
               oViz.Config.filterValues[key] = event.target.value;
               oViz._saveSettings();
               oViz._rerender();
            });
            var opts = [{value: '__all__', label: LBL.ALL_FILTER}].concat(values.map(function(v) { return {value: v, label: v}; }));
            sel.selectAll("option").data(opts).enter().append("option").attr("value", function(d) { return d.value; }).property("selected", function(d) { return d.value === current; }).text(function(d) { return d.label; });
         })(i);
      }
      return controls;
   };

   WsuDumbbellViz.prototype._sortOptions = function(sample) {
      var s = sample || {};
      var opts = [];
      if (s.sortFields && s.sortFields.length) {
         s.sortFields.forEach(function(f, i) {
            opts.push({value: 'sort-' + i, label: f.label || ('Sort ' + (i + 1))});
         });
      }
      opts.push({value: 'first', label: 'First value'});
      opts.push({value: 'second', label: 'Second value'});
      opts.push({value: 'delta', label: 'Δ (signed)'});
      opts.push({value: 'absDelta', label: 'Δ (absolute)'});
      opts.push({value: 'original', label: LBL.ORIGINAL_ORDER});
      return opts;
   };

   WsuDumbbellViz.prototype._uniqueFilterValues = function(rows, fieldIndex) {
      var seen = {};
      var values = [];
      rows.forEach(function(row) {
         if (!row.filterFields || !row.filterFields[fieldIndex]) return;
         var v = str(row.filterFields[fieldIndex].value);
         if (v === "" || seen[v]) return;
         seen[v] = true;
         values.push(v);
      });
      return values.sort(function(a, b) { return compareText(a, b); });
   };

   WsuDumbbellViz.prototype._applyFilters = function(rows) {
      var filterValues = this.Config.filterValues || {};
      return rows.filter(function(row) {
         if (!row.filterFields || row.filterFields.length === 0) return true;
         for (var i = 0; i < row.filterFields.length; i++) {
            var key = 'filter-' + i;
            var selected = filterValues[key];
            if (!selected || selected === '__all__') continue;
            if (str(row.filterFields[i].value) !== selected) return false;
         }
         return true;
      });
   };

   WsuDumbbellViz.prototype._drawSummary = function(root, rows) {
      var fmtOpts = this._formatOpts();
      var valid = rows.filter(function(d) { return !isNaN(d.delta); });
      var up = valid.filter(function(d) { return d.delta > 0; }).length;
      var down = valid.filter(function(d) { return d.delta < 0; }).length;
      var flat = valid.filter(function(d) { return d.delta === 0; }).length;
      var threshold = Number(this.Config.largeChangeThreshold) || 1;
      var largeDrops = valid.filter(function(d) { return d.delta <= -threshold; }).length;
      var avg = d3.mean(valid, function(d) { return d.delta; });
      root.append("div")
         .attr("class", "summary-strip")
         .html(
            "<span>" + esc(LBL.SUMMARY_UP) + ": <b>" + up + "</b></span>" +
            "<span>" + esc(LBL.SUMMARY_FLAT) + ": <b>" + flat + "</b></span>" +
            "<span>" + esc(LBL.SUMMARY_DOWN) + ": <b>" + down + "</b></span>" +
            "<span>" + esc(LBL.SUMMARY_AVG) + ": <b>" + esc(formatValue(avg, fmtOpts)) + "</b></span>" +
            "<span>" + esc(LBL.SUMMARY_LARGE) + ": <b>" + largeDrops + "</b></span>"
         );
   };

   WsuDumbbellViz.prototype._legendItems = function(sample, rows) {
      if (!sample) return [];
      if (this.Config.colorMode === "group" && this._hasGroups(rows)) {
         var groups = Array.from(new Set(rows.map(function(d) { return d.group || "Ungrouped"; }))).slice(0, 12);
         return groups.map(function(group, i) {
            var groupRow = rows.filter(function(row) { return (row.group || "Ungrouped") === group; })[0] || {};
            return {label: group, color: groupRow.groupColor || GROUP_PALETTE[i % GROUP_PALETTE.length]};
         });
      }
      if (this.Config.colorMode === "direction") {
         return [
            {label: LBL.DIR_IMPROVED, color: this.Config.improveColor},
            {label: LBL.DIR_WORSE, color: this.Config.worseColor},
            {label: LBL.DIR_SAME, color: this.Config.sameColor}
         ];
      }
      return [
         {label: this._configText("firstLabel", sample.firstName || "First"), color: this._endpointDefaultColor("first")},
         {label: this._configText("secondLabel", sample.secondName || "Second"), color: this._endpointDefaultColor("second")}
      ];
   };

   WsuDumbbellViz.prototype._legendPlacement = function(width, items) {
      if (this.Config.legend === "off" || this.Config.legendPosition === "off" || !items.length) return "off";
      if (this.Config.legendPosition === "right" || this.Config.legendPosition === "bottom") return this.Config.legendPosition;
      return width < 680 || items.length > 6 ? "bottom" : "right";
   };

   WsuDumbbellViz.prototype._legendRightWidth = function(items) {
      var longest = d3.max(items, function(d) { return str(d.label).length; }) || 8;
      return Math.min(230, Math.max(132, longest * 7 + 34));
   };

   WsuDumbbellViz.prototype._legendBottomHeight = function(items, width) {
      var columns = Math.max(1, Math.floor(Math.max(width - 86, 120) / 148));
      return Math.ceil(items.length / columns) * 18 + 24;
   };

   WsuDumbbellViz.prototype._legendMarkerSymbol = function() {
      var shape = this.Config.legendMarkerShape;
      var endpointShape = this.Config.endpointShape || "circle";
      var resolved = (shape === "match" || !shape) ? endpointShape : shape;
      var size = Math.max(Number(this.Config.legendMarkerSize) || 8, 4);
      return d3.symbol().type(symbolType(resolved)).size(Math.PI * size * size)();
   };

   WsuDumbbellViz.prototype._drawLegend = function(svg, placement, box, items) {
      var oViz = this;
      var markerPath = this._legendMarkerSymbol();
      var legend, groups;

      // Click-to-fade only makes sense when there's a row-level grouping
      // (group or direction). Endpoint mode has no such grouping, so the
      // legend stays a static color key.
      var clickEnabled = this.Config.colorMode === "group" || this.Config.colorMode === "direction";
      function attachClick(sel) {
         if (!clickEnabled) return;
         sel.style("cursor", "pointer").on("click", function(event, d) {
            event.preventDefault();
            event.stopPropagation();
            var current = oViz.getLegendActiveSeries();
            oViz.setLegendActiveSeries(current === d.label ? null : d.label);
            oViz._applyLegendActiveSeries();
         });
      }

      if (placement === "bottom") {
         var columns = Math.max(1, Math.floor(Math.max(box.width, 120) / 148));
         legend = svg.append("g").attr("class", "legend legend-bottom").attr("transform", "translate(" + box.x + "," + box.legendY + ")");
         groups = legend.selectAll("g").data(items).enter().append("g").attr("class", "legend-item").attr("data-series", function(d) { return d.label; }).attr("transform", function(d, i) {
            return "translate(" + ((i % columns) * 148) + "," + (Math.floor(i / columns) * 18) + ")";
         });
      } else {
         legend = svg.append("g").attr("class", "legend legend-right").attr("transform", "translate(" + (box.svgWidth - box.rightWidth + 12) + "," + box.y + ")");
         groups = legend.selectAll("g").data(items).enter().append("g").attr("class", "legend-item").attr("data-series", function(d) { return d.label; }).attr("transform", function(d, i) { return "translate(0," + (i * 18) + ")"; });
      }
      groups.append("path").attr("d", markerPath).attr("transform", "translate(5,5)").attr("fill", function(d) { return d.color; });
      groups.append("text").attr("x", 16).attr("y", 9).text(function(d) { return label(d.label, 18); });
      attachClick(groups);
   };

   WsuDumbbellViz.prototype._applyLegendActiveSeries = function() {
      var active = this.getLegendActiveSeries();
      var root = d3.select(this.getContainerElem());
      root.selectAll(".legend-item").classed("legend-active", false).classed("legend-inactive", false);
      if (!active) {
         root.selectAll(".student-dumbbell").classed("wsu-faded", false);
         return;
      }
      // Endpoint mode has no row-level series grouping — fade would grey out
      // every dumbbell. Skip applying fade and just leave legend label styling.
      if (this.Config.colorMode === "endpoint") {
         this.setLegendActiveSeries(null);
         return;
      }
      root.selectAll(".legend-item").each(function() {
         var s = d3.select(this).attr("data-series");
         d3.select(this).classed("legend-active", s === active).classed("legend-inactive", s !== active);
      });
      root.selectAll(".student-dumbbell").classed("wsu-faded", function() {
         return d3.select(this).attr("data-series-key") !== active;
      });
   };

   WsuDumbbellViz.prototype._drawReferenceLines = function(g, rows, y, width, fmtOpts) {
      var lines = parseLabeledValues(this.Config.referenceLines);
      if (this.Config.averageLines === "on") {
         lines.push({value: d3.mean(rows, function(d) { return d.first; }), label: LBL.AVG_FIRST});
         lines.push({value: d3.mean(rows, function(d) { return d.second; }), label: LBL.AVG_SECOND});
      }
      var lineGroups = g.selectAll(".reference-group").data(lines).enter().append("g").attr("class", "reference-group");
      lineGroups.append("line").attr("class", "reference-line").attr("x1", 0).attr("x2", width).attr("y1", function(d) { return y(d.value); }).attr("y2", function(d) { return y(d.value); });
      lineGroups.append("text").attr("class", "reference-label").attr("x", width - 4).attr("y", function(d) { return y(d.value) - 3; }).attr("text-anchor", "end").text(function(d) { return d.label; });
   };

   WsuDumbbellViz.prototype._drawAnnotations = function(g, y, width) {
      var annotations = parseLabeledValues(this.Config.annotations);
      var items = g.selectAll(".annotation").data(annotations).enter().append("g").attr("class", "annotation");
      items.append("text").attr("x", 4).attr("y", function(d) { return y(d.value) - 5; }).text(function(d) { return d.label; });
   };

   WsuDumbbellViz.prototype._yDomain = function(rows) {
      if (this.Config.yScale === "gpa") return [-1, 4];
      var values = [];
      rows.forEach(function(row) {
         if (!row.firstMissing) values.push(row.first);
         if (!row.secondMissing) values.push(row.second);
      });
      if (values.length === 0) return [0, 1];
      var min = d3.min(values);
      var max = d3.max(values);
      var pad = Math.max((max - min) * 0.08, 0.2);
      return [min - pad, max + pad];
   };

   WsuDumbbellViz.prototype._endpointColor = function(row, endpoint) {
      if (this.Config.colorMode === "group") return this._groupColor(row);
      if (this.Config.colorMode === "direction") return this._directionColor(row);
      return endpoint === "first" ? this._endpointDefaultColor("first") : this._endpointDefaultColor("second");
   };

   WsuDumbbellViz.prototype._connectorColor = function(row) {
      if (this.Config.colorMode === "group") return this._groupColor(row);
      if (this.Config.colorMode === "direction") return this._directionColor(row);
      return this._endpointDefaultColor("connector");
   };

   // Returns the value used to match a row against the active legend item.
   // Endpoint mode has no series-level grouping, so returns "" (no fade applies).
   WsuDumbbellViz.prototype._seriesKey = function(row) {
      var mode = this.Config.colorMode;
      if (mode === "group") return row.group || "Ungrouped";
      if (mode === "direction") return row.direction;
      return ""; // endpoint mode — legend click is disabled
   };

   WsuDumbbellViz.prototype._directionColor = function(row) {
      if (isNaN(row.delta)) return this.Config.sameColor;
      if (row.delta > 0) return this.Config.improveColor;
      if (row.delta < 0) return this.Config.worseColor;
      return this.Config.sameColor;
   };

   WsuDumbbellViz.prototype._groupColor = function(row) {
      if (row.groupColor) return row.groupColor;
      var group = row.group || "Ungrouped";
      var sum = 0;
      for (var i = 0; i < group.length; i++) sum += group.charCodeAt(i);
      return GROUP_PALETTE[sum % GROUP_PALETTE.length];
   };

   WsuDumbbellViz.prototype._hasGroups = function(rows) {
      return rows.some(function(row) { return row.group !== ""; });
   };

   WsuDumbbellViz.prototype._isOutlier = function(row) {
      return this.Config.highlightOutliers === "on" && !isNaN(row.delta) && Math.abs(row.delta) >= (Number(this.Config.largeChangeThreshold) || 1);
   };

   WsuDumbbellViz.prototype._samePoint = function(row) {
      return !row.firstMissing && !row.secondMissing && Math.abs(row.first - row.second) < 0.001;
   };

   WsuDumbbellViz.prototype._shouldShowLabels = function(rowCount) {
      if (this.Config.xLabels === "on") return true;
      if (this.Config.xLabels === "off") return false;
      return rowCount <= 50;
   };

   WsuDumbbellViz.prototype._tickValues = function(rows) {
      if (this._shouldShowLabels(rows.length)) return rows.map(function(d) { return d.xKey; });
      var maxTicks = rows.length <= 200 ? 12 : 8;
      var step = Math.max(Math.ceil(rows.length / maxTicks), 1);
      return rows.filter(function(d, i) { return i === 0 || i === rows.length - 1 || i % step === 0; }).map(function(d) { return d.xKey; });
   };

   WsuDumbbellViz.prototype._xAxisTitle = function(rows) {
      if (this.Config.xAxisTitle) return this.Config.xAxisTitle;
      var sample = rows[0] || {};
      var sortBy = this.Config.sortBy || 'original';
      var options = this._sortOptions(sample);
      var match = options.filter(function(o) { return o.value === sortBy; })[0];
      var sortLabel = match ? match.label : LBL.ORIGINAL_ORDER;
      var heading = this._configText("entityLabel", this._shouldShowLabels(rows.length) ? sample.entityLabel : "Sorted categories");
      return heading + LBL.SORTED_BY + sortLabel;
   };

   WsuDumbbellViz.prototype._tooltipHtml = function(row, role) {
      var fmtOpts = this._formatOpts();
      var tipRows = [];
      var cfg = this.Config;
      if (cfg.showCategory !== "off") {
         var entityLabel = this._configText("entityLabel", row.entityLabel || "Category");
         this._addTipRow(tipRows, entityLabel, row.entity);
      }
      if (cfg.showFirstValue !== "off") {
         var firstLabel = this._configText("firstLabel", row.firstName || "First");
         this._addTipRow(tipRows, firstLabel, row.firstMissing ? LBL.MISSING : formatValue(row.first, fmtOpts));
      }
      if (cfg.showSecondValue !== "off") {
         var secondLabel = this._configText("secondLabel", row.secondName || "Second");
         this._addTipRow(tipRows, secondLabel, row.secondMissing ? LBL.MISSING : formatValue(row.second, fmtOpts));
      }
      if (cfg.showDelta !== "off" && !isNaN(row.delta)) {
         this._addTipRow(tipRows, "Δ", formatDelta(row.delta, fmtOpts));
      }
      if (cfg.showDeltaPercent === "on" && !isNaN(row.delta) && !row.firstMissing && row.first !== 0) {
         var pct = (row.delta / row.first) * 100;
         this._addTipRow(tipRows, "Δ%", (pct > 0 ? "+" : "") + pct.toFixed(1) + "%");
      }
      if (cfg.showDirection === "on" && row.direction) {
         this._addTipRow(tipRows, "Direction", row.direction);
      }
      if (cfg.showGroup !== "off" && row.group) {
         var groupLabel = this._configText("groupLabel", row.groupLabel || "Group");
         this._addTipRow(tipRows, groupLabel, row.group);
      }
      if (cfg.showCount !== "off" && row.count > 1) this._addTipRow(tipRows, "Count", row.count);
      row.details.forEach(function(detail) {
         this._addTipRow(tipRows, detail.label, detail.value);
      }, this);
      if (!tipRows.length) return "";
      if (cfg.tooltipLayout === "compact") {
         return "<div class='compact-tip'>" + tipRows.map(function(item) {
            return "<span><b>" + esc(item.label) + ":</b> " + esc(item.value) + "</span>";
         }).join(" ") + "</div>";
      }
      return "<table>" + tipRows.map(function(item) {
         return "<tr><td class='tthead'>" + esc(item.label) + "</td><td class='ttval'>" + esc(item.value) + "</td></tr>";
      }).join("") + "</table>";
   };

   WsuDumbbellViz.prototype._addTipRow = function(rows, name, value) {
      if (str(value) !== "") rows.push({label: name, value: value});
   };

   WsuDumbbellViz.prototype._showTooltip = function(tooltip, event, row, role) {
      var html = this._tooltipHtml(row, role);
      if (!html) {
         tooltip.style("display", "none");
         return;
      }
      tooltip.html(html).style("display", "block");
      this._moveTooltip(tooltip, event);
   };

   WsuDumbbellViz.prototype._moveTooltip = function(tooltip, event) {
      var margin = 12;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
      var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      var node = tooltip.node();
      var width = node ? node.offsetWidth : 280;
      var height = node ? node.offsetHeight : 120;
      var left = event.pageX + margin;
      var top = event.pageY - 24;
      if (left + width + margin > scrollX + viewportWidth) left = event.pageX - width - margin;
      if (top + height + margin > scrollY + viewportHeight) top = event.pageY - height - margin;
      if (left < scrollX + margin) left = scrollX + margin;
      if (top < scrollY + margin) top = scrollY + margin;
      tooltip.style("left", left + "px").style("top", top + "px");
   };

   WsuDumbbellViz.prototype._markRow = function(event, row, oDataLayout, root) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.ctrlKey) {
         this.getMarkingService().clearMarksForDataLayout(oDataLayout);
         this.clearSelectedRows();
      }
      this._markDataRows(row.sourceRows || [row.row], oDataLayout);
      this.getSelectedRows().set(row.row, true);
      this._publishMarkEvent(oDataLayout);
      this._applySelectedRows(root);
   };

   WsuDumbbellViz.prototype._markRows = function(rows, oDataLayout, root) {
      var service = this.getMarkingService();
      service.clearMarksForDataLayout(oDataLayout);
      this.clearSelectedRows();
      rows.forEach(function(row) {
         this._markDataRows(row.sourceRows || [row.row], oDataLayout);
         this.getSelectedRows().set(row.row, true);
      }, this);
      this._publishMarkEvent(oDataLayout);
      this._applySelectedRows(root);
   };

   WsuDumbbellViz.prototype._markDataRows = function(rowIndexes, oDataLayout) {
      rowIndexes.forEach(function(rowIndex) {
         this.getMarkingService().setMark(oDataLayout, PHYS_DATA, parseInt(rowIndex, 10), 0);
         try {
            this.getMarkingService().setMark(oDataLayout, PHYS_DATA, parseInt(rowIndex, 10), 1);
         } catch (e) { /* long-format has only one measure column */ }
      }, this);
   };

   WsuDumbbellViz.prototype._clearMarks = function(oDataLayout, root) {
      this.getMarkingService().clearMarksForDataLayout(oDataLayout);
      this.clearSelectedRows();
      this._publishMarkEvent(oDataLayout);
      this._applySelectedRows(root);
   };

   WsuDumbbellViz.prototype._applySelectedRows = function(root) {
      var selectedRows = this.getSelectedRows();
      root.selectAll(".endpoint,.connector").classed("wsu-selected", false);
      selectedRows.forEach(function(value, row) {
         root.selectAll("[data-row='" + row + "'] .endpoint,[data-row='" + row + "'] .connector").classed("wsu-selected", true);
      });
   };

   WsuDumbbellViz.prototype._rerender = function() {
      var oTransientVizContext = this.assertOrCreateVizContext();
      var oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
      this._render(oTransientRenderingContext);
   };

   WsuDumbbellViz.prototype._render = function(oTransientRenderingContext) {
      try {
         this.loadConfig();
         var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
         if (!oDataLayout) return;
         var rows = this._generateData(oDataLayout, oTransientRenderingContext);
         var elContainer = this.getContainerElem();
         if (!rows || rows.length === 0) {
            $(elContainer).html("<div class='wsu-dumbbell'><div class='empty-state'>" + esc(LBL.EMPTY_STATE) + "</div></div>");
            return;
         }
         this._draw(elContainer, rows, oDataLayout);
      }
      finally {
         this._setIsRendered(true);
      }
   };

   WsuDumbbellViz.prototype.render = function(oTransientRenderingContext) {
      this._render(oTransientRenderingContext);
   };

   WsuDumbbellViz.prototype.resizeVisualization = function(oVizDimensions, oTransientVizContext) {
      this._render(this.createRenderingContext(oTransientVizContext));
   };

   WsuDumbbellViz.prototype._publishMarkEvent = function(oDataLayout, eMarkContext) {
      try {
         var markingEvent = new interactions.MarkingEvent(this.getID(), this.getViewName(), oDataLayout, null, eMarkContext);
         var eventRouter = this.getEventRouter();
         if (eventRouter) eventRouter.publish(markingEvent);
      } catch (e) {
         _logger.warning("Error during mark publish: " + (e && e.message ? e.message : e));
      }
   };

   WsuDumbbellViz.prototype._buildSelectedItems = function(oTransientRenderingContext) {
      var oViz = this;
      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      var service = this.getMarkingService();
      function callback() {
         oViz.clearSelectedRows();
         if (!oViz.isStarted()) return;
         service.traverseDataEdgeMarks(oDataLayout, function(nRow) {
            oViz.getSelectedRows().set(nRow, true);
         });
         d3.select(oViz.getContainerElem()).selectAll(".wsu-dumbbell").each(function() {
            oViz._applySelectedRows(d3.select(this));
         });
      }
      service.getUpdatedMarkingSet(oDataLayout, marking.EMarkOperation.MARK_RELATED, callback);
   };

   WsuDumbbellViz.prototype.onHighlight = function() {
      this._buildSelectedItems(this.createRenderingContext(this.assertOrCreateVizContext()));
   };

   WsuDumbbellViz.prototype._onDefaultColorsSettingsChanged = function() {
      this._rerender();
      this._setIsRendered(true);
   };

   WsuDumbbellViz.prototype._addVizSpecificMenuOptions = function(oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext) {
      WsuDumbbellViz.superClass._addVizSpecificMenuOptions.call(this, oTransientVizContext, sMenuType, aResults, contextmenu, evtParams, oTransientRenderingContext);
      if (sMenuType === euidef.CM_TYPE_VIZ_PROPS && !this.isViewOnlyLimit()) {
         if (!oTransientRenderingContext) oTransientRenderingContext = this.createRenderingContext(oTransientVizContext);
         this._addFilterMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
         this._addRemoveSelectedMenuOption(oTransientVizContext, aResults, null, null, oTransientRenderingContext);
      }
   };

   WsuDumbbellViz.prototype._addVizSpecificPropsDialog = function(oTabbedPanelsGadgetInfo) {
      this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
      WsuDumbbellViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
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
   // Internal Config stays as "on"/"off" strings (gadget-boundary translation
   // only) — saved workbooks load identically.
   function addToggle(panel, id, labelText, configValue) {
      var isOn = configValue !== "off";
      var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, isOn);
      panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
   }

   WsuDumbbellViz.prototype.doAddVizSpecificPropsDialog = function(oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
      jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
      jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
      this.loadConfig();
      var factory = this.getGadgetFactory();

      var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
      function tryPanel(id) {
         try { var p = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, id); return p || pGen; }
         catch (e) { return pGen; }
      }
      var pStyle = tryPanel("wsuDumbbellStyle");
      var pReference = tryPanel("wsuDumbbellReference");
      var pAxisLegend = tryPanel("wsuDumbbellAxisLegend");

      var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
      var ord = {GEN: base + 100, STY: base + 200, REF: base + 300, AXL: base + 400};
      var nx = function(g) { return ord[g]++; };

      // ============ GENERAL ============
      addSwitcher(pGen, "viewModeGadget", "View: Mode", this.Config.viewMode, [{value: "individual", label: "Individuals"}, {value: "groupAverage", label: "Group Aggregate"}, {value: "smallMultiples", label: "Small Multiples"}], nx("GEN"));
      addSwitcher(pGen, "groupAggregationGadget", "View: Group Aggregation", this.Config.groupAggregation, [{value: "mean", label: "Mean"}, {value: "median", label: "Median"}, {value: "sum", label: "Sum"}, {value: "min", label: "Min"}, {value: "max", label: "Max"}], nx("GEN"));
      addSwitcher(pGen, "longFormatRoleMappingGadget", "View: Long-format Role", this.Config.longFormatRoleMapping, [{value: "keyword", label: "Keyword (pre/first/before / target/second/after)"}, {value: "bucketOrder", label: "Bucket Order (1st row=first, 2nd=second)"}], nx("GEN"));

      addSwitcher(pGen, "tooltipLayoutGadget", "Tooltip: Layout", this.Config.tooltipLayout, [{value: "table", label: "Table"}, {value: "compact", label: "Compact"}], nx("GEN"));
      addToggle(pGen, "summaryGadget", "Tooltip: Stats Summary Bar", this.Config.showSummary);
      addToggle(pGen, "showCategoryGadget", "Tooltip: Show Category", this.Config.showCategory);
      addToggle(pGen, "showFirstValueGadget", "Tooltip: Show First Value", this.Config.showFirstValue);
      addToggle(pGen, "showSecondValueGadget", "Tooltip: Show Second Value", this.Config.showSecondValue);
      addToggle(pGen, "showDeltaGadget", "Tooltip: Show Δ", this.Config.showDelta);
      addToggle(pGen, "showDeltaPercentGadget", "Tooltip: Show Δ%", this.Config.showDeltaPercent);
      addToggle(pGen, "showDirectionGadget", "Tooltip: Show Direction", this.Config.showDirection);
      addToggle(pGen, "showGroupGadget", "Tooltip: Show Group", this.Config.showGroup);
      addToggle(pGen, "showCountGadget", "Tooltip: Show Count", this.Config.showCount);

      addSwitcher(pGen, "numberFormatGadget", "Format: Number Format", this.Config.numberFormat, [{value: "auto", label: "Auto"}, {value: "number", label: "Number"}, {value: "percent", label: "Percent (×100)"}, {value: "currency", label: "Currency (USD)"}, {value: "compact", label: "Compact (K/M/B)"}], nx("GEN"));
      addSwitcher(pGen, "decimalPlacesGadget", "Format: Decimal Places", this.Config.decimalPlaces, [{value: "auto", label: "Auto"}, {value: "0", label: "0"}, {value: "1", label: "1"}, {value: "2", label: "2"}, {value: "3", label: "3"}, {value: "4", label: "4"}], nx("GEN"));
      addText(pGen, factory, "valuePrefixGadget", "Format: Value Prefix", this.Config.valuePrefix);
      addText(pGen, factory, "valueSuffixGadget", "Format: Value Suffix", this.Config.valueSuffix);
      addSwitcher(pGen, "missingModeGadget", "Format: Missing Values", this.Config.missingMode, [{value: "hide", label: "Hide row"}, {value: "show", label: "Show partial"}, {value: "zero", label: "Treat as 0"}], nx("GEN"));
      addSwitcher(pGen, "yScaleGadget", "Format: Y Scale", this.Config.yScale, [{value: "auto", label: "Auto (data range)"}, {value: "gpa", label: "GPA (-1 to 4)"}], nx("GEN"));

      addSwitcher(pGen, "zoomModeGadget", "Interaction: Zoom Mode", this.Config.zoomMode, [{value: "off", label: "Off"}, {value: "x", label: "X (drag horizontally)"}, {value: "y", label: "Y (drag vertically)"}, {value: "xy", label: "X + Y (drag rectangle)"}], nx("GEN"));
      addSwitcher(pGen, "brushModeGadget", "Interaction: Brush Select Rows", this.Config.brushMode, [{value: "off", label: "Off"}, {value: "on", label: "On (overrides X-zoom)"}], nx("GEN"));

      // ============ STYLE ============
      addSwitcher(pStyle, "colorSourceGadget", "Color: Source", this.Config.colorSource, [{value: "oac", label: "OAC Theme"}, {value: "custom", label: "Custom Palette"}], nx("STY"));
      addSwitcher(pStyle, "colorModeGadget", "Color: Mode", this.Config.colorMode, [{value: "endpoint", label: "Endpoint (first/second)"}, {value: "group", label: "Group"}, {value: "direction", label: "Direction (improve/worse/same)"}], nx("STY"));
      addText(pStyle, factory, "paletteGadget", "Color: Custom Palette (comma-separated hex)", this.Config.palette);
      addText(pStyle, factory, "firstColorGadget", "Color: First (override)", this.Config.firstColor);
      addText(pStyle, factory, "secondColorGadget", "Color: Second (override)", this.Config.secondColor);
      addText(pStyle, factory, "improveColorGadget", "Color: Improve (direction mode)", this.Config.improveColor);
      addText(pStyle, factory, "worseColorGadget", "Color: Worse (direction mode)", this.Config.worseColor);
      addText(pStyle, factory, "sameColorGadget", "Color: Same (direction mode)", this.Config.sameColor);

      addSwitcher(pStyle, "endpointShapeGadget", "Style: Endpoint Shape", this.Config.endpointShape, [{value: "circle", label: "Circle"}, {value: "square", label: "Square"}, {value: "triangle", label: "Triangle"}, {value: "diamond", label: "Diamond"}, {value: "cross", label: "Cross"}, {value: "star", label: "Star"}], nx("STY"));
      pStyle.addChild(new gadgets.SliderGadgetInfo("dotSizeGadget", "Style: Endpoint Size", "Style: Endpoint Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.dotSize, 2, 12)));
      addSwitcher(pStyle, "linePatternGadget", "Style: Connector Pattern", this.Config.linePattern, [{value: "solid", label: "Solid"}, {value: "dashed", label: "Dashed"}, {value: "dotted", label: "Dotted"}, {value: "dashdot", label: "Dash-Dot"}], nx("STY"));
      pStyle.addChild(new gadgets.SliderGadgetInfo("lineWidthGadget", "Style: Connector Width", "Style: Connector Width", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.lineWidth, 1, 8)));
      addToggle(pStyle, "jitterGadget", "Style: Jitter (when first==second)", this.Config.jitter);

      addText(pStyle, factory, "entityLabelGadget", "Label: Category (override)", this.Config.entityLabel);
      addText(pStyle, factory, "firstLabelGadget", "Label: First (override)", this.Config.firstLabel);
      addText(pStyle, factory, "secondLabelGadget", "Label: Second (override)", this.Config.secondLabel);
      addText(pStyle, factory, "groupLabelGadget", "Label: Group (override)", this.Config.groupLabel);

      // ============ REFERENCE ============
      addText(pReference, factory, "referenceLinesGadget", "Reference Lines (Value:Label, Value:Label, ...)", this.Config.referenceLines);
      addText(pReference, factory, "annotationsGadget", "Annotations (Value:Label, Value:Label, ...)", this.Config.annotations);
      addToggle(pReference, "averageLinesGadget", "Reference: Show Avg Lines", this.Config.averageLines);
      addText(pReference, factory, "largeChangeThresholdGadget", "Reference: Large Change Threshold", this.Config.largeChangeThreshold);
      addToggle(pReference, "highlightOutliersGadget", "Reference: Highlight Outliers", this.Config.highlightOutliers);

      // ============ AXIS & LEGEND ============
      addSwitcher(pAxisLegend, "sortDirectionGadget", "Sort: Direction", this.Config.sortDirection, [{value: "ascending", label: "Ascending"}, {value: "descending", label: "Descending"}], nx("AXL"));
      addSwitcher(pAxisLegend, "sortByGadget", "Sort: Field", this.Config.sortBy, this._buildSortColumnOptions(), nx("AXL"));
      addToggle(pAxisLegend, "viewerControlsGadget", "Sort: In-chart Controls", this.Config.viewerControls);
      addSwitcher(pAxisLegend, "sortControlPositionGadget", "Sort: Control Position", this.Config.sortControlPosition, [{value: "topRight", label: "Top Right"}, {value: "topLeft", label: "Top Left"}, {value: "bottomRight", label: "Bottom Right"}, {value: "bottomLeft", label: "Bottom Left"}, {value: "above", label: "Above"}, {value: "below", label: "Below"}], nx("AXL"));
      addSwitcher(pAxisLegend, "sortControlStyleGadget", "Sort: Control Style", this.Config.sortControlStyle, [{value: "compact", label: "Compact"}, {value: "expanded", label: "Expanded"}], nx("AXL"));
      addSwitcher(pAxisLegend, "controlSpacingGadget", "Sort: Control Spacing", this.Config.controlSpacing, [{value: "tight", label: "Tight"}, {value: "default", label: "Default"}, {value: "loose", label: "Loose"}], nx("AXL"));

      addSwitcher(pAxisLegend, "xLabelsGadget", "Axis: X Labels", this.Config.xLabels, [{value: "auto", label: "Auto"}, {value: "off", label: "Off"}, {value: "on", label: "On"}], nx("AXL"));
      addToggle(pAxisLegend, "gridlinesGadget", "Axis: Gridlines", this.Config.gridlines);
      addText(pAxisLegend, factory, "xAxisTitleGadget", "Axis: X Title (override)", this.Config.xAxisTitle);
      addText(pAxisLegend, factory, "yAxisTitleGadget", "Axis: Y Title (override)", this.Config.yAxisTitle);

      addToggle(pAxisLegend, "legendGadget", "Legend: Show", this.Config.legend);
      addSwitcher(pAxisLegend, "legendPositionGadget", "Legend: Position", this.Config.legendPosition, [{value: "auto", label: "Auto"}, {value: "right", label: "Right"}, {value: "bottom", label: "Bottom"}, {value: "off", label: "Off"}], nx("AXL"));
      addSwitcher(pAxisLegend, "legendMarkerShapeGadget", "Legend: Marker Shape", this.Config.legendMarkerShape, [{value: "match", label: "Match Endpoints"}, {value: "circle", label: "Circle"}, {value: "square", label: "Square"}, {value: "triangle", label: "Triangle"}, {value: "diamond", label: "Diamond"}, {value: "cross", label: "Cross"}, {value: "star", label: "Star"}], nx("AXL"));
      pAxisLegend.addChild(new gadgets.SliderGadgetInfo("legendMarkerSizeGadget", "Legend: Marker Size", "Legend: Marker Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.legendMarkerSize, 4, 14)));

      if (WsuDumbbellViz.superClass.doAddVizSpecificPropsDialog) WsuDumbbellViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
   };

   WsuDumbbellViz.prototype._handlePropChange = function(sGadgetID, oPropChange, oViewSettings, oActionContext) {
      var updateSettings = WsuDumbbellViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
      if (updateSettings) return updateSettings;
      var map = {
         viewModeGadget: "viewMode", groupAggregationGadget: "groupAggregation",
         longFormatRoleMappingGadget: "longFormatRoleMapping",
         tooltipLayoutGadget: "tooltipLayout", summaryGadget: "showSummary",
         showCategoryGadget: "showCategory", showFirstValueGadget: "showFirstValue",
         showSecondValueGadget: "showSecondValue", showDeltaGadget: "showDelta",
         showDeltaPercentGadget: "showDeltaPercent", showDirectionGadget: "showDirection",
         showGroupGadget: "showGroup", showCountGadget: "showCount",
         numberFormatGadget: "numberFormat", decimalPlacesGadget: "decimalPlaces",
         valuePrefixGadget: "valuePrefix", valueSuffixGadget: "valueSuffix",
         missingModeGadget: "missingMode", yScaleGadget: "yScale",
         zoomModeGadget: "zoomMode", brushModeGadget: "brushMode",
         colorSourceGadget: "colorSource", colorModeGadget: "colorMode",
         paletteGadget: "palette",
         firstColorGadget: "firstColor", secondColorGadget: "secondColor",
         improveColorGadget: "improveColor", worseColorGadget: "worseColor", sameColorGadget: "sameColor",
         endpointShapeGadget: "endpointShape", dotSizeGadget: "dotSize",
         linePatternGadget: "linePattern", lineWidthGadget: "lineWidth",
         jitterGadget: "jitter",
         entityLabelGadget: "entityLabel", firstLabelGadget: "firstLabel",
         secondLabelGadget: "secondLabel", groupLabelGadget: "groupLabel",
         referenceLinesGadget: "referenceLines", annotationsGadget: "annotations",
         averageLinesGadget: "averageLines", largeChangeThresholdGadget: "largeChangeThreshold",
         highlightOutliersGadget: "highlightOutliers",
         sortDirectionGadget: "sortDirection", sortByGadget: "sortBy",
         viewerControlsGadget: "viewerControls", sortControlPositionGadget: "sortControlPosition",
         sortControlStyleGadget: "sortControlStyle", controlSpacingGadget: "controlSpacing",
         xLabelsGadget: "xLabels", gridlinesGadget: "gridlines",
         xAxisTitleGadget: "xAxisTitle", yAxisTitleGadget: "yAxisTitle",
         legendGadget: "legend", legendPositionGadget: "legendPosition",
         legendMarkerShapeGadget: "legendMarkerShape", legendMarkerSizeGadget: "legendMarkerSize"
      };
      var key = map[sGadgetID];
      if (!key) return false;
      // W2: TEXT_TOGGLE gadgets emit boolean checked instead of value.
      // Translate at the boundary so internal Config keeps "on"/"off" strings
      // and saved workbooks load identically.
      var TOGGLE_GADGETS = {
         summaryGadget: 1, showCategoryGadget: 1, showFirstValueGadget: 1, showSecondValueGadget: 1,
         showDeltaGadget: 1, showDeltaPercentGadget: 1, showDirectionGadget: 1,
         showGroupGadget: 1, showCountGadget: 1, jitterGadget: 1,
         averageLinesGadget: 1, highlightOutliersGadget: 1, viewerControlsGadget: 1,
         gridlinesGadget: 1, legendGadget: 1
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

   WsuDumbbellViz.prototype._doInitializeComponent = function() {
      WsuDumbbellViz.superClass._doInitializeComponent.call(this);
      this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
      this.subscribeToEvent(events.types.INTERACTION_HIGHLIGHT, this.onHighlight, this.getViewName() + "." + events.types.INTERACTION_HIGHLIGHT);
   };

   function createClientComponent(sID, sDisplayName, sOrigin) {
      return new WsuDumbbellViz(sID, sDisplayName, sOrigin, WsuDumbbellViz.VERSION);
   }

   return {createClientComponent: createClientComponent};
});
