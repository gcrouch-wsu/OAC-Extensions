define(['jquery',
        'obitech-framework/jsx',
        'obitech-report/datavisualization',
        'obitech-reportservices/datamodelshapes',
        'obitech-reportservices/events',
        'obitech-reportservices/interactionservice',
        'obitech-application/gadgets',
        'obitech-report/gadgetdialog',
        'obitech-application/extendable-ui-definitions',
        'obitech-reportservices/data',
        'obitech-appservices/logger',
        'd3v6js',
        'com-wsu-network/lib/vis-network.min',
        'skin!css!com-wsu-network/wsuNetworkstyles'],
        function($,
                 jsx,
                 dataviz,
                 datamodelshapes,
                 events,
                 interactions,
                 gadgets,
                 gadgetdialog,
                 euidef,
                 data,
                 logger,
                 d3,
                 vislib) {
  "use strict";

  var MODULE_NAME = "com-wsu-network/wsuNetwork";
  jsx.assertAllNotNullExceptLastN(arguments, MODULE_NAME + " arguments", 2);

  var _logger = new logger.Logger(MODULE_NAME);
  _logger.info("Initializing WSU Network plugin");

  var PHYS_DATA = datamodelshapes.Physical.DATA;
  var PHYS_ROW = datamodelshapes.Physical.ROW;
  var PHYS_COLUMN = datamodelshapes.Physical.COLUMN;
  var SETTINGS_CHART = dataviz.SettingsNS.CHART;
  var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
  var DCP_DATA_LAYOUT_HELPER = dataviz.DataContextProperty.DATA_LAYOUT_HELPER;
  var LAYER_DISPLAY_NAME = data.LayerMetadata.LAYER_DISPLAY_NAME;

  var LBL = {
    EMPTY: "No edges to display. Add Source and Destination fields.",
    EXPANDED_FALLBACK: "Expanded stages require a valid Repeat Stage / Attempt Number field. Showing loop mode."
  };

  function str(v) {
    return jsx.isNull(v) || typeof v === "undefined" ? "" : String(v);
  }

  function trim(v) {
    return str(v).trim();
  }

  function num(v) {
    if (jsx.isNull(v) || typeof v === "undefined" || v === "") return null;
    var n = Number(v);
    return isNaN(n) || !isFinite(n) ? null : n;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function sanitizeHex(color, fallback) {
    var c = trim(color);
    var m3 = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) return ("#" + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase();
    if (/^#([a-f\d]{6})$/i.test(c)) return c.toLowerCase();
    if (/^rgba?\(/i.test(c)) return c;
    return fallback;
  }

  function colorWithAlpha(color, alpha, fallback) {
    var c = trim(color);
    var a = clamp(Number(alpha) || 0, 0, 1);
    var m3 = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) {
      return "rgba(" + parseInt(m3[1] + m3[1], 16) + "," + parseInt(m3[2] + m3[2], 16) + "," + parseInt(m3[3] + m3[3], 16) + "," + a + ")";
    }
    var m6 = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
    if (m6) {
      return "rgba(" + parseInt(m6[1], 16) + "," + parseInt(m6[2], 16) + "," + parseInt(m6[3], 16) + "," + a + ")";
    }
    var rgb = /^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)/i.exec(c);
    if (rgb) {
      return "rgba(" + clamp(Math.round(Number(rgb[1])), 0, 255) + "," +
        clamp(Math.round(Number(rgb[2])), 0, 255) + "," +
        clamp(Math.round(Number(rgb[3])), 0, 255) + "," + a + ")";
    }
    return fallback || c || ("rgba(120,120,120," + a + ")");
  }

  // vis-network >= 8 renders string titles with innerText, so markup must be
  // supplied as a DOM element. First line is bold, remaining lines are plain.
  function makeTitle(lines) {
    var el = document.createElement("div");
    lines.forEach(function(line, i) {
      if (i > 0) el.appendChild(document.createElement("br"));
      if (i === 0) {
        var b = document.createElement("b");
        b.textContent = str(line);
        el.appendChild(b);
      } else {
        el.appendChild(document.createTextNode(str(line)));
      }
    });
    return el;
  }

  function escHtml(s) {
    return str(s).replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Composite dictionary keys use a control character no label can contain,
  // so "A||B" + "C" and "A" + "B||C" never collide.
  var KEY_SEP = "";

  function setAdd(map, key, value) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) map[key] = {};
    if (!trim(value)) return;
    map[key][trim(value)] = true;
  }

  function firstKey(obj) {
    var keys = Object.keys(obj || {});
    return keys.length ? keys[0] : "";
  }

  function addUnique(arr, value) {
    if (arr.indexOf(value) < 0) arr.push(value);
  }

  function parseCsvColors(text) {
    return str(text).split(",")
      .map(function(part) { return sanitizeHex(part, ""); })
      .filter(function(v) { return !!v; });
  }

  function parseLegendDescriptionMap(text) {
    var out = {};
    str(text).split("|").forEach(function(token) {
      var part = trim(token);
      if (!part) return;
      var idx = part.indexOf("=");
      if (idx <= 0) return;
      var key = trim(part.slice(0, idx));
      var val = trim(part.slice(idx + 1));
      if (!key || !val) return;
      out[key] = val;
    });
    return out;
  }

  function safeGetValue(oDataLayout, edge, a, b, c) {
    try {
      if (typeof c === "undefined") return oDataLayout.getValue(edge, a, b);
      return oDataLayout.getValue(edge, a, b, c);
    } catch (e) {
      return "";
    }
  }

  function parseStageInt(value) {
    var s = trim(value);
    if (!s) return null;
    var match = s.match(/\d+/);
    if (!match) return null;
    var n = parseInt(match[0], 10);
    return isNaN(n) || !isFinite(n) ? null : Math.max(1, n);
  }

  function repeatNodeMinSize(cfg) {
    return Math.ceil((Number(cfg.repeatSize) || 26) / 2) + 4;
  }

  function repeatSelfReferenceSize(cfg, nodeSize) {
    var base = Number(cfg.repeatSize) || 26;
    var size = Math.max(base, Math.round((Number(nodeSize) || base) * 0.85));
    var attachedMax = Math.max(4, Math.round(((Number(nodeSize) || base) * 2) - 2));
    return clamp(Math.min(size, attachedMax), 4, 200);
  }

  function repeatSelfReference(cfg, nodeSize) {
    return {
      size: repeatSelfReferenceSize(cfg, nodeSize),
      angle: Math.PI / 3,
      renderBehindTheNode: false
    };
  }

  function isMissingDestinationValue(value) {
    if (value === null || typeof value === "undefined") return true;
    var s = str(value).trim();
    if (!s) return true;
    var lowered = s.toLowerCase();
    return lowered === "null" || lowered === "(null)" || lowered === "n/a" || lowered === "na";
  }

  function addRowDetails(oDataLayout, detailLayers, rowIndex) {
    var out = [];
    detailLayers.forEach(function(layer) {
      var val = trim(safeGetValue(oDataLayout, PHYS_ROW, layer.index, rowIndex, false));
      if (!val) return;
      out.push({label: layer.displayName, value: val});
    });
    return out;
  }

  function stageLabel(courseId, stageInt, cfg) {
    var base = trim(courseId);
    var stage = Math.max(1, Number(stageInt) || 1);
    var maxStage = Math.max(1, Math.floor(Number(cfg.maxExpandedRepeatStage) || 3));
    if (stage <= 1) return base;
    if (stage > maxStage && cfg.collapseOverflowRepeatStages === "on") {
      return base + " (" + trim(cfg.overflowRepeatLabel || "Repeat 3+") + ")";
    }
    return base + " (Repeat " + (stage - 1) + ")";
  }

  function toOnOff(value) {
    return value === "off" ? "off" : "on";
  }

  function pickEdgeLabel(aggEdge, cfg, outgoingByNode, edgeWeightText) {
    var useRepeatLabel = cfg.showRepeatLoopLabels === "on" &&
      cfg.repeatRenderMode === "loop" &&
      aggEdge.isSelfLoop &&
      cfg.repeatLoopLabelMode !== "off";

    if (useRepeatLabel) {
      if (cfg.repeatLoopLabelMode === "percent") {
        var denom = outgoingByNode[aggEdge.from] || 0;
        var pct = denom > 0 ? (aggEdge.weight / denom) * 100 : 0;
        return pct.toFixed(1) + "%";
      }
      return edgeWeightText;
    }

    var labels = Object.keys(aggEdge.linkLabelSet || {});
    if (labels.length === 1) return labels[0];
    return edgeWeightText;
  }

  function WsuNetworkViz(sID, sDisplayName, sOrigin, sVersion) {
    WsuNetworkViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);
    this._visInstance = null;
    this.Config = {
      stabilization: "off",
      gravity: -3200,
      springLength: 120,
      solver: "barnesHut",
      performanceMode: "auto",
      largeGraphEdgeCap: 120,
      largeGraphNodeCap: 150,
      includeNonProgressors: "on",
      missingDestinationLabel: "No Further Course",
      highlightNonProgressors: "on",
      nonProgressorColor: "#f9a825",
      nodeShape: "dot",
      minNodeSize: 8,
      maxNodeSize: 34,
      minEdgeWidth: 1,
      maxEdgeWidth: 8,
      arrows: "to",
      emphasizeRepeats: "on",
      repeatColor: "#981e32",
      repeatRoundness: 0.45,
      repeatSize: 26,
      showRepeatLoopLabels: "on",
      repeatLoopLabelMode: "count",
      repeatRenderMode: "loop",
      maxExpandedRepeatStage: 3,
      collapseOverflowRepeatStages: "on",
      overflowRepeatLabel: "Repeat 3+",
      colorSource: "oac",
      edgeColorMode: "default",
      edgeTypePalette: "",
      edgeLegendDescriptions: "",
      showEdgeTypeLegend: "off",
      edgeTypeLegendPosition: "right",
      nodeBackground: "#8a9aa5",
      nodeBorder: "#5e6a71",
      edgeColor: "rgba(94,106,113,0.5)",
      highlightColor: "#981e32",
      showNodeVolume: "on",
      showConnectorScore: "on",
      showEdgeWeight: "on",
      showEdgePassRateText: "on",
      showTerminalEdgeText: "on",
      showEdgeLabels: "on",
      hoverEffects: "on",
      dragNodes: "on"
    };
  }

  WsuNetworkViz.VERSION = "1.1.2";
  jsx.extend(WsuNetworkViz, dataviz.DataVisualization);

  WsuNetworkViz.prototype._saveSettings = function() {
    this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
  };

  WsuNetworkViz.prototype.loadConfig = function() {
    var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
    Object.keys(this.Config).forEach(function(k) {
      if (!jsx.isNull(conf[k]) && typeof conf[k] !== "undefined") this.Config[k] = conf[k];
    }, this);

    this.Config.stabilization = toOnOff(this.Config.stabilization);
    this.Config.performanceMode = this.Config.performanceMode === "interactive" || this.Config.performanceMode === "stabilized"
      ? this.Config.performanceMode : "auto";
    this.Config.solver = this.Config.solver === "forceAtlas2Based" ? "forceAtlas2Based" : "barnesHut";
    this.Config.gravity = clamp(Number(this.Config.gravity) || -3200, -5000, -1000);
    this.Config.springLength = clamp(Number(this.Config.springLength) || 120, 50, 300);
    this.Config.largeGraphEdgeCap = clamp(Math.floor(Number(this.Config.largeGraphEdgeCap) || 120), 25, 500);
    this.Config.largeGraphNodeCap = clamp(Math.floor(Number(this.Config.largeGraphNodeCap) || 150), 25, 500);
    this.Config.includeNonProgressors = toOnOff(this.Config.includeNonProgressors);
    this.Config.highlightNonProgressors = toOnOff(this.Config.highlightNonProgressors);
    this.Config.missingDestinationLabel = trim(this.Config.missingDestinationLabel) || "No Further Course";
    this.Config.nonProgressorColor = sanitizeHex(this.Config.nonProgressorColor, "#f9a825");
    this.Config.nodeShape = /^(dot|circle|box|square|triangle)$/.test(this.Config.nodeShape) ? this.Config.nodeShape : "dot";
    this.Config.minNodeSize = clamp(Number(this.Config.minNodeSize) || 8, 4, 20);
    this.Config.maxNodeSize = clamp(Number(this.Config.maxNodeSize) || 34, 20, 60);
    if (this.Config.minNodeSize > this.Config.maxNodeSize) this.Config.maxNodeSize = this.Config.minNodeSize + 2;
    this.Config.minEdgeWidth = clamp(Number(this.Config.minEdgeWidth) || 1, 0.5, 5);
    this.Config.maxEdgeWidth = clamp(Number(this.Config.maxEdgeWidth) || 8, 5, 20);
    if (this.Config.minEdgeWidth > this.Config.maxEdgeWidth) this.Config.maxEdgeWidth = this.Config.minEdgeWidth + 1;
    this.Config.arrows = /^(to|from|middle|off)$/.test(this.Config.arrows) ? this.Config.arrows : "to";
    this.Config.emphasizeRepeats = toOnOff(this.Config.emphasizeRepeats);
    this.Config.repeatColor = sanitizeHex(this.Config.repeatColor, "#981e32");
    this.Config.repeatRoundness = clamp(Number(this.Config.repeatRoundness) || 0.45, 0, 1);
    this.Config.repeatSize = clamp(Number(this.Config.repeatSize) || 26, 10, 50);
    this.Config.showRepeatLoopLabels = toOnOff(this.Config.showRepeatLoopLabels);
    this.Config.repeatLoopLabelMode = /^(count|percent|off)$/.test(this.Config.repeatLoopLabelMode) ? this.Config.repeatLoopLabelMode : "count";
    this.Config.repeatRenderMode = this.Config.repeatRenderMode === "expandedStages" ? "expandedStages" : "loop";
    this.Config.maxExpandedRepeatStage = clamp(Math.floor(Number(this.Config.maxExpandedRepeatStage) || 3), 1, 5);
    this.Config.collapseOverflowRepeatStages = toOnOff(this.Config.collapseOverflowRepeatStages);
    this.Config.overflowRepeatLabel = trim(this.Config.overflowRepeatLabel) || "Repeat 3+";
    this.Config.colorSource = this.Config.colorSource === "custom" ? "custom" : "oac";
    this.Config.edgeColorMode = this.Config.edgeColorMode === "linkLabel" ? "linkLabel" : "default";
    this.Config.edgeTypePalette = parseCsvColors(this.Config.edgeTypePalette).join(",");
    this.Config.edgeLegendDescriptions = str(this.Config.edgeLegendDescriptions);
    this.Config.showEdgeTypeLegend = toOnOff(this.Config.showEdgeTypeLegend);
    this.Config.edgeTypeLegendPosition = /^(right|top|bottom)$/.test(this.Config.edgeTypeLegendPosition)
      ? this.Config.edgeTypeLegendPosition : "right";
    this.Config.nodeBackground = sanitizeHex(this.Config.nodeBackground, "#8a9aa5");
    this.Config.nodeBorder = sanitizeHex(this.Config.nodeBorder, "#5e6a71");
    this.Config.edgeColor = sanitizeHex(this.Config.edgeColor, "rgba(94,106,113,0.5)");
    this.Config.highlightColor = sanitizeHex(this.Config.highlightColor, "#981e32");
    this.Config.showNodeVolume = toOnOff(this.Config.showNodeVolume);
    this.Config.showConnectorScore = toOnOff(this.Config.showConnectorScore);
    this.Config.showEdgeWeight = toOnOff(this.Config.showEdgeWeight);
    this.Config.showEdgePassRateText = toOnOff(this.Config.showEdgePassRateText);
    this.Config.showTerminalEdgeText = toOnOff(this.Config.showTerminalEdgeText);
    this.Config.showEdgeLabels = toOnOff(this.Config.showEdgeLabels);
    this.Config.hoverEffects = toOnOff(this.Config.hoverEffects);
    this.Config.dragNodes = toOnOff(this.Config.dragNodes);
  };

  WsuNetworkViz.prototype._layersForRowEdge = function(oDataLayout, helper) {
    var count = oDataLayout.getLayerCount(PHYS_ROW);
    var out = [];
    for (var i = 0; i < count; i++) {
      var logical = "";
      try { logical = trim(helper.getLogicalEdgeName(PHYS_ROW, i)).toLowerCase(); } catch (e) { logical = ""; }
      var display = oDataLayout.getLayerMetadata(PHYS_ROW, i, LAYER_DISPLAY_NAME) || ("Layer " + i);
      out.push({index: i, logical: logical, displayName: display});
    }
    return out;
  };

  WsuNetworkViz.prototype._resolveOacGroupColor = function(oTransientRenderingContext, helper, rowIndex) {
    try {
      var oColorContext = this.getColorContext(oTransientRenderingContext);
      var oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, datamodelshapes.Logical.COLOR);
      var colorInfo = this.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
      return colorInfo.sColor || colorInfo.sSeriesColor || "";
    } catch (e) {
      return "";
    }
  };

  WsuNetworkViz.prototype._buildRows = function(oDataLayout, oTransientRenderingContext) {
    var helper = oTransientRenderingContext.get(DCP_DATA_LAYOUT_HELPER);
    var nRows = oDataLayout.getEdgeExtent(PHYS_ROW) || 0;
    var rowLayers = this._layersForRowEdge(oDataLayout, helper);
    // The "Tooltip details" edge maps to Logical.CATEGORY, which the host reports as "detail".
    var detailLayers = rowLayers.filter(function(layer) { return layer.logical === "detail"; });
    var colorLayer = rowLayers.filter(function(layer) { return layer.logical === "color"; })[0];
    var glyphLayer = rowLayers.filter(function(layer) { return layer.logical === "glyph"; })[0];
    var sizeLayer = rowLayers.filter(function(layer) { return layer.logical === "size"; })[0];
    var out = [];
    var hasAnyValidStage = false;

    for (var r = 0; r < nRows; r++) {
      var source = trim(safeGetValue(oDataLayout, PHYS_ROW, 0, r, false));
      if (!source) continue;

      var rawDestination = safeGetValue(oDataLayout, PHYS_ROW, 1, r, false);
      var destination = trim(rawDestination);
      if (isMissingDestinationValue(rawDestination)) {
        if (this.Config.includeNonProgressors === "on") destination = this.Config.missingDestinationLabel;
        else continue;
      }
      if (!destination) continue;

      var edgeWeight = num(safeGetValue(oDataLayout, PHYS_DATA, r, 0));
      if (edgeWeight === null) edgeWeight = 1;
      var nodeSize = num(safeGetValue(oDataLayout, PHYS_DATA, r, 1));
      var groupValue = colorLayer ? trim(safeGetValue(oDataLayout, PHYS_ROW, colorLayer.index, r, false)) : "";
      var linkLabel = glyphLayer ? trim(safeGetValue(oDataLayout, PHYS_ROW, glyphLayer.index, r, false)) : "";
      var stageRaw = sizeLayer ? trim(safeGetValue(oDataLayout, PHYS_ROW, sizeLayer.index, r, false)) : "";
      var stageInt = parseStageInt(stageRaw);
      if (stageInt !== null) hasAnyValidStage = true;

      out.push({
        rowIndex: r,
        source: source,
        destination: destination,
        edgeWeight: edgeWeight,
        nodeSize: nodeSize,
        group: groupValue,
        linkLabel: linkLabel,
        stageRaw: stageRaw,
        stageInt: stageInt,
        details: addRowDetails(oDataLayout, detailLayers, r),
        oacColor: this._resolveOacGroupColor(oTransientRenderingContext, helper, r)
      });
    }

    return {
      rows: out,
      hasAnyValidStage: hasAnyValidStage
    };
  };

  WsuNetworkViz.prototype._buildModel = function(oDataLayout, oTransientRenderingContext) {
    var built = this._buildRows(oDataLayout, oTransientRenderingContext);
    var rows = built.rows;
    var note = "";
    var mode = this.Config.repeatRenderMode;
    if (mode === "expandedStages" && !built.hasAnyValidStage) {
      mode = "loop";
      note = LBL.EXPANDED_FALLBACK;
    }

    var aggEdges = Object.create(null);
    var nodeMeta = Object.create(null);
    var groupColorMap = Object.create(null);
    var colorFallback = d3.scaleOrdinal(d3.schemeTableau10);
    var edgeTypeCounts = Object.create(null);
    var edgeTypeColorMap = Object.create(null);
    var edgeTypeLegend = [];
    var edgeTypePalette = parseCsvColors(this.Config.edgeTypePalette);
    var edgeTypeColorScale = d3.scaleOrdinal(edgeTypePalette.length ? edgeTypePalette : d3.schemeTableau10);
    var legendDescMap = parseLegendDescriptionMap(this.Config.edgeLegendDescriptions);

    function ensureNodeMeta(nodeId) {
      if (!nodeMeta[nodeId]) {
        nodeMeta[nodeId] = {
          id: nodeId,
          incoming: 0,
          outgoing: 0,
          groups: [],
          groupSet: {},
          nodeSizeValues: [],
          detailValues: {},
          rows: []
        };
      }
      return nodeMeta[nodeId];
    }

    rows.forEach(function(row) {
      var from = row.source;
      var to = row.destination;
      var transformedRepeat = false;
      var stageForSource = row.stageInt;
      if (mode === "expandedStages" && row.stageInt !== null) {
        from = stageLabel(row.source, row.stageInt, this.Config);
        if (row.source === row.destination) {
          to = stageLabel(row.source, row.stageInt + 1, this.Config);
          transformedRepeat = true;
        }
      }

      var edgeKey = from + KEY_SEP + to;
      if (!aggEdges[edgeKey]) {
        aggEdges[edgeKey] = {
          key: edgeKey,
          from: from,
          to: to,
          weight: 0,
          rows: [],
          linkLabelSet: {},
          detailValues: {},
          isSelfLoop: from === to,
          isTransformedRepeat: false,
          isNonProgressor: to === this.Config.missingDestinationLabel,
          edgeType: "",
          groupValue: trim(row.group),
          groupColor: row.oacColor || ""
        };
      }

      var edge = aggEdges[edgeKey];
      edge.weight += row.edgeWeight;
      edge.isTransformedRepeat = edge.isTransformedRepeat || transformedRepeat;
      edge.isSelfLoop = edge.from === edge.to;
      edge.isNonProgressor = edge.to === this.Config.missingDestinationLabel;
      if (row.linkLabel) edge.linkLabelSet[row.linkLabel] = true;
      if (!edge.groupValue && row.group) edge.groupValue = trim(row.group);
      if (!edge.groupColor && row.oacColor) edge.groupColor = row.oacColor;
      addUnique(edge.rows, row.rowIndex);
      row.details.forEach(function(d) {
        setAdd(edge.detailValues, d.label, d.value);
      });

      if (row.group && !groupColorMap[row.group]) {
        groupColorMap[row.group] = row.oacColor || colorFallback(row.group);
      }

      var fromNode = ensureNodeMeta(from);
      var toNode = ensureNodeMeta(to);
      fromNode.outgoing += row.edgeWeight;
      toNode.incoming += row.edgeWeight;
      addUnique(fromNode.rows, row.rowIndex);
      addUnique(toNode.rows, row.rowIndex);

      if (row.group && !fromNode.groupSet[row.group]) {
        fromNode.groupSet[row.group] = true;
        fromNode.groups.push(row.group);
      }
      if (row.group && !toNode.groupSet[row.group]) {
        toNode.groupSet[row.group] = true;
        toNode.groups.push(row.group);
      }

      if (row.nodeSize !== null) {
        fromNode.nodeSizeValues.push(row.nodeSize);
        toNode.nodeSizeValues.push(row.nodeSize);
      }
      row.details.forEach(function(d) {
        setAdd(fromNode.detailValues, d.label, d.value);
        setAdd(toNode.detailValues, d.label, d.value);
      });
    }, this);

    var edges = Object.keys(aggEdges).map(function(key) { return aggEdges[key]; });
    if (!edges.length) {
      return {nodes: [], edges: [], note: note, mode: mode, edgeTypeLegend: []};
    }

    var outgoingByNode = Object.create(null);
    edges.forEach(function(edge) {
      if (!outgoingByNode[edge.from]) outgoingByNode[edge.from] = 0;
      outgoingByNode[edge.from] += edge.weight;
    });

    var edgeWeights = edges.map(function(e) { return e.weight; });
    var minEdgeWeight = d3.min(edgeWeights);
    var maxEdgeWeight = d3.max(edgeWeights);
    var edgeScale = d3.scaleLinear()
      .domain([minEdgeWeight, maxEdgeWeight])
      .range([this.Config.minEdgeWidth, this.Config.maxEdgeWidth]);

    edges.forEach(function(edge) {
      var labels = Object.keys(edge.linkLabelSet || {});
      var type = "Unlabeled";
      if (labels.length === 1) type = labels[0];
      else if (labels.length > 1) type = "Mixed Link Labels";
      edge.edgeType = type;
      edgeTypeCounts[type] = (edgeTypeCounts[type] || 0) + edge.weight;
      if (!edgeTypeColorMap[type]) edgeTypeColorMap[type] = edgeTypeColorScale(type);
    });

    var selfLoopNodeIds = Object.create(null);
    edges.forEach(function(edge) {
      if (edge.isSelfLoop) selfLoopNodeIds[edge.from] = true;
    });

    edges = edges.map(function(edge, idx) {
      var edgeWeightText = String(Math.round(edge.weight * 100) / 100);
      var label = pickEdgeLabel(edge, this.Config, outgoingByNode, edgeWeightText);
      var detailRows = Object.keys(edge.detailValues).map(function(labelName) {
        var vals = Object.keys(edge.detailValues[labelName] || {});
        return vals.length === 1 ? {label: labelName, value: vals[0]} : null;
      }).filter(function(v) { return v !== null; });

      var titleRows = [edge.from + " -> " + edge.to];
      if (this.Config.showEdgeWeight === "on") titleRows.push("N: " + edgeWeightText);
      if (this.Config.showTerminalEdgeText === "on" && edge.isNonProgressor) {
        titleRows.push("No further course in pathway scope");
      }
      if (this.Config.showEdgePassRateText === "on") {
        detailRows.forEach(function(rowDetail) {
          titleRows.push(rowDetail.label + ": " + rowDetail.value);
        });
      }

      var color = this.Config.edgeColor;
      if (edge.isSelfLoop && this.Config.emphasizeRepeats === "on" && mode === "loop") {
        color = this.Config.repeatColor;
      } else if (edge.isNonProgressor && this.Config.highlightNonProgressors === "on") {
        color = this.Config.nonProgressorColor;
      } else if (this.Config.edgeColorMode === "linkLabel") {
        color = edgeTypeColorMap[edge.edgeType] || this.Config.edgeColor;
      } else if (this.Config.colorSource === "oac" && edge.groupValue && groupColorMap[edge.groupValue]) {
        color = groupColorMap[edge.groupValue];
      }

      var smooth = edge.isSelfLoop
        ? {enabled: false}
        : {enabled: true, type: "dynamic"};

      return {
        id: "e_" + idx,
        from: edge.from,
        to: edge.to,
        // No `value`: vis-network would rescale width from it with its own
        // defaults and ignore the Min/Max Edge Width settings.
        weight: edge.weight,
        width: minEdgeWeight === maxEdgeWeight ? (this.Config.minEdgeWidth + this.Config.maxEdgeWidth) / 2 : edgeScale(edge.weight),
        label: this.Config.showEdgeLabels === "on" ? label : "",
        title: makeTitle(titleRows),
        color: {color: color},
        arrows: this.Config.arrows === "off" ? "" : this.Config.arrows,
        smooth: smooth,
        rows: edge.rows,
        isSelfLoop: edge.isSelfLoop,
        isTransformedRepeat: edge.isTransformedRepeat,
        edgeType: edge.edgeType
      };
    }, this);

    var nodeIds = Object.keys(nodeMeta);
    // Node size comes from the Node Size measure when it is consistent for the
    // node, otherwise from total incident edge weight. The scale domain must be
    // built from the same values that are scaled, so resolve them first.
    var nodeSizeValueById = Object.create(null);
    nodeIds.forEach(function(id) {
      var meta = nodeMeta[id];
      var sizeValues = meta.nodeSizeValues.filter(function(v) { return v !== null && isFinite(v); });
      var consistent = sizeValues.length > 0 && sizeValues.every(function(v) { return v === sizeValues[0]; });
      nodeSizeValueById[id] = consistent ? sizeValues[0] : (meta.incoming + meta.outgoing);
    });
    var sizeDomainValues = nodeIds.map(function(id) { return nodeSizeValueById[id]; });
    var minSizeValue = d3.min(sizeDomainValues);
    var maxSizeValue = d3.max(sizeDomainValues);
    var nodeScale = d3.scaleLinear()
      .domain([minSizeValue, maxSizeValue])
      .range([this.Config.minNodeSize, this.Config.maxNodeSize])
      .clamp(true);

    var nodes = nodeIds.map(function(nodeId) {
      var meta = nodeMeta[nodeId];
      var connector = Math.min(meta.incoming, meta.outgoing);
      var sizeValue = nodeSizeValueById[nodeId];
      var group = "";
      if (meta.groupSet.target) group = "target";
      else if (meta.groups.length) group = meta.groups[0];

      var detailRows = Object.keys(meta.detailValues).map(function(labelName) {
        var vals = Object.keys(meta.detailValues[labelName] || {});
        return vals.length === 1 ? {label: labelName, value: vals[0]} : null;
      }).filter(function(v) { return v !== null; });

      var titleRows = [nodeId];
      if (this.Config.showNodeVolume === "on") titleRows.push("Node Volume: " + (Math.round(sizeValue * 100) / 100));
      if (this.Config.showConnectorScore === "on") titleRows.push("Connector Score: " + (Math.round(connector * 100) / 100));
      detailRows.forEach(function(rowDetail) {
        titleRows.push(rowDetail.label + ": " + rowDetail.value);
      });

      var fill = this.Config.nodeBackground;
      var border = this.Config.nodeBorder;
      if (nodeId === this.Config.missingDestinationLabel && this.Config.highlightNonProgressors === "on") {
        fill = this.Config.nonProgressorColor;
      } else if (group === "target") {
        fill = this.Config.highlightColor;
        border = this.Config.highlightColor;
      } else if (this.Config.colorSource === "oac" && group && groupColorMap[group]) {
        fill = groupColorMap[group];
      }

      var nodeSize = minSizeValue === maxSizeValue ? (this.Config.minNodeSize + this.Config.maxNodeSize) / 2 : nodeScale(sizeValue);
      if (selfLoopNodeIds[nodeId]) nodeSize = Math.max(nodeSize, repeatNodeMinSize(this.Config));

      return {
        id: nodeId,
        label: nodeId,
        title: makeTitle(titleRows),
        size: nodeSize,
        shape: this.Config.nodeShape,
        color: {background: fill, border: border},
        rows: meta.rows
      };
    }, this);

    var nodeById = Object.create(null);
    nodes.forEach(function(n) { nodeById[n.id] = n; });
    edges.forEach(function(edge) {
      if (!edge.isSelfLoop) return;
      var node = nodeById[edge.from];
      edge.selfReference = repeatSelfReference(this.Config, node && node.size);
    }, this);

    edgeTypeLegend = Object.keys(edgeTypeCounts).sort().map(function(type) {
      return {
        type: type,
        color: edgeTypeColorMap[type],
        count: edgeTypeCounts[type],
        description: legendDescMap[type] || type
      };
    });

    return {
      nodes: nodes,
      edges: edges,
      note: note,
      mode: mode,
      edgeTypeLegend: edgeTypeLegend
    };
  };

  WsuNetworkViz.prototype._markRows = function(rows, oDataLayout) {
    try {
      var svc = this.getMarkingService();
      svc.clearMarksForDataLayout(oDataLayout);
      (rows || []).forEach(function(r) {
        svc.setMark(oDataLayout, PHYS_ROW, parseInt(r, 10), 0);
      });
      var evt = new interactions.MarkingEvent(this.getID(), this.getViewName(), oDataLayout, null, null);
      var router = this.getEventRouter();
      if (router) router.publish(evt);
    } catch (e) {
      _logger.warning("Marking failed: " + (e && e.message ? e.message : e));
    }
  };

  WsuNetworkViz.prototype._destroyNetwork = function() {
    if (this._visInstance && this._visInstance.destroy) {
      this._visInstance.destroy();
    }
    this._visInstance = null;
  };

  WsuNetworkViz.prototype._draw = function(elContainer, model, oDataLayout) {
    var containerId = this.getSubElementIdFromParent(elContainer, "wsuNetwork") || this.getID() || ("viz_" + Date.now());
    var rootId = "wsu_network_" + containerId.replace(/[^A-Za-z0-9_-]/g, "_");
    this._destroyNetwork();
    $(elContainer).html("<div id='" + rootId + "' class='wsu-network'><div class='network-canvas'></div><div class='edge-legend'></div><div class='subtle-note'></div></div>");
    var root = d3.select("#" + rootId);
    var canvasSel = root.select(".network-canvas");
    var canvasNode = canvasSel.node();
    var legendNode = root.select(".edge-legend");
    var noteNode = root.select(".subtle-note");

    if (!model.nodes.length || !model.edges.length) {
      root.append("div").attr("class", "empty-state").text(LBL.EMPTY);
      return;
    }

    var vis = vislib || window.vis;
    if (!vis || !vis.Network || !vis.DataSet) {
      root.append("div").attr("class", "empty-state").text("vis-network bundle unavailable.");
      return;
    }

    var shouldStabilize = this.Config.performanceMode === "stabilized" || this.Config.stabilization === "on";
    var overCap = model.edges.length > this.Config.largeGraphEdgeCap || model.nodes.length > this.Config.largeGraphNodeCap;
    if (this.Config.performanceMode === "auto" && overCap) shouldStabilize = true;
    if (model.note) noteNode.text(model.note);
    if (this.Config.performanceMode === "auto" && overCap) {
      noteNode.text((model.note ? model.note + " " : "") + "Large graph detected. Stabilizing layout for readability.");
    }

    var options = {
      nodes: {
        shape: this.Config.nodeShape,
        borderWidth: 1.5,
        font: {size: 12, face: "Arial"}
      },
      edges: {
        smooth: {enabled: true, type: "dynamic"},
        font: {align: "middle", size: 11},
        selectionWidth: 1.2
      },
      interaction: {
        hover: this.Config.hoverEffects === "on",
        dragNodes: this.Config.dragNodes === "on",
        dragView: true,
        zoomView: true,
        tooltipDelay: 80
      },
      physics: {
        enabled: true,
        solver: this.Config.solver,
        stabilization: shouldStabilize ? {enabled: true, iterations: 250, fit: true} : false,
        barnesHut: {
          gravitationalConstant: this.Config.gravity,
          springLength: this.Config.springLength
        },
        forceAtlas2Based: {
          gravitationalConstant: this.Config.gravity,
          springLength: this.Config.springLength
        }
      },
      layout: {improvedLayout: true}
    };

    var showEdgeTypeLegend = this.Config.edgeColorMode === "linkLabel" &&
      this.Config.showEdgeTypeLegend === "on" &&
      model.edgeTypeLegend &&
      model.edgeTypeLegend.length;

    if (showEdgeTypeLegend) {
      var pos = this.Config.edgeTypeLegendPosition;
      legendNode.attr("class", "edge-legend edge-legend-" + pos);
      canvasSel.attr("class", "network-canvas network-canvas-legend-" + pos);
      var legendHtml = "<div class='edge-legend-title'>Edge Type Legend</div>";
      legendHtml += model.edgeTypeLegend.map(function(item) {
        return "<div class='edge-legend-item' data-edge-type='" + escHtml(item.type) + "'>" +
          "<span class='swatch' style='background:" + escHtml(item.color) + ";'></span>" +
          "<span class='edge-legend-label'>" + escHtml(item.type) + "</span>" +
          "<span class='edge-legend-desc'>" + escHtml(item.description) + "</span>" +
          "</div>";
      }).join("");
      legendNode.html(legendHtml).style("display", "block");
    } else {
      legendNode.attr("class", "edge-legend");
      canvasSel.attr("class", "network-canvas");
      legendNode.style("display", "none");
    }

    var nodeItems = model.nodes.map(function(n) { return $.extend(true, {}, n); });
    var edgeItems = model.edges.map(function(e) { return $.extend(true, {}, e); });
    var nodeDataSet = new vis.DataSet(nodeItems);
    var edgeDataSet = new vis.DataSet(edgeItems);
    this._visInstance = new vis.Network(canvasNode, {
      nodes: nodeDataSet,
      edges: edgeDataSet
    }, options);

    var fitPadding = Math.max(
      48,
      Math.round(this.Config.maxNodeSize + repeatSelfReferenceSize(this.Config, Math.max(this.Config.maxNodeSize, repeatNodeMinSize(this.Config))) + this.Config.maxEdgeWidth + 24)
    );
    function fitWithPadding(instance) {
      if (!instance || !instance.fit) return;
      try {
        instance.fit({
          animation: false,
          padding: {
            top: fitPadding,
            right: fitPadding,
            bottom: fitPadding,
            left: fitPadding
          }
        });
      } catch (e) {}
    }

    var baseNodesById = Object.create(null);
    var baseEdgesById = Object.create(null);
    nodeItems.forEach(function(n) { baseNodesById[n.id] = $.extend(true, {}, n); });
    edgeItems.forEach(function(e) { baseEdgesById[e.id] = $.extend(true, {}, e); });
    var activeLegendType = "";
    var that = this;

    function updateLegendVisualState() {
      if (!showEdgeTypeLegend) return;
      legendNode.selectAll(".edge-legend-item")
        .classed("active", function() {
          return !!activeLegendType && this.getAttribute("data-edge-type") === activeLegendType;
        })
        .classed("inactive", function() {
          var thisType = this.getAttribute("data-edge-type");
          return !!activeLegendType && thisType !== activeLegendType;
        });
    }

    function clearLegendFocus() {
      activeLegendType = "";
      var resetNodes = Object.keys(baseNodesById).map(function(id) {
        return {
          id: id,
          color: baseNodesById[id].color
        };
      });
      var resetEdges = Object.keys(baseEdgesById).map(function(id) {
        return {
          id: id,
          color: baseEdgesById[id].color,
          width: baseEdgesById[id].width
        };
      });
      nodeDataSet.update(resetNodes);
      edgeDataSet.update(resetEdges);
      updateLegendVisualState();
    }

    function applyLegendFocus(edgeType) {
      if (!edgeType) return;
      if (activeLegendType === edgeType) {
        clearLegendFocus();
        return;
      }
      activeLegendType = edgeType;

      var highlightedEdgeIds = {};
      var highlightedNodeIds = {};
      Object.keys(baseEdgesById).forEach(function(edgeId) {
        var edge = baseEdgesById[edgeId];
        if (edge.edgeType === edgeType) {
          highlightedEdgeIds[edgeId] = true;
          highlightedNodeIds[edge.from] = true;
          highlightedNodeIds[edge.to] = true;
        }
      });

      var edgeUpdates = Object.keys(baseEdgesById).map(function(edgeId) {
        var edge = baseEdgesById[edgeId];
        var isHit = !!highlightedEdgeIds[edgeId];
        if (isHit) {
          return {
            id: edgeId,
            color: edge.color,
            width: edge.width
          };
        }
        var baseColor = edge.color && edge.color.color ? edge.color.color : that.Config.edgeColor;
        return {
          id: edgeId,
          color: {color: colorWithAlpha(baseColor, 0.12, "rgba(120,120,120,0.12)")},
          width: Math.max(0.6, (Number(edge.width) || 1) * 0.35)
        };
      });

      var nodeUpdates = Object.keys(baseNodesById).map(function(nodeId) {
        var node = baseNodesById[nodeId];
        var isHit = !!highlightedNodeIds[nodeId];
        if (isHit) {
          return {id: nodeId, color: node.color};
        }
        var baseBg = node.color && node.color.background ? node.color.background : that.Config.nodeBackground;
        var baseBorder = node.color && node.color.border ? node.color.border : that.Config.nodeBorder;
        return {
          id: nodeId,
          color: {
            background: colorWithAlpha(baseBg, 0.2, "rgba(210,214,219,0.2)"),
            border: colorWithAlpha(baseBorder, 0.3, "rgba(160,168,176,0.3)")
          }
        };
      });

      edgeDataSet.update(edgeUpdates);
      nodeDataSet.update(nodeUpdates);
      updateLegendVisualState();
    }

    if (showEdgeTypeLegend) {
      legendNode.selectAll(".edge-legend-item")
        .style("cursor", "pointer")
        .on("click", function() {
          var edgeType = this.getAttribute("data-edge-type");
          applyLegendFocus(edgeType);
        });
    }

    if (shouldStabilize) {
      var viz = this;
      this._visInstance.once("stabilizationIterationsDone", function() {
        try {
          viz._visInstance.setOptions({physics: {enabled: false}});
        } catch (e) {
          _logger.warning("Failed to disable physics post-stabilization: " + (e && e.message ? e.message : e));
        }
        fitWithPadding(viz._visInstance);
      });
    } else {
      var networkRef = this._visInstance;
      setTimeout(function() { fitWithPadding(networkRef); }, 60);
    }

    this._visInstance.on("click", function(params) {
      if (!params || ((!params.nodes || !params.nodes.length) && (!params.edges || !params.edges.length))) {
        clearLegendFocus();
        return;
      }
      if (!params.nodes || !params.nodes.length) return;
      var nodeId = params.nodes[0];
      var node = model.nodes.filter(function(n) { return n.id === nodeId; })[0];
      if (node) that._markRows(node.rows, oDataLayout);
    });

    this._visInstance.on("doubleClick", function(params) {
      if (!params || !params.edges || !params.edges.length) return;
      var edgeId = params.edges[0];
      var edge = model.edges.filter(function(e) { return e.id === edgeId; })[0];
      if (edge) that._markRows(edge.rows, oDataLayout);
    });
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
    panel.addChild(factory.createGadgetInfo(id, labelText, labelText, gvp, order));
  }

  function addSlider(panel, id, labelText, value, min, max) {
    panel.addChild(new gadgets.SliderGadgetInfo(
      id,
      labelText,
      labelText,
      new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, value, min, max)
    ));
  }

  WsuNetworkViz.prototype.doAddVizSpecificPropsDialog = function(oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
    jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
    jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
    this.loadConfig();
    var factory = this.getGadgetFactory();
    var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
    function tryPanel(id) {
      try {
        var p = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, id);
        return p || pGen;
      } catch (e) {
        return pGen;
      }
    }

    var pStyle = tryPanel("wsuNetworkStyle");
    var pInteraction = tryPanel("wsuNetworkInteraction");
    var pAxisLegend = tryPanel("wsuNetworkAxisLegend");

    var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
    var ord = {GEN: base + 100, STYLE: base + 200, INT: base + 300, LEG: base + 400};
    var nx = function(group) { return ord[group]++; };

    addToggle(pGen, "stabilizationGadget", "Layout: Stabilization", this.Config.stabilization, nx("GEN"));
    addSwitcher(pGen, "solverGadget", "Layout: Physics Mode", this.Config.solver, [
      {value: "barnesHut", label: "Barnes-Hut"},
      {value: "forceAtlas2Based", label: "ForceAtlas2Based"}
    ], nx("GEN"));
    addSwitcher(pGen, "performanceModeGadget", "Layout: Performance Mode", this.Config.performanceMode, [
      {value: "auto", label: "Auto"},
      {value: "interactive", label: "Interactive"},
      {value: "stabilized", label: "Stabilized"}
    ], nx("GEN"));
    addToggle(pGen, "emphasizeRepeatsGadget", "Repeats: Emphasize Self-Loops", this.Config.emphasizeRepeats, nx("GEN"));
    addSlider(pGen, "repeatRoundnessGadget", "Repeats: Loop Roundness", Math.round(this.Config.repeatRoundness * 100), 0, 100);
    addSlider(pGen, "repeatSizeGadget", "Repeats: Loop Size", this.Config.repeatSize, 10, 50);
    addToggle(pGen, "showRepeatLoopLabelsGadget", "Repeats: Show Loop Labels", this.Config.showRepeatLoopLabels, nx("GEN"));
    addSwitcher(pGen, "repeatLoopLabelModeGadget", "Repeats: Loop Label Mode", this.Config.repeatLoopLabelMode, [
      {value: "count", label: "Count"},
      {value: "percent", label: "Percent"},
      {value: "off", label: "Off"}
    ], nx("GEN"));
    addSwitcher(pGen, "repeatRenderModeGadget", "Repeats: Render Mode", this.Config.repeatRenderMode, [
      {value: "loop", label: "Loop"},
      {value: "expandedStages", label: "Expanded Stages"}
    ], nx("GEN"));
    addSlider(pGen, "maxExpandedRepeatStageGadget", "Repeats: Max Expanded Stage", this.Config.maxExpandedRepeatStage, 1, 5);
    addToggle(pGen, "collapseOverflowRepeatStagesGadget", "Repeats: Collapse Overflow Stages", this.Config.collapseOverflowRepeatStages, nx("GEN"));
    addText(pGen, factory, "overflowRepeatLabelGadget", "Repeats: Overflow Label", this.Config.overflowRepeatLabel, nx("GEN"));
    addToggle(pGen, "includeNonProgressorsGadget", "Terminal: Include Non-Progressors", this.Config.includeNonProgressors, nx("GEN"));
    addText(pGen, factory, "missingDestinationLabelGadget", "Terminal: Missing Destination Label", this.Config.missingDestinationLabel, nx("GEN"));
    addToggle(pGen, "highlightNonProgressorsGadget", "Terminal: Highlight Non-Progressors", this.Config.highlightNonProgressors, nx("GEN"));
    addToggle(pGen, "showNodeVolumeGadget", "Tooltip: Show Node Volume", this.Config.showNodeVolume, nx("GEN"));
    addToggle(pGen, "showConnectorScoreGadget", "Tooltip: Show Connector Score", this.Config.showConnectorScore, nx("GEN"));
    addToggle(pGen, "showEdgeWeightGadget", "Tooltip: Show Edge Weight", this.Config.showEdgeWeight, nx("GEN"));
    addToggle(pGen, "showEdgePassRateTextGadget", "Tooltip: Show Edge Pass Text", this.Config.showEdgePassRateText, nx("GEN"));
    addToggle(pGen, "showTerminalEdgeTextGadget", "Tooltip: Show Terminal Edge Text", this.Config.showTerminalEdgeText, nx("GEN"));
    addToggle(pGen, "showEdgeLabelsGadget", "Label: Show Edge Labels", this.Config.showEdgeLabels, nx("GEN"));

    addSlider(pStyle, "minNodeSizeGadget", "Nodes: Min Size", this.Config.minNodeSize, 4, 20);
    addSlider(pStyle, "maxNodeSizeGadget", "Nodes: Max Size", this.Config.maxNodeSize, 20, 60);
    addSlider(pStyle, "minEdgeWidthGadget", "Edges: Min Width", Math.round(this.Config.minEdgeWidth * 10), 5, 50);
    addSlider(pStyle, "maxEdgeWidthGadget", "Edges: Max Width", this.Config.maxEdgeWidth, 5, 20);
    addSwitcher(pStyle, "nodeShapeGadget", "Nodes: Shape", this.Config.nodeShape, [
      {value: "dot", label: "Dot"},
      {value: "circle", label: "Circle"},
      {value: "box", label: "Box"},
      {value: "square", label: "Square"},
      {value: "triangle", label: "Triangle"}
    ], nx("STYLE"));
    addSwitcher(pStyle, "colorSourceGadget", "Color: Source", this.Config.colorSource, [
      {value: "oac", label: "OAC Theme"},
      {value: "custom", label: "Custom"}
    ], nx("STYLE"));
    addSwitcher(pStyle, "edgeColorModeGadget", "Color: Edge Color Mode", this.Config.edgeColorMode, [
      {value: "default", label: "Default"},
      {value: "linkLabel", label: "By Link Label"}
    ], nx("STYLE"));
    addText(pStyle, factory, "edgeTypePaletteGadget", "Color: Edge Type Palette (hex csv)", this.Config.edgeTypePalette, nx("STYLE"));
    addText(pStyle, factory, "nodeBackgroundGadget", "Color: Node Background", this.Config.nodeBackground, nx("STYLE"));
    addText(pStyle, factory, "nodeBorderGadget", "Color: Node Border", this.Config.nodeBorder, nx("STYLE"));
    addText(pStyle, factory, "edgeColorGadget", "Color: Edge Default", this.Config.edgeColor, nx("STYLE"));
    addText(pStyle, factory, "repeatColorGadget", "Color: Repeat Highlight", this.Config.repeatColor, nx("STYLE"));
    addText(pStyle, factory, "highlightColorGadget", "Color: Target Highlight", this.Config.highlightColor, nx("STYLE"));
    addText(pStyle, factory, "nonProgressorColorGadget", "Color: Non-Progressor Terminal", this.Config.nonProgressorColor, nx("STYLE"));

    addSlider(pInteraction, "gravityGadget", "Physics: Gravity", Math.abs(this.Config.gravity), 1000, 5000);
    addSlider(pInteraction, "springLengthGadget", "Physics: Spring Length", this.Config.springLength, 50, 300);
    addToggle(pInteraction, "hoverEffectsGadget", "Interaction: Hover Effects", this.Config.hoverEffects, nx("INT"));
    addToggle(pInteraction, "dragNodesGadget", "Interaction: Drag Nodes", this.Config.dragNodes, nx("INT"));
    addSlider(pInteraction, "largeGraphEdgeCapGadget", "Interaction: Large Graph Edge Cap", this.Config.largeGraphEdgeCap, 25, 500);
    addSlider(pInteraction, "largeGraphNodeCapGadget", "Interaction: Large Graph Node Cap", this.Config.largeGraphNodeCap, 25, 500);

    addToggle(pAxisLegend, "showEdgeTypeLegendGadget", "Legend: Show Edge Type Legend", this.Config.showEdgeTypeLegend, nx("LEG"));
    addSwitcher(pAxisLegend, "edgeTypeLegendPositionGadget", "Legend: Edge Type Legend Position", this.Config.edgeTypeLegendPosition, [
      {value: "right", label: "Right"},
      {value: "top", label: "Top"},
      {value: "bottom", label: "Bottom"}
    ], nx("LEG"));
    addText(pAxisLegend, factory, "edgeLegendDescriptionsGadget", "Legend: Edge Descriptions (type=desc|...)", this.Config.edgeLegendDescriptions, nx("LEG"));

    if (WsuNetworkViz.superClass.doAddVizSpecificPropsDialog) {
      WsuNetworkViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
    }
  };

  WsuNetworkViz.prototype._addVizSpecificPropsDialog = function(oTabbedPanelsGadgetInfo) {
    this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
    WsuNetworkViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
  };

  WsuNetworkViz.prototype._handlePropChange = function(sGadgetID, oPropChange, oViewSettings, oActionContext) {
    var updateSettings = WsuNetworkViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
    if (updateSettings) return updateSettings;

    var map = {
      solverGadget: "solver",
      performanceModeGadget: "performanceMode",
      repeatLoopLabelModeGadget: "repeatLoopLabelMode",
      repeatRenderModeGadget: "repeatRenderMode",
      overflowRepeatLabelGadget: "overflowRepeatLabel",
      missingDestinationLabelGadget: "missingDestinationLabel",
      nodeShapeGadget: "nodeShape",
      colorSourceGadget: "colorSource",
      edgeColorModeGadget: "edgeColorMode",
      edgeTypePaletteGadget: "edgeTypePalette",
      nodeBackgroundGadget: "nodeBackground",
      nodeBorderGadget: "nodeBorder",
      edgeColorGadget: "edgeColor",
      repeatColorGadget: "repeatColor",
      highlightColorGadget: "highlightColor",
      nonProgressorColorGadget: "nonProgressorColor",
      edgeTypeLegendPositionGadget: "edgeTypeLegendPosition",
      edgeLegendDescriptionsGadget: "edgeLegendDescriptions"
    };
    var toggle = {
      stabilizationGadget: "stabilization",
      emphasizeRepeatsGadget: "emphasizeRepeats",
      showRepeatLoopLabelsGadget: "showRepeatLoopLabels",
      collapseOverflowRepeatStagesGadget: "collapseOverflowRepeatStages",
      includeNonProgressorsGadget: "includeNonProgressors",
      highlightNonProgressorsGadget: "highlightNonProgressors",
      showNodeVolumeGadget: "showNodeVolume",
      showConnectorScoreGadget: "showConnectorScore",
      showEdgeWeightGadget: "showEdgeWeight",
      showEdgePassRateTextGadget: "showEdgePassRateText",
      showTerminalEdgeTextGadget: "showTerminalEdgeText",
      showEdgeLabelsGadget: "showEdgeLabels",
      hoverEffectsGadget: "hoverEffects",
      dragNodesGadget: "dragNodes",
      showEdgeTypeLegendGadget: "showEdgeTypeLegend"
    };
    var slider = {
      repeatRoundnessGadget: "repeatRoundness",
      repeatSizeGadget: "repeatSize",
      maxExpandedRepeatStageGadget: "maxExpandedRepeatStage",
      minNodeSizeGadget: "minNodeSize",
      maxNodeSizeGadget: "maxNodeSize",
      minEdgeWidthGadget: "minEdgeWidth",
      maxEdgeWidthGadget: "maxEdgeWidth",
      gravityGadget: "gravity",
      springLengthGadget: "springLength",
      largeGraphEdgeCapGadget: "largeGraphEdgeCap",
      largeGraphNodeCapGadget: "largeGraphNodeCap"
    };

    if (toggle[sGadgetID]) {
      this.Config[toggle[sGadgetID]] = oPropChange.checked ? "on" : "off";
    } else if (map[sGadgetID]) {
      this.Config[map[sGadgetID]] = oPropChange.value;
    } else if (slider[sGadgetID]) {
      this.Config[slider[sGadgetID]] = oPropChange.value;
      if (sGadgetID === "gravityGadget") this.Config.gravity = -Math.abs(Number(oPropChange.value));
      if (sGadgetID === "repeatRoundnessGadget") this.Config.repeatRoundness = Number(oPropChange.value) / 100;
      if (sGadgetID === "minEdgeWidthGadget") this.Config.minEdgeWidth = Number(oPropChange.value) / 10;
    } else {
      return false;
    }

    if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
    else this._saveSettings();
    return true;
  };

  WsuNetworkViz.prototype._render = function(oTransientRenderingContext) {
    try {
      this.loadConfig();
      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      var container = this.getContainerElem();
      if (!container || !oDataLayout) return;
      var model = this._buildModel(oDataLayout, oTransientRenderingContext);
      this._draw(container, model, oDataLayout);
    } catch (e) {
      _logger.warning("Render failed: " + (e && e.message ? e.message : e));
      $(this.getContainerElem()).html("<div class='wsu-network'><div class='empty-state'>Render failed: " + escHtml(e && e.message ? e.message : e) + "</div></div>");
    } finally {
      this._setIsRendered(true);
    }
  };

  WsuNetworkViz.prototype.render = function(oTransientRenderingContext) {
    this._render(oTransientRenderingContext);
  };

  WsuNetworkViz.prototype._doInitializeComponent = function() {
    WsuNetworkViz.superClass._doInitializeComponent.call(this);
    this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
  };

  WsuNetworkViz.prototype._doStopComponent = function() {
    this._destroyNetwork();
    WsuNetworkViz.superClass._doStopComponent.apply(this, arguments);
  };

  WsuNetworkViz.prototype._onDefaultColorsSettingsChanged = function() {
    var oTransientVizContext = this.assertOrCreateVizContext();
    this._render(this.createRenderingContext(oTransientVizContext));
  };

  function createClientComponent(sID, sDisplayName, sOrigin) {
    return new WsuNetworkViz(sID, sDisplayName, sOrigin, WsuNetworkViz.VERSION);
  }

  return {createClientComponent: createClientComponent};
});
