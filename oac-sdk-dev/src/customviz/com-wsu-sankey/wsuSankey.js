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
        'skin!css!com-wsu-sankey/wsuSankeystyles'],
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

  var MODULE_NAME = "com-wsu-sankey/wsuSankey";
  jsx.assertAllNotNullExceptLastN(arguments, MODULE_NAME + " arguments", 1);

  var _logger = new logger.Logger(MODULE_NAME);
  _logger.info("Initializing WSU Sankey plugin");

  var PHYS_DATA = datamodelshapes.Physical.DATA;
  var PHYS_ROW = datamodelshapes.Physical.ROW;
  var PHYS_COLUMN = datamodelshapes.Physical.COLUMN;
  var SETTINGS_CHART = dataviz.SettingsNS.CHART;
  var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
  var DCP_DATA_LAYOUT_HELPER = dataviz.DataContextProperty.DATA_LAYOUT_HELPER;
  var LAYER_DISPLAY_NAME = data.LayerMetadata.LAYER_DISPLAY_NAME;

  var LBL = {
    EMPTY: "No rows to display. Add Start Node and End Node buckets.",
    UNKNOWN_START: "(Unknown Start)",
    UNKNOWN_END: "(Unknown End)"
  };

  // Composite dictionary keys use a control character no label can contain,
  // so "A|B" + "C" and "A" + "B|C" never collide.
  var KEY_SEP = "\u001f";

  function edgeToStage(e) {
    return typeof e.toStage === "number" ? e.toStage : e.stageIndex + 1;
  }

  function str(v) { return jsx.isNull(v) || typeof v === "undefined" ? "" : String(v); }
  function esc(s) {
    return str(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(v) {
    if (jsx.isNull(v) || typeof v === "undefined" || v === "") return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  function normalized(v) {
    return str(v).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Like `Number(v) || fallback` but 0 is a real value, not a missing one.
  function numOr(v, fallback) {
    var n = num(v);
    return n === null ? fallback : n;
  }
  function addUnique(arr, val) {
    if (arr.indexOf(val) < 0) arr.push(val);
  }
  function addDetailValue(map, label, value) {
    var lab = str(label).trim();
    if (!lab) return;
    var val = str(value).trim();
    if (!Object.prototype.hasOwnProperty.call(map, lab)) map[lab] = [];
    if (!val) return;
    if (map[lab].indexOf(val) < 0) map[lab].push(val);
  }
  function mergeDetailRows(map, rows) {
    (rows || []).forEach(function(d) {
      addDetailValue(map, d && d.label, d && d.value);
    });
  }
  function detailsMapToRows(map) {
    return Object.keys(map || {}).map(function(label) {
      var values = map[label] || [];
      if (!values.length) return {label: label, value: ""};
      if (values.length === 1) return {label: label, value: values[0]};
      var sample = values.slice(0, 3).join(", ");
      if (values.length <= 3) return {label: label, value: sample};
      return {label: label, value: sample + " (+" + (values.length - 3) + " more)"};
    });
  }
  function colorWithAlpha(color, alpha, fallback) {
    var c = str(color).trim();
    var a = clamp(alpha, 0, 1);
    var m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) return "rgba(" + parseInt(m3[1] + m3[1], 16) + "," + parseInt(m3[2] + m3[2], 16) + "," + parseInt(m3[3] + m3[3], 16) + "," + a + ")";
    var m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
    if (m6) return "rgba(" + parseInt(m6[1], 16) + "," + parseInt(m6[2], 16) + "," + parseInt(m6[3], 16) + "," + a + ")";
    var rgb = /^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/i.exec(c);
    if (rgb) {
      return "rgba(" + clamp(Math.round(Number(rgb[1])), 0, 255) + "," + clamp(Math.round(Number(rgb[2])), 0, 255) + "," + clamp(Math.round(Number(rgb[3])), 0, 255) + "," + a + ")";
    }
    return fallback || c || "rgba(32,33,36," + a + ")";
  }
  function sanitizeHex(color, fallback) {
    var c = str(color).trim();
    var m3 = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) return ("#" + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase();
    if (/^#([a-f\d]{6})$/i.test(c)) return c.toLowerCase();
    return fallback;
  }
  function isMissingEndValue(value) {
    var text = str(value).trim();
    if (!text) return true;
    var lowered = text.toLowerCase();
    return lowered === "null" || lowered === "(null)" || lowered === "n/a" || lowered === "na";
  }
  function truncateLabel(value, maxChars) {
    var text = str(value);
    var cap = Math.max(8, Math.floor(Number(maxChars) || 28));
    if (text.length <= cap) return text;
    return text.slice(0, Math.max(1, cap - 3)).trim() + "...";
  }
  function parsePalette(text) {
    var out = [];
    str(text).split(",").forEach(function(tok) {
      var c = sanitizeHex(tok, "");
      if (c) out.push(c);
    });
    return out;
  }
  function getMeasureName(oDataLayout, measures, index, fallback) {
    var value = "";
    try { value = oDataLayout.getValue(PHYS_COLUMN, 0, index, false); }
    catch (e) { value = ""; }
    return str(value || measures[index] || fallback);
  }

  function WsuSankeyViz(sID, sDisplayName, sOrigin, sVersion) {
    WsuSankeyViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);
    this._activeLegendKey = null;
    this.Config = {
      intermediatePolicy: "provided",
      maxIntermediateDepth: 4,
      xSortDirection: "asc",
      termCodeDirection: "asc",
      minFlowThreshold: 0,
      thresholdMode: "absolute",
      topNPerStage: 0,
      collapseOther: "off",
      dropOrphans: "on",
      disallowSelfLinks: "on",
      showWarnings: "on",
      tooltipPercentMode: "stage",
      valueDecimals: 1,
      colorSource: "oac",
      colorBy: "group",
      customPalette: "",
      nodeFillColor: "#0f4c5c",
      nodeWidth: 24,
      nodeGap: 18,
      autoNodeGap: "on",
      minNodeHeight: 8,
      stagePadding: 18,
      chartLeftPadding: 72,
      chartRightPadding: 72,
      chartBottomPadding: 24,
      linkOpacity: 0.35,
      linkCurve: 0.5,
      nodeLabelFontSize: 11,
      nodeLabelMaxChars: 28,
      linkLabelFontSize: 10,
      showNodeLabels: "on",
      showLinkLabels: "off",
      showLegend: "on",
      legendPosition: "bottom",
      showStageTitles: "off",
      startStageTitle: "",
      endStageTitle: "",
      stageTitleColor: "#202124",
      stageTitleFontSize: 12,
      stageTitleBold: "on",
      stageTitleItalic: "off",
      stageTitleOrientation: "vertical",
      stageTitleOffset: 42,
      showDerivedTooltipMetrics: "off",
      includeIncompletePaths: "on",
      routeMissingEndToIncomplete: "on",
      highlightIncompletePaths: "on",
      incompleteEndLabel: "No Completion",
      incompletePathColor: "#d97706",
      unknownStartLabel: LBL.UNKNOWN_START,
      unknownEndLabel: LBL.UNKNOWN_END
    };
  }

  WsuSankeyViz.VERSION = "1.0.2";
  jsx.extend(WsuSankeyViz, dataviz.DataVisualization);

  WsuSankeyViz.prototype._saveSettings = function() {
    this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
  };

  WsuSankeyViz.prototype.loadConfig = function() {
    var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
    Object.keys(this.Config).forEach(function(k) {
      if (!jsx.isNull(conf[k]) && typeof conf[k] !== "undefined") this.Config[k] = conf[k];
    }, this);
    this.Config.maxIntermediateDepth = clamp(Math.floor(numOr(this.Config.maxIntermediateDepth, 4)), 0, 5);
    this.Config.valueDecimals = clamp(Math.floor(numOr(this.Config.valueDecimals, 1)), 0, 4);
    this.Config.nodeWidth = clamp(Number(this.Config.nodeWidth) || 24, 10, 60);
    this.Config.nodeGap = clamp(Number(this.Config.nodeGap) || 18, 4, 40);
    this.Config.minNodeHeight = clamp(Number(this.Config.minNodeHeight) || 8, 4, 24);
    this.Config.stagePadding = clamp(numOr(this.Config.stagePadding, 18), 0, 80);
    this.Config.chartLeftPadding = clamp(numOr(this.Config.chartLeftPadding, 72), 0, 180);
    this.Config.chartRightPadding = clamp(numOr(this.Config.chartRightPadding, 72), 0, 180);
    this.Config.chartBottomPadding = clamp(numOr(this.Config.chartBottomPadding, 24), 0, 120);
    this.Config.linkOpacity = clamp(Number(this.Config.linkOpacity) || 0.35, 0.05, 1);
    this.Config.linkCurve = clamp(Number(this.Config.linkCurve) || 0.5, 0.05, 0.95);
    this.Config.nodeLabelFontSize = clamp(Math.floor(Number(this.Config.nodeLabelFontSize) || 11), 9, 20);
    this.Config.nodeLabelMaxChars = clamp(Math.floor(Number(this.Config.nodeLabelMaxChars) || 28), 8, 80);
    this.Config.linkLabelFontSize = clamp(Math.floor(Number(this.Config.linkLabelFontSize) || 10), 8, 18);
    this.Config.stageTitleColor = sanitizeHex(this.Config.stageTitleColor, "#202124");
    this.Config.stageTitleFontSize = clamp(Math.floor(Number(this.Config.stageTitleFontSize) || 12), 8, 28);
    this.Config.stageTitleOffset = clamp(Math.floor(Number(this.Config.stageTitleOffset) || 42), 12, 120);
    this.Config.stageTitleOrientation = this.Config.stageTitleOrientation === "horizontal" ? "horizontal" : "vertical";
    this.Config.minFlowThreshold = Math.max(0, Number(this.Config.minFlowThreshold) || 0);
    this.Config.topNPerStage = clamp(Math.floor(Number(this.Config.topNPerStage) || 0), 0, 50);
    this.Config.customPalette = parsePalette(this.Config.customPalette).join(",");
    this.Config.nodeFillColor = sanitizeHex(this.Config.nodeFillColor, "#0f4c5c");
    this.Config.incompletePathColor = sanitizeHex(this.Config.incompletePathColor, "#d97706");
    if (!this.Config.incompletePathColor) this.Config.incompletePathColor = "#d97706";
    this.Config.incompleteEndLabel = str(this.Config.incompleteEndLabel).trim() || "No Completion";
    this.Config.startStageTitle = str(this.Config.startStageTitle).trim();
    this.Config.endStageTitle = str(this.Config.endStageTitle).trim();
    this.Config.unknownStartLabel = str(this.Config.unknownStartLabel).trim() || LBL.UNKNOWN_START;
    this.Config.unknownEndLabel = str(this.Config.unknownEndLabel).trim() || LBL.UNKNOWN_END;
  };

  WsuSankeyViz.prototype._chartFrame = function(width, height) {
    var legendTop = this.Config.showLegend === "on" && this.Config.legendPosition === "top";
    var showLeftTitle = this.Config.showStageTitles === "on" && !!this.Config.startStageTitle;
    var margin = {
      top: legendTop ? 44 : 18,
      left: 12 + (showLeftTitle ? this.Config.chartLeftPadding : 0),
      right: 12 + this.Config.chartRightPadding,
      bottom: (this.Config.showLegend === "on" && !legendTop ? 46 : 18) + this.Config.chartBottomPadding
    };
    return {
      margin: margin,
      innerWidth: Math.max(120, width - margin.left - margin.right),
      innerHeight: Math.max(120, height - margin.top - margin.bottom)
    };
  };

  WsuSankeyViz.prototype._resolveThemeColor = function(oTransientRenderingContext, helper, rowIndex) {
    try {
      var oColorContext = this.getColorContext(oTransientRenderingContext);
      var oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, datamodelshapes.Logical.COLOR);
      var colorInfo = this.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
      return colorInfo.sColor || colorInfo.sSeriesColor || "";
    } catch (e) {
      return "";
    }
  };

  WsuSankeyViz.prototype._layersForRowEdge = function(oDataLayout, helper) {
    var count = oDataLayout.getLayerCount(PHYS_ROW);
    var out = [];
    for (var i = 0; i < count; i++) {
      var logical = "";
      try { logical = str(helper.getLogicalEdgeName(PHYS_ROW, i)).toLowerCase(); } catch (e) { logical = ""; }
      var display = oDataLayout.getLayerMetadata(PHYS_ROW, i, LAYER_DISPLAY_NAME) || ("Layer " + i);
      out.push({index: i, logical: logical, displayName: display});
    }
    return out;
  };

  WsuSankeyViz.prototype._buildRawEdges = function(oDataLayout, oTransientRenderingContext) {
    var helper = oTransientRenderingContext.get(DCP_DATA_LAYOUT_HELPER);
    var oDataModel = this.getRootDataModel();
    var allMeasures = oDataModel && oDataModel.getColumnIDsIn ? (oDataModel.getColumnIDsIn(PHYS_DATA) || []) : [];
    var dataMeasureLayers = allMeasures.map(function(columnId, index) {
      var logical = "";
      try { logical = str(helper.getLogicalEdgeName(PHYS_DATA, index)).toLowerCase(); } catch (e) { logical = ""; }
      return {
        index: index,
        logical: logical,
        displayName: getMeasureName(oDataLayout, allMeasures, index, "Measure " + (index + 1))
      };
    });
    var nRows = oDataLayout.getEdgeExtent(PHYS_ROW) || 0;
    var layers = this._layersForRowEdge(oDataLayout, helper);
    var warnings = {
      orphanRows: 0,
      selfLinkEdges: 0,
      truncatedIntermediateRows: 0,
      thresholdDropped: 0,
      topNDropped: 0
    };
    var raw = [];
    var useOacColor = this.Config.colorSource !== "custom";
    var weightLayer = dataMeasureLayers.filter(function(layer) { return layer.logical === "measures"; })[0];
    var hasMeasureRoleInfo = dataMeasureLayers.some(function(layer) { return !!layer.logical; });

    for (var r = 0; r < nRows; r++) {
      var start = "";
      var end = "";
      var mids = [];
      var termCode = null;
      var group = "";
      var details = [];
      var incompletePath = false;

      layers.forEach(function(layer) {
        var value = str(oDataLayout.getValue(PHYS_ROW, layer.index, r, false));
        if (layer.logical === "row") start = value;
        else if (layer.logical === "item") end = value;
        else if (layer.logical === "glyph") mids.push(value);
        else if (layer.logical === "size" && termCode === null) termCode = num(value);
        else if (layer.logical === "color") group = value;
        else {
          details.push({label: layer.displayName, value: value});
        }
      });
      dataMeasureLayers.forEach(function(layer) {
        if (layer.logical !== "detail") return;
        details.push({
          label: layer.displayName || ("Tooltip Measure " + (layer.index + 1)),
          value: str(oDataLayout.getValue(PHYS_DATA, r, layer.index))
        });
      });

      start = str(start).trim();
      end = str(end).trim();
      if (!start) start = this.Config.dropOrphans === "off" ? this.Config.unknownStartLabel : "";
      var canonicalIncompleteEnd = normalized(this.Config.incompleteEndLabel);
      var matchesCanonicalIncompleteEnd = !!end &&
        !!canonicalIncompleteEnd &&
        normalized(end) === canonicalIncompleteEnd;
      if (matchesCanonicalIncompleteEnd) {
        if (this.Config.includeIncompletePaths === "on") {
          incompletePath = true;
        } else {
          end = this.Config.dropOrphans === "off" ? this.Config.unknownEndLabel : "";
        }
      } else if (isMissingEndValue(end)) {
        if (start &&
            this.Config.routeMissingEndToIncomplete === "on" &&
            this.Config.includeIncompletePaths === "on") {
          end = this.Config.incompleteEndLabel;
          incompletePath = true;
        } else {
          end = this.Config.dropOrphans === "off" ? this.Config.unknownEndLabel : "";
        }
      }
      if (!start || !end) {
        warnings.orphanRows += 1;
        if (this.Config.dropOrphans === "on") continue;
      }

      // Stage index is the bucket position (Start = 0, Intermediate i = i + 1,
      // End = last), so a blank intermediate cell never shifts later nodes
      // into a different lane; the link simply spans the empty stage.
      var depth = this.Config.intermediatePolicy === "none" ? 0 : Math.min(mids.length, this.Config.maxIntermediateDepth);
      var truncated = false;
      var path = [{stage: 0, label: str(start).trim()}];
      mids.forEach(function(v, i) {
        var label = str(v).trim();
        if (!label) return;
        if (i >= depth) { truncated = true; return; }
        path.push({stage: i + 1, label: label});
      });
      if (truncated && this.Config.intermediatePolicy !== "none") warnings.truncatedIntermediateRows += 1;
      path.push({stage: depth + 1, label: str(end).trim()});
      var weight = weightLayer
        ? num(oDataLayout.getValue(PHYS_DATA, r, weightLayer.index))
        : (hasMeasureRoleInfo ? null : num(oDataLayout.getValue(PHYS_DATA, r, 0)));
      if (weight === null || weight < 0) weight = 1;
      var color = useOacColor ? this._resolveThemeColor(oTransientRenderingContext, helper, r) : "";
      for (var s = 0; s < path.length - 1; s++) {
        var from = path[s].label;
        var to = path[s + 1].label;
        if (!from || !to) continue;
        if (this.Config.disallowSelfLinks === "on" && normalized(from) === normalized(to)) {
          warnings.selfLinkEdges += 1;
          continue;
        }
        raw.push({
          stageIndex: path[s].stage,
          toStage: path[s + 1].stage,
          from: from,
          to: to,
          group: group || "",
          value: weight,
          row: r,
          details: details,
          termCode: termCode,
          color: color,
          incompletePath: incompletePath
        });
      }
    }
    return {rawEdges: raw, warnings: warnings};
  };

  WsuSankeyViz.prototype._aggregateEdges = function(rawEdges, warnings) {
    var byKey = Object.create(null);
    var total = 0;
    rawEdges.forEach(function(e) {
      total += e.value;
      var key = [e.stageIndex, e.toStage, e.from, e.to, e.group || ""].join(KEY_SEP);
      if (!byKey[key]) {
        byKey[key] = {
          stageIndex: e.stageIndex,
          toStage: e.toStage,
          from: e.from,
          to: e.to,
          group: e.group || "",
          value: 0,
          rows: [],
          color: e.color || "",
          termCode: e.termCode,
          incompletePath: !!e.incompletePath,
          detailsMap: {}
        };
      }
      byKey[key].value += e.value;
      addUnique(byKey[key].rows, e.row);
      if (!byKey[key].color && e.color) byKey[key].color = e.color;
      if (byKey[key].termCode === null || typeof byKey[key].termCode === "undefined") byKey[key].termCode = e.termCode;
      byKey[key].incompletePath = byKey[key].incompletePath || !!e.incompletePath;
      mergeDetailRows(byKey[key].detailsMap, e.details);
    });

    var edges = Object.keys(byKey).map(function(k) {
      var edge = byKey[k];
      edge.details = detailsMapToRows(edge.detailsMap);
      delete edge.detailsMap;
      return edge;
    });
    var threshold = this.Config.minFlowThreshold;
    if (threshold > 0) {
      edges = edges.filter(function(e) {
        var keep = this.Config.thresholdMode === "percent"
          ? ((total > 0 ? (e.value / total * 100) : 0) >= threshold)
          : (e.value >= threshold);
        if (!keep) warnings.thresholdDropped += 1;
        return keep;
      }, this);
    }

    if (this.Config.topNPerStage > 0) {
      var grouped = Object.create(null);
      edges.forEach(function(e) {
        if (!grouped[e.stageIndex]) grouped[e.stageIndex] = [];
        grouped[e.stageIndex].push(e);
      });
      var next = [];
      Object.keys(grouped).forEach(function(sk) {
        var arr = grouped[sk].slice().sort(function(a, b) { return b.value - a.value; });
        var keep = arr.slice(0, this.Config.topNPerStage);
        var drop = arr.slice(this.Config.topNPerStage);
        drop.forEach(function() { warnings.topNDropped += 1; });
        next = next.concat(keep);
        if (this.Config.collapseOther === "on" && drop.length) {
          var other = {stageIndex: Number(sk), toStage: Number(sk) + 1, from: "Other", to: "Other", group: "", value: 0, rows: [], color: ""};
          drop.forEach(function(d) {
            other.value += d.value;
            d.rows.forEach(function(r) { addUnique(other.rows, r); });
          });
          if (other.value > 0) next.push(other);
        }
      }, this);
      edges = next;
    }

    return {edges: edges, total: total, warnings: warnings};
  };

  WsuSankeyViz.prototype._layout = function(edges, width, height) {
    if (!edges.length) return {nodes: [], edges: [], stageTotals: {}, stageCount: 0};
    var nodesByKey = Object.create(null);
    var stageToNodes = Object.create(null);
    var stageTotals = Object.create(null);
    var maxStage = 0;

    function ensureNode(stage, label) {
      var key = stage + KEY_SEP + label;
      if (!nodesByKey[key]) {
        nodesByKey[key] = {
          key: key,
          stage: stage,
          label: label,
          inValue: 0,
          outValue: 0,
          rows: [],
            detailsMap: {},
            themeColor: "",
            sortKey: null,
          x: 0, y: 0, h: 0
        };
        if (!stageToNodes[stage]) stageToNodes[stage] = [];
        stageToNodes[stage].push(nodesByKey[key]);
      }
      return nodesByKey[key];
    }

    edges.forEach(function(e) {
      var s = ensureNode(e.stageIndex, e.from);
      var t = ensureNode(edgeToStage(e), e.to);
      s.outValue += e.value;
      t.inValue += e.value;
      e.rows.forEach(function(r) { addUnique(s.rows, r); addUnique(t.rows, r); });
      mergeDetailRows(s.detailsMap, e.details);
      mergeDetailRows(t.detailsMap, e.details);
      if (!s.themeColor && e.color) s.themeColor = e.color;
      if (!t.themeColor && e.color) t.themeColor = e.color;
      if (typeof e.termCode === "number" && !isNaN(e.termCode)) {
        if (s.sortKey === null || typeof s.sortKey === "undefined") s.sortKey = e.termCode;
        else s.sortKey = Math.min(s.sortKey, e.termCode);
        if (t.sortKey === null || typeof t.sortKey === "undefined") t.sortKey = e.termCode;
        else t.sortKey = Math.min(t.sortKey, e.termCode);
      }
      maxStage = Math.max(maxStage, edgeToStage(e));
    });

    var stageCount = maxStage + 1;
    var nodeWidth = this.Config.nodeWidth;
    var configuredGap = this.Config.nodeGap;
    var minNodeHeight = this.Config.minNodeHeight;
    var stagePadding = this.Config.stagePadding;
    var innerW = Math.max(20, width - nodeWidth - (stagePadding * 2));
    var step = stageCount <= 1 ? 0 : (innerW / (stageCount - 1));
    var stageScales = {};
    var termSortDir = this.Config.termCodeDirection === "desc" ? -1 : 1;
    for (var s = 0; s < stageCount; s++) {
      var list = stageToNodes[s] || [];
      list.forEach(function(n) { n.value = Math.max(n.inValue, n.outValue); });
      list.sort(function(a, b) {
        var aHas = typeof a.sortKey === "number" && !isNaN(a.sortKey);
        var bHas = typeof b.sortKey === "number" && !isNaN(b.sortKey);
        if (aHas && bHas && a.sortKey !== b.sortKey) return (a.sortKey - b.sortKey) * termSortDir;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return b.value - a.value || a.label.localeCompare(b.label);
      });
      var sum = list.reduce(function(acc, n) { return acc + n.value; }, 0);
      stageTotals[s] = sum;
      var gap = list.length > 1 ? configuredGap : 0;
      if (this.Config.autoNodeGap === "on" && list.length > 1) {
        var denseGapCeiling = (height - (list.length * minNodeHeight)) / Math.max(1, list.length - 1);
        gap = clamp(Math.floor(denseGapCeiling), 2, configuredGap);
      }
      var heightBudget = Math.max(Math.max(20, list.length * 2), height - Math.max(0, list.length - 1) * gap);
      var scale = sum > 0 ? (heightBudget / sum) : 1;
      stageScales[s] = scale;
      var assignedHeight = 0;
      list.forEach(function(n) {
        n.h = Math.max(minNodeHeight, n.value * scale);
        assignedHeight += n.h;
      });
      if (assignedHeight > heightBudget && assignedHeight > 0) {
        var shrink = heightBudget / assignedHeight;
        list.forEach(function(n) {
          n.h = Math.max(2, n.h * shrink);
        });
      }
      if (sum > 0) {
        stageScales[s] = list.reduce(function(acc, n) {
          if (n.value <= 0) return acc;
          return Math.min(acc, n.h / n.value);
        }, scale);
      }
      var y = 0;
      list.forEach(function(n) {
        n.x = this.Config.xSortDirection === "desc"
          ? (stagePadding + innerW - (s * step))
          : (stagePadding + (s * step));
        n.y = clamp(y, 0, Math.max(0, height - n.h));
        y = n.y + n.h + gap;
        n._sourceOffset = 0;
        n._targetOffset = 0;
      }, this);
    }

    var outEdges = edges.slice().sort(function(a, b) {
      if (a.stageIndex !== b.stageIndex) return a.stageIndex - b.stageIndex;
      var aHas = typeof a.termCode === "number" && !isNaN(a.termCode);
      var bHas = typeof b.termCode === "number" && !isNaN(b.termCode);
      if (aHas && bHas && a.termCode !== b.termCode) return (a.termCode - b.termCode) * termSortDir;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      return a.to.localeCompare(b.to);
    }).map(function(e, idx) {
      var source = nodesByKey[e.stageIndex + KEY_SEP + e.from];
      var target = nodesByKey[edgeToStage(e) + KEY_SEP + e.to];
      var edgeScale = Math.min(stageScales[e.stageIndex] || 1, stageScales[edgeToStage(e)] || 1);
      var w = Math.max(1, e.value * edgeScale);
      var sy = source.y + source._sourceOffset + (w / 2);
      var ty = target.y + target._targetOffset + (w / 2);
      source._sourceOffset += w;
      target._targetOffset += w;
      return {
        id: "e" + idx,
        stageIndex: e.stageIndex,
        toStage: edgeToStage(e),
        from: e.from,
        to: e.to,
        value: e.value,
        rows: e.rows,
        group: e.group,
        color: e.color,
        incompletePath: !!e.incompletePath,
        details: e.details || [],
        termCode: e.termCode,
        source: source,
        target: target,
        sy: sy,
        ty: ty,
        width: w
      };
    });

    return {
      nodes: Object.keys(nodesByKey).map(function(k) {
        var node = nodesByKey[k];
        node.details = detailsMapToRows(node.detailsMap);
        delete node.detailsMap;
        return node;
      }),
      edges: outEdges,
      stageTotals: stageTotals,
      stageCount: stageCount
    };
  };

  WsuSankeyViz.prototype._tooltipHtmlForEdge = function(edge, totalsByStage, totalFlow) {
    var rows = [["From", edge.from], ["To", edge.to]];
    (edge.details || []).forEach(function(d) {
      rows.push([d.label, d.value]);
    });
    if (this.Config.showDerivedTooltipMetrics !== "on") {
      return "<table>" + rows.map(function(r) {
        return "<tr><td class='tthead'>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>";
      }).join("") + "</table>";
    }
    var pctMode = this.Config.tooltipPercentMode;
    var stageTotal = totalsByStage[edge.stageIndex] || 0;
    var stagePct = stageTotal > 0 ? (edge.value / stageTotal * 100) : 0;
    var totalPct = totalFlow > 0 ? (edge.value / totalFlow * 100) : 0;
    var decimals = this.Config.valueDecimals;
    rows = rows.concat([
      ["Flow Weight", edge.value.toFixed(decimals)],
      ["Rows", edge.rows.length]
    ]);
    if (pctMode === "stage" || pctMode === "both") rows.push(["% of Stage", stagePct.toFixed(1) + "%"]);
    if (pctMode === "total" || pctMode === "both") rows.push(["% of Total", totalPct.toFixed(1) + "%"]);
    return "<table>" + rows.map(function(r) {
      return "<tr><td class='tthead'>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>";
    }).join("") + "</table>";
  };

  WsuSankeyViz.prototype._tooltipHtmlForNode = function(node) {
    var rows = [["Node", node.label]];
    if (this.Config.showDerivedTooltipMetrics !== "on") {
      return "<table>" + rows.map(function(r) {
        return "<tr><td class='tthead'>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>";
      }).join("") + "</table>";
    }
    (node.details || []).forEach(function(d) {
      rows.push([d.label, d.value]);
    });
    var decimals = this.Config.valueDecimals;
    rows = rows.concat([
      ["Stage", String(node.stage + 1)],
      ["In", node.inValue.toFixed(decimals)],
      ["Out", node.outValue.toFixed(decimals)],
      ["Rows", String(node.rows.length)]
    ]);
    return "<table>" + rows.map(function(r) {
      return "<tr><td class='tthead'>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>";
    }).join("") + "</table>";
  };

  WsuSankeyViz.prototype._moveTooltip = function(tooltip, event) {
    var node = tooltip.node();
    if (!node) return;
    var pageX = event.pageX || 0;
    var pageY = event.pageY || 0;
    var left = pageX + 12;
    var top = pageY + 12;
    var w = node.offsetWidth || 0;
    var h = node.offsetHeight || 0;
    var maxX = window.pageXOffset + window.innerWidth - w - 8;
    var maxY = window.pageYOffset + window.innerHeight - h - 8;
    if (left > maxX) left = pageX - w - 12;
    if (top > maxY) top = pageY - h - 12;
    tooltip.style("left", left + "px").style("top", top + "px");
  };

  WsuSankeyViz.prototype._markRows = function(rows, oDataLayout) {
    try {
      var svc = this.getMarkingService();
      svc.clearMarksForDataLayout(oDataLayout);
      rows.forEach(function(r) { svc.setMark(oDataLayout, PHYS_ROW, parseInt(r, 10), 0); });
      var evt = new interactions.MarkingEvent(this.getID(), this.getViewName(), oDataLayout, null, null);
      var router = this.getEventRouter();
      if (router) router.publish(evt);
    } catch (e) {
      _logger.warning("Marking failed: " + (e && e.message ? e.message : e));
    }
  };

  WsuSankeyViz.prototype._draw = function(elContainer, model, oDataLayout) {
    var containerId = this.getSubElementIdFromParent(elContainer, "wsuSankey") || this.getID() || ("viz_" + Date.now());
    var rootId = "wsu_sankey_" + containerId.replace(/[^A-Za-z0-9_-]/g, "_");
    $(elContainer).html("<div id='" + rootId + "' class='wsu-sankey'></div>");
    var root = d3.select("#" + rootId);
    var width = Math.max($(elContainer).width(), 480);
    var height = Math.max($(elContainer).height(), 320);

    if (!model || !model.layout || !model.layout.edges.length) {
      root.append("div").attr("class", "empty-state").text(LBL.EMPTY);
      return;
    }

    var frame = this._chartFrame(width, height);
    var margin = frame.margin;
    var innerWidth = frame.innerWidth;
    var innerHeight = frame.innerHeight;
    var legendTop = this.Config.showLegend === "on" && this.Config.legendPosition === "top";

    var svg = root.append("svg").attr("width", width).attr("height", height).attr("viewBox", "0 0 " + width + " " + height);
    var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    var tooltip = d3.select("body").selectAll("#" + rootId + "_tooltip").data([null]);
    tooltip = tooltip.enter().append("div").attr("id", rootId + "_tooltip").attr("class", "wsu-sankey-tooltip").merge(tooltip);
    this._tooltipId = rootId + "_tooltip";

    var palette = parsePalette(this.Config.customPalette);
    var colorScale = d3.scaleOrdinal().range(palette.length ? palette : ["#1e88e5", "#43a047", "#f4511e", "#8e24aa", "#00897b", "#6d4c41"]);
    var oViz = this;

    if (this.Config.showStageTitles === "on") {
      var titleLayer = g.append("g").attr("class", "stage-titles");
      function drawStageTitle(text, side) {
        if (!text) return;
        var x = side === "left" ? -oViz.Config.stageTitleOffset : (innerWidth + oViz.Config.stageTitleOffset);
        var y = innerHeight / 2;
        var title = titleLayer.append("text")
          .attr("class", "stage-title " + side)
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .style("fill", oViz.Config.stageTitleColor)
          .style("font-size", oViz.Config.stageTitleFontSize + "px")
          .style("font-weight", oViz.Config.stageTitleBold === "on" ? "700" : "400")
          .style("font-style", oViz.Config.stageTitleItalic === "on" ? "italic" : "normal")
          .text(text);
        if (oViz.Config.stageTitleOrientation === "horizontal") {
          title.attr("x", x).attr("y", y);
        } else {
          title.attr("transform", "translate(" + x + "," + y + ") rotate(-90)");
        }
      }
      drawStageTitle(this.Config.startStageTitle, "left");
      drawStageTitle(this.Config.endStageTitle, "right");
    }

    function edgeColor(e) {
      var fallback = "#1e88e5";
      if (e.incompletePath && oViz.Config.highlightIncompletePaths === "on") return oViz.Config.incompletePathColor || "#d97706";
      if (oViz.Config.colorSource === "custom") {
        if (oViz.Config.colorBy === "source") return colorScale(e.from);
        if (oViz.Config.colorBy === "target") return colorScale(e.to);
        return colorScale(e.group || (e.from + "->" + e.to));
      }
      if (oViz.Config.colorBy === "source") return e.source.themeColor || e.color || colorScale(e.from) || fallback;
      if (oViz.Config.colorBy === "target") return e.target.themeColor || e.color || colorScale(e.to) || fallback;
      return e.color || colorScale(e.group || (e.from + "->" + e.to)) || fallback;
    }

    var links = g.append("g").attr("class", "links").selectAll("path")
      .data(model.layout.edges)
      .enter()
      .append("path")
      .attr("class", "link-path")
      .attr("d", function(e) {
        var x0 = e.source.x + oViz.Config.nodeWidth;
        var x1 = e.target.x;
        var c = Math.abs(x1 - x0) * oViz.Config.linkCurve;
        return "M" + x0 + "," + e.sy + " C" + (x0 + c) + "," + e.sy + " " + (x1 - c) + "," + e.ty + " " + x1 + "," + e.ty;
      })
      .attr("stroke-width", function(e) { return e.width; })
      .attr("stroke", function(e) { return colorWithAlpha(edgeColor(e), oViz.Config.linkOpacity, "rgba(30,136,229,0.35)"); })
      .on("mouseover", function(event, e) {
        tooltip.html(oViz._tooltipHtmlForEdge(e, model.layout.stageTotals, model.totalFlow)).style("display", "block");
        oViz._moveTooltip(tooltip, event);
      })
      .on("mousemove", function(event) { oViz._moveTooltip(tooltip, event); })
      .on("mouseout", function() { tooltip.style("display", "none"); })
      .on("click", function(event, e) {
        event.preventDefault();
        event.stopPropagation();
        applyFocus("edge:" + e.id, collectDownstreamFromEdge(e));
        oViz._markRows(e.rows, oDataLayout);
      });

    if (this.Config.showLinkLabels === "on") {
      g.append("g").selectAll("text")
        .data(model.layout.edges)
        .enter()
        .append("text")
        .attr("class", "link-label")
        .attr("x", function(e) { return (e.source.x + oViz.Config.nodeWidth + e.target.x) / 2; })
        .attr("y", function(e) { return (e.sy + e.ty) / 2; })
        .style("font-size", this.Config.linkLabelFontSize + "px")
        .text(function(e) { return e.value.toFixed(oViz.Config.valueDecimals); });
    }

    var nodes = g.append("g").attr("class", "nodes").selectAll("g")
      .data(model.layout.nodes)
      .enter()
      .append("g");

    var nodeRects = nodes.append("rect")
      .attr("class", "node-rect")
      .attr("x", function(n) { return n.x; })
      .attr("y", function(n) { return n.y; })
      .attr("width", this.Config.nodeWidth)
      .attr("height", function(n) { return n.h; })
      .attr("fill", this.Config.nodeFillColor)
      .on("mouseover", function(event, n) {
        tooltip.html(oViz._tooltipHtmlForNode(n)).style("display", "block");
        oViz._moveTooltip(tooltip, event);
      })
      .on("mousemove", function(event) { oViz._moveTooltip(tooltip, event); })
      .on("mouseout", function() { tooltip.style("display", "none"); })
      .on("click", function(event, n) {
        event.preventDefault();
        event.stopPropagation();
        applyNodeFocus(n);
        oViz._markRows(n.rows, oDataLayout);
      });

    if (this.Config.showNodeLabels === "on") {
      nodes.filter(function(n) {
        return n.h >= Math.max(8, oViz.Config.nodeLabelFontSize + 1);
      }).append("text")
        .attr("class", "node-label")
        .attr("x", function(n) {
          var rightSide = n.x > innerWidth / 2;
          return rightSide ? (n.x - 4) : (n.x + oViz.Config.nodeWidth + 4);
        })
        .attr("y", function(n) { return n.y + n.h / 2; })
        .attr("text-anchor", function(n) { return n.x > innerWidth / 2 ? "end" : "start"; })
        .attr("dominant-baseline", "middle")
        .style("font-size", this.Config.nodeLabelFontSize + "px")
        .text(function(n) { return truncateLabel(n.label, oViz.Config.nodeLabelMaxChars); });
    }

    // Click focus follows pathway intent: start nodes look downstream, end
    // nodes look upstream, and intermediate nodes show both directions.
    var nodeLabels = nodes.selectAll(".node-label");
    var activeFocusKey = null;
    var legendItems = null;
    function collectDownstreamFromNode(nodeKey) {
      var connectedNodes = {};
      var connectedEdges = {};
      var queue = [nodeKey];
      connectedNodes[nodeKey] = true;
      while (queue.length) {
        var current = queue.shift();
        model.layout.edges.forEach(function(e) {
          if (e.source.key !== current) return;
          connectedEdges[e.id] = true;
          if (!connectedNodes[e.target.key]) {
            connectedNodes[e.target.key] = true;
            queue.push(e.target.key);
          }
        });
      }
      return {nodes: connectedNodes, edges: connectedEdges};
    }
    function collectUpstreamFromNode(nodeKey) {
      var connectedNodes = {};
      var connectedEdges = {};
      var queue = [nodeKey];
      connectedNodes[nodeKey] = true;
      while (queue.length) {
        var current = queue.shift();
        model.layout.edges.forEach(function(e) {
          if (e.target.key !== current) return;
          connectedEdges[e.id] = true;
          if (!connectedNodes[e.source.key]) {
            connectedNodes[e.source.key] = true;
            queue.push(e.source.key);
          }
        });
      }
      return {nodes: connectedNodes, edges: connectedEdges};
    }
    function mergeFocus(a, b) {
      var nodesOut = {};
      var edgesOut = {};
      Object.keys(a.nodes || {}).forEach(function(k) { nodesOut[k] = true; });
      Object.keys(b.nodes || {}).forEach(function(k) { nodesOut[k] = true; });
      Object.keys(a.edges || {}).forEach(function(k) { edgesOut[k] = true; });
      Object.keys(b.edges || {}).forEach(function(k) { edgesOut[k] = true; });
      return {nodes: nodesOut, edges: edgesOut};
    }
    function collectDownstreamFromEdge(edge) {
      var connectedNodes = {};
      var connectedEdges = {};
      connectedEdges[edge.id] = true;
      connectedNodes[edge.source.key] = true;
      connectedNodes[edge.target.key] = true;
      var queue = [edge.target.key];
      while (queue.length) {
        var current = queue.shift();
        model.layout.edges.forEach(function(e) {
          if (e.source.key === current) {
            connectedEdges[e.id] = true;
            if (!connectedNodes[e.target.key]) {
              connectedNodes[e.target.key] = true;
              queue.push(e.target.key);
            }
          }
        });
      }
      return {nodes: connectedNodes, edges: connectedEdges};
    }
    function resetFocus() {
      activeFocusKey = null;
      links
        .style("opacity", null)
        .style("stroke-width", function(e) { return e.width; });
      nodeRects.style("opacity", null);
      nodeLabels.style("opacity", null);
      if (legendItems) legendItems.classed("legend-active", false).classed("legend-inactive", false);
      oViz._activeLegendKey = null;
    }
    function applyFocus(focusKey, focus) {
      if (activeFocusKey === focusKey) {
        resetFocus();
        return;
      }
      activeFocusKey = focusKey;
      links
        .style("opacity", function(e) { return focus.edges[e.id] ? 1 : 0.08; })
        .style("stroke-width", function(e) { return focus.edges[e.id] ? Math.max(e.width, 2.5) : Math.max(0.75, e.width * 0.5); });
      nodeRects.style("opacity", function(n) { return focus.nodes[n.key] ? 1 : 0.25; });
      nodeLabels.style("opacity", function(n) { return focus.nodes[n.key] ? 1 : 0.35; });
    }
    function applyNodeFocus(node) {
      if (!node || !node.key) {
        resetFocus();
        return;
      }
      var hasIncoming = model.layout.edges.some(function(e) { return e.target.key === node.key; });
      var hasOutgoing = model.layout.edges.some(function(e) { return e.source.key === node.key; });
      var focus = hasIncoming && hasOutgoing
        ? mergeFocus(collectUpstreamFromNode(node.key), collectDownstreamFromNode(node.key))
        : (hasIncoming ? collectUpstreamFromNode(node.key) : collectDownstreamFromNode(node.key));
      applyFocus("node:" + node.key, focus);
    }
    svg.on("click", function() {
      resetFocus();
    });

    if (this.Config.showLegend === "on") {
      var legendGroups = {};
      var incompleteLegendName = "Incomplete Paths";
      var hasNamedGroups = model.layout.edges.some(function(e) { return !!str(e.group).trim(); });
      model.layout.edges.forEach(function(e) {
        if (e.incompletePath && oViz.Config.highlightIncompletePaths === "on") {
          if (!legendGroups[incompleteLegendName]) legendGroups[incompleteLegendName] = {edge: e, incomplete: true};
          return;
        }
        if (!hasNamedGroups) return;
        var k = str(e.group).trim() || "Ungrouped Paths";
        if (!legendGroups[k]) legendGroups[k] = {edge: e, incomplete: false};
      });
      function legendColor(name, entry) {
        if (entry && entry.incomplete) return oViz.Config.incompletePathColor || "#d97706";
        var sampleEdge = entry && entry.edge;
        if (oViz.Config.colorSource === "custom") return colorScale(name);
        if (!sampleEdge) return colorScale(name);
        if (oViz.Config.colorBy === "source") return sampleEdge.source.themeColor || sampleEdge.color || colorScale(name);
        if (oViz.Config.colorBy === "target") return sampleEdge.target.themeColor || sampleEdge.color || colorScale(name);
        return sampleEdge.color || colorScale(name);
      }
      var lg = Object.keys(legendGroups);
      if (lg.length) {
        function collectLegendFocus(name, entry) {
          var nodesOut = {};
          var edgesOut = {};
          model.layout.edges.forEach(function(e) {
            var matches = entry && entry.incomplete
              ? !!e.incompletePath
              : (str(e.group).trim() || "Ungrouped Paths") === name;
            if (!matches) return;
            edgesOut[e.id] = true;
            nodesOut[e.source.key] = true;
            nodesOut[e.target.key] = true;
          });
          return {nodes: nodesOut, edges: edgesOut};
        }
        function applyLegendFocus(name, entry) {
          var key = "legend:" + name;
          applyFocus(key, collectLegendFocus(name, entry));
          oViz._activeLegendKey = activeFocusKey === key ? name : null;
          if (legendItems) {
            legendItems
              .classed("legend-active", function(d) { return activeFocusKey === key && d.name === name; })
              .classed("legend-inactive", function(d) { return activeFocusKey === key && d.name !== name; });
          }
        }
        var legendY = legendTop ? -22 : (innerHeight + 18);
        var legend = g.append("g").attr("class", "legend").attr("transform", "translate(0," + legendY + ")");
        var legendData = lg.slice(0, 8).map(function(name) {
          return {name: name, entry: legendGroups[name]};
        });
        legendItems = legend.selectAll("g.legend-item")
          .data(legendData)
          .enter()
          .append("g")
          .attr("class", "legend-item")
          .attr("transform", function(d, idx) { return "translate(" + (idx * 150) + ",0)"; })
          .style("cursor", "pointer")
          .on("click", function(event, d) {
            event.preventDefault();
            event.stopPropagation();
            applyLegendFocus(d.name, d.entry);
          });
        legendItems.append("rect")
          .attr("x", 0)
          .attr("y", 0)
          .attr("width", 14)
          .attr("height", 14)
          .attr("fill", function(d) {
            var fillColor = legendColor(d.name, d.entry);
            return oViz.Config.colorSource === "custom" || d.entry.incomplete
              ? fillColor
              : colorWithAlpha(fillColor, oViz.Config.linkOpacity);
          });
        legendItems.append("text")
          .attr("x", 20)
          .attr("y", 11)
          .text(function(d) { return d.name; });
      }
    }

    var warningText = [];
    if (model.warnings.orphanRows > 0) warningText.push("orphans dropped: " + model.warnings.orphanRows);
    if (model.warnings.selfLinkEdges > 0) warningText.push("self-links removed: " + model.warnings.selfLinkEdges);
    if (model.warnings.truncatedIntermediateRows > 0) warningText.push("rows truncated by max depth: " + model.warnings.truncatedIntermediateRows);
    if (warningText.length && this.Config.showWarnings === "on") {
      g.append("text")
        .attr("class", "warning-text")
        .attr("x", 0)
        .attr("y", -4)
        .text(warningText.join(" | "));
    }
  };

  WsuSankeyViz.prototype._buildModel = function(oDataLayout, oTransientRenderingContext, size) {
    var rawBuild = this._buildRawEdges(oDataLayout, oTransientRenderingContext);
    var agg = this._aggregateEdges(rawBuild.rawEdges, rawBuild.warnings);
    var layout = this._layout(agg.edges, size.width, size.height);
    return {layout: layout, warnings: agg.warnings, totalFlow: agg.total};
  };

  function addSwitcher(panel, id, labelText, value, options, order) {
    var infos = options.map(function(option) { return new gadgets.OptionInfo(option.value, option.label); });
    var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_SWITCHER, value);
    panel.addChild(new gadgets.TextSwitcherGadgetInfo(id, labelText, labelText, gvp, order, false, infos));
  }
  function addToggle(panel, id, labelText, value, order) {
    var checked = value !== "off";
    var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, checked);
    if (typeof order === "number" && gvp.setOrder) gvp.setOrder(order);
    panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
  }
  function addText(panel, factory, id, labelText, value, order) {
    var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_FIELD, str(value));
    panel.addChild(factory.createGadgetInfo(id, labelText, labelText, gvp));
  }

  WsuSankeyViz.prototype.doAddVizSpecificPropsDialog = function(oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
    jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
    jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
    this.loadConfig();
    var factory = this.getGadgetFactory();
    var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
    function tryPanel(id) {
      try { var p = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, id); return p || pGen; }
      catch (e) { return pGen; }
    }
    var pRules = tryPanel("wsuSankeyRules");
    var pStyle = tryPanel("wsuSankeyStyle");
    var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
    var ord = {GEN: base + 100, RULE: base + 200, STY: base + 300};
    var nx = function(g) { return ord[g]++; };

    addSwitcher(pGen, "intermediatePolicyGadget", "Intermediate Policy", this.Config.intermediatePolicy, [
      {value: "provided", label: "Use Provided Intermediate"},
      {value: "none", label: "None (Start -> End)"}
    ], nx("GEN"));
    pGen.addChild(new gadgets.SliderGadgetInfo("maxIntermediateDepthGadget", "Max Intermediate Depth", "Max Intermediate Depth", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.maxIntermediateDepth, 0, 5)));
    addSwitcher(pGen, "tooltipPercentModeGadget", "Tooltip Percent Mode", this.Config.tooltipPercentMode, [
      {value: "off", label: "Off"},
      {value: "stage", label: "Stage"},
      {value: "total", label: "Total"},
      {value: "both", label: "Both"}
    ], nx("GEN"));
    addToggle(pGen, "showDerivedTooltipMetricsGadget", "Tooltip: Show Derived Metrics", this.Config.showDerivedTooltipMetrics, nx("GEN"));
    addToggle(pGen, "includeIncompletePathsGadget", "Include Incomplete Paths", this.Config.includeIncompletePaths, nx("GEN"));
    addToggle(pGen, "routeMissingEndToIncompleteGadget", "Route Missing End to Incomplete Label", this.Config.routeMissingEndToIncomplete, nx("GEN"));
    addSwitcher(pGen, "colorSourceGadget", "Color Source (OAC Theme/Custom)", this.Config.colorSource, [
      {value: "oac", label: "OAC Theme"},
      {value: "custom", label: "Custom Palette"}
    ], nx("GEN"));
    addSwitcher(pGen, "colorByGadget", "Color By", this.Config.colorBy, [
      {value: "group", label: "Path Group"},
      {value: "source", label: "Source Node"},
      {value: "target", label: "Target Node"}
    ], nx("GEN"));
    addText(pGen, factory, "customPaletteGadget", "Custom Palette (hex csv)", this.Config.customPalette, nx("GEN"));
    addText(pGen, factory, "unknownStartLabelGadget", "Fallback Label for Missing Start", this.Config.unknownStartLabel, nx("GEN"));
    addText(pGen, factory, "unknownEndLabelGadget", "Fallback Label for Missing End", this.Config.unknownEndLabel, nx("GEN"));
    addText(pGen, factory, "incompleteEndLabelGadget", "Incomplete Path Label", this.Config.incompleteEndLabel, nx("GEN"));

    addSwitcher(pRules, "xSortDirectionGadget", "Stage Direction", this.Config.xSortDirection, [
      {value: "asc", label: "Left to Right"},
      {value: "desc", label: "Right to Left"}
    ], nx("RULE"));
    addSwitcher(pRules, "termCodeDirectionGadget", "Sorting Term Code Direction", this.Config.termCodeDirection, [
      {value: "asc", label: "Ascending"},
      {value: "desc", label: "Descending"}
    ], nx("RULE"));
    addSwitcher(pRules, "thresholdModeGadget", "Threshold Mode", this.Config.thresholdMode, [
      {value: "absolute", label: "Absolute"},
      {value: "percent", label: "Percent"}
    ], nx("RULE"));
    addText(pRules, factory, "minFlowThresholdGadget", "Min Flow Threshold", this.Config.minFlowThreshold, nx("RULE"));
    pRules.addChild(new gadgets.SliderGadgetInfo("topNPerStageGadget", "Top N Per Stage", "Top N Per Stage", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.topNPerStage, 0, 50)));
    addToggle(pRules, "collapseOtherGadget", "Collapse Other", this.Config.collapseOther, nx("RULE"));
    addToggle(pRules, "dropOrphansGadget", "Drop Rows Still Missing Required Nodes", this.Config.dropOrphans, nx("RULE"));
    addToggle(pRules, "disallowSelfLinksGadget", "Disallow Self Links", this.Config.disallowSelfLinks, nx("RULE"));
    addToggle(pRules, "showWarningsGadget", "Show Validation Warnings", this.Config.showWarnings, nx("RULE"));

    pStyle.addChild(new gadgets.SliderGadgetInfo("nodeWidthGadget", "Node Width", "Node Width", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.nodeWidth, 10, 60)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("nodeGapGadget", "Node Gap", "Node Gap", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.nodeGap, 4, 40)));
    addToggle(pStyle, "autoNodeGapGadget", "Auto-Tighten Node Gap", this.Config.autoNodeGap, nx("STY"));
    pStyle.addChild(new gadgets.SliderGadgetInfo("minNodeHeightGadget", "Minimum Node Height", "Minimum Node Height", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.minNodeHeight, 4, 24)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("stagePaddingGadget", "Stage Padding", "Stage Padding", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.stagePadding, 0, 80)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("chartLeftPaddingGadget", "Chart Left Padding", "Chart Left Padding", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.chartLeftPadding, 0, 180)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("chartRightPaddingGadget", "Chart Right Padding", "Chart Right Padding", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.chartRightPadding, 0, 180)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("chartBottomPaddingGadget", "Chart Bottom Padding", "Chart Bottom Padding", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.chartBottomPadding, 0, 120)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("linkOpacityGadget", "Link Opacity (%)", "Link Opacity (%)", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, Math.round(this.Config.linkOpacity * 100), 5, 100)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("linkCurveGadget", "Link Curve (%)", "Link Curve (%)", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, Math.round(this.Config.linkCurve * 100), 5, 95)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("valueDecimalsGadget", "Value Decimals", "Value Decimals", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.valueDecimals, 0, 4)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("nodeLabelFontSizeGadget", "Node Label Font Size", "Node Label Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.nodeLabelFontSize, 9, 20)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("nodeLabelMaxCharsGadget", "Node Label Max Characters", "Node Label Max Characters", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.nodeLabelMaxChars, 8, 80)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("linkLabelFontSizeGadget", "Link Label Font Size", "Link Label Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.linkLabelFontSize, 8, 18)));
    addText(pStyle, factory, "nodeFillColorGadget", "Node Fill Color (hex)", this.Config.nodeFillColor, nx("STY"));
    addToggle(pStyle, "showNodeLabelsGadget", "Show Node Labels", this.Config.showNodeLabels, nx("STY"));
    addToggle(pStyle, "showLinkLabelsGadget", "Show Link Labels", this.Config.showLinkLabels, nx("STY"));
    addToggle(pStyle, "highlightIncompletePathsGadget", "Highlight Incomplete Paths", this.Config.highlightIncompletePaths, nx("STY"));
    addText(pStyle, factory, "incompletePathColorGadget", "Incomplete Path Color (hex)", this.Config.incompletePathColor, nx("STY"));
    addToggle(pStyle, "showLegendGadget", "Show Legend", this.Config.showLegend, nx("STY"));
    addSwitcher(pStyle, "legendPositionGadget", "Legend Position", this.Config.legendPosition, [
      {value: "bottom", label: "Bottom"},
      {value: "top", label: "Top"}
    ], nx("STY"));
    addToggle(pStyle, "showStageTitlesGadget", "Show Left/Right Stage Titles", this.Config.showStageTitles, nx("STY"));
    addText(pStyle, factory, "startStageTitleGadget", "Left Stage Title", this.Config.startStageTitle, nx("STY"));
    addText(pStyle, factory, "endStageTitleGadget", "Right Stage Title", this.Config.endStageTitle, nx("STY"));
    addText(pStyle, factory, "stageTitleColorGadget", "Stage Title Color (hex)", this.Config.stageTitleColor, nx("STY"));
    pStyle.addChild(new gadgets.SliderGadgetInfo("stageTitleFontSizeGadget", "Stage Title Font Size", "Stage Title Font Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.stageTitleFontSize, 8, 28)));
    pStyle.addChild(new gadgets.SliderGadgetInfo("stageTitleOffsetGadget", "Stage Title Offset", "Stage Title Offset", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.stageTitleOffset, 12, 120)));
    addToggle(pStyle, "stageTitleBoldGadget", "Stage Title Bold", this.Config.stageTitleBold, nx("STY"));
    addToggle(pStyle, "stageTitleItalicGadget", "Stage Title Italic", this.Config.stageTitleItalic, nx("STY"));
    addSwitcher(pStyle, "stageTitleOrientationGadget", "Stage Title Orientation", this.Config.stageTitleOrientation, [
      {value: "vertical", label: "Vertical"},
      {value: "horizontal", label: "Horizontal"}
    ], nx("STY"));

    if (WsuSankeyViz.superClass.doAddVizSpecificPropsDialog) {
      WsuSankeyViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
    }
  };

  WsuSankeyViz.prototype._addVizSpecificPropsDialog = function(oTabbedPanelsGadgetInfo) {
    this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
    WsuSankeyViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
  };

  WsuSankeyViz.prototype._handlePropChange = function(sGadgetID, oPropChange, oViewSettings, oActionContext) {
    var updateSettings = WsuSankeyViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
    if (updateSettings) return updateSettings;
    var map = {
      intermediatePolicyGadget: "intermediatePolicy",
      maxIntermediateDepthGadget: "maxIntermediateDepth",
      xSortDirectionGadget: "xSortDirection",
      termCodeDirectionGadget: "termCodeDirection",
      minFlowThresholdGadget: "minFlowThreshold",
      thresholdModeGadget: "thresholdMode",
      topNPerStageGadget: "topNPerStage",
      tooltipPercentModeGadget: "tooltipPercentMode",
      colorSourceGadget: "colorSource",
      colorByGadget: "colorBy",
      customPaletteGadget: "customPalette",
      unknownStartLabelGadget: "unknownStartLabel",
      unknownEndLabelGadget: "unknownEndLabel",
      incompleteEndLabelGadget: "incompleteEndLabel",
      nodeWidthGadget: "nodeWidth",
      nodeGapGadget: "nodeGap",
      minNodeHeightGadget: "minNodeHeight",
      stagePaddingGadget: "stagePadding",
      chartLeftPaddingGadget: "chartLeftPadding",
      chartRightPaddingGadget: "chartRightPadding",
      chartBottomPaddingGadget: "chartBottomPadding",
      linkOpacityGadget: "linkOpacity",
      linkCurveGadget: "linkCurve",
      valueDecimalsGadget: "valueDecimals",
      nodeLabelFontSizeGadget: "nodeLabelFontSize",
      nodeLabelMaxCharsGadget: "nodeLabelMaxChars",
      linkLabelFontSizeGadget: "linkLabelFontSize",
      nodeFillColorGadget: "nodeFillColor",
      incompletePathColorGadget: "incompletePathColor",
      legendPositionGadget: "legendPosition",
      startStageTitleGadget: "startStageTitle",
      endStageTitleGadget: "endStageTitle",
      stageTitleColorGadget: "stageTitleColor",
      stageTitleFontSizeGadget: "stageTitleFontSize",
      stageTitleOffsetGadget: "stageTitleOffset",
      stageTitleOrientationGadget: "stageTitleOrientation"
    };
    var key = map[sGadgetID];
    var toggleGadgets = {
      collapseOtherGadget: "collapseOther",
      dropOrphansGadget: "dropOrphans",
      disallowSelfLinksGadget: "disallowSelfLinks",
      showWarningsGadget: "showWarnings",
      showDerivedTooltipMetricsGadget: "showDerivedTooltipMetrics",
      includeIncompletePathsGadget: "includeIncompletePaths",
      routeMissingEndToIncompleteGadget: "routeMissingEndToIncomplete",
      autoNodeGapGadget: "autoNodeGap",
      showStageTitlesGadget: "showStageTitles",
      stageTitleBoldGadget: "stageTitleBold",
      stageTitleItalicGadget: "stageTitleItalic",
      showNodeLabelsGadget: "showNodeLabels",
      showLinkLabelsGadget: "showLinkLabels",
      highlightIncompletePathsGadget: "highlightIncompletePaths",
      showLegendGadget: "showLegend"
    };
    if (toggleGadgets[sGadgetID]) {
      this.Config[toggleGadgets[sGadgetID]] = oPropChange.checked ? "on" : "off";
    } else if (key) {
      this.Config[key] = oPropChange.value;
      if (sGadgetID === "linkOpacityGadget") this.Config.linkOpacity = Number(oPropChange.value) / 100;
      if (sGadgetID === "linkCurveGadget") this.Config.linkCurve = Number(oPropChange.value) / 100;
      if (sGadgetID === "nodeFillColorGadget") this.Config.nodeFillColor = sanitizeHex(oPropChange.value, "#0f4c5c");
      if (sGadgetID === "incompletePathColorGadget") this.Config.incompletePathColor = sanitizeHex(oPropChange.value, "#d97706");
      if (sGadgetID === "stageTitleColorGadget") this.Config.stageTitleColor = sanitizeHex(oPropChange.value, "#202124");
    } else {
      return false;
    }
    if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
    else this._saveSettings();
    return true;
  };

  WsuSankeyViz.prototype._render = function(oTransientRenderingContext) {
    try {
      this.loadConfig();
      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      var container = this.getContainerElem();
      if (!container || !oDataLayout) return;
      var width = Math.max($(container).width(), 480);
      var height = Math.max($(container).height(), 320);
      var frame = this._chartFrame(width, height);
      var model = this._buildModel(oDataLayout, oTransientRenderingContext, {
        width: frame.innerWidth,
        height: frame.innerHeight
      });
      this._draw(container, model, oDataLayout);
    } catch (e) {
      _logger.warning("Render failed: " + (e && e.message ? e.message : e));
      $(this.getContainerElem()).html("<div class='wsu-sankey'><div class='empty-state'>Render failed: " + esc(e && e.message ? e.message : e) + "</div></div>");
    } finally {
      this._setIsRendered(true);
    }
  };

  WsuSankeyViz.prototype.render = function(oTransientRenderingContext) {
    this._render(oTransientRenderingContext);
  };

  WsuSankeyViz.prototype._doInitializeComponent = function() {
    WsuSankeyViz.superClass._doInitializeComponent.call(this);
    this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
  };

  WsuSankeyViz.prototype._doStopComponent = function() {
    // Tooltips are attached to <body>; remove ours when the viz is torn down.
    if (this._tooltipId) d3.select("#" + this._tooltipId).remove();
    WsuSankeyViz.superClass._doStopComponent.apply(this, arguments);
  };

  WsuSankeyViz.prototype._onDefaultColorsSettingsChanged = function() {
    var oTransientVizContext = this.assertOrCreateVizContext();
    this._render(this.createRenderingContext(oTransientVizContext));
  };

  function createClientComponent(sID, sDisplayName, sOrigin) {
    return new WsuSankeyViz(sID, sDisplayName, sOrigin, WsuSankeyViz.VERSION);
  }

  return {createClientComponent: createClientComponent};
});
