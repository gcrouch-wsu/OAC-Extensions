/*
 * Compare an OAC tenant probe (tests/oac-probe.js output) against what the
 * plugins and the currency lint assume.
 *
 * Usage: node tests/compare-probe.js tests/oac-probe.<tenant>.json
 */
"use strict";

var fs = require("fs");
var path = require("path");

var file = process.argv[2];
if (!file) { console.error("usage: node tests/compare-probe.js <probe.json>"); process.exit(2); }
var probe = JSON.parse(fs.readFileSync(file, "utf8"));

// Pull the lists straight out of lint.js so this never drifts from it.
var lintSrc = fs.readFileSync(path.join(__dirname, "lint.js"), "utf8");
function listFrom(name) {
  var m = new RegExp("var " + name + " = \\[([\\s\\S]*?)\\];").exec(lintSrc);
  return m ? (m[1].match(/"([^"]+)"/g) || []).map(function (s) { return s.replace(/"/g, ""); }) : [];
}
function keysFrom(name) {
  var m = new RegExp("var " + name + " = \\{([\\s\\S]*?)\\n\\};").exec(lintSrc);
  return m ? (m[1].match(/^\s*"([^"]+)"\s*:/gm) || []).map(function (s) { return s.replace(/[\s":]/g, ""); }) : [];
}
var allowed = listFrom("ALLOWED_MODULES");
var unverified = listFrom("UNVERIFIED_HOST_METHODS");
var forbidden = keysFrom("FORBIDDEN_MODULES");

var bad = 0, warn = 0;
function fail(s) { console.log("  FAIL  " + s); bad++; }
function note(s) { console.log("  note  " + s); warn++; }
function ok(s) { console.log("  ok    " + s); }

console.log("Probe of " + probe.url + " at " + probe.probedAt + (probe.build ? " (build " + probe.build + ")" : " (build not exposed)"));

console.log("\nAllowlist modules on the tenant:");
allowed.forEach(function (id) {
  if (id === "require") return;
  if (probe.modules[id] === true) ok(id);
  else if (probe.modules[id] === false) fail(id + " — in ALLOWED_MODULES but NOT defined on the tenant");
  else note(id + " — not probed");
});

console.log("\nForbidden / legacy modules on the tenant (informational):");
forbidden.forEach(function (id) { console.log("  " + (probe.modules[id] ? "present" : "absent ") + "  " + id); });

console.log("\nD3:");
Object.keys(probe.d3 || {}).forEach(function (id) { console.log("  " + id + " = " + probe.d3[id]); });
if (!probe.d3["d3v6js"]) fail("d3v6js does not resolve — all four D3 plugins would fail to load");
Object.keys(probe.modules).filter(function (id) { return /^d3/.test(id) && probe.modules[id] && !/^(d3js|d3v3|d3v6js)$/.test(id); })
  .forEach(function (id) { note("newer D3 id available on the tenant: " + id + " — decide whether to move (oac_design 6.32)"); });

// Methods the framework assigns per instance in a base constructor
// (`e.getID = function …` in report.js), so they never appear on
// DataVisualization.prototype. A false here is a probe limitation, not absence;
// the 1.0.0 plugins call them on the tenant today.
var INSTANCE_ASSIGNED = ["getID"];

console.log("\nInherited host methods the plugins call:");
var methods = probe.methods || {};
Object.keys(methods).forEach(function (m) {
  if (m === "_error") { fail("could not inspect DataVisualization.prototype: " + methods[m]); return; }
  if (INSTANCE_ASSIGNED.indexOf(m) >= 0 && methods[m] !== true) { note(m + " — assigned per instance by the base constructor; not visible on the prototype (expected)"); return; }
  var present = methods[m] === true;
  if (unverified.indexOf(m) >= 0) { (present ? note : ok)(m + " — " + (present ? "PRESENT on tenant (absent on OAD); guarded call can now be relied on" : "absent, as on OAD; guard stays")); return; }
  if (present) ok(m);
  else if (/^(getSubElementIdFromParent|_addColorMenuOption|_addFilterMenuOption|_addRemoveSelectedMenuOption|_addVizSpecificMenuOptions|getProjection|getVizContextFromRenderingContext|getLogicalDataModel)$/.test(m)) note(m + " — absent; plugins feature-detect it, no action");
  else fail(m + " — absent on tenant and the plugins call it unguarded");
});

console.log("\nHost panel ids:");
Object.keys(probe.panels || {}).forEach(function (k) {
  if (k === "_error") { fail("could not inspect extendable-ui-definitions: " + probe.panels[k]); return; }
  (probe.panels[k] ? ok : note)(k + " = " + JSON.stringify(probe.panels[k]));
});

console.log("\n" + (bad ? bad + " failure(s), " : "no failures, ") + warn + " note(s).");
if (!bad) console.log("Record the tenant build next to HOST_VERSION in tests/lint.js and in CHANGELOG.md.");
process.exitCode = bad ? 1 : 0;
