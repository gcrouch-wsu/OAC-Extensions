/*
 * OAC tenant probe — paste this whole file into the browser DevTools console
 * while signed in to Oracle Analytics Cloud with ANY workbook open (the
 * RequireJS context only exists inside the Data Visualization app).
 *
 * It prints one JSON blob. Save it as oac-sdk-dev/tests/oac-probe.<tenant>.json
 * and run:  node tests/compare-probe.js tests/oac-probe.<tenant>.json
 *
 * Read-only: it inspects the module registry and a few framework objects. It
 * sends nothing anywhere and touches no data.
 */
(function () {
  var out = { probedAt: new Date().toISOString(), url: location.origin, build: null, modules: {}, d3: {}, methods: {}, panels: {} };

  // 1. Tenant build, if the page exposes it.
  try {
    var about = document.querySelector('[data-build], [data-version]');
    out.build = (about && (about.getAttribute('data-build') || about.getAttribute('data-version'))) || (window.obi && window.obi.buildNumber) || null;
  } catch (e) { out.build = null; }

  // 2. Every defined AMD module id that this plugin family cares about.
  var ctx = window.requirejs && requirejs.s && requirejs.s.contexts && requirejs.s.contexts._;
  if (!ctx) { console.error("RequireJS context not found — open a workbook first."); return; }
  var defined = Object.keys(ctx.defined || {});
  var wanted = /^(d3|jquery$|require$|ojL10n|obitech-(framework|report|reportservices|application|appservices|viz|legend|tooltip)\/)/;
  defined.forEach(function (id) { if (wanted.test(id)) out.modules[id] = true; });
  // ids the lint allowlist names, whether or not they appear above
  ["jquery", "d3js", "d3v3", "d3v6js", "d3v7js", "obitech-framework/jsx", "obitech-report/datavisualization",
   "obitech-report/gadgetdialog", "obitech-report/vizdatamodelsmanager", "obitech-reportservices/data",
   "obitech-reportservices/datamodelshapes", "obitech-reportservices/events", "obitech-reportservices/interactionservice",
   "obitech-reportservices/markingservice", "obitech-application/gadgets", "obitech-application/extendable-ui-definitions",
   "obitech-appservices/logger", "obitech-viz/genericDataModelHandler", "obitech-framework/messageformat",
   "obitech-legend/legendandvizcontainer"].forEach(function (id) {
    out.modules[id] = !!(ctx.defined && Object.prototype.hasOwnProperty.call(ctx.defined, id)) || (ctx.config && ctx.config.paths && !!ctx.config.paths[id]) || out.modules[id] || false;
  });

  // 3. D3 versions for every d3-ish id that resolves.
  Object.keys(out.modules).filter(function (id) { return /^d3/.test(id) && out.modules[id]; }).forEach(function (id) {
    try { var d3 = ctx.defined[id]; out.d3[id] = d3 && d3.version ? d3.version : "(loaded, no .version)"; } catch (e) { out.d3[id] = "error: " + e.message; }
  });

  // 4. Inherited host methods the WSU plugins call — present on the base class?
  try {
    var dv = ctx.defined["obitech-report/datavisualization"];
    var proto = dv && dv.DataVisualization && dv.DataVisualization.prototype;
    ["getID", "getViewName", "getSettings", "getRootDataModel", "getLogicalDataModel", "getContainerElem", "getSubElementIdFromParent",
     "getMarkingService", "getEventRouter", "subscribeToEvent", "getGadgetFactory", "getColorContext", "getCachedColorInterpolator",
     "getDataItemColorInfo", "assertOrCreateVizContext", "createRenderingContext", "getVizContextFromRenderingContext", "getProjection",
     "isViewOnlyLimit", "isStarted", "_setIsRendered", "_doInitializeComponent", "_doStopComponent", "_addVizSpecificPropsDialog",
     "_handlePropChange", "_addColorMenuOption", "_addFilterMenuOption", "_addRemoveSelectedMenuOption", "_addVizSpecificMenuOptions"
    ].forEach(function (m) { out.methods[m] = proto ? (typeof proto[m] === "function") : "no prototype"; });
  } catch (e) { out.methods._error = e.message; }

  // 5. Host panel ids the plugins request.
  try {
    var eu = ctx.defined["obitech-application/extendable-ui-definitions"];
    ["GD_PANEL_ID_GENERAL", "GD_PANEL_ID_AXIS", "GD_PANEL_ID_INTERACTION", "GD_PANEL_ID_VALUE", "GD_PANEL_ID_CONTROLS", "GD_PANEL_ID_FILTERS"].forEach(function (k) {
      out.panels[k] = eu && eu[k] !== undefined ? eu[k] : null;
    });
  } catch (e) { out.panels._error = e.message; }

  var text = JSON.stringify(out, null, 2);
  console.log(text);
  try { copy(text); console.log("(copied to clipboard)"); } catch (e) { /* copy() not available everywhere */ }
})();
