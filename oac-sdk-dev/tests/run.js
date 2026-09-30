/*
 * Regression tests at the model / aggregation / layout boundary for the five
 * WSU plugins. Each test encodes a defect from the 2026-09 code review so it
 * cannot silently return. Run from oac-sdk-dev/:  node tests/run.js
 */
"use strict";

var assert = require("assert");
var H = require("./harness");
var test = H.test, suite = H.suite, fakeLayout = H.fakeLayout, instance = H.instance;

// ============================================================================
suite("WSU Sankey", function() {
  var mod = H.loadPlugin("com-wsu-sankey", "wsuSankey.js");

  function build(rowsSpec, config) {
    var fake = fakeLayout(rowsSpec);
    var viz = instance(mod, fake, config);
    viz.loadConfig();
    var raw = viz._buildRawEdges(fake.layout, fake.ctx);
    var agg = viz._aggregateEdges(raw.rawEdges, raw.warnings, raw.pathWeightTotal);
    var layout = viz._layout(agg.edges, 800, 400);
    return { viz: viz, raw: raw, agg: agg, layout: layout };
  }
  function nodeKeys(layout) { return layout.nodes.map(function(n) { return n.stage + ":" + n.label; }).sort(); }

  test("blank intermediate keeps later cells in their bucket lane (#22)", function() {
    var r = build({ rows: [
      { logical: "row",   name: "Start", values: ["A", "A"] },
      { logical: "glyph", name: "I1",    values: ["B", ""] },
      { logical: "glyph", name: "I2",    values: ["C", "C"] },
      { logical: "item",  name: "End",   values: ["D", "D"] }
    ]});
    var real = r.layout.nodes.filter(function(n) { return !n.transit; });
    assert.deepStrictEqual(real.map(function(n) { return n.stage + ":" + n.label; }).sort(), ["0:A", "1:B", "2:C", "3:D"]);
    var span = r.agg.edges.filter(function(e) { return e.from === "A" && e.to === "C"; })[0];
    assert.ok(span, "A->C spanning edge exists");
    assert.strictEqual(span.stageIndex, 0);
    assert.strictEqual(span.toStage, 2);
    // the spanning link reserves a transit slot in stage 1 and routes through it
    var transit = r.layout.nodes.filter(function(n) { return n.transit && n.stage === 1; });
    assert.strictEqual(transit.length, 1);
    var drawn = r.layout.edges.filter(function(e) { return e.from === "A" && e.to === "C"; })[0];
    assert.strictEqual(drawn.waypoints.length, 1);
    var b = real.filter(function(n) { return n.label === "B"; })[0];
    var wy = drawn.waypoints[0].y;
    assert.ok(wy < b.y || wy > b.y + b.h, "waypoint y " + wy + " is outside B [" + b.y + "," + (b.y + b.h) + "]");
  });

  test("spanning link does not pass through an unrelated middle-stage node (#22 geometry)", function() {
    var r = build({ rows: [
      { logical: "row",   name: "Start", values: ["A", "X"] },
      { logical: "glyph", name: "I1",    values: ["", "B"] },
      { logical: "item",  name: "End",   values: ["D", "Y"] }
    ]});
    var b = r.layout.nodes.filter(function(n) { return n.label === "B"; })[0];
    var ad = r.layout.edges.filter(function(e) { return e.from === "A" && e.to === "D"; })[0];
    assert.strictEqual(ad.waypoints.length, 1);
    var wy = ad.waypoints[0].y;
    assert.ok(wy < b.y || wy > b.y + b.h, "A->D routes around B");
    assert.ok(b.h < 400, "B no longer fills the whole stage: " + b.h);
    assert.strictEqual(r.layout.stageTotals[1], 1, "transit flow excluded from stage 1 total");
  });

  test("complete and incomplete traffic on the SAME segment are separate edges (#34)", function() {
    // 9 rows A -> B -> C, 1 row A -> B -> (missing): the A->B segment is shared
    var st = [], mid = [], en = [];
    for (var i = 0; i < 10; i++) { st.push("A"); mid.push("B"); en.push(i < 9 ? "C" : ""); }
    var r = build({ rows: [
      { logical: "row",   name: "Start", values: st },
      { logical: "glyph", name: "I1",    values: mid },
      { logical: "item",  name: "End",   values: en }
    ]}, { routeMissingEndToIncomplete: "on", includeIncompletePaths: "on", incompleteEndLabel: "No Completion" });
    var ab = r.agg.edges.filter(function(e) { return e.from === "A" && e.to === "B"; });
    assert.strictEqual(ab.length, 2, "A->B split by status");
    var complete = ab.filter(function(e) { return !e.incompletePath; })[0];
    var incomplete = ab.filter(function(e) { return e.incompletePath; })[0];
    assert.strictEqual(complete.value, 9);
    assert.strictEqual(incomplete.value, 1);
    assert.strictEqual(complete.rows.length, 9);
    assert.strictEqual(incomplete.rows.length, 1);
  });

  test("rows whose every segment was rejected do not inflate the percent denominator (#35 round 2)", function() {
    var r = build({
      rows: [{ logical: "row", name: "Start", values: ["A", "B"] }, { logical: "item", name: "End", values: ["A", "C"] }],
      measures: [{ logical: "measures", name: "W", values: [9, 1] }]
    }, { disallowSelfLinks: "on", thresholdMode: "percent", minFlowThreshold: 60 });
    assert.strictEqual(r.raw.warnings.selfLinkEdges, 1);
    assert.strictEqual(r.agg.total, 1, "only the emitting row counts");
    assert.strictEqual(r.agg.edges.length, 1, "B->C survives");
  });

  test("JSON tuple keys: labels containing U+001F do not collide (#10 round 2)", function() {
    var r = build({ rows: [
      { logical: "row",  name: "Start", values: ["A\u001fB", "A"] },
      { logical: "item", name: "End",   values: ["C", "B\u001fC"] }
    ]});
    assert.strictEqual(r.agg.edges.length, 2);
  });

  test("percent threshold uses path weight, not summed segments (#35)", function() {
    // one path A->B->C (weight 1): each segment is 100% of the path weight
    var r = build({ rows: [
      { logical: "row",   name: "Start", values: ["A"] },
      { logical: "glyph", name: "I1",    values: ["B"] },
      { logical: "item",  name: "End",   values: ["C"] }
    ]}, { thresholdMode: "percent", minFlowThreshold: 60 });
    assert.strictEqual(r.agg.total, 1);
    assert.strictEqual(r.agg.edges.length, 2, "both segments survive a 60% threshold");
    assert.strictEqual(r.agg.warnings.thresholdDropped, 0);
  });

  test("zero is a valid setting value (#25)", function() {
    var viz = instance(mod, null, { valueDecimals: 0, maxIntermediateDepth: 0, stagePadding: 0, chartLeftPadding: 0 });
    viz.loadConfig();
    assert.strictEqual(viz.Config.valueDecimals, 0);
    assert.strictEqual(viz.Config.maxIntermediateDepth, 0);
    assert.strictEqual(viz.Config.stagePadding, 0);
    assert.strictEqual(viz.Config.chartLeftPadding, 0);
  });

  test("labels containing the old '|' separator do not collide (#10)", function() {
    var r = build({ rows: [
      { logical: "row",  name: "Start", values: ["A|B", "A"] },
      { logical: "item", name: "End",   values: ["C", "B|C"] }
    ]});
    assert.strictEqual(r.agg.edges.length, 2);
  });

  test("'Other' keeps incomplete status and details (#24)", function() {
    var starts = [], ends = [], det = [];
    for (var i = 0; i < 6; i++) { starts.push("S" + i); ends.push(i === 5 ? "" : "E" + i); det.push("d" + i); }
    var r = build({ rows: [
      { logical: "row",    name: "Start",  values: starts },
      { logical: "item",   name: "End",    values: ends },
      { logical: "detail", name: "Detail", values: det }
    ]}, { topNPerStage: 2, collapseOther: "on", routeMissingEndToIncomplete: "on" });
    var others = r.agg.edges.filter(function(e) { return e.from === "Other"; });
    assert.ok(others.length >= 1, "an Other edge exists");
    var incOther = others.filter(function(e) { return e.incompletePath; });
    assert.strictEqual(incOther.length, 1, "the incomplete flow collapsed into its own Other");
    others.forEach(function(o) { assert.ok(Array.isArray(o.details), "Other carries details"); });
    var complete = others.filter(function(e) { return !e.incompletePath; })[0];
    assert.ok(complete.details.length > 0, "Other carries at least one detail row");
  });

  test("'Other' keeps the earliest term code (#24)", function() {
    var starts = [], ends = [], strm = [];
    for (var i = 0; i < 5; i++) { starts.push("S" + i); ends.push("E" + i); strm.push(String(2260 - i)); }
    var r = build({ rows: [
      { logical: "row",  name: "Start", values: starts },
      { logical: "item", name: "End",   values: ends },
      { logical: "size", name: "STRM",  values: strm }
    ]}, { topNPerStage: 1, collapseOther: "on" });
    var other = r.agg.edges.filter(function(e) { return e.from === "Other"; })[0];
    assert.strictEqual(other.termCode, 2256);
  });

  test("stacked link floors never exceed the node height (#26)", function() {
    var starts = [], ends = [];
    for (var i = 0; i < 60; i++) { starts.push("Hub"); ends.push("E" + i); }
    starts.push("Big"); ends.push("BigEnd");
    var weights = starts.map(function(s) { return s === "Big" ? 5000 : 1; });
    var r = build({
      rows: [{ logical: "row", name: "Start", values: starts }, { logical: "item", name: "End", values: ends }],
      measures: [{ logical: "measures", name: "W", values: weights }]
    });
    var hub = r.layout.nodes.filter(function(n) { return n.label === "Hub"; })[0];
    var out = r.layout.edges.filter(function(e) { return e.from === "Hub"; });
    var sum = out.reduce(function(a, e) { return a + e.width; }, 0);
    assert.ok(sum <= hub.h + 1e-6, "sum of link widths " + sum + " <= node height " + hub.h);
  });
});

