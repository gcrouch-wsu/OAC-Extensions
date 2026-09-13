/*
 * Host-independent test harness for the WSU plugins.
 *
 * Loads a plugin's AMD module in Node with the obitech-* framework modules
 * replaced by minimal stubs, so the model / aggregation / layout code can be
 * exercised with synthetic data. Nothing here touches the DOM beyond a tiny
 * document stub for tooltip title construction.
 *
 * Usage: node tests/run.js        (from oac-sdk-dev/)
 */
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");

var SRC = path.join(__dirname, "..", "src", "customviz");

// ---- framework stubs -------------------------------------------------------

function Logger() {}
Logger.prototype.info = function() {};
Logger.prototype.warning = function() {};
Logger.prototype.error = function() {};

var jsx = {
  assertAllNotNullExceptLastN: function() {},
  assertObject: function(o, name) { if (!o || typeof o !== "object") throw new Error("assertObject " + name); },
  assertInstanceOf: function() {},
  isNull: function(v) { return v === null; },
  extend: function(sub, base) {
    sub.prototype = Object.create(base.prototype);
    sub.prototype.constructor = sub;
    sub.baseConstructor = base;
    sub.superClass = base.prototype;
  }
};

function DataVisualization(sID) { this._id = sID || "viz"; }
DataVisualization.prototype.getID = function() { return this._id; };
DataVisualization.prototype.getViewName = function() { return "view"; };
DataVisualization.prototype.getSettings = function() {
  var self = this;
  return {
    getViewConfigJSON: function() { return self._savedConfig || {}; },
    setViewConfigJSON: function(ns, cfg) { self._savedConfig = JSON.parse(JSON.stringify(cfg)); }
  };
};
DataVisualization.prototype.getRootDataModel = function() {
  var self = this;
  return { getColumnIDsIn: function() { return self._measureIds || []; } };
};
DataVisualization.prototype.getColorContext = function() { throw new Error("no color service in tests"); };
DataVisualization.prototype.getCachedColorInterpolator = function() { throw new Error("no color service in tests"); };
DataVisualization.prototype.getDataItemColorInfo = function() { throw new Error("no color service in tests"); };
DataVisualization.prototype.subscribeToEvent = function() {};
DataVisualization.prototype._setIsRendered = function() {};
DataVisualization.prototype.isStarted = function() { return true; };
DataVisualization.prototype.getContainerElem = function() { return null; };

var PHYS = { DATA: "data", ROW: "row", COLUMN: "column" };
var LOGICAL = { ROW: "row", COLUMN: "column", COLOR: "color", CATEGORY: "detail", GLYPH: "glyph", SIZE: "size", MEASURES: "measures", ITEM: "item" };

function d3Stub() {
  function num(v) { return typeof v === "number" && !isNaN(v); }
  function vals(arr, acc) { return (arr || []).map(acc || function(d) { return d; }).filter(num); }
  var d3 = {
    sum: function(a, f) { return vals(a, f).reduce(function(x, y) { return x + y; }, 0); },
    mean: function(a, f) { var v = vals(a, f); return v.length ? d3.sum(v) / v.length : undefined; },
    median: function(a, f) { var v = vals(a, f).sort(function(x, y) { return x - y; }); if (!v.length) return undefined; var m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; },
    min: function(a, f) { var v = vals(a, f); return v.length ? Math.min.apply(null, v) : undefined; },
    max: function(a, f) { var v = vals(a, f); return v.length ? Math.max.apply(null, v) : undefined; },
    group: function(a, f) { var m = new Map(); (a || []).forEach(function(d) { var k = f(d); if (!m.has(k)) m.set(k, []); m.get(k).push(d); }); return m; },
    scaleOrdinal: function(range) { var map = new Map(); var i = 0; var fn = function(k) { if (!map.has(k)) map.set(k, (range || ["#000"])[i++ % (range || ["#000"]).length]); return map.get(k); }; fn.domain = function() { return fn; }; fn.range = function() { return fn; }; return fn; },
    schemeTableau10: ["#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ab"],
    schemeCategory10: ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"],
    scaleLinear: function() {
      var dom = [0, 1], rng = [0, 1], clampIt = false;
      var fn = function(v) {
        var t = dom[1] === dom[0] ? 0 : (v - dom[0]) / (dom[1] - dom[0]);
        if (clampIt) t = Math.max(0, Math.min(1, t));
        return rng[0] + t * (rng[1] - rng[0]);
      };
      fn.domain = function(d) { dom = d; return fn; };
      fn.range = function(r) { rng = r; return fn; };
      fn.clamp = function(c) { clampIt = !!c; return fn; };
      fn.nice = function() { return fn; };
      return fn;
    },
    select: function() { throw new Error("d3.select is not available in tests"); }
  };
  return d3;
}

