/*
 * Currency lint for the WSU plugins.
 *
 * Fails when a plugin depends on something the host is retiring, or on a
 * module id that is not in the allowlist verified against the installed
 * Oracle Analytics Desktop. Keeping the allowlist tied to a host version is
 * what makes an OAD/OAC upgrade a re-verification instead of a guess.
 *
 * Usage: node tests/lint.js        (from oac-sdk-dev/)
 * Also run by tests/run.js.
 */
"use strict";

var fs = require("fs");
var path = require("path");

var SRC = path.join(__dirname, "..", "src", "customviz");

// Module ids confirmed present in OAD 26.01.0.0.0 (2026-01-20 build) by
// grepping war/va/plugins/*/*.js. Re-verify and bump HOST_VERSION after an
// OAD upgrade; see docs/oac_design.md "Currency policy".
var HOST_VERSION = "26.01.0.0.0";
var ALLOWED_MODULES = [
  "jquery",
  "d3v6js",
  "obitech-framework/jsx",
  "obitech-report/datavisualization",
  "obitech-report/gadgetdialog",
  "obitech-report/vizdatamodelsmanager",
  "obitech-reportservices/data",
  "obitech-reportservices/datamodelshapes",
  "obitech-reportservices/events",
  "obitech-reportservices/interactionservice",
  "obitech-reportservices/markingservice",
  "obitech-application/gadgets",
  "obitech-application/extendable-ui-definitions",
  "obitech-appservices/logger",
  "obitech-viz/genericDataModelHandler"
];

// Ids the host is retiring or that break on minor updates. Never reintroduce.
var FORBIDDEN_MODULES = {
  "d3js": "D3 v3 alias; Oracle's 2026 samples moved to 'd3v3' and OAD 26.01 no longer defines that either. Use d3v6js.",
  "d3v3": "Not defined in OAD 26.01 (cloud-only alias). Use d3v6js.",
  "obitech-legend/legendandvizcontainer": "Semi-private mixin that breaks on minor updates (oac_design.md section 2). Draw legends in SVG.",
  "knockout": "Not used by this plugin family; OAC's own samples are moving off it.",
  "obitech-report/visualization": "Superseded by obitech-report/datavisualization."
};

// Host methods the plugins are allowed to call that are underscore-prefixed
// (semi-private). Each must be justified here or the lint fails.
var TOLERATED_PRIVATE_CALLS = {
  "_setIsRendered": "lifecycle hook used by every Oracle sample",
  "_addColorMenuOption": "native Color menu hook (issue #4) — wrapped in feature detection",
  "_addFilterMenuOption": "native Filter menu hook — wrapped in feature detection",
  "_addRemoveSelectedMenuOption": "native menu hook — wrapped in feature detection",
  "_addVizSpecificPropsDialog": "property-panel hook used by every Oracle sample",
  "_handlePropChange": "property-panel hook used by every Oracle sample",
  "_doInitializeComponent": "lifecycle hook (verified against OAD, see AI_HANDOFF)",
  "_doStopComponent": "lifecycle hook (verified against OAD, see AI_HANDOFF)"
};

var problems = [];
function problem(file, msg) { problems.push(path.relative(SRC, file) + ": " + msg); }

function listPlugins() {
  return fs.readdirSync(SRC).filter(function(d) { return /^com-wsu-/.test(d); });
}

function amdDeps(code) {
  var m = /define\(\s*\[([\s\S]*?)\]/.exec(code);
  if (!m) return null;
  return m[1].split(",").map(function(s) { return s.trim().replace(/^['"]|['"]$/g, ""); }).filter(Boolean);
}

listPlugins().forEach(function(plugin) {
  var dir = path.join(SRC, plugin);
  var files = fs.readdirSync(dir);

  // 1. Manifest style: JSON manifests under extensions/, never a hand-written plugin.xml in src.
  if (files.indexOf("plugin.xml") >= 0) problem(path.join(dir, "plugin.xml"), "hand-written plugin.xml in src (legacy); the SDK generates it from extensions/*.json");
  var ext = path.join(dir, "extensions");
  if (!fs.existsSync(ext)) problem(dir, "missing extensions/ JSON manifests");

  files.filter(function(f) { return /\.js$/.test(f); }).forEach(function(f) {
    var file = path.join(dir, f);
    var code = fs.readFileSync(file, "utf8");
    var deps = amdDeps(code);
    if (!deps) {
      if (!/^lib\//.test(f)) problem(file, "no AMD define() found");
      return;
    }
    deps.forEach(function(dep) {
      var id = dep.replace(/^skin!css!/, "");
      if (/^skin!css!/.test(dep)) {
        if (id.indexOf(plugin + "/") !== 0) problem(file, "stylesheet dependency outside the plugin folder: " + dep);
        return;
      }
      if (id.indexOf(plugin + "/") === 0) return;           // the plugin's own files (lib/, nls/)
      if (FORBIDDEN_MODULES[id]) { problem(file, "forbidden dependency '" + id + "': " + FORBIDDEN_MODULES[id]); return; }
      if (ALLOWED_MODULES.indexOf(id) < 0) problem(file, "dependency '" + id + "' is not in the allowlist verified against OAD " + HOST_VERSION + " — verify it exists in the host and add it to tests/lint.js");
    });

    // 2. Semi-private host calls must be tolerated explicitly.
    var own = {};
    (code.match(/prototype\.(_[A-Za-z0-9]+)\s*=/g) || []).forEach(function(s) { own[s.replace(/prototype\.|\s*=/g, "")] = true; });
    // methods assigned per instance in the constructor: this._name = function
    (code.match(/this\.(_[A-Za-z0-9]+)\s*=\s*function/g) || []).forEach(function(s) { own[s.replace(/^this\.|\s*=\s*function$/g, "")] = true; });
    var privCalls = {};
    (code.match(/superClass\.(_[A-Za-z0-9]+)|this\.(_[A-Za-z0-9]+)\(/g) || []).forEach(function(s) {
      var name = s.replace(/^superClass\.|^this\.|\($/g, "");
      if (!own[name] && !TOLERATED_PRIVATE_CALLS[name]) privCalls[name] = true;
    });
    Object.keys(privCalls).forEach(function(name) {
      problem(file, "calls semi-private host method '" + name + "' — add a justification to TOLERATED_PRIVATE_CALLS or avoid it");
    });

    // 3. Legacy string markers that do not appear as AMD deps.
    if (/legendandvizcontainer/.test(code)) problem(file, "references legendandvizcontainer");
    if (/\bd3\.(layout|svg\.line|scale\.linear|behavior)\b/.test(code)) problem(file, "uses a D3 v3-only API");
  });
});

if (problems.length) {
  console.log("Currency lint: " + problems.length + " problem(s)");
  problems.forEach(function(p) { console.log("  - " + p); });
  process.exitCode = 1;
} else {
  console.log("Currency lint: clean (allowlist verified against OAD " + HOST_VERSION + ")");
}