// ============================================================================
suite("WSU Lattice Scatter", function() {
  var mod = H.loadPlugin("com-wsu-lattice-scatter", "wsuLatticeScatter.js");

  test("null grade points are missing, not 0.0 (#11)", function() {
    var viz = instance(mod, null, { markerShape: "grade-points" });
    viz.loadConfig();
    assert.strictEqual(viz._markerLabel({ gradeLetter: "A", gradePoints: null }), "4.0");
    assert.strictEqual(viz._gradePoints({ gradeLetter: "", gradePoints: "" }), null);
  });

  test("points without a letter render the points, not IP (#11)", function() {
    var viz = instance(mod, null, { markerShape: "grade-points" });
    viz.loadConfig();
    assert.strictEqual(viz._markerLabel({ gradeLetter: "", gradePoints: 3.7 }), "3.7");
    assert.strictEqual(viz._markerLabel({ gradeLetter: "", gradePoints: null }), "IP");
    viz.Config.markerShape = "grade-letter";
    assert.strictEqual(viz._markerLabel({ gradeLetter: "", gradePoints: 3.7 }), "3.7");
    assert.strictEqual(viz._markerLabel({ gradeLetter: "B+", gradePoints: null }), "B+");
  });

  test("dedicated Sorting Term Code beats the tooltip-label heuristic (#12)", function() {
    var fake = fakeLayout({ rows: [
      { logical: "item",   name: "Term",      values: ["2024 Fall"] },
      { logical: "row",    name: "Course",    values: ["MATH 171"] },
      { logical: "size",   name: "SortKey",   values: ["2267"] },
      { logical: "detail", name: "Term Code", values: ["2247"] }
    ]});
    var viz = instance(mod, fake, { colorSource: "custom" });
    viz.loadConfig();
    var model = viz._generateData(fake.layout, fake.ctx);
    var pts = model.points || model.rows || model;
    var p = pts[0];
    assert.strictEqual(p.termSort, 2267);
  });

  test("progress threshold classifies, and normalizes the letter like the label does (#13)", function() {
    var viz = instance(mod, null, { progressThreshold: 1.7 });
    viz.loadConfig();
    assert.strictEqual(viz._progressStatus({ gradeLetter: "C", gradePoints: 2.0 }), "Progress Eligible");
    assert.strictEqual(viz._progressStatus({ gradeLetter: "D", gradePoints: 1.0 }), "Progress Blocked");
    assert.strictEqual(viz._progressStatus({ gradeLetter: "W", gradePoints: 4.0 }), "Progress Blocked");
    assert.strictEqual(viz._progressStatus({ gradeLetter: " w ", gradePoints: 4.0 }), "Progress Blocked");
    assert.strictEqual(viz._gradePoints({ gradeLetter: " b+ ", gradePoints: null }), 3.3);
  });

  test("extraction no longer stamps IP onto rows that have points but no letter (#11)", function() {
    var fake = fakeLayout({
      rows: [{ logical: "item", name: "Term", values: ["2024 Fall"] }, { logical: "row", name: "Course", values: ["MATH 171"] }],
      measures: [{ logical: "measures", name: "Points", values: [3.7] }]
    });
    var viz = instance(mod, fake, { colorSource: "custom", markerShape: "grade-points" });
    viz.loadConfig();
    var pts = viz._generateData(fake.layout, fake.ctx);
    var p = (pts.points || pts.rows || pts)[0];
    assert.strictEqual(p.gradeLetter, "");
    assert.strictEqual(viz._markerLabel(p), "3.7");
  });
});

// ============================================================================
suite("WSU Dumbbell", function() {
  var mod = H.loadPlugin("com-wsu-dumbbell", "wsuDumbbell.js");

  function longRows(entities, roles, values) {
    var fake = fakeLayout({
      rows: [
        { logical: "row",  name: "Entity", values: entities },
        { logical: "item", name: "Role",   values: roles }
      ],
      measures: [{ logical: "measures", name: "Value", values: values }]
    });
    var viz = instance(mod, fake, { colorSource: "custom" });
    viz.loadConfig();
    return { viz: viz, rows: viz._generateData(fake.layout, fake.ctx) };
  }

  test("a duplicate role never fills the other endpoint (#1)", function() {
    var r = longRows(["X", "X", "X"], ["before", "before", "after"], [1, 2, 9]);
    assert.strictEqual(r.rows.length, 1);
    assert.strictEqual(r.rows[0].first, 1);
    assert.strictEqual(r.rows[0].second, 9);
  });

  test("all-missing Sum aggregate stays missing (#2)", function() {
    var r = longRows(["X", "Y"], ["after", "after"], [5, 7]);
    // rows with a missing endpoint are hidden by default; show them so the
    // aggregate sees two contributors whose first endpoint is missing
    r.viz.Config.missingMode = "show";
    r.viz.Config.viewMode = "groupAverage";
    r.viz.Config.groupAggregation = "sum";
    var fake2 = fakeLayout({ rows: [{ logical: "row", name: "Entity", values: ["X", "Y"] }, { logical: "item", name: "Role", values: ["after", "after"] }], measures: [{ logical: "measures", name: "Value", values: [5, 7] }] });
    r.viz._measureIds = fake2.measureIds;
    var shown = r.viz._generateData(fake2.layout, fake2.ctx);
    var agg = r.viz._aggregateRows(shown);
    assert.strictEqual(agg.length, 1);
    assert.ok(agg[0].firstMissing, "first endpoint is missing, not 0");
    assert.strictEqual(agg[0].second, 12);
    assert.ok(isNaN(agg[0].delta));
    assert.strictEqual(agg[0].isAggregate, true);
  });

  test("legend swatch equals the mark color for a group (#7)", function() {
    var r = longRows(["X", "X"], ["before", "after"], [1, 2]);
    r.rows.forEach(function(row) { row.group = "Alpha"; row.groupColor = ""; });
    r.viz.Config.colorMode = "group";
    var legend = r.viz._legendItems(r.rows[0], r.rows);
    assert.strictEqual(legend.length, 1);
    assert.strictEqual(legend[0].color, r.viz._groupColor(r.rows[0]));
  });

  test("category value 'constructor' is an ordinary entity (#10)", function() {
    var r = longRows(["constructor", "constructor"], ["before", "after"], [1, 2]);
    assert.strictEqual(r.rows.length, 1);
    assert.strictEqual(r.rows[0].first, 1);
    assert.strictEqual(r.rows[0].second, 2);
  });

  test("saved filter selections are restored by loadConfig (#4)", function() {
    var viz = instance(mod, null);
    viz._savedConfig = { filterValues: { "filter-0": "Math" } };
    viz.loadConfig();
    assert.deepStrictEqual(viz.Config.filterValues, { "filter-0": "Math" });
  });

  test("property-panel sort options include first/second/delta/absDelta (drift)", function() {
    var viz = instance(mod, null);
    viz.setLastDatasetMeta({ sortLabels: ["Dept"] });
    var values = viz._buildSortColumnOptions().map(function(o) { return o.value; });
    ["original", "sort-0", "first", "second", "delta", "absDelta"].forEach(function(v) {
      assert.ok(values.indexOf(v) >= 0, "missing " + v);
    });
  });
});

// ============================================================================
suite("WSU Line", function() {
  var mod = H.loadPlugin("com-wsu-line", "wsuLine.js");

  test("missing values are unranked and sort last (#15)", function() {
    var viz = instance(mod, null, { compareMode: "rank", tooltipSortColumn: "rank" });
    viz.loadConfig();
    var rows = [
      { series: "A", value: 1, termCode: null },
      { series: "B", value: NaN, termCode: null },
      { series: "C", value: 10, termCode: null }
    ];
    var dataset = { byX: new Map([["x", rows]]), hasTermCode: false };
    var out = viz._tooltipRows("x", null, dataset).rows;
    var byS = {}; out.forEach(function(r) { byS[r.series] = r; });
    assert.strictEqual(out[out.length - 1].series, "B", "unranked row sorts last");
    assert.strictEqual(byS.C._rank, 1);
    assert.strictEqual(byS.A._rank, 2);
    assert.strictEqual(byS.B._rank, 0, "NaN row is unranked");
    // descending: real ranks reverse, unranked still last
    viz.Config.tooltipSortDirection = "desc";
    var outDesc = viz._tooltipRows("x", null, dataset).rows;
    assert.strictEqual(outDesc[0].series, "A", "rank 2 first when descending");
    assert.strictEqual(outDesc[outDesc.length - 1].series, "B", "unranked row sorts last in desc too");
  });

  test("marker size clamps into the gadget range (#18)", function() {
    var viz = instance(mod, null, { pointSize: 3 });
    viz.loadConfig();
    assert.strictEqual(viz.Config.pointSize, 4);
  });

  test("a conflicting dynamic label on a hidden null row forces the fallback (#16)", function() {
    var fake = fakeLayout({
      rows: [
        { logical: "row",  name: "X",     values: ["2023", "2024"] },
        { logical: "item", name: "Label", values: ["Applied", "Admitted"] }
      ],
      measures: [{ logical: "measures", name: "Headcount", values: [10, null] }]
    });
    var viz = instance(mod, fake, { colorSource: "custom", missingMode: "hide" });
    viz.loadConfig();
    var dataset = viz._generateData(fake.layout, fake.ctx);
    assert.strictEqual(dataset.rows.length, 1, "null row hidden");
    assert.notStrictEqual(dataset.valueLabel, "Applied", "conflicting hidden label must not win");
  });
});