function documentStub() {
  function el(tag) {
    return {
      tagName: tag, children: [], textContent: "",
      appendChild: function(c) { this.children.push(c); return c; },
      get text() { return this.children.map(function(c) { return c.text !== undefined ? c.text : c.textContent; }).join("") || this.textContent; }
    };
  }
  return {
    createElement: function(tag) { return el(tag); },
    createTextNode: function(t) { var n = el("#text"); n.textContent = String(t); return n; },
    addEventListener: function() {}, removeEventListener: function() {}
  };
}

function stubFor(dep) {
  if (dep === "jquery") { var $ = function() { return { html: function() {}, width: function() { return 800; }, height: function() { return 500; } }; }; $.extend = function(deep, target) { for (var i = 2; i < arguments.length; i++) { Object.assign(target, JSON.parse(JSON.stringify(arguments[i]))); } return target; }; return $; }
  if (dep === "obitech-framework/jsx") return jsx;
  if (dep === "obitech-report/datavisualization") return { DataVisualization: DataVisualization, SettingsNS: { CHART: "chart" }, DataContextProperty: { DATA_LAYOUT: "dl", DATA_LAYOUT_HELPER: "dlh" } };
  if (dep === "obitech-reportservices/datamodelshapes") return { Physical: PHYS, Logical: LOGICAL, PhysicalPlacement: function(e) { this.edge = e; } };
  if (dep === "obitech-reportservices/events") return { types: { DEFAULT_COLOR_SETTINGS_CHANGED: "dcsc" } };
  if (dep === "obitech-reportservices/interactionservice") return { MarkingEvent: function() {} };
  if (dep === "obitech-reportservices/markingservice") return { EMarkOperation: { MARK_RELATED: "related" } };
  if (dep === "obitech-application/gadgets") return {};
  if (dep === "obitech-report/gadgetdialog") return {};
  if (dep === "obitech-application/extendable-ui-definitions") return { GD_PANEL_ID_GENERAL: "general", GadgetTypeIDs: {} };
  if (dep === "obitech-reportservices/data") return { LayerMetadata: { LAYER_DISPLAY_NAME: "displayName" } };
  if (dep === "obitech-appservices/logger") return { Logger: Logger };
  if (dep === "d3v6js") return d3Stub();
  if (/vis-network/.test(dep)) return { DataSet: function() {}, Network: function() {} };
  if (/^skin!/.test(dep)) return {};
  if (/^ojL10n!/.test(dep)) return loadNlsBundle(dep.replace(/^ojL10n!/, ""));
  if (dep === "require") return { toUrl: function(p) { return p; } };
  if (dep === "obitech-framework/messageformat") return { format: function(s) { return s; } };
  throw new Error("no stub for dependency " + dep);
}

// ojL10n!<plugin>/nls/messages -> the plugin's real root bundle, so tests run
// against the same strings the host would serve for the default locale.
function loadNlsBundle(modulePath) {
  var file = path.join(SRC, modulePath.replace(/\/nls\/messages$/, "/nls/root/messages.js"));
  var code = fs.readFileSync(file, "utf8");
  var bundle = null;
  vm.runInNewContext(code, { define: function(obj) { bundle = obj; } }, { filename: file });
  if (!bundle || typeof bundle !== "object") throw new Error("NLS bundle did not define an object: " + file);
  return bundle;
}

