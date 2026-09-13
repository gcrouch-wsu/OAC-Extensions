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
  "obitech-viz/genericDataModelHandler",
  // Established by Oracle's May 2026 samples (oac_design.md 6.33); present in 26.01.
  "require",                            // for requirejs.toUrl() when lazy-loading ES modules
  "obitech-framework/messageformat"     // pairs with ojL10n!<plugin>/nls/messages
];

// Host methods that are ABSENT from OAD HOST_VERSION. Whether the cloud host
// has them is unverified (Oracle's May 2026 sample guards the call; a guard
// proves nothing about any tenant). Every call must be feature-detected, and
// the guard must sit in the same statement or the enclosing few lines.
var UNVERIFIED_HOST_METHODS = ["getProjection"];

// Ids the plugin family must not depend on. Never reintroduce.
var FORBIDDEN_MODULES = {
  "d3js": "Host-bundled D3 v3 (3.4.13). Oracle's What's New: 'planned for deprecation in May 2026'. Use d3v6js.",
  "d3v3": "D3 v3 from cdnjs via the oracle.bi.tech.plugin.requirejsConfig extension point (Oracle's interim guidance for the d3js deprecation). It is D3 v3 and an external CDN dependency; this family uses d3v6js and makes no external calls.",
  "obitech-legend/legendandvizcontainer": "Semi-private mixin that breaks on minor updates (oac_design.md section 2). Draw legends in SVG.",
  "knockout": "Not used by this plugin family (Oracle still documents it for data-action editors, not visualizations).",
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

// Replace comments and string/regex literals with spaces (length-preserving is
// not needed; we only test for presence of syntax afterwards).
function stripCommentsAndStrings(code) {
  var out = "";
  var i = 0, n = code.length;
  while (i < n) {
    var c = code[i], d = code[i + 1];
    if (c === "/" && d === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { i += 2; while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      var q = c; i++;
      while (i < n && code[i] !== q) { if (code[i] === "\\") i++; i++; }
      i++; out += (q === "`" ? " TEMPLATE_LITERAL_MARKER " : " "); continue;
    }
    if (c === "/" && /[=(,:\[!&|?{};\n]\s*$/.test(out.slice(-3))) {
      // regex literal (heuristic: '/' after an operator/opening token)
      i++; while (i < n && code[i] !== "/") { if (code[i] === "\\") i++; if (code[i] === "\n") break; i++; }
      i++; out += " "; continue;
    }
    out += c; i++;
  }
  return out;
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
      if (id.indexOf("ojL10n!" + plugin + "/") === 0) return; // the plugin's own i18n bundle
      if (FORBIDDEN_MODULES[id]) { problem(file, "forbidden dependency '" + id + "': " + FORBIDDEN_MODULES[id]); return; }
      if (ALLOWED_MODULES.indexOf(id) < 0) problem(file, "dependency '" + id + "' is not in the allowlist verified against OAD " + HOST_VERSION + " — verify it exists in the host and add it to tests/lint.js");
    });

    // 2. Semi-private host calls must be tolerated explicitly.
    var own = {};
    (code.match(/prototype\.(_[A-Za-z0-9]+)\s*=/g) || []).forEach(function(s) { own[s.replace(/prototype\.|\s*=/g, "")] = true; });
    // methods assigned per instance in the constructor: this._name = function
    (code.match(/this\.(_[A-Za-z0-9]+)\s*=\s*function/g) || []).forEach(function(s) { own[s.replace(/^this\.|\s*=\s*function$/g, "")] = true; });
    // Aliases of `this` (var oViz = this; var that = this; var self = this) are
    // scanned too, so oViz._x() cannot bypass the rule.
    var aliases = ["this"];
    (code.match(/var\s+([A-Za-z_$][\w$]*)\s*=\s*this\s*;/g) || []).forEach(function(s) {
      aliases.push(s.replace(/^var\s+|\s*=\s*this\s*;$/g, ""));
    });
    var privCalls = {};
    var privRe = new RegExp("(?:superClass|" + aliases.join("|") + ")\\.(_[A-Za-z0-9]+)\\s*\\(", "g");
    var pm;
    while ((pm = privRe.exec(code)) !== null) {
      var name = pm[1];
      if (!own[name] && !TOLERATED_PRIVATE_CALLS[name]) privCalls[name] = true;
    }
    Object.keys(privCalls).forEach(function(name) {
      problem(file, "calls semi-private host method '" + name + "' — add a justification to TOLERATED_PRIVATE_CALLS or avoid it");
    });

    // 3. AMD entry files stay ES5 (the optimizer path); ES2015+ belongs in
    //    modules loaded via import(requirejs.toUrl(...)) — see oac_design.md 6.32.
    // Scan code only: comments and string literals are blanked first so prose
    // like "let the wheel" or a backtick in a comment cannot trip the rule.
    var codeOnly = stripCommentsAndStrings(code);
    var es2015 = [];
    if (/(^|[^A-Za-z0-9_$.])(let|const)\s+[A-Za-z_$]/.test(codeOnly)) es2015.push("let/const");
    if (/=>/.test(codeOnly)) es2015.push("arrow function");
    if (/(^|[^A-Za-z0-9_$.])class\s+[A-Z][A-Za-z0-9_$]*\s*(extends\s+[A-Za-z_$][\w$.]*\s*)?\{/.test(codeOnly)) es2015.push("class");
    if (/TEMPLATE_LITERAL_MARKER/.test(codeOnly)) es2015.push("template literal");
    if (/\bfunction\b[^(]*\([^)]*=[^)]*\)/.test(codeOnly)) es2015.push("default parameter");
    if (/\.\.\.[A-Za-z_$\[]/.test(codeOnly)) es2015.push("spread/rest");
    if (/\b(var|let|const)\s*[\[{]/.test(codeOnly)) es2015.push("destructuring");
    if (/\bfor\s*\([^)]*\bof\b/.test(codeOnly)) es2015.push("for-of");
    if (/\basync\s+function\b|\bawait\s/.test(codeOnly)) es2015.push("async/await");
    // Dynamic import() is the sanctioned exception: it is how modern code is loaded.
    if (es2015.length) problem(file, "AMD entry file uses ES2015+ syntax (" + es2015.join(", ") + "); keep entry modules ES5 and lazy-load modern code with import()");

    // 4. Host methods absent from OAD must be feature-detected at the call site
    //    (guard within the 400 characters preceding each call), for `this` and its aliases.
    UNVERIFIED_HOST_METHODS.forEach(function(m) {
      aliases.forEach(function(alias) {
        var callRe = new RegExp(alias.replace(/\$/g, "\\$") + "\\." + m + "\\s*\\(", "g");
        var cm;
        while ((cm = callRe.exec(code)) !== null) {
          var before = code.slice(Math.max(0, cm.index - 400), cm.index);
          var guardRe = new RegExp("typeof\\s+" + alias.replace(/\$/g, "\\$") + "\\." + m + "\\s*===\\s*['\"]function['\"]");
          if (!guardRe.test(before)) {
            problem(file, "calls '" + alias + "." + m + "()' at offset " + cm.index + " without a nearby typeof guard — absent from OAD " + HOST_VERSION + ", unverified on OAC");
          }
        }
      });
    });

    // 5. Legacy string markers that do not appear as AMD deps.
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