// ============================================================================
suite("WSU Network", function() {
  var mod = H.loadPlugin("com-wsu-network", "wsuNetwork.js");

  function build(spec, config) {
    var fake = fakeLayout(spec);
    var viz = instance(mod, fake, Object.assign({ colorSource: "custom" }, config || {}));
    viz.loadConfig();
    return { viz: viz, model: viz._buildModel(fake.layout, fake.ctx) };
  }

  test("a detail blank on one contributor is not reported for the aggregate (#21)", function() {
    var r = build({
      rows: [
        { logical: "row",    name: "Source",  values: ["A", "A"] },
        { logical: "row",    name: "Dest",    values: ["B", "B"] },
        { logical: "detail", name: "Outcome", values: ["Pass", ""] }
      ],
      measures: [{ logical: "measures", name: "N", values: [1, 1] }]
    });
    var edge = r.model.edges[0];
    var text = edge.title && edge.title.text !== undefined ? edge.title.text : String(edge.title);
    assert.ok(text.indexOf("Pass") < 0, "tooltip must not claim Outcome: Pass; got " + JSON.stringify(text));
  });

  test("labels containing '||' do not merge edges (#10)", function() {
    var r = build({
      rows: [
        { logical: "row", name: "Source", values: ["A||B", "A"] },
        { logical: "row", name: "Dest",   values: ["C", "B||C"] }
      ],
      measures: [{ logical: "measures", name: "N", values: [1, 1] }]
    });
    assert.strictEqual(r.model.edges.length, 2);
  });

  test("edge items carry width but not vis-network value (#19)", function() {
    var r = build({
      rows: [
        { logical: "row", name: "Source", values: ["A", "B"] },
        { logical: "row", name: "Dest",   values: ["B", "C"] }
      ],
      measures: [{ logical: "measures", name: "N", values: [1, 10] }]
    }, { minEdgeWidth: 2, maxEdgeWidth: 8 });
    r.model.edges.forEach(function(e) {
      assert.ok(!("value" in e), "no value key");
      assert.ok(e.width >= 2 && e.width <= 8, "width " + e.width + " within configured range");
    });
  });

  test("Repeat Roundness is no longer a config key, and a saved one loads cleanly (#20)", function() {
    var viz = instance(mod, null);
    assert.ok(!("repeatRoundness" in viz.Config));
    viz._savedConfig = { repeatRoundness: 0.9, repeatSize: 30, showEdgeLabels: "off" };
    viz.loadConfig();
    assert.strictEqual(viz.Config.repeatSize, 30);
    assert.strictEqual(viz.Config.showEdgeLabels, "off");
    assert.ok(!("repeatRoundness" in viz.Config));
  });

  test("JSON tuple keys: labels containing U+001F do not merge edges (#10 round 2)", function() {
    var r = build({
      rows: [
        { logical: "row", name: "Source", values: ["A\u001fB", "A"] },
        { logical: "row", name: "Dest",   values: ["C", "B\u001fC"] }
      ],
      measures: [{ logical: "measures", name: "N", values: [1, 1] }]
    });
    assert.strictEqual(r.model.edges.length, 2);
  });
});

