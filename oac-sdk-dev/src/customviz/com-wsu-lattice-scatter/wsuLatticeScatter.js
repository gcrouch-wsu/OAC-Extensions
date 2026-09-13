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
        'skin!css!com-wsu-lattice-scatter/wsuLatticeScatterstyles'],
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

  var MODULE_NAME = "com-wsu-lattice-scatter/wsuLatticeScatter";
  jsx.assertAllNotNullExceptLastN(arguments, MODULE_NAME + " arguments", 1);

  var _logger = new logger.Logger(MODULE_NAME);
  _logger.info("Initializing WSU Lattice Scatter plugin");

  jsx.assertObject(datamodelshapes.Physical, MODULE_NAME + " datamodelshapes.Physical");
  jsx.assertObject(datamodelshapes.Logical, MODULE_NAME + " datamodelshapes.Logical");
  jsx.assertObject(dataviz.SettingsNS, MODULE_NAME + " dataviz.SettingsNS");
  jsx.assertObject(dataviz.DataContextProperty, MODULE_NAME + " dataviz.DataContextProperty");
  jsx.assertObject(data.LayerMetadata, MODULE_NAME + " data.LayerMetadata");

  var PHYS_DATA = datamodelshapes.Physical.DATA;
  var PHYS_ROW = datamodelshapes.Physical.ROW;
  var LOGICAL_COLOR = datamodelshapes.Logical.COLOR;
  var SETTINGS_CHART = dataviz.SettingsNS.CHART;
  // Fallback parse order is fixed; dataset term sort keys remain authoritative.
  var TERM_PARSE_FALLBACK_ORDER = "spring-summer-fall";
  var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
  var DCP_DATA_LAYOUT_HELPER = dataviz.DataContextProperty.DATA_LAYOUT_HELPER;
  var LAYER_DISPLAY_NAME = data.LayerMetadata.LAYER_DISPLAY_NAME;

  var LETTER_TO_POINTS = {
    "A": 4.0, "A-": 3.7, "B+": 3.3, "B": 3.0, "B-": 2.7,
    "C+": 2.3, "C": 2.0, "C-": 1.7, "D+": 1.3, "D": 1.0, "F": 0.0
  };

  var LBL = {
    EMPTY: "No rows to display. Add Course (Y), Term (X), and optional grade fields.",
    ELIGIBLE: "Progress Eligible",
    BLOCKED: "Progress Blocked",
    TT_STUDENT: "Student",
    TT_COURSE: "Course",
    TT_TERM: "Term",
    TT_GRADE: "Grade",
    X_TITLE: "Term",
    Y_TITLE: "Course"
  };

  function str(v) {
    if (jsx.isNull(v) || typeof v === "undefined") return "";
    return String(v);
  }

  function esc(v) {
    return str(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(v) {
    if (v === null || typeof v === "undefined" || str(v).trim() === "") return null;
    var n = Number(v);
    return isNaN(n) || !isFinite(n) ? null : n;
  }

  function compareText(a, b) {
    return str(a).localeCompare(str(b), undefined, {numeric: true, sensitivity: "base"});
  }

  function truncateLabel(text, maxLen) {
    var s = str(text);
    if (s.length <= maxLen) return s;
    return s.substring(0, Math.max(1, maxLen - 1)) + "…";
  }

  function tokenizedLower(text) {
    return str(text).toLowerCase().replace(/[_\W]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizedFieldName(text) {
    return tokenizedLower(text);
  }

  function containsAny(text, tokens) {
    var t = tokenizedLower(text);
    return tokens.some(function(tok) { return t.indexOf(tok) >= 0; });
  }

  function dashArrayFor(pattern, width) {
    var w = Math.max(Number(width) || 2, 1);
    if (pattern === "dashed") return (w * 3) + " " + (w * 2);
    if (pattern === "dotted") return (w * 1) + " " + (w * 1.8);
    return null;
  }

  function symbolType(name) {
    switch (name) {
      case "square": return d3.symbolSquare;
      case "triangle": return d3.symbolTriangle;
      case "diamond": return d3.symbolDiamond;
      case "cross": return d3.symbolCross;
      case "star": return d3.symbolStar;
      default: return d3.symbolCircle;
    }
  }

  function colorWithAlpha(color, alpha, fallback) {
    var c = str(color).trim();
    var a = Math.max(0, Math.min(1, alpha));
    var m3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) {
      return "rgba(" +
        parseInt(m3[1] + m3[1], 16) + "," +
        parseInt(m3[2] + m3[2], 16) + "," +
        parseInt(m3[3] + m3[3], 16) + "," + a + ")";
    }
    var m6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
    if (m6) {
      return "rgba(" +
        parseInt(m6[1], 16) + "," +
        parseInt(m6[2], 16) + "," +
        parseInt(m6[3], 16) + "," + a + ")";
    }
    var rgb = /^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+))?\s*\)$/i.exec(c);
    if (rgb) {
      var r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
      var g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
      var b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    if (typeof fallback === "string" && fallback) return fallback;
    return c;
  }

  function sanitizeHexColor(color, fallback) {
    var c = str(color).trim();
    var m3 = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
    if (m3) return ("#" + m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase();
    if (/^#([a-f\d]{6})$/i.test(c)) return c.toLowerCase();
    return fallback;
  }

  function safeDisplayColor(color, fallback) {
    var c = str(color).trim();
    var lower = c.toLowerCase();
    if (!c) return fallback;
    if (lower === "null" || lower === "undefined" || lower === "nan") return fallback;
    if (/^#([a-f\d]{3}|[a-f\d]{6})$/i.test(c)) return c;
    if (/^rgba?\(/i.test(c)) return c;
    if (/^hsla?\(/i.test(c)) return c;
    if (/^var\(\s*--[A-Za-z0-9_-]+\s*\)$/i.test(c)) return c;
    try {
      if (typeof CSS !== "undefined" && CSS && typeof CSS.supports === "function") {
        if (CSS.supports("color", c)) return c;
      }
    } catch (ignore) {
      // Ignore host CSS API issues and continue with safe fallback checks.
    }
    if (/^(transparent|currentcolor|inherit|initial|unset|revert)$/i.test(c)) return c;
    return fallback;
  }

  function seasonOrderMap(mode) {
    return mode === "fall-spring-summer"
      ? {fall: 1, spring: 2, summer: 3, winter: 4}
      : {spring: 1, summer: 2, fall: 3, winter: 4};
  }

  function seasonFromToken(tok) {
    var t = str(tok).toLowerCase();
    if (t === "sp" || t === "spr" || t === "spring") return "spring";
    if (t === "su" || t === "sum" || t === "summer") return "summer";
    if (t === "fa" || t === "fall" || t === "aut" || t === "autumn") return "fall";
    if (t === "wi" || t === "win" || t === "winter") return "winter";
    return "";
  }

  function parseTermLabel(termLabel, mode) {
    var s = str(termLabel);
    var order = seasonOrderMap(mode);
    var mCode1 = /(\d{4})\s*[-_ ]?\s*(SP|SU|FA|WI)\b/i.exec(s);
    if (mCode1) {
      var s1 = seasonFromToken(mCode1[2]);
      if (s1) return {year: Number(mCode1[1]), season: order[s1] || 99};
    }
    var mCode2 = /\b(SP|SU|FA|WI)\s*[-_ ]?(\d{2,4})\b/i.exec(s);
    if (mCode2) {
      var yy = Number(mCode2[2]);
      if (yy < 100) yy += 2000;
      var s2 = seasonFromToken(mCode2[1]);
      if (s2) return {year: yy, season: order[s2] || 99};
    }
    var m = /(\d{4})\s*(spring|summer|fall|winter)/i.exec(s);
    if (m) return {year: Number(m[1]), season: order[str(m[2]).toLowerCase()] || 99};
    var mRev = /(spring|summer|fall|winter)\s*(\d{4})/i.exec(s);
    if (mRev) return {year: Number(mRev[2]), season: order[str(mRev[1]).toLowerCase()] || 99};
    return null;
  }

  function WsuLatticeScatterViz(sID, sDisplayName, sOrigin, sVersion) {
    WsuLatticeScatterViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);
    this.Config = {
      markerShape: "grade-letter",
      markerSize: 11,
      xSortDirection: "asc",
      ySortDirection: "asc",
      progressThreshold: 1.7,
      gradeFontSize: 13,
      gradeFontBold: "off",
      gradeFontItalic: "off",
      gradeFontUnderline: "off",
      gradeBackground: "none",
      outlineShade: 85,
      colorSource: "oac",
      customGradeColor: "#1e88e5",
      xAxisTitle: "",
      yAxisTitle: "",
      gridlines: "on"
    };
  }

  WsuLatticeScatterViz.VERSION = "1.1.0";
  jsx.extend(WsuLatticeScatterViz, dataviz.DataVisualization);

  WsuLatticeScatterViz.prototype._saveSettings = function() {
    this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
  };

  WsuLatticeScatterViz.prototype.loadConfig = function() {
    var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
    Object.keys(this.Config).forEach(function(k) {
      if (!jsx.isNull(conf[k]) && typeof conf[k] !== "undefined") this.Config[k] = conf[k];
    }, this);
    this.Config.markerSize = Math.max(6, Math.min(30, Number(this.Config.markerSize) || 11));
    this.Config.progressThreshold = Number(this.Config.progressThreshold);
    if (isNaN(this.Config.progressThreshold)) this.Config.progressThreshold = 1.7;
    this.Config.gradeFontSize = Math.max(8, Math.min(22, Number(this.Config.gradeFontSize) || 13));
    this.Config.outlineShade = Number(this.Config.outlineShade);
    if (isNaN(this.Config.outlineShade)) this.Config.outlineShade = 85;
    this.Config.outlineShade = Math.max(20, Math.min(100, this.Config.outlineShade));
    this.Config.customGradeColor = sanitizeHexColor(this.Config.customGradeColor, "#1e88e5");
  };

  WsuLatticeScatterViz.prototype._gradePoints = function(p) {
    var gp = num(p.gradePoints);
    if (gp !== null) return gp;
    var gl = str(p.gradeLetter).toUpperCase();
    return Object.prototype.hasOwnProperty.call(LETTER_TO_POINTS, gl) ? LETTER_TO_POINTS[gl] : null;
  };

  WsuLatticeScatterViz.prototype._progressStatus = function(p) {
    var letter = str(p.gradeLetter).toUpperCase();
    if (letter === "W" || letter === "I" || letter === "IP") return LBL.BLOCKED;
    var gp = this._gradePoints(p);
    if (gp === null) return LBL.BLOCKED;
    return gp >= this.Config.progressThreshold ? LBL.ELIGIBLE : LBL.BLOCKED;
  };

  // "IP" (in progress) is only shown when the row carries neither a letter nor
  // grade points. A missing letter with real points renders the points; a
  // missing measure with a real letter renders the letter (or its point value).
  WsuLatticeScatterViz.prototype._markerLabel = function(p) {
    var l = str(p.gradeLetter).trim().toUpperCase();
    var gp = this._gradePoints(p);
    if (this.Config.markerShape === "grade-letter") {
      if (l) return l;
      return gp === null ? "IP" : gp.toFixed(1);
    }
    if (this.Config.markerShape === "grade-points") {
      if (l === "W" || l === "I" || l === "IP") return l;
      if (gp !== null) return gp.toFixed(1);
      return l || "IP";
    }
    return "";
  };

  WsuLatticeScatterViz.prototype._sortTerms = function(vals, sortMap) {
    function sortValue(map, key) {
      if (!map || typeof map[key] === "undefined" || map[key] === null) return null;
      var raw = map[key];
      if (typeof raw === "object" && raw !== null && typeof raw.value !== "undefined") return raw.value;
      return raw;
    }
    var termMode = TERM_PARSE_FALLBACK_ORDER;
    var a = vals.slice().sort(function(v1, v2) {
      var n1 = sortValue(sortMap, v1), n2 = sortValue(sortMap, v2);
      var both = typeof n1 === "number" && typeof n2 === "number" && !isNaN(n1) && !isNaN(n2);
      if (both && n1 !== n2) return n1 - n2;
      var p1 = parseTermLabel(v1, termMode);
      var p2 = parseTermLabel(v2, termMode);
      if (p1 && p2) {
        if (p1.year !== p2.year) return p1.year - p2.year;
        if (p1.season !== p2.season) return p1.season - p2.season;
      }
      return compareText(v1, v2);
    });
    if (this.Config.xSortDirection === "desc") a.reverse();
    return a;
  };

  WsuLatticeScatterViz.prototype._sortCourses = function(vals, sortMap) {
    function sortValue(map, key) {
      if (!map || typeof map[key] === "undefined" || map[key] === null) return null;
      var raw = map[key];
      if (typeof raw === "object" && raw !== null && typeof raw.value !== "undefined") return raw.value;
      return raw;
    }
    function parseCatalog(v) {
      var s = str(v);
      var m = /([A-Za-z&]+)\s*[-]?\s*(\d{2,4})/.exec(s);
      if (m) {
        var n1 = Number(m[2]);
        return {dept: str(m[1]).toUpperCase(), num: isNaN(n1) ? null : n1};
      }
      var all = s.match(/(\d{2,4})/g);
      if (!all || !all.length) return null;
      var n = Number(all[all.length - 1]);
      return {dept: "", num: isNaN(n) ? null : n};
    }
    var a = vals.slice().sort(function(v1, v2) {
      var n1 = sortValue(sortMap, v1), n2 = sortValue(sortMap, v2);
      var both = typeof n1 === "number" && typeof n2 === "number" && !isNaN(n1) && !isNaN(n2);
      if (both && n1 !== n2) return n1 - n2;
      var c1 = parseCatalog(v1), c2 = parseCatalog(v2);
      if (c1 && c2) {
        if (c1.dept !== c2.dept) return compareText(c1.dept, c2.dept);
        if (c1.num !== null && c2.num !== null && c1.num !== c2.num) return c1.num - c2.num;
      }
      return compareText(v1, v2);
    });
    if (this.Config.ySortDirection === "desc") a.reverse();
    return a;
  };

  WsuLatticeScatterViz.prototype._detectLayerRole = function(logicalKey, displayName) {
    var key = str(logicalKey);
    if (key) return key;
    var name = tokenizedLower(displayName);
    if (containsAny(name, ["term"])) return "item";
    if (containsAny(name, ["course"])) return "row";
    if (containsAny(name, ["student"])) return "color";
    if (containsAny(name, ["grade"])) return "glyph";
    return "";
  };

  WsuLatticeScatterViz.prototype._resolveThemeColor = function(oTransientRenderingContext, helper, rowIndex) {
    try {
      var oColorContext = this.getColorContext(oTransientRenderingContext);
      var oColorInterpolator = this.getCachedColorInterpolator(oTransientRenderingContext, LOGICAL_COLOR);
      var colorInfo = this.getDataItemColorInfo(helper, oColorContext, oColorInterpolator, rowIndex, 0);
      return colorInfo.sColor || colorInfo.sSeriesColor || "";
    } catch (e) {
      return "";
    }
  };

  WsuLatticeScatterViz.prototype._generateData = function(oDataLayout, oTransientRenderingContext) {
    var oDataModel = this.getRootDataModel();
    if (!oDataModel || !oDataLayout) return null;
    var helper = oTransientRenderingContext.get(DCP_DATA_LAYOUT_HELPER);
    var nRows = oDataLayout.getEdgeExtent(PHYS_ROW);
    var nRowLayerCount = oDataLayout.getLayerCount(PHYS_ROW);
    var layers = [];
    for (var i = 0; i < nRowLayerCount; i++) {
      var logical = "";
      try { logical = helper.getLogicalEdgeName(PHYS_ROW, i); } catch (e) { logical = ""; }
      var display = oDataLayout.getLayerMetadata(PHYS_ROW, i, LAYER_DISPLAY_NAME) || logical || ("Layer " + i);
      layers.push({index: i, logical: this._detectLayerRole(logical, display), displayName: display});
    }

    var useOacColor = this.Config.colorSource !== "custom";
    var points = [];
    // The Class Grade Points measure is optional (minCount 0): do not touch the
    // data edge when it is absent.
    var hasMeasure = false;
    try { hasMeasure = (oDataLayout.getEdgeExtent(PHYS_DATA) || 0) > 0; } catch (e) { hasMeasure = false; }
    for (var row = 0; row < Math.max(nRows, 0); row++) {
      var p = {
        row: row,
        course: "",
        term: "",
        studentId: "",
        gradeLetter: "",
        gradePoints: null,
        termSort: null,
        courseSort: null,
        details: [],
        color: ""
      };

      layers.forEach(function(layer) {
        var value = str(oDataLayout.getValue(PHYS_ROW, layer.index, row, false));
        if (layer.logical === "row") p.course = value;
        else if (layer.logical === "item") p.term = value;
        else if (layer.logical === "color") p.studentId = value;
        else if (layer.logical === "glyph") {
          if (!p.gradeLetter) p.gradeLetter = value;
        } else if (layer.logical === "size") {
          // Dedicated "Sorting Term Code" bucket (categorical placement).
          var sizeSort = num(value);
          if (sizeSort !== null) p.termSort = sizeSort;
        } else {
          p.details.push({label: layer.displayName, value: value});
        }
      });

      if (hasMeasure) {
        var m = num(oDataLayout.getValue(PHYS_DATA, row, 0));
        if (m !== null) p.gradePoints = m;
      }

      // Try to infer common semantic fields from detail labels.
      p.details.forEach(function(d) {
        var lab = normalizedFieldName(d.label);
        if ((lab === "student id" || lab === "student" || lab === "student id key" || lab === "student_id") && !p.studentId) p.studentId = d.value;
        if (lab === "grade code" || lab === "target grade code" || lab === "official letter grade" || lab === "letter grade") {
          if (!p.gradeLetter) p.gradeLetter = d.value;
        }
        // Only a fallback: the dedicated "Sorting Term Code" bucket (size edge) wins when present.
        if (p.termSort === null && (lab === "target term sort" || lab === "target term index" || lab === "term sort key" || lab === "academic term index" || lab === "term index" || lab === "term sort" || lab === "term code" || lab === "strm")) {
          var t = num(d.value);
          if (t !== null) p.termSort = t;
        }
        if (lab === "course sort order" || lab === "course sort" || lab === "course order" || lab === "catalog sort") {
          var c = num(d.value);
          if (c !== null) p.courseSort = c;
        }
      });

      if (useOacColor) p.color = this._resolveThemeColor(oTransientRenderingContext, helper, row);

      p.course = p.course || ("Course " + (row + 1));
      p.term = p.term || ("Term " + (row + 1));
      if (!p.studentId) {
        p.studentId = ("Row " + (row + 1));
      }
      points.push(p);
    }
    return points;
  };

  WsuLatticeScatterViz.prototype._dynamicContainerSize = function(points, labels) {
    var bg = this.Config.gradeBackground;
    if (bg === "none") return this.Config.markerSize;
    var longest = "";
    labels.forEach(function(label) {
      if (str(label).length > longest.length) longest = str(label);
    });
    var fontSize = this.Config.gradeFontSize;
    var charWidth = fontSize * 0.62;
    var width = Math.max(1, longest.length) * charWidth + (this.Config.markerSize * 0.8);
    var height = fontSize * 1.35 + (this.Config.markerSize * 0.8);
    if (bg === "circle-outline" || bg === "circle-fill") return Math.ceil(Math.sqrt(width * width + height * height));
    return Math.ceil(Math.max(width, height));
  };

  WsuLatticeScatterViz.prototype._tooltipHtml = function(point) {
    var detailRows = [];
    (point.details || []).forEach(function(d) {
      var label = str(d && d.label).trim();
      if (!label) return;
      detailRows.push([label, d && d.value]);
    });
    if (!detailRows.length) return "";
    return "<table>" + detailRows.map(function(r) {
      return "<tr><td class='tthead'>" + esc(r[0]) + "</td><td class='ttval'>" + esc(r[1]) + "</td></tr>";
    }).join("") + "</table>";
  };

  WsuLatticeScatterViz.prototype._moveTooltip = function(tooltip, event) {
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
    // A tooltip wider/taller than the space on either side would flip to a
    // negative coordinate; keep it on-screen instead.
    var minX = window.pageXOffset + 8;
    var minY = window.pageYOffset + 8;
    if (left < minX) left = minX;
    if (top < minY) top = minY;
    tooltip.style("left", left + "px").style("top", top + "px");
  };

  WsuLatticeScatterViz.prototype._markRow = function(point, oDataLayout) {
    try {
      var svc = this.getMarkingService();
      svc.clearMarksForDataLayout(oDataLayout);
      var measureCount = 0;
      try { measureCount = oDataLayout.getEdgeExtent(PHYS_DATA) || 0; } catch (e) { measureCount = 0; }
      if (measureCount > 0) {
        svc.setMark(oDataLayout, PHYS_DATA, parseInt(point.row, 10), 0);
      } else {
        var rowCount = 0;
        try { rowCount = oDataLayout.getEdgeExtent(PHYS_ROW) || 0; } catch (ignore) { rowCount = 0; }
        if (rowCount > 0) {
          // Fall back to category-edge marking so click interactions still work without measures.
          svc.setMark(oDataLayout, PHYS_ROW, parseInt(point.row, 10), 0);
        } else {
          _logger.warning("Mark skipped: no markable edge present in current data layout.");
          return;
        }
      }
      var evt = new interactions.MarkingEvent(this.getID(), this.getViewName(), oDataLayout, null, null);
      var router = this.getEventRouter();
      if (router) router.publish(evt);
    } catch (e) {
      _logger.warning("Marking failed: " + (e && e.message ? e.message : e));
    }
  };

  WsuLatticeScatterViz.prototype._draw = function(elContainer, points, oDataLayout) {
    var oViz = this;
    var containerId = this.getSubElementIdFromParent(elContainer, "wsuLattice") || this.getID() || ("viz_" + Date.now());
    var rootId = "wsu_lattice_" + containerId.replace(/[^A-Za-z0-9_-]/g, "_");
    $(elContainer).html("<div id='" + rootId + "' class='wsu-lattice'></div>");
    var root = d3.select("#" + rootId);
    var width = Math.max($(elContainer).width(), 420);
    var height = Math.max($(elContainer).height(), 280);

    var termsUnique = {};
    var coursesUnique = {};
    var termSortMap = {};
    var courseSortMap = {};
    var termSortConflictWarned = false;
    var courseSortConflictWarned = false;
    function mergeSortValue(map, key, n, onConflict) {
      if (typeof n !== "number" || isNaN(n)) return;
      if (!map[key]) {
        map[key] = {value: n, conflict: false};
        return;
      }
      if (map[key].value !== n) {
        map[key].conflict = true;
        map[key].value = Math.min(map[key].value, n);
        if (onConflict) onConflict(key, map[key].value, n);
      }
    }
    points.forEach(function(p) {
      termsUnique[p.term] = true;
      coursesUnique[p.course] = true;
      mergeSortValue(termSortMap, p.term, p.termSort, function(term, a, b) {
        if (termSortConflictWarned) return;
        termSortConflictWarned = true;
        _logger.warning("Conflicting term sort values detected; using minimum value fallback.");
      });
      mergeSortValue(courseSortMap, p.course, p.courseSort, function(course, a, b) {
        if (courseSortConflictWarned) return;
        courseSortConflictWarned = true;
        _logger.warning("Conflicting course sort values detected; using minimum value fallback.");
      });
    });
    var terms = this._sortTerms(Object.keys(termsUnique), termSortMap);
    var courses = this._sortCourses(Object.keys(coursesUnique), courseSortMap);

    var longestCourse = courses.reduce(function(mx, c) { return Math.max(mx, str(c).length); }, 8);
    var xDensity = terms.length > 0 ? (width / Math.max(terms.length, 1)) : width;
    var xRotate = xDensity < 75 ? -45 : (xDensity < 115 ? -25 : 0);
    var yLabelMax = 24;

    var margin = {
      top: 20,
      right: 20,
      bottom: xRotate === -45 ? 98 : (xRotate === -25 ? 82 : 68),
      left: Math.max(140, Math.min(250, 48 + (Math.min(longestCourse, yLabelMax) * 6)))
    };
    var innerWidth = Math.max(120, width - margin.left - margin.right);
    var innerHeight = Math.max(120, height - margin.top - margin.bottom);

    var svg = root.append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", "0 0 " + width + " " + height);

    var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    var x = d3.scaleBand().domain(terms).range([0, innerWidth]).padding(0.2);
    var y = d3.scaleBand().domain(courses).range([0, innerHeight]).padding(0.24);
    var customBaseColor = sanitizeHexColor(this.Config.customGradeColor, "#1e88e5");
    var themeBaseColorRaw = (points.find(function(p) { return !!p.color; }) || {}).color;
    var themeBaseColor = this.Config.colorSource === "custom"
      ? customBaseColor
      : safeDisplayColor(themeBaseColorRaw, "#1e88e5");
    var rowBandEvenFill = colorWithAlpha(themeBaseColor, 0.07, "rgba(32,33,36,0.04)");
    var rowBandOddFill = colorWithAlpha(themeBaseColor, 0.02, "rgba(32,33,36,0.01)");

    // Alternating row bands improve scanability in long course lists.
    g.append("g").attr("class", "row-bands")
      .selectAll("rect")
      .data(courses)
      .enter()
      .append("rect")
      .attr("x", 0)
      .attr("y", function(c) { return y(c); })
      .attr("width", innerWidth)
      .attr("height", y.bandwidth())
      .attr("class", function(c, i) { return (i % 2 === 0) ? "row-band-even" : "row-band-odd"; })
      .attr("fill", function(c, i) { return (i % 2 === 0) ? rowBandEvenFill : rowBandOddFill; });

    if (this.Config.gridlines !== "off") {
      g.append("g").attr("class", "grid")
        .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(function() { return ""; }));
    }
    var xAxis = g.append("g").attr("class", "axis")
      .attr("transform", "translate(0," + innerHeight + ")")
      .call(d3.axisBottom(x));
    xAxis.selectAll("text")
      .attr("transform", "rotate(" + xRotate + ")")
      .style("text-anchor", xRotate === 0 ? "middle" : "end");

    var yAxis = g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickFormat(function(c) {
      return truncateLabel(c, yLabelMax);
    }));
    yAxis.selectAll("text").append("title").text(function(c) { return str(c); });

    g.append("text")
      .attr("class", "axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 66)
      .attr("text-anchor", "middle")
      .text(this.Config.xAxisTitle || LBL.X_TITLE);

    g.append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -110)
      .attr("text-anchor", "middle")
      .text(this.Config.yAxisTitle || LBL.Y_TITLE);

    var warningText = [];
    if (termSortConflictWarned) warningText.push("conflicting term sort values detected");
    if (courseSortConflictWarned) warningText.push("conflicting course sort values detected");
    if (warningText.length) {
      g.append("text")
        .attr("class", "warning-text")
        .attr("x", 0)
        .attr("y", -4)
        .text(warningText.join(" | "));
    }

    var tooltip = d3.select("body").selectAll("#" + rootId + "_tooltip").data([null]);
    tooltip = tooltip.enter().append("div").attr("id", rootId + "_tooltip").attr("class", "wsu-lattice-tooltip").merge(tooltip);
    this._tooltipId = rootId + "_tooltip";

    var isGradeMarker = this.Config.markerShape === "grade-letter" || this.Config.markerShape === "grade-points";
    var labels = points.map(function(p) { return oViz._markerLabel(p); });
    var containerSize = this._dynamicContainerSize(points, labels);
    var outlineAlpha = this.Config.outlineShade / 100;

    var rows = g.selectAll(".lattice-point").data(points, function(d) { return d.row; });
    var enter = rows.enter().append("g").attr("class", "lattice-point");
    var merged = enter.merge(rows);
    rows.exit().remove();

    merged.each(function(point) {
      var group = d3.select(this);
      var blocked = oViz._progressStatus(point) === LBL.BLOCKED;
      group.classed("progress-blocked", blocked).classed("progress-eligible", !blocked)
        .attr("data-progress", blocked ? "blocked" : "eligible");
      var cx = x(point.term) + x.bandwidth() / 2;
      var cyBase = y(point.course) + y.bandwidth() / 2;
      var cy = cyBase;
      var customColor = sanitizeHexColor(oViz.Config.customGradeColor, "#1e88e5");
      var oacColor = safeDisplayColor(point.color, themeBaseColor);
      var color = oViz.Config.colorSource === "custom" ? customColor : oacColor;
      var strokeColor = colorWithAlpha(color, outlineAlpha, "rgba(32,33,36,0.45)");
      var bg = oViz.Config.gradeBackground;
      var bgFill = "rgba(0,0,0,0)";
      var bgStroke = strokeColor;
      var bgStrokeWidth = 0;
      var bgShape = "circle";

      group.selectAll("*").remove();

      if (isGradeMarker) {
        if (bg === "circle-outline") { bgShape = "circle"; bgStrokeWidth = 2; }
        else if (bg === "circle-fill") { bgShape = "circle"; bgStrokeWidth = 2; bgFill = colorWithAlpha(color, 0.18, "rgba(32,33,36,0.12)"); }
        else if (bg === "square-outline") { bgShape = "square"; bgStrokeWidth = 2; }
        else if (bg === "square-fill") { bgShape = "square"; bgStrokeWidth = 2; bgFill = colorWithAlpha(color, 0.18, "rgba(32,33,36,0.12)"); }

        if (bgStrokeWidth > 0) {
          if (bgShape === "circle") {
            group.append("circle")
              .attr("class", "point-bg")
              .attr("cx", cx).attr("cy", cy)
              .attr("r", containerSize / 2)
              .attr("fill", bgFill)
              .attr("stroke", bgStroke)
              .attr("stroke-width", bgStrokeWidth);
          } else {
            group.append("rect")
              .attr("class", "point-bg")
              .attr("x", cx - containerSize / 2).attr("y", cy - containerSize / 2)
              .attr("width", containerSize).attr("height", containerSize)
              .attr("fill", bgFill)
              .attr("stroke", bgStroke)
              .attr("stroke-width", bgStrokeWidth);
          }
        }

        group.append("text")
          .attr("class", "point-label")
          .attr("x", cx).attr("y", cy)
          .style("font-size", oViz.Config.gradeFontSize + "px")
          .style("font-family", "Arial, sans-serif")
          .style("fill", color)
          .style("font-weight", oViz.Config.gradeFontBold === "on" ? "700" : "400")
          .style("font-style", oViz.Config.gradeFontItalic === "on" ? "italic" : "normal")
          .style("text-decoration", oViz.Config.gradeFontUnderline === "on" ? "underline" : "none")
          .text(oViz._markerLabel(point));
      } else {
        var sym = d3.symbol().type(symbolType(oViz.Config.markerShape)).size(Math.PI * oViz.Config.markerSize * oViz.Config.markerSize);
        group.append("path")
          .attr("class", "point-symbol")
          .attr("transform", "translate(" + cx + "," + cy + ")")
          .attr("d", sym())
          .attr("fill", color)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 1);
      }

      var focusSize = Math.max(12, (bgStrokeWidth > 0 ? containerSize : oViz.Config.markerSize) / 2 + 6);
      var focus = group.append("circle")
        .attr("class", "point-focus")
        .attr("cx", cx).attr("cy", cy)
        .attr("r", focusSize)
        .attr("stroke", colorWithAlpha(color, 0.45, "rgba(32,33,36,0.35)"))
        .style("display", "none");

      group.append("circle")
        .attr("class", "point-hit")
        .attr("cx", cx).attr("cy", cy)
        .attr("r", Math.max(10, containerSize / 2 + 3))
        .attr("fill", "rgba(0,0,0,0)")
        .on("mouseover", function(event) {
          focus.style("display", null);
          var html = oViz._tooltipHtml(point);
          if (html) {
            tooltip.html(html).style("display", "block");
            oViz._moveTooltip(tooltip, event);
          } else {
            tooltip.html("").style("display", "none");
          }
        })
        .on("mousemove", function(event) {
          if (tooltip.style("display") !== "none") oViz._moveTooltip(tooltip, event);
        })
        .on("mouseout", function() {
          focus.style("display", "none");
          tooltip.style("display", "none");
        })
        .on("click", function(event) {
          event.preventDefault();
          event.stopPropagation();
          oViz._markRow(point, oDataLayout);
        });
    });
  };

  WsuLatticeScatterViz.prototype._render = function(oTransientRenderingContext) {
    try {
      this.loadConfig();
      var oDataLayout = oTransientRenderingContext.get(DCP_DATA_LAYOUT);
      if (!oDataLayout) return;
      var points = this._generateData(oDataLayout, oTransientRenderingContext);
      var elContainer = this.getContainerElem();
      if (!points || !points.length) {
        $(elContainer).html("<div class='wsu-lattice'><div class='empty-state'>" + esc(LBL.EMPTY) + "</div></div>");
        return;
      }
      this._draw(elContainer, points, oDataLayout);
    } catch (e) {
      _logger.warning("Render failed: " + (e && e.message ? e.message : e));
      $(this.getContainerElem()).html("<div class='wsu-lattice'><div class='empty-state'>Render failed: " + esc(e && e.message ? e.message : e) + "</div></div>");
    } finally {
      this._setIsRendered(true);
    }
  };

  WsuLatticeScatterViz.prototype.render = function(oTransientRenderingContext) {
    this._render(oTransientRenderingContext);
  };

  WsuLatticeScatterViz.prototype.resizeVisualization = function(oVizDimensions, oTransientVizContext) {
    this._render(this.createRenderingContext(oTransientVizContext));
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

  function addToggle(panel, id, labelText, configValue) {
    var isOn = configValue !== "off";
    var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, isOn);
    panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
  }

  WsuLatticeScatterViz.prototype.doAddVizSpecificPropsDialog = function(oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
    jsx.assertObject(oTransientRenderingContext, "oTransientRenderingContext");
    jsx.assertInstanceOf(oTabbedPanelsGadgetInfo, gadgets.TabbedPanelsGadgetInfo, "oTabbedPanelsGadgetInfo", "obitech-application/gadgets.TabbedPanelsGadgetInfo");
    this.loadConfig();
    var factory = this.getGadgetFactory();
    var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
    function tryPanel(id) {
      try { var p = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, id); return p || pGen; }
      catch (e) { return pGen; }
    }
    var pStyle = tryPanel("wsuLatticeStyle");
    var pAxis = tryPanel("wsuLatticeAxis");
    var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
    var ord = {GEN: base + 100, STY: base + 200, AXL: base + 300};
    var nx = function(g) { return ord[g]++; };

    addSwitcher(pGen, "markerShapeGadget", "Marker: Shape", this.Config.markerShape, [
      {value: "grade-letter", label: "Grade Letter"},
      {value: "grade-points", label: "Grade Points"},
      {value: "circle", label: "Circle"},
      {value: "square", label: "Square"},
      {value: "triangle", label: "Triangle"},
      {value: "diamond", label: "Diamond"},
      {value: "cross", label: "Cross"},
      {value: "star", label: "Star"}
    ], nx("GEN"));
    pGen.addChild(new gadgets.SliderGadgetInfo("markerSizeGadget", "Marker: Size", "Marker: Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.markerSize, 6, 30)));
    addSwitcher(pGen, "progressThresholdGadget", "Progress: Threshold", Number(this.Config.progressThreshold).toFixed(1), [
      {value: "2.0", label: "C (2.0)"},
      {value: "1.7", label: "C- (1.7)"},
      {value: "1.3", label: "D+ (1.3)"},
      {value: "1.0", label: "D (1.0)"},
      {value: "0.0", label: "F (0.0)"}
    ], nx("GEN"));
    pStyle.addChild(new gadgets.SliderGadgetInfo("gradeFontSizeGadget", "Grade Text: Size", "Grade Text: Size", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.gradeFontSize, 8, 22)));
    addToggle(pStyle, "gradeFontBoldGadget", "Grade Text: Bold", this.Config.gradeFontBold);
    addToggle(pStyle, "gradeFontItalicGadget", "Grade Text: Italic", this.Config.gradeFontItalic);
    addToggle(pStyle, "gradeFontUnderlineGadget", "Grade Text: Underline", this.Config.gradeFontUnderline);
    addSwitcher(pStyle, "gradeBackgroundGadget", "Grade Background", this.Config.gradeBackground, [
      {value: "none", label: "None"},
      {value: "circle-outline", label: "Circle Outline"},
      {value: "circle-fill", label: "Circle Fill"},
      {value: "square-outline", label: "Square Outline"},
      {value: "square-fill", label: "Square Fill"}
    ], nx("STY"));
    pStyle.addChild(new gadgets.SliderGadgetInfo("outlineShadeGadget", "Outline Shade", "Outline Shade", new gadgets.SliderGadgetValueProperties(euidef.GadgetTypeIDs.SLIDER, this.Config.outlineShade, 20, 100)));
    addSwitcher(pStyle, "colorSourceGadget", "Color Source (OAC Theme/Custom)", this.Config.colorSource, [
      {value: "oac", label: "OAC Theme"},
      {value: "custom", label: "Custom"}
    ], nx("STY"));
    addText(pStyle, factory, "customGradeColorGadget", "Custom Grade Color (hex)", this.Config.customGradeColor);

    addSwitcher(pAxis, "xSortDirectionGadget", "X Axis Sort", this.Config.xSortDirection, [
      {value: "asc", label: "Ascending"},
      {value: "desc", label: "Descending"}
    ], nx("AXL"));
    addSwitcher(pAxis, "ySortDirectionGadget", "Y Axis Sort", this.Config.ySortDirection, [
      {value: "asc", label: "Ascending"},
      {value: "desc", label: "Descending"}
    ], nx("AXL"));
    addToggle(pAxis, "gridlinesGadget", "Axis: Gridlines", this.Config.gridlines);
    addText(pAxis, factory, "xAxisTitleGadget", "Axis: X Title", this.Config.xAxisTitle);
    addText(pAxis, factory, "yAxisTitleGadget", "Axis: Y Title", this.Config.yAxisTitle);

    if (WsuLatticeScatterViz.superClass.doAddVizSpecificPropsDialog) {
      WsuLatticeScatterViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
    }
  };

  WsuLatticeScatterViz.prototype._addVizSpecificPropsDialog = function(oTabbedPanelsGadgetInfo) {
    this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
    WsuLatticeScatterViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
  };

  WsuLatticeScatterViz.prototype._handlePropChange = function(sGadgetID, oPropChange, oViewSettings, oActionContext) {
    var updateSettings = WsuLatticeScatterViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
    if (updateSettings) return updateSettings;
    var map = {
      markerShapeGadget: "markerShape",
      markerSizeGadget: "markerSize",
      progressThresholdGadget: "progressThreshold",
      gradeFontSizeGadget: "gradeFontSize",
      gradeFontBoldGadget: "gradeFontBold",
      gradeFontItalicGadget: "gradeFontItalic",
      gradeFontUnderlineGadget: "gradeFontUnderline",
      gradeBackgroundGadget: "gradeBackground",
      outlineShadeGadget: "outlineShade",
      colorSourceGadget: "colorSource",
      customGradeColorGadget: "customGradeColor",
      xSortDirectionGadget: "xSortDirection",
      ySortDirectionGadget: "ySortDirection",
      gridlinesGadget: "gridlines",
      xAxisTitleGadget: "xAxisTitle",
      yAxisTitleGadget: "yAxisTitle"
    };
    var key = map[sGadgetID];
    if (!key) return false;
    var toggleGadgets = {
      gradeFontBoldGadget: 1, gradeFontItalicGadget: 1, gradeFontUnderlineGadget: 1, gridlinesGadget: 1
    };
    if (toggleGadgets[sGadgetID]) this.Config[key] = oPropChange.checked ? "on" : "off";
    else this.Config[key] = oPropChange.value;
    if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
    else this._saveSettings();
    return true;
  };

  WsuLatticeScatterViz.prototype._doInitializeComponent = function() {
    WsuLatticeScatterViz.superClass._doInitializeComponent.call(this);
    this.subscribeToEvent(events.types.DEFAULT_COLOR_SETTINGS_CHANGED, this._onDefaultColorsSettingsChanged, "**");
  };

  WsuLatticeScatterViz.prototype._doStopComponent = function() {
    // Tooltips are attached to <body>; remove ours when the viz is torn down.
    if (this._tooltipId) d3.select("#" + this._tooltipId).remove();
    WsuLatticeScatterViz.superClass._doStopComponent.apply(this, arguments);
  };

  WsuLatticeScatterViz.prototype._onDefaultColorsSettingsChanged = function() {
    var oTransientVizContext = this.assertOrCreateVizContext();
    this._render(this.createRenderingContext(oTransientVizContext));
  };

  function createClientComponent(sID, sDisplayName, sOrigin) {
    return new WsuLatticeScatterViz(sID, sDisplayName, sOrigin, WsuLatticeScatterViz.VERSION);
  }

  return {createClientComponent: createClientComponent};
});
