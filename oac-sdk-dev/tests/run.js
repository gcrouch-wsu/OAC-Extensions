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

H.summary();