// ============================================================================
suite("WSU Glossary Pivot", function() {
  var mod = H.loadPlugin("com-wsu-glossary-pivot", "glossaryPivotViz.js");

  test("a rowspan label is repeated on every printed body row", function() {
    var flat = mod._expandBodyRowspans([
      [
        { html: "Fall", colspan: 1, rowspan: 2, tag: "th" },
        { html: "A", colspan: 1, rowspan: 1, tag: "th" },
        { html: "10", colspan: 1, rowspan: 1, tag: "td" }
      ],
      [
        { html: "B", colspan: 1, rowspan: 1, tag: "th" },
        { html: "20", colspan: 1, rowspan: 1, tag: "td" }
      ]
    ]);
    assert.strictEqual(flat.length, 2);
    assert.strictEqual(flat[1][0].html, "Fall");
    assert.strictEqual(flat[1][1].html, "B");
    assert.strictEqual(flat[1][2].html, "20");
    assert.strictEqual(flat[1].length, 3);
  });

  test("a colspan total label stays one cell", function() {
    var flat = mod._expandBodyRowspans([[
      { html: "Total", colspan: 2, rowspan: 1, tag: "th" },
      { html: "30", colspan: 1, rowspan: 1, tag: "td" }
    ]]);
    assert.strictEqual(flat[0].length, 2);
    assert.strictEqual(flat[0][0].html, "Total");
    assert.strictEqual(flat[0][0].colspan, 2);
  });

  test("Print Canvas, One page per report (forceBreaks): the break goes on the table itself, not a wrapping div, and not before the first section", function() {
    var joined = mod._joinPrintSections(["<table class='a'>A</table>", "<table class='b'>B</table>"], true);
    assert.strictEqual(joined.indexOf("<div"), -1, "no wrapping div — a forced break on an ancestor that plays no part in the table's own pagination is a known source of an extra blank page");
    assert.strictEqual(joined.indexOf("<table class='a'>A</table>"), 0, "first section is unchanged and starts the document");
    assert.ok(joined.indexOf("<table style='page-break-before:always;break-before:page' class='b'>B</table>") >= 0, "break style lands on the second table's own tag");
  });

  test("Print Canvas, One page per report: a single section gets no page break", function() {
    var joined = mod._joinPrintSections(["<table>Only</table>"], true);
    assert.strictEqual(joined, "<table>Only</table>");
  });

  test("Print Canvas, Minimize blank space (optional, forceBreaks false): sections just concatenate, no break anywhere", function() {
    var joined = mod._joinPrintSections(["<table class='a'>A</table>", "<table class='b'>B</table>"], false);
    assert.strictEqual(joined, "<table class='a'>A</table><table class='b'>B</table>");
    assert.strictEqual(joined.indexOf("page-break-before"), -1);
  });

  test("a rich-text editor title prints as plain text", function() {
    assert.strictEqual(mod._plainTitle("<p><strong>Dataset</strong></p>"), "Dataset");
    assert.strictEqual(mod._plainTitle("&lt;p&gt;&lt;strong&gt;Dataset&lt;/strong&gt;&lt;/p&gt;"), "Dataset");
  });

  test("page margin is the property value on every page", function() {
    assert.strictEqual(mod._printPageBox("narrow", "landscape").margin, "0.25in");
    assert.strictEqual(mod._printPageBox("normal", "portrait").margin, "0.5in");
    assert.strictEqual(mod._printPageBox("wide", "portrait").margin, "1in");
    assert.strictEqual(mod._printPageBox("normal", "landscape").padding, "0");
    assert.strictEqual(mod._printPageBox("normal", "portrait").size, "8.5in 11in");
    assert.strictEqual(mod._printPageBox("normal", "landscape").size, "11in 8.5in");
  });

  test("a wide report scales down further in portrait than in landscape", function() {
    var portrait = mod._fitScale(1500, "normal", "portrait");
    var landscape = mod._fitScale(1500, "normal", "landscape");
    assert.ok(portrait < landscape);
    assert.ok(landscape < 1);
    assert.strictEqual(mod._fitScale(100, "wide", "portrait"), 1);
  });

  test("a table narrower than the page sizes to the margins", function() {
    var layout = mod._printTableLayout(400, "normal", "landscape", "margins");
    assert.strictEqual(layout.width, "100%");
    assert.strictEqual(layout.layout, "auto");
    assert.strictEqual(layout.scale, 1);
  });

  test("content sizing leaves a narrow table at its own width", function() {
    var layout = mod._printTableLayout(400, "normal", "landscape", "content");
    assert.strictEqual(layout.width, "max-content");
    assert.strictEqual(layout.layout, "auto");
    assert.strictEqual(layout.scale, 1);
  });

  test("a table wider than the page reflows to the page width, with a matching font shrink", function() {
    var expectedScale = mod._fitScale(2000, "normal", "portrait");
    var margins = mod._printTableLayout(2000, "normal", "portrait", "margins");
    var content = mod._printTableLayout(2000, "normal", "portrait", "content");
    assert.ok(expectedScale < 1, "a 2000px table should not fit an untouched portrait page");
    assert.strictEqual(margins.scale, 6 / 9, "font shrink stops at 6pt");
    assert.strictEqual(margins.width, "max-content", "an over-wide table keeps its natural width");
    assert.strictEqual(margins.layout, "auto");
    assert.strictEqual(content.scale, margins.scale);
    assert.strictEqual(content.width, "max-content");
    assert.strictEqual(content.layout, "auto");
  });

  test("Print Canvas defaults to one page per report", function() {
    assert.strictEqual(H.instance(mod).Config.printCanvasSpacing, "perReport");
  });

  test("print fitting remeasures at smaller text and preserves the 6pt floor", function() {
    function table(natural, padding) {
      return {
        style: {}, scrollWidth: 0,
        getBoundingClientRect: function() {
          return { width: padding + (natural - padding) * parseFloat(this.style.fontSize || "9") / 9 };
        }
      };
    }
    var fits = table(1100, 100), over = table(1800, 100);
    var doc = { getElementsByTagName: function() { return [fits, over]; } };
    assert.strictEqual(mod._fitPrintedReport(doc, "landscape", "normal", ["margins", "content"]), 1);
    assert.strictEqual(fits.style.tableLayout, "auto");
    assert.strictEqual(fits.style.width, "100%");
    assert.ok(parseFloat(fits.style.fontSize) >= 6 && parseFloat(fits.style.fontSize) < 9);
    assert.strictEqual(over.style.fontSize, "6pt");
    assert.strictEqual(over.style.width, "max-content");
  });

  test("zero-width print tables remain at 9pt", function() {
    var table = { style: {}, scrollWidth: 0, getBoundingClientRect: function() { return { width: 0 }; } };
    var doc = { getElementsByTagName: function() { return [table]; } };
    assert.strictEqual(mod._fitPrintedReport(doc, "portrait", "normal", ["content"]), 0);
    assert.strictEqual(table.style.fontSize, "9pt");
    assert.strictEqual(table.style.width, "max-content");
  });

  test("invalid per-measure precision cannot blank the pivot", function() {
    var parsed = mod._parseMeasureFormatOverrides("A:number:-1; B:currency:101; C:percent:2; D:bogus:2");
    assert.deepStrictEqual(Object.keys(parsed), ["C"]);
    assert.strictEqual(mod._formatValue(1234.5, { numberFormat: "currency", decimalPlaces: "101" }), "$1,234.50");
  });

  /* Reported live: on a pivot mixing a native measure (Headcount) with
     calculated ones (Full-Time, Part-Time, % Full-Time), only Headcount's
     per-measure format override took effect. Root cause, confirmed by
     instrumenting the real getValue(..., true) call live: a calculated
     measure's raw id comes back null, and the old code folded that into
     the SAME "__single__" sentinel used for "no measure-labels layer at
     all" — silently merging every calculated measure into one shared
     bucket. That corrupted three independent features that all key off
     this same array: per-measure format overrides could never reach a
     calculated measure, a Grand Total Column would sum unrelated
     calculated measures together, the heat map would pool their ranges
     together, and Header: Hidden Columns could never hide one of them
     (colHidden explicitly refuses to check a "__single__" id against the
     hidden list). Fixed by falling back to the measure's own display name
     instead of the sentinel when its raw id is null. */
  var LM_TEST = { LAYER_DISPLAY_NAME: "displayName", LAYER_ID: "id", LAYER_ISMEASURE_LABELS: "isMeasureLabels" };

  test("a calculated measure whose raw id is null keeps its own bucket, not the __single__ sentinel", function() {
    var names = ["Headcount", "Full-Time", "Part-Time", "% Full-Time"];
    var ids = ["HEADCOUNT", null, null, null];
    var dl = {
      getLayerMetadata: function(edge, layer, key) { return key === LM_TEST.LAYER_ISMEASURE_LABELS ? true : null; },
      getValue: function(edge, layer, c, raw) { return raw ? ids[c] : names[c]; }
    };
    var result = mod._computeMeasureIdByCol(dl, LM_TEST, 1, names.length);
    assert.strictEqual(result.idByCol[0], "HEADCOUNT");
    assert.strictEqual(result.idByCol[1], "Full-Time");
    assert.strictEqual(result.idByCol[2], "Part-Time");
    assert.strictEqual(result.idByCol[3], "% Full-Time");
    var distinct = {};
    result.idByCol.forEach(function(id) { distinct[id] = true; });
    assert.strictEqual(Object.keys(distinct).length, 4, "each measure keeps its own bucket");
    assert.notStrictEqual(result.idByCol[1], "__single__");
    assert.strictEqual(result.nameById["Full-Time"], "Full-Time");
  });

  test("computeMeasureIdByCol still uses the __single__ sentinel when there is truly no measure-labels layer", function() {
    var dl = { getLayerMetadata: function() { return null; }, getValue: function() { return null; } };
    var result = mod._computeMeasureIdByCol(dl, LM_TEST, 0, 1);
    assert.strictEqual(result.idByCol[0], "__single__");
  });

  /* The actual live cause, found only after 0.16.1 shipped and was tested
     against the real tenant: a calculated measure's raw id is NOT null —
     confirmed with stack-trace-precise instrumentation on the reported
     workbook. OAC assigns it a real but opaque, auto-generated code
     ("c34"), never shown anywhere in the UI, so an author can only ever
     type the printed header text into the override field — which never
     matched that opaque id. resolveFormat now falls back to matching by
     measure name when the id lookup misses. Verified against the exact
     override string and opaque id from the live workbook. */
  test("resolveFormat falls back to the measure's display name when its id is a real but opaque code", function() {
    var overrides = mod._parseMeasureFormatOverrides("Full-Time:number:0");
    var Config = { numberFormat: "auto", decimalPlaces: "auto" };
    var fmt = mod._resolveFormat(Config, overrides, "c34", "Full-Time");
    assert.strictEqual(fmt.numberFormat, "number");
    assert.strictEqual(fmt.decimalPlaces, "0");
  });

  test("resolveFormat still prefers a real id match over the name fallback", function() {
    var overrides = mod._parseMeasureFormatOverrides("CUM_GPA:currency:2;Cumulative GPA:number:0");
    var Config = { numberFormat: "auto", decimalPlaces: "auto" };
    var fmt = mod._resolveFormat(Config, overrides, "CUM_GPA", "Cumulative GPA");
    assert.strictEqual(fmt.numberFormat, "currency", "the id match (more specific) wins over the name match");
  });

  test("resolveFormat falls back to the global Config when neither id nor name match", function() {
    var overrides = mod._parseMeasureFormatOverrides("Full-Time:number:0");
    var Config = { numberFormat: "percent", decimalPlaces: "1" };
    var fmt = mod._resolveFormat(Config, overrides, "c29", "% Female");
    assert.strictEqual(fmt.numberFormat, "percent");
    assert.strictEqual(fmt.decimalPlaces, "1");
  });

  test("contrast choice handles bright, dark, and middle colors", function() {
    assert.ok(mod._headerPaint("#ffffff").style.indexOf("#000000") >= 0);
    assert.ok(mod._headerPaint("#000000").style.indexOf("#ffffff") >= 0);
    assert.strictEqual(mod._interpolateColor("#999999", "#999999", 0.5).fg, "#000000");
  });

  test("Print Canvas includes off-screen active tables in visual order and excludes inactive panels", function() {
    var selected = { id: "mgr-tabitem-snapshot!canvas!1" };
    var manager = { id: "mgr", querySelector: function() { return selected; }, parentNode: null };
    var content = { parentNode: manager };
    function panel(id) {
      return { id: "mgr-" + id, className: "bitech-rui-tab-panel-wrapper", parentNode: content,
        getBoundingClientRect: function() { return { top: 100, left: 0, width: 1000, height: 1000 }; },
        getAttribute: function() { return null; } };
    }
    var active = panel("canvas!1"), inactive = panel("canvas!3");
    function container(parent, top, left) {
      return { parentNode: parent, getAttribute: function() { return null; },
        getBoundingClientRect: function() { return { top: top, left: left, width: 200, height: 100 }; },
        compareDocumentPosition: function() { return 0; } };
    }
    var self = container(active, 200, 20);
    var above = container(active, -500, 20);
    var below = container(active, 1300, 20);
    var stale = container(inactive, 200, 20);
    var hidden = container(active, 250, 20); hidden._css = { display: "none", visibility: "visible" };
    var detached = container(active, 300, 20); detached._connected = false;
    function entry(el) { return { getContainer: function() { return el; }, build: function() {} }; }
    var eSelf = entry(self), eAbove = entry(above), eBelow = entry(below);
    var found = mod._collectPrintCanvasEntries(self, {
      self: eSelf, above: eAbove, below: eBelow, stale: entry(stale), hidden: entry(hidden),
      detached: entry(detached), broken: { getContainer: function() { throw Error("gone"); }, build: function() {} }
    });
    assert.deepStrictEqual(Array.prototype.slice.call(found), [eAbove, eSelf, eBelow]);
  });

  test("Print Canvas fails closed if the clicked panel is not selected", function() {
    var manager = { id: "mgr", querySelector: function() { return { id: "mgr-tabitem-snapshot!canvas!3" }; } };
    var panel = { id: "mgr-canvas!1", className: "bitech-rui-tab-panel-wrapper",
      parentNode: { parentNode: manager } };
    var el = { parentNode: panel };
    assert.strictEqual(mod._collectPrintCanvasEntries(el, { x: { getContainer: function() { return el; }, build: function() {} } }).length, 0);
  });

  test("Print Canvas fails closed if the canvas panel cannot be measured", function() {
    var manager = { id: "mgr", querySelector: function() { return { id: "mgr-tabitem-snapshot!canvas!1" }; } };
    var panel = { id: "mgr-canvas!1", className: "bitech-rui-tab-panel-wrapper",
      parentNode: { parentNode: manager }, getBoundingClientRect: function() { throw Error("removed"); } };
    var el = { parentNode: panel };
    assert.strictEqual(mod._collectPrintCanvasEntries(el, { x: { getContainer: function() { return el; }, build: function() {} } }).length, 0);
  });

  /* The in-editor tab-panel host (canvasComponentManager, live for the
     entire time a property panel is open, and for Preview/Run entered
     from the editor) ids its selected tab "<mgr>-tabitem-<suffix>", with
     no "snapshot!" infix, unlike the read-mode host
     (insightComponentManager: "<mgr>-tabitem-snapshot!<suffix>"). Before
     this was recognized, every Print Canvas click taken while editing
     properties saw zero selected tabs and failed closed, even though the
     clicked panel was genuinely the one on screen — confirmed live on the
     dev tenant, reported as "No tables on this canvas could be printed"
     immediately after changing Print Orientation, persisting until the
     report was fully closed and reopened (a fresh load restores the
     read-mode host). */
  function selectableFixture(panelSuffix, selectedDataBiItemId) {
    var selected = { id: "mgr-tabitem-x", getAttribute: function(name) {
      return name === "data-bi-item-id" ? selectedDataBiItemId : null;
    } };
    var manager = { id: "mgr", querySelector: function() { return selected; } };
    var panel = { id: "mgr-" + panelSuffix, className: "bitech-rui-tab-panel-wrapper",
      parentNode: { parentNode: manager },
      getBoundingClientRect: function() { return { top: 0, left: 0, width: 500, height: 300 }; },
      getAttribute: function() { return null; } };
    var el = { parentNode: panel, getAttribute: function() { return null; },
      getBoundingClientRect: function() { return { top: 10, left: 10, width: 200, height: 100 }; },
      compareDocumentPosition: function() { return 0; } };
    return mod._collectPrintCanvasEntries(el, { x: { getContainer: function() { return el; }, build: function() {} } });
  }

  test("Print Canvas recognizes the in-editor tab id shape (data-bi-item-id, no snapshot! prefix)", function() {
    assert.strictEqual(selectableFixture("canvas!3", "canvas!3").length, 1);
  });

  test("Print Canvas recognizes the read-mode tab id shape via data-bi-item-id (snapshot! prefix)", function() {
    assert.strictEqual(selectableFixture("canvas!1", "snapshot!canvas!1").length, 1);
  });

  test("Print Canvas fails closed when data-bi-item-id belongs to a different panel", function() {
    assert.strictEqual(selectableFixture("canvas!3", "canvas!1").length, 0);
    assert.strictEqual(selectableFixture("canvas!3", "snapshot!canvas!1").length, 0);
  });

  test("an empty render invalidates the previous printable layout", function() {
    var viz = H.instance(mod);
    viz.getContainerElem = function() { return {}; };
    viz._lastDataLayout = { old: true };
    viz._markedRows[4] = true;
    viz._doRender({ get: function() { return null; } });
    assert.strictEqual(viz._lastDataLayout, null);
    assert.strictEqual(Object.keys(viz._markedRows).length, 0);
  });

  test("a removed live description leaves no tooltip (no bundled fallback, removed v0.16.0)", function() {
    var viz = H.instance(mod);
    var layout = {};
    viz.getContainerElem = function() { return {}; };
    viz._buildTable = function() { return "<table></table>"; };
    viz._replaceTableHtml = function() {};
    viz._wireTooltips = viz._wireMarking = viz._wireKeyboardRows = viz._wireGroupToggle = viz._wireSort = viz._applyMarkedRows = function() {};
    function context(map) {
      return { get: function(key) {
        if (key === "dl") return layout;
        if (key === "vizContext") return { _properties: { "obitech-report/datavisualization#columnInfoMap": map } };
        return null;
      } };
    }
    viz._doRender(context({ CUM_GPA: { _info: { desc: "Temporary text" } } }));
    assert.strictEqual(viz._glossary.getDescription("CUM_GPA", "CUM_GPA").text, "Temporary text");
    viz._doRender(context({}));
    assert.strictEqual(viz._glossary.getDescription("CUM_GPA", "CUM_GPA"), null);
  });

  test("a workbook override still outranks live catalog text (2-tier ranking after v0.16.0)", function() {
    var glossary = mod._buildGlossary();
    glossary.mergeLive({ CUM_GPA: { text: "Catalog text", origin: "live" } });
    assert.strictEqual(glossary.getDescription("CUM_GPA", "CUM_GPA").text, "Catalog text");
    assert.strictEqual(glossary.getDescription("CUM_GPA", "CUM_GPA").origin, "live");
    glossary.mergeLive({ CUM_GPA: { text: "Author's own wording", origin: "override" } });
    assert.strictEqual(glossary.getDescription("CUM_GPA", "CUM_GPA").text, "Author's own wording");
    assert.strictEqual(glossary.getDescription("CUM_GPA", "CUM_GPA").origin, "override");
  });

  test("a column with neither live nor override text has no tooltip", function() {
    var glossary = mod._buildGlossary();
    assert.strictEqual(glossary.getDescription("NOT_A_REAL_COLUMN", "NOT_A_REAL_COLUMN"), null);
  });

  /* Closes a gap an independent review found: the tests above exercise only
     the pure glossary functions, not the actual rendered header markup. A
     future change could leave gp-has-desc (and the tooltip hover/focus
     hooks that class wires) on a no-match header while those tests still
     passed. This renders a real table through _buildTable and inspects the
     header <th> HTML for the class itself, for both a matched and an
     unmatched row layer. */
  test("a no-match header carries no gp-has-desc class; a matched one does", function() {
    var viz = H.instance(mod, null, { showDescriptions: "on" });
    viz._glossary = mod._buildGlossary();
    viz._glossary.mergeLive({ OUTER: { text: "Outer group description", origin: "live" } });
    var layout = {
      getLayerCount: function(edge) { return edge === "row" ? 2 : (edge === "column" ? 1 : 0); },
      getEdgeExtent: function(edge) { return edge === "row" ? 1 : (edge === "column" ? 1 : 0); },
      getLayerMetadata: function(edge, layer, key) {
        if (key === "isMeasureLabels") return false;
        if (key === "id") return edge === "row" ? (layer ? "INNER" : "OUTER") : "CATEGORY";
        return edge === "row" ? (layer ? "Inner" : "Outer") : "Category";
      },
      getValue: function(edge, a, b) {
        if (edge === "row") return a === 0 ? "Group" : "A";
        if (edge === "column") return "Member";
        if (edge === "data") return 1;
        return null;
      },
      getItemEndSlice: function(edge, layer, index) { return index; }
    };
    var html = viz._buildTable(layout);
    function cellAttrs(sortMarker) {
      var markerIdx = html.indexOf(sortMarker);
      assert.ok(markerIdx >= 0, sortMarker + " should be in the rendered table");
      var openIdx = html.lastIndexOf("<th", markerIdx);
      return html.slice(openIdx, markerIdx);
    }
    assert.ok(cellAttrs("data-gp-sort='row:0'").indexOf("gp-has-desc") >= 0,
      "OUTER has a live description and should carry gp-has-desc");
    assert.ok(cellAttrs("data-gp-sort='row:1'").indexOf("gp-has-desc") < 0,
      "INNER has no description and must not carry gp-has-desc");
  });

  test("a late marking callback cannot overwrite a newer layout", function() {
    var viz = H.instance(mod);
    var pending = [];
    var layoutA = {}, layoutB = {};
    viz._applyMarkedRows = function() {};
    viz.getMarkingService = function() { return {
      getUpdatedMarkingSet: function(dl, op, callback) { pending.push(callback); },
      traverseDataEdgeMarks: function(dl, callback) { callback(7); }
    }; };
    viz._lastDataLayout = layoutA;
    viz._renderRevision = 1;
    viz._syncIncomingMarks({ get: function() { return layoutA; } });
    viz._lastDataLayout = layoutB;
    viz._renderRevision = 2;
    viz._markedRows[3] = true;
    pending[0]();
    assert.strictEqual(viz._markedRows[3], true);
    viz._syncIncomingMarks({ get: function() { return layoutB; } });
    pending[1]();
    assert.strictEqual(viz._markedRows[7], true);
    assert.strictEqual(viz._markedRows[3], undefined);
  });

  test("print handlers exist before print; repeat, afterprint, and exceptions clean the iframe", function() {
    var frames = [], wins = [];
    var body = {
      appendChild: function(frame) { frame.parentNode = this; frames.push(frame); },
      removeChild: function(frame) { frames.splice(frames.indexOf(frame), 1); frame.parentNode = null; }
    };
    var printDoc = {
      body: { getBoundingClientRect: function() {}, scrollHeight: 900 },
      documentElement: { scrollHeight: 900 },
      open: function() {}, write: function() {}, close: function() {},
      getElementsByTagName: function() { return []; }
    };
    var outerDoc = { body: body, createElement: function() {
      var win = { document: printDoc, focus: function() {}, print: function() {
        assert.strictEqual(typeof this.onafterprint, "function", "handler registered before print");
      } };
      wins.push(win);
      return { style: {}, setAttribute: function() {}, contentWindow: win, parentNode: null };
    } };
    var printMod = H.loadPlugin("com-wsu-glossary-pivot", "glossaryPivotViz.js", { document: outerDoc });
    var viz = H.instance(printMod);
    assert.strictEqual(printMod._openGlossaryPrint(viz, "<html></html>", "landscape", "normal", ["margins"]).ok, true);
    assert.strictEqual(frames.length, 1);
    assert.strictEqual(printMod._openGlossaryPrint(viz, "<html></html>", "landscape", "normal", ["margins"]).busy, true);
    assert.strictEqual(frames.length, 1, "rapid repeat preserves the active print frame");
    wins[0].onafterprint();
    assert.strictEqual(frames.length, 0);
    assert.strictEqual(viz._printFrame, null);
    assert.strictEqual(printMod._openGlossaryPrint(viz, "<html></html>", "landscape", "normal", ["margins"]).ok, true);
    viz._doStopComponent();
    assert.strictEqual(frames.length, 0, "component stop removes its print frame");
    outerDoc.createElement = function() {
      var win = { document: printDoc, focus: function() {}, print: function() { throw Error("printer failed"); } };
      return { style: {}, setAttribute: function() {}, contentWindow: win, parentNode: null };
    };
    assert.strictEqual(printMod._openGlossaryPrint(viz, "<html></html>", "landscape", "normal", ["margins"]).ok, false);
    assert.strictEqual(frames.length, 0, "exception removes its frame");
    assert.strictEqual(viz._printFrame, null);
  });

  test("sort and collapse stay keyboard reachable; hiding all row fields restores detail", function() {
    var viz = H.instance(mod, null, { rowGroupCollapse: "on", showDescriptions: "off" });
    viz._glossary = mod._buildGlossary();
    var layout = {
      getLayerCount: function(edge) { return edge === "row" ? 2 : (edge === "column" ? 1 : 0); },
      getEdgeExtent: function(edge) { return edge === "row" ? 2 : (edge === "column" ? 1 : 0); },
      getLayerMetadata: function(edge, layer, key) {
        if (key === "isMeasureLabels") return false;
        if (key === "id") return edge === "row" ? (layer ? "INNER" : "OUTER") : "CATEGORY";
        return edge === "row" ? (layer ? "Inner" : "Outer") : "Category";
      },
      getValue: function(edge, a, b, raw) {
        if (edge === "row") return a === 0 ? "Group" : (b ? "B" : "A");
        if (edge === "column") return "Member";
        if (edge === "data") return b ? 2 : 1;
        return null;
      },
      getItemEndSlice: function(edge, layer, index) { return edge === "row" && layer === 0 ? 1 : index; }
    };
    var expanded = viz._buildTable(layout);
    assert.ok(expanded.indexOf("aria-expanded='true'") >= 0);
    assert.ok(expanded.indexOf("<button type='button' class='gp-group-toggle'") >= 0);
    assert.ok(expanded.indexOf("data-gp-sort='row:0' aria-sort='none'") >= 0);
    assert.ok(expanded.indexOf("scope='row'") >= 0);
    viz._collapsedGroups[0] = true;
    assert.ok(viz._buildTable(layout).indexOf("aria-expanded='false'") >= 0);
    viz.Config.hiddenColumns = "OUTER; INNER";
    var hidden = viz._buildTable(layout);
    assert.strictEqual(hidden.indexOf("gp-collapsed"), -1, "a hidden control cannot leave an unexpandable aggregate");
    assert.ok(hidden.indexOf("data-gp-row='0'") >= 0 && hidden.indexOf("data-gp-row='1'") >= 0);
  });

  /* ---- 0.17.0: the data team's fix list (2026-09-29) ----
     The IPEDS 2026 Spring pivot from the report: the native pivot's Grand
     Total for % Full-Time is 86.29 and for % Female 54.37; the Glossary
     Pivot summed the rows (243.05, 182.8). */
  function ipedsLayout(opts) {
    opts = opts || {};
    var hc = [19518, 2679, 1263], ft = [17399, 1703, 1141], fem = [10344, 1459, 952], intl = [458, 693, 23];
    var cols = [
      { id: "HEADCOUNT", name: "Headcount", raw: hc, fmt: function(v) { return v.toLocaleString("en-US"); } },
      { id: "c31", name: "Full-Time", raw: ft, fmt: function(v) { return v.toLocaleString("en-US"); } },
      { id: "c34", name: "% Full-Time", raw: hc.map(function(h, i) { return ft[i] / h * 100; }), fmt: function(v) { return v.toFixed(2); } },
      { id: "c40", name: "% Female", raw: hc.map(function(h, i) { return fem[i] / h * 100; }), fmt: function(v) { return v.toFixed(1); } },
      { id: "INTL", name: "International", raw: intl, fmt: function(v) { return v.toLocaleString("en-US"); } },
      { id: "c44", name: "% International", raw: hc.map(function(h, i) { return intl[i] / h; }), fmt: function(v) { return (v * 100).toFixed(1) + "%"; } }
    ];
    if (opts.dropHeadcount) cols.shift();
    return {
      cols: cols,
      getLayerCount: function(edge) { return edge === "row" ? 2 : (edge === "column" ? 1 : 0); },
      getEdgeExtent: function(edge) { return edge === "row" ? 3 : (edge === "column" ? cols.length : 0); },
      getLayerMetadata: function(edge, layer, key) {
        if (edge === "column") return key === "isMeasureLabels" ? true : (key === "id" ? "DM!MEASURE_DIMENSION" : "Measures");
        if (key === "isMeasureLabels") return false;
        if (key === "id") return layer ? "IPEDS_LEVEL" : "TERM";
        return layer ? "IPEDS Degree Level" : "Term";
      },
      getValue: function(edge, a, b, raw) {
        if (edge === "row") return a === 0 ? "2026 Spring" : ["Undergraduate", "Graduate", "Professional"][b];
        if (edge === "column") return raw ? cols[b].id : cols[b].name;
        if (edge === "data") return raw ? cols[b].raw[a] : cols[b].fmt(cols[b].raw[a]);
        return null;
      },
      getItemEndSlice: function(edge, layer, index) { return edge === "row" && layer === 0 ? 2 : index; }
    };
  }
  function totalRowCells(html) {
    var row = html.slice(html.lastIndexOf("<tr class='gp-total-row'>"));
    var cells = [], re = /<td class='gp-val gp-total-val'>([^<]*)<\/td>/g, m;
    while ((m = re.exec(row))) cells.push(m[1]);
    return cells;
  }

  test("without a rule a rate still sums (unchanged default), but formatted like its cells", function() {
    var viz = H.instance(mod, null, { showGrandTotalRow: "on", showDescriptions: "off" });
    viz._glossary = mod._buildGlossary();
    var cells = totalRowCells(viz._buildTable(ipedsLayout()));
    assert.strictEqual(cells[0], "23,460", "Headcount sum keeps OAC's grouping");
    assert.strictEqual(cells[2], "243.05", "the reported wrong total, now at least two decimals like its cells");
  });

  test("weighted(Headcount) and ratio(N, D) reproduce the native pivot's grand totals", function() {
    var viz = H.instance(mod, null, {
      showGrandTotalRow: "on", showDescriptions: "off",
      totalRules: "% Full-Time = weighted(Headcount); % Female = WEIGHTED( headcount ); % International = ratio(International, Headcount)"
    });
    viz._glossary = mod._buildGlossary();
    var cells = totalRowCells(viz._buildTable(ipedsLayout()));
    assert.strictEqual(cells[2], "86.29", "% Full-Time = 20,243 / 23,460");
    assert.strictEqual(cells[3], "54.4", "% Female = 12,755 / 23,460, at the column's own 1 decimal");
    assert.strictEqual(cells[5], "5.0%", "% International = 1,174 / 23,460, not the row average (10%) or the sum (30%)");
    assert.strictEqual(cells[0], "23,460", "unlisted measures still sum");
  });

  test("a weight can be hidden and still drives the total; ratio scale argument applies", function() {
    var viz = H.instance(mod, null, {
      showGrandTotalRow: "on", showDescriptions: "off", hiddenColumns: "Headcount",
      totalRules: "% Full-Time = ratio(Full-Time, Headcount, 100)"
    });
    viz._glossary = mod._buildGlossary();
    var html = viz._buildTable(ipedsLayout());
    assert.strictEqual(html.indexOf(">Headcount<"), -1, "Headcount is not drawn");
    assert.strictEqual(totalRowCells(html)[1], "86.29");
  });

  test("a rule naming a measure that is not on the pivot leaves the total blank and says why", function() {
    var viz = H.instance(mod, null, { showGrandTotalRow: "on", showDescriptions: "off",
      totalRules: "% Full-Time = weighted(Headcount); bogus rule" });
    viz._glossary = mod._buildGlossary();
    var warnings = [];
    viz._warnConfig = function(rejected, missing) { warnings.push(JSON.parse(JSON.stringify([rejected, missing]))); };
    var cells = totalRowCells(viz._buildTable(ipedsLayout({ dropHeadcount: true })));
    assert.strictEqual(cells[1], "", "blank, never a wrong sum");
    assert.deepStrictEqual(warnings[0][0], ["bogus rule"]);
    assert.deepStrictEqual(warnings[0][1], ["Headcount"]);
  });

  test("subtotals, collapsed groups, and the grand total column use the same rule", function() {
    var ctx = {
      num: function(r, cc) { return [[80, 100], [20, 50]][r][cc]; },
      sibling: function(cc, ref) { return ref === "W" ? 1 : null; }
    };
    assert.strictEqual(mod._aggregateCells(0, 1, [0], { kind: "weighted", a: "W" }, ctx), (80 * 100 + 20 * 50) / 150);
    assert.strictEqual(mod._aggregateCells(0, 1, [0], { kind: "avg" }, ctx), 50);
    assert.strictEqual(mod._aggregateCells(0, 1, [0], { kind: "min" }, ctx), 20);
    assert.strictEqual(mod._aggregateCells(0, 1, [0], { kind: "none" }, ctx), null);
    assert.strictEqual(mod._aggregateCells(0, 1, [0], null, ctx), 100);
    assert.strictEqual(mod._aggregateCells(0, 1, [0], { kind: "weighted", a: "X" }, ctx), null);
  });

  test("total rules parse case-insensitively and reject malformed entries", function() {
    var rejected = [];
    var rules = mod._parseTotalRules("A = Sum; B=AVERAGE; C = weighted(Head count); D = ratio(N, D, 100); E = ratio(N); F = what; = sum", rejected);
    assert.strictEqual(rules.A.kind, "sum");
    assert.strictEqual(rules.B.kind, "avg");
    assert.strictEqual(rules.C.a, "Head count");
    assert.strictEqual(rules.D.scale, 100);
    assert.deepStrictEqual(Object.keys(rules), ["A", "B", "C", "D"]);
    assert.strictEqual(rejected.length, 3);
  });

  test("auto format for a computed total copies the cells' look", function() {
    function like(n, raw, formatted) { return mod._formatLike(n, mod._inferAutoFormat(raw, formatted)); }
    assert.strictEqual(like(1234567.891, 18105.33, "18,105.33"), "1,234,567.89");
    assert.strictEqual(like(1234567.891, 18105.33, "$18,105.33"), "$1,234,567.89");
    assert.strictEqual(like(-5.5, 1, "$1.00"), "-$5.50");
    assert.strictEqual(like(0.05004, 0.398, "39.8%"), "5.0%", "OAC multiplied by 100");
    assert.strictEqual(like(86.29, 89.14, "89.14%"), "86.29%", "a percent sign without ×100");
    assert.strictEqual(like(0.1 + 0.2, 1, "1"), "0");
    assert.strictEqual(mod._formatLike(0.1 + 0.2, null), "0.3", "no sample: float noise trimmed");
    assert.strictEqual(mod._formatLike(1234567.5, null), "1,234,567.5");
    assert.strictEqual(mod._formatValue(0.1 + 0.2, { numberFormat: "number", decimalPlaces: "auto" }), "0.3");
  });

  test("per-measure overrides: any case, aliases, colons in names, qualified ids by tail", function() {
    var rejected = [];
    var o = mod._parseMeasureFormatOverrides("% Full-Time:Percent:1; Ratio: A:B:number:0; Rate:percentage; X:bogus:2", rejected);
    assert.strictEqual(o["% FULL-TIME"].numberFormat, "percent");
    assert.strictEqual(o["RATIO: A:B"].decimalPlaces, "0");
    assert.strictEqual(o.RATE.numberFormat, "percent");
    assert.deepStrictEqual(rejected, ["X:bogus:2"]);
    var cfg = { numberFormat: "auto", decimalPlaces: "auto" };
    var q = mod._parseMeasureFormatOverrides("Headcount:number:0");
    assert.strictEqual(mod._resolveFormat(cfg, q, "\"SA\".\"Facts\".\"Headcount\"", "Student Headcount").numberFormat, "number");
  });

  test("layout settings: alignment variables, width classes, and the colgroup", function() {
    var attrs = mod._tableLayoutAttrs({ rowHeaderAlign: "right", rowHeaderVAlign: "top", colHeaderAlign: "bogus",
      tableWidth: "fixed", tableWidthPx: "900", wrapText: "headers" });
    assert.ok(attrs.style.indexOf("--gp-rh-align:right") >= 0);
    assert.ok(attrs.style.indexOf("--gp-rh-valign:top") >= 0);
    assert.ok(attrs.style.indexOf("--gp-ch-align:center") >= 0, "an invalid value falls back to the default");
    assert.ok(attrs.style.indexOf("width:900px") >= 0);
    assert.ok(attrs.cls.indexOf("gp-tw-fixed") >= 0 && attrs.cls.indexOf("gp-wrap-hdr") >= 0);
    assert.ok(mod._tableLayoutAttrs({ tableWidth: "fixed", tableWidthPx: "" }).cls.indexOf("gp-tw-fill") >= 0,
      "fixed without a width fills");

    var viz = H.instance(mod, null, { showDescriptions: "off", columnWidth: "70",
      columnWidths: "% Full-Time: 55; IPEDS Degree Level: 120; Bad: wide" });
    viz._glossary = mod._buildGlossary();
    var warnings = [];
    viz._warnConfig = function(rejected) { warnings.push(JSON.parse(JSON.stringify(rejected))); };
    var html = viz._buildTable(ipedsLayout());
    var cg = html.slice(html.indexOf("<colgroup>"), html.indexOf("</colgroup>"));
    assert.strictEqual((cg.match(/<col[ >]/g) || []).length, 2 + 6, "two row fields plus six value columns");
    assert.ok(cg.indexOf("width:120px") >= 0 && cg.indexOf("width:55px") >= 0 && cg.indexOf("width:70px") >= 0);
    assert.deepStrictEqual(warnings[0], ["Bad: wide"]);
    viz.Config.columnWidth = ""; viz.Config.columnWidths = "";
    assert.strictEqual(viz._buildTable(ipedsLayout()).indexOf("<colgroup>"), -1, "no widths, no colgroup");
  });

  test("print never grants a mid-word break and follows the alignment settings", function() {
    var doc = mod._wrapPrintDocument("T", "landscape", "<table></table>", "normal");
    assert.strictEqual(doc.indexOf("break-word"), -1);
    assert.strictEqual(doc.indexOf("break-all"), -1);
    assert.ok(doc.indexOf("overflow-wrap: normal") >= 0);
    assert.ok(doc.indexOf("var(--gp-rh-align, left)") >= 0);
  });

  test("wrapped labels keep hyphenated words and a leading % whole", function() {
    assert.strictEqual(mod._labelHtml("% Full-Time"), "% <span class='gp-nobr'>Full-Time</span>");
    assert.strictEqual(mod._labelHtml("Headcount Converted FTE"), "Headcount Converted FTE");
    assert.strictEqual(mod._labelHtml("<b>"), "&lt;b&gt;", "still escaped");
  });

  /* ---- 0.18.0: data bars ---- */
  test("data bars: listed measures only, own color, number after the bar, none on totals", function() {
    var viz = H.instance(mod, null, { showDescriptions: "off", showGrandTotalRow: "on",
      dataBars: "Headcount: #981e32; % International: #e08a1e: 100%; Bad: crimson" });
    viz._glossary = mod._buildGlossary();
    var warnings = [];
    viz._warnConfig = function(rejected) { warnings.push(JSON.parse(JSON.stringify(rejected))); };
    var html = viz._buildTable(ipedsLayout());
    var bars = html.match(/<span class='gp-bar' style='width:[\d.]+%;background:[^']+'><\/span>/g) || [];
    assert.strictEqual(bars.length, 6, "3 rows x 2 barred measures; no bar on the total row");
    assert.ok(bars[0].indexOf("width:100%;background:rgb(152,30,50)") >= 0, "largest Headcount fills the bar");
    assert.ok(html.indexOf("width:13.7%;background:rgb(152,30,50)") >= 0, "2,679 / 19,518 from zero");
    assert.ok(html.indexOf("width:2.3%;background:rgb(224,138,30)") >= 0, "100% bar: 2.3% of the full bar");
    assert.ok(/gp-bar-track[^>]*>(<span[^>]*><\/span>)?<\/span><span class='gp-bar-num' style='min-width:6ch'>19,518</.test(html), "number follows the bar");
    assert.strictEqual((html.match(/gp-bar-cell/g) || []).length, 6);
    assert.deepStrictEqual(warnings[0], ["Bad: crimson"]);
  });

  test("data bars: parsing, 100% scale for fraction and percent-number columns, heat map yields", function() {
    var rejected = [];
    var b = mod._parseDataBars("Headcount; % Female: 9fd3dc; Ratio: A: #111111: 100; X: blue", rejected);
    assert.ok(b.HEADCOUNT && !b.HEADCOUNT.full, "a bare name gets the default color");
    assert.strictEqual(b["% FEMALE"].color, "rgb(159,211,220)");
    assert.ok(b["RATIO: A"].full);
    assert.strictEqual(JSON.stringify(rejected), JSON.stringify(["X: blue"]));
    assert.strictEqual(mod._barPercent(0.398, { full: true }, { min: 0.1, max: 0.5 }), 39.8);
    assert.strictEqual(mod._barPercent(89.14, { full: true }, { min: 60, max: 90 }), 89.1);
    assert.strictEqual(mod._barPercent(50, { full: false }, { min: 0, max: 200 }), 25);
    assert.strictEqual(mod._barPercent(-5, { full: false }, { min: -5, max: 10 }), 0, "no bar below zero");
    assert.strictEqual(mod._barPercent(null, { full: false }, { min: 0, max: 10 }), null);
    var viz = H.instance(mod, null, { showDescriptions: "off", cellColor: "on", dataBars: "Headcount: #981e32" });
    viz._glossary = mod._buildGlossary();
    var html = viz._buildTable(ipedsLayout());
    var firstRow = html.slice(html.indexOf("<tr data-gp-row='0'>"), html.indexOf("</tr>", html.indexOf("<tr data-gp-row='0'>")));
    var cells = firstRow.split("<td").slice(1);
    assert.ok(cells[0].indexOf("gp-bar-cell") >= 0 && cells[0].indexOf("gp-heat") < 0, "the bar replaces the heat map on its measure");
    assert.ok(cells[1].indexOf("gp-heat") >= 0, "other measures keep the heat map");
  });

  /* ---- 0.19.0: % of total, hover color ---- */
  function shareLayout() {
    var terms = ["2025 Fall", "2025 Fall", "2026 Fall", "2026 Fall"], levels = ["UGRD", "GRAD", "UGRD", "GRAD"];
    var hc = [60, 40, 30, 70];
    var cols = [{ id: "HEADCOUNT", name: "Headcount" }, { id: "c90", name: "Headcount Share" }];
    return {
      getLayerCount: function(edge) { return edge === "row" ? 2 : (edge === "column" ? 1 : 0); },
      getEdgeExtent: function(edge) { return edge === "row" ? 4 : (edge === "column" ? 2 : 0); },
      getLayerMetadata: function(edge, layer, key) {
        if (edge === "column") return key === "isMeasureLabels" ? true : (key === "id" ? "DM!MEASURE_DIMENSION" : "Measures");
        if (key === "isMeasureLabels") return false;
        if (key === "id") return layer ? "IPEDS_LEVEL" : "TERM";
        return layer ? "IPEDS Degree Level" : "Term";
      },
      getValue: function(edge, a, b, raw) {
        if (edge === "row") return a === 0 ? terms[b] : levels[b];
        if (edge === "column") return raw ? cols[b].id : cols[b].name;
        if (edge === "data") return raw ? hc[a] : String(hc[a]);
        return null;
      },
      getItemEndSlice: function(edge, layer, index) { return edge === "row" && layer === 0 ? (index < 2 ? 1 : 3) : index; }
    };
  }
  function shareCells(html) {
    var out = [], re = /<td class='gp-val[^']*'[^>]*>([^<]*)<\/td>/g, m;
    while ((m = re.exec(html))) out.push(m[1]);
    return out;
  }

  test("% of total by column: shares, subtotals, and a 100% grand total; the original column is untouched", function() {
    var viz = H.instance(mod, null, { showDescriptions: "off", showGrandTotalRow: "on", showRowSubtotals: "on",
      percentOfTotal: "Headcount Share" });
    viz._glossary = mod._buildGlossary();
    var c = shareCells(viz._buildTable(shareLayout()));
    // rows: [60,30%] [40,20%] subtotal [100,50%] [30,15%] [70,35%] subtotal [100,50%] grand [200,100%]
    assert.deepStrictEqual(c.slice(0, 2), ["60", "30.0%"]);
    assert.deepStrictEqual(c.slice(2, 4), ["40", "20.0%"]);
    assert.strictEqual(c[5], "50.0%", "first term's subtotal is its share of the column");
    assert.strictEqual(c[7], "15.0%");
    assert.strictEqual(c[c.length - 1], "100.0%", "grand total");
    assert.strictEqual(c[c.length - 2], "200", "Headcount itself still sums");
  });

  test("% of total by a named Rows field: each group adds to 100%, nothing hardcoded", function() {
    var viz = H.instance(mod, null, { showDescriptions: "off", showGrandTotalRow: "on", showRowSubtotals: "on",
      percentOfTotal: "headcount share: by Term" });
    viz._glossary = mod._buildGlossary();
    var c = shareCells(viz._buildTable(shareLayout()));
    assert.strictEqual(c[1], "60.0%");
    assert.strictEqual(c[3], "40.0%");
    assert.strictEqual(c[5], "100.0%", "each term's subtotal is 100%");
    assert.strictEqual(c[7], "30.0%");
    assert.strictEqual(c[9], "70.0%");
    assert.strictEqual(c[c.length - 1], "100.0%");
    var byLevel = H.instance(mod, null, { showDescriptions: "off", percentOfTotal: "Headcount Share: by IPEDS Degree Level" });
    byLevel._glossary = mod._buildGlossary();
    assert.strictEqual(shareCells(byLevel._buildTable(shareLayout()))[1], "100.0%", "grouping by the inner field works too");
  });

  test("% of total: an unknown field leaves the numbers alone and warns; own override wins; share bars", function() {
    var viz = H.instance(mod, null, { showDescriptions: "off", percentOfTotal: "Headcount Share: by College" });
    viz._glossary = mod._buildGlossary();
    var warnings = [];
    viz._warnConfig = function(rejected, missing) { warnings.push(JSON.parse(JSON.stringify(missing))); };
    assert.strictEqual(shareCells(viz._buildTable(shareLayout()))[1], "60");
    assert.deepStrictEqual(warnings[0], ["by College"]);
    var fmt = H.instance(mod, null, { showDescriptions: "off", percentOfTotal: "Headcount Share",
      measureFormatOverrides: "Headcount Share:percent:0", numberFormat: "number", dataBars: "Headcount Share: #5e6a71: 100%" });
    fmt._glossary = mod._buildGlossary();
    var html = fmt._buildTable(shareLayout());
    assert.ok(html.indexOf(">30%<") >= 0, "the share column's own override applies");
    assert.ok(html.indexOf("width:30%;background:rgb(94,106,113)") >= 0, "a 100% bar on a share is its share");
    var p = mod._parsePercentOfTotal("A; B: by Term; C: column; Ratio: X", []);
    assert.strictEqual(p.A.by, null);
    assert.strictEqual(p.B.by, "Term");
    assert.strictEqual(p.C.by, null);
    assert.ok(p["RATIO: X"], "a colon in a name without 'by' keeps the whole name");
  });

  test("glossary hover defaults to WSU gray with white text; invalid hex falls back", function() {
    var a = mod._tableLayoutAttrs({});
    assert.ok(a.style.indexOf("--gp-hover-bg:rgb(94,106,113);--gp-hover-fg:#ffffff") >= 0);
    assert.ok(mod._tableLayoutAttrs({ hoverColor: "nope" }).style.indexOf("rgb(94,106,113)") >= 0);
    assert.ok(mod._tableLayoutAttrs({ hoverColor: "#f0f0f0" }).style.indexOf("--gp-hover-fg:#000000") >= 0);
  });

  test("tooltip indicator: corner mark by default, icon only on described headers, none when tooltips are off", function() {
    function build(cfg) {
      var viz = H.instance(mod, null, Object.assign({ showDescriptions: "on" }, cfg));
      viz._glossary = mod._buildGlossary();
      viz._glossary.mergeLive({ HEADCOUNT: { text: "Students enrolled", origin: "live" } });
      return viz._buildTable(ipedsLayout());
    }
    var corner = build({});
    assert.ok(/<table class='[^']*gp-ind-corner/.test(corner));
    assert.strictEqual(corner.indexOf("gp-info"), -1);
    var icon = build({ tooltipIndicator: "icon" });
    assert.strictEqual((icon.match(/class='gp-info'/g) || []).length, 1, "only the header with a description");
    assert.ok(icon.indexOf("gp-ind-corner") < 0);
    assert.ok(build({ tooltipIndicator: "none" }).indexOf("gp-ind-corner") < 0);
    assert.ok(build({ showDescriptions: "off" }).indexOf("gp-ind-corner") < 0);
  });

  /* ---- 0.19.0 panel consolidation: saved workbooks keep their choices ---- */
  test("legacy print, wrap, and underline settings carry into the combined controls", function() {
    function loaded(saved) {
      var viz = H.instance(mod);
      viz._savedConfig = saved;
      viz.loadConfig();
      return viz.Config;
    }
    var a = loaded({ showPrintPdf: "on", showPrintCanvas: "off", wrapHeaders: "on", wrapCells: "off", showHeaderUnderline: "off" });
    assert.strictEqual(a.printButtons, "pdf");
    assert.strictEqual(a.wrapText, "headers");
    assert.strictEqual(a.tooltipIndicator, "corner", "underline off keeps the new default");
    var b = loaded({ showPrintPdf: "on", showPrintCanvas: "on", wrapHeaders: "on", wrapCells: "on", showHeaderUnderline: "on" });
    assert.strictEqual(b.printButtons, "both");
    assert.strictEqual(b.wrapText, "all");
    assert.strictEqual(b.tooltipIndicator, "underline");
    var c = loaded({ showPrintCanvas: "on", wrapCells: "on" });
    assert.strictEqual(c.printButtons, "canvas");
    assert.strictEqual(c.wrapText, "body");
    var d = loaded({});
    assert.strictEqual(d.printButtons, "none");
    assert.strictEqual(d.wrapText, "off");
    var e = loaded({ printButtons: "none", showPrintPdf: "on", wrapText: "off", wrapHeaders: "on",
      tooltipIndicator: "none", showHeaderUnderline: "on" });
    assert.strictEqual(e.printButtons, "none", "a saved new-control choice wins over the legacy key");
    assert.strictEqual(e.wrapText, "off");
    assert.strictEqual(e.tooltipIndicator, "none");
  });

  test("underline is now an indicator choice", function() {
    var viz = H.instance(mod, null, { showDescriptions: "on", tooltipIndicator: "underline" });
    viz._glossary = mod._buildGlossary();
    var html = viz._buildTable(ipedsLayout());
    assert.ok(/<table class='gp-table /.test(html) && html.indexOf("gp-no-underline") < 0);
    assert.ok(html.indexOf("gp-ind-corner") < 0);
    var mod2 = H.instance(mod, null, { showDescriptions: "on" });
    mod2._glossary = mod._buildGlossary();
    assert.ok(mod2._buildTable(ipedsLayout()).indexOf("gp-no-underline") >= 0);
  });

  test("the tooltip heading carries the renamed label", function() {
    var viz = H.instance(mod, null, { showDescriptions: "on", headerLabels: "c34: Pct FT" });
    viz._glossary = mod._buildGlossary();
    viz._glossary.mergeLive({ c34: { text: "Share of students enrolled full time", origin: "override" } });
    var html = viz._buildTable(ipedsLayout());
    assert.ok(html.indexOf("data-gp-title='Pct FT'") >= 0);
    assert.ok(html.indexOf("data-gp-name='% Full-Time'") >= 0, "the glossary still looks up the real name");
  });
});