// ---- module loader ---------------------------------------------------------

function loadPlugin(folder, file) {
  var code = fs.readFileSync(path.join(SRC, folder, file), "utf8");
  var exported = null;
  var sandbox = {
    define: function(deps, factory) { exported = factory.apply(null, deps.map(stubFor)); },
    document: documentStub(),
    window: { pageXOffset: 0, pageYOffset: 0, innerWidth: 1200, innerHeight: 800 },
    console: console, Map: Map, Set: Set, Object: Object, Array: Array, Number: Number, String: String,
    Math: Math, JSON: JSON, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN, isFinite: isFinite,
    Error: Error, RegExp: RegExp, Date: Date, Infinity: Infinity
  };
  vm.runInNewContext(code, sandbox, { filename: file });
  if (!exported || !exported.createClientComponent) throw new Error(file + " did not export createClientComponent");
  return exported;
}

// ---- fake data layout ------------------------------------------------------
//
// spec = {
//   rows:     [{logical: "row", name: "Source", values: [...]}, ...]   // PHYS_ROW layers
//   measures: [{logical: "measures", name: "Weight", values: [...]}]   // PHYS_DATA columns
// }
function fakeLayout(spec) {
  var rows = spec.rows || [];
  var measures = spec.measures || [];
  var nRows = rows.length ? rows[0].values.length : (measures.length ? measures[0].values.length : 0);
  var layout = {
    getEdgeExtent: function(edge) { return edge === PHYS.ROW ? nRows : (edge === PHYS.DATA ? measures.length : 0); },
    getLayerCount: function(edge) { return edge === PHYS.ROW ? rows.length : (edge === PHYS.COLUMN ? measures.length : 0); },
    getLayerMetadata: function(edge, i) { return edge === PHYS.ROW ? rows[i].name : (measures[i] ? measures[i].name : ""); },
    getValue: function(edge, a, b) {
      if (edge === PHYS.ROW) return rows[a] ? rows[a].values[b] : "";
      if (edge === PHYS.DATA) return measures[b] ? measures[b].values[a] : null;
      if (edge === PHYS.COLUMN) return measures[a] ? measures[a].name : "";
      return "";
    }
  };
  var helper = {
    getLogicalEdgeName: function(edge, i) { return edge === PHYS.ROW ? rows[i].logical : (measures[i] ? measures[i].logical : ""); }
  };
  var ctx = { get: function(key) { return key === "dl" ? layout : (key === "dlh" ? helper : null); } };
  return { layout: layout, helper: helper, ctx: ctx, measureIds: measures.map(function(m) { return m.name; }) };
}

function instance(mod, fake, config) {
  var viz = mod.createClientComponent("viz-1", "test", "origin");
  if (fake) viz._measureIds = fake.measureIds;
  if (config) Object.keys(config).forEach(function(k) { viz.Config[k] = config[k]; });
  return viz;
}

// ---- tiny test runner ------------------------------------------------------

var results = { pass: 0, fail: 0, failures: [] };
function test(name, fn) {
  try { fn(); results.pass++; console.log("  ok   " + name); }
  catch (e) { results.fail++; results.failures.push(name + ": " + (e && e.stack || e)); console.log("  FAIL " + name + "\n       " + (e && e.message || e)); }
}
function suite(name, fn) { console.log(name); fn(); }
function summary() {
  console.log("\n" + results.pass + " passed, " + results.fail + " failed");
  if (results.fail) { process.exitCode = 1; }
}

module.exports = { loadPlugin: loadPlugin, fakeLayout: fakeLayout, instance: instance, test: test, suite: suite, summary: summary, PHYS: PHYS };