// ============================================================================
suite("NLS bundles", function() {
  var fs = require("fs"), path = require("path"), vm = require("vm");
  var SRC = path.join(__dirname, "..", "src", "customviz");
  fs.readdirSync(SRC).filter(function(d) { return /^com-wsu-/.test(d); }).forEach(function(plugin) {
    test(plugin + ": every L(key, fallback) in the renderer has the key in nls/root/messages.js", function() {
      /* The renderer is the top-level JS file that is not the datamodel
         handler. The older wsu*.js filter missed glossaryPivotViz.js and
         then passed undefined to readFileSync. */
      var js = fs.readdirSync(path.join(SRC, plugin)).filter(function(f) {
         return /\.js$/.test(f) && !/datamodelhandler/i.test(f);
      })[0];
      assert.ok(js, "no renderer JS in " + plugin);
      var code = fs.readFileSync(path.join(SRC, plugin, js), "utf8");
      var bundleCode = fs.readFileSync(path.join(SRC, plugin, "nls", "root", "messages.js"), "utf8");
      var bundle = null;
      vm.runInNewContext(bundleCode, { define: function(o) { bundle = o; } });
      var keys = [], m, re = /L\("([A-Z0-9_]+)",\s*"/g;
      while ((m = re.exec(code)) !== null) keys.push(m[1]);
      assert.ok(keys.length > 0, "renderer externalizes at least one string");
      var missing = keys.filter(function(k) { return !Object.prototype.hasOwnProperty.call(bundle, k); });
      assert.deepStrictEqual(missing, [], "keys missing from bundle");
      // manifest keys (display name, buckets) must be there too
      var manifestKeys = [];
      var extDir = path.join(SRC, plugin, "extensions");
      fs.readdirSync(extDir).forEach(function(d) {
        fs.readdirSync(path.join(extDir, d)).forEach(function(f) {
          var txt = fs.readFileSync(path.join(extDir, d, f), "utf8");
          var km, kre = /"key"\s*:\s*"([A-Z0-9_]+)"/g;
          while ((km = kre.exec(txt)) !== null) manifestKeys.push(km[1]);
        });
      });
      var missing2 = manifestKeys.filter(function(k) { return !Object.prototype.hasOwnProperty.call(bundle, k); });
      assert.deepStrictEqual(missing2, [], "manifest keys missing from bundle");
    });
  });
});

H.summary();

// Currency lint runs as part of the suite so a legacy dependency fails CI too.
require("./lint");
