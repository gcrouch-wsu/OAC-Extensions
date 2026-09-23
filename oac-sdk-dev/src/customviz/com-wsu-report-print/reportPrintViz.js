/********************** WSU Report Print — custom visualization ***************
 *
 * A short bar for the top of a canvas. It does not draw the report table.
 * Print PDF opens the browser print dialog on a document that contains only
 * the table bound to THIS visualization, with the column headers in thead
 * so they repeat on each page. The bar is not in that document.
 *
 * It cannot see another visualization. The report fields have to be dropped
 * on Rows, Columns, and Values here, the same way they are on the pivot.
 *
 * Row labels are repeated on every body row. A rowspan that started on the
 * previous page would otherwise leave the next page with a blank stub.
 ******************************************************************************/

define(['jquery',
        'obitech-framework/jsx',
        'obitech-report/datavisualization',
        'obitech-reportservices/datamodelshapes',
        'obitech-application/gadgets',
        'obitech-report/gadgetdialog',
        'obitech-application/extendable-ui-definitions',
        'obitech-appservices/logger',
        'ojL10n!com-wsu-report-print/nls/messages',
        'obitech-reportservices/data',
        'skin!css!com-wsu-report-print/reportPrintVizstyles'],
        function($,
                 jsx,
                 dataviz,
                 datamodelshapes,
                 gadgets,
                 gadgetdialog,
                 euidef,
                 logger,
                 messages,
                 data) {
   "use strict";

   var MODULE_NAME = 'com-wsu-report-print/reportPrintViz';
   var _logger = new logger.Logger(MODULE_NAME);

   jsx.assertObject(datamodelshapes.Physical, MODULE_NAME + " datamodelshapes.Physical");
   jsx.assertObject(dataviz.SettingsNS, MODULE_NAME + " dataviz.SettingsNS");
   jsx.assertObject(dataviz.DataContextProperty, MODULE_NAME + " dataviz.DataContextProperty");
   jsx.assertObject(data.LayerMetadata, MODULE_NAME + " data.LayerMetadata");
   var SETTINGS_CHART = dataviz.SettingsNS.CHART;
   var DCP_DATA_LAYOUT = dataviz.DataContextProperty.DATA_LAYOUT;
   var PHYS_DATA = datamodelshapes.Physical.DATA;
   var PHYS_ROW = datamodelshapes.Physical.ROW;
   var PHYS_COLUMN = datamodelshapes.Physical.COLUMN;

   function L(key, fallback) {
      var v = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : null;
      return typeof v === "string" && v !== "" ? v : fallback;
   }

   var LBL = {
      EMPTY: L("REPORTPRINT_LBL_EMPTY", "Add the report fields to Rows, Columns, and Values on this visualization."),
      BUTTON: L("REPORTPRINT_LBL_BUTTON", "Print PDF"),
      HINT: L("REPORTPRINT_LBL_HINT", "Prints the fields dropped here. The button is not on the pages."),
      TOTAL: L("REPORTPRINT_LBL_TOTAL", "Total"),
      PRINT_ERROR: L("REPORTPRINT_LBL_PRINT_ERROR", "Print could not open. Use the browser print dialog if it appears, or allow this page to print.")
   };

   function ReportPrintViz(sID, sDisplayName, sOrigin, sVersion) {
      ReportPrintViz.baseConstructor.call(this, sID, sDisplayName, sOrigin, sVersion);
      this._layout = null;
      this._printFrame = null;
      this.Config = {
         reportTitle: "Report",
         orientation: "landscape",
         showGrandTotal: "on"
      };
      this.loadConfig = function () {
         var conf = this.getSettings().getViewConfigJSON(SETTINGS_CHART) || {};
         Object.keys(this.Config).forEach(function (key) {
            if (!jsx.isNull(conf[key]) && typeof conf[key] !== "undefined") this.Config[key] = conf[key];
         }, this);
      };
   }
   jsx.extend(ReportPrintViz, dataviz.DataVisualization);
   ReportPrintViz.VERSION = "1.0.0";

   function escapeHtml(s) {
      if (s == null) return "";
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                      .replace(/'/g, "&#39;");
   }

   function groupThousands(n) {
      var sign = n < 0 ? "-" : "";
      var body = (Math.round(Math.abs(n) * 100) / 100).toFixed(2);
      if (body.slice(-3) === ".00") body = body.slice(0, -3);
      else if (body.charAt(body.length - 1) === "0") body = body.slice(0, -1);
      var parts = body.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return sign + parts.join(".");
   }

   function textAt(dl, edge, a, b) {
      var v = null;
      try { v = dl.getValue(edge, a, b, false); } catch (e) {}
      return v == null ? "" : String(v);
   }

   function rawNumber(dl, r, c) {
      var v = null;
      try { v = dl.getValue(PHYS_DATA, r, c, true); } catch (e) {}
      if (v == null || v === "") return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
   }

   /**
    * Printable pivot. Column headers stay in thead so the browser repeats
    * them. Row labels are repeated on each body row so a page never opens
    * on a blank spanned cell.
    */
   function buildPrintHtml(dl, Config) {
      var LM = data.LayerMetadata;
      var nRowLayers = dl.getLayerCount(PHYS_ROW) || 0;
      var nColLayers = dl.getLayerCount(PHYS_COLUMN) || 0;
      var nRows = dl.getEdgeExtent(PHYS_ROW) || 0;
      var nCols = dl.getEdgeExtent(PHYS_COLUMN) || 0;
      if (!nRows && nCols) nRows = 1;
      if (!nCols) return null;

      var title = (Config.reportTitle && String(Config.reportTitle).trim()) || "Report";
      var orient = Config.orientation === "portrait" ? "portrait" : "landscape";
      var span = nRowLayers + nCols;
      var html = [];
      html.push("<!DOCTYPE html><html><head><meta charset='utf-8'><title>");
      html.push(escapeHtml(title));
      html.push("</title><style>");
      html.push("@page { size: " + orient + "; margin: 0.5in; }");
      html.push("body { margin: 0; color: #1b1f24; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }");
      html.push("table { border-collapse: collapse; width: 100%; }");
      html.push("th, td { border: 1px solid #b7bcc2; padding: 3px 6px; vertical-align: top; }");
      html.push("thead { display: table-header-group; }");
      html.push("tr { break-inside: avoid; page-break-inside: avoid; }");
      html.push("th { background: #f0f2f4; font-weight: 700; text-align: center; }");
      html.push("th.title { background: #ffffff; font-size: 13pt; text-align: left; border: 0; padding: 0 0 8px; }");
      html.push("td.rh { text-align: left; background: #f7f8f9; }");
      html.push("td.num, td.total { text-align: right; font-variant-numeric: tabular-nums; }");
      html.push("tr.total td { font-weight: 700; background: #eef2f4; }");
      html.push("td.total .lbl { display: block; text-align: left; }");
      html.push("th, tr.total td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }");
      html.push("</style></head><body><table><thead>");
      html.push("<tr><th class='title' colspan='" + span + "'>" + escapeHtml(title) + "</th></tr>");

      var headerRows = Math.max(nColLayers, 1);
      for (var cl = 0; cl < headerRows; cl++) {
         html.push("<tr>");
         if (nRowLayers > 0) {
            if (cl < headerRows - 1) {
               html.push("<th colspan='" + nRowLayers + "'></th>");
            } else {
               for (var rl = 0; rl < nRowLayers; rl++) {
                  var rName = "";
                  try { rName = dl.getLayerMetadata(PHYS_ROW, rl, LM.LAYER_DISPLAY_NAME); } catch (e) {}
                  html.push("<th>" + escapeHtml(rName == null ? "" : rName) + "</th>");
               }
            }
         }
         if (cl < nColLayers) {
            var c = 0;
            while (c < nCols) {
               var end = c;
               try { end = dl.getItemEndSlice(PHYS_COLUMN, cl, c); } catch (e2) { end = c; }
               if (end == null || end < c) end = c;
               html.push("<th colspan='" + (end - c + 1) + "'>" + escapeHtml(textAt(dl, PHYS_COLUMN, cl, c)) + "</th>");
               c = end + 1;
            }
         } else {
            for (var cp = 0; cp < nCols; cp++) html.push("<th></th>");
         }
         html.push("</tr>");
      }
      html.push("</thead><tbody>");

      var totals = [];
      var anyTotal = [];
      for (var ti = 0; ti < nCols; ti++) { totals[ti] = 0; anyTotal[ti] = false; }

      for (var r = 0; r < nRows; r++) {
         html.push("<tr>");
         for (var l = 0; l < nRowLayers; l++) {
            html.push("<td class='rh'>" + escapeHtml(textAt(dl, PHYS_ROW, l, r)) + "</td>");
         }
         for (var cc = 0; cc < nCols; cc++) {
            html.push("<td class='num'>" + escapeHtml(textAt(dl, PHYS_DATA, r, cc)) + "</td>");
            var num = rawNumber(dl, r, cc);
            if (num != null) { totals[cc] += num; anyTotal[cc] = true; }
         }
         html.push("</tr>");
      }

      if (Config.showGrandTotal === "on") {
         html.push("<tr class='total'>");
         if (nRowLayers > 0) {
            html.push("<td class='rh' colspan='" + nRowLayers + "'>" + escapeHtml(LBL.TOTAL) + "</td>");
         }
         for (var tc = 0; tc < nCols; tc++) {
            var totalText = anyTotal[tc] ? escapeHtml(groupThousands(totals[tc])) : "";
            if (nRowLayers === 0 && tc === 0) {
               totalText = "<span class='lbl'>" + escapeHtml(LBL.TOTAL) + "</span>" + totalText;
            }
            html.push("<td class='total'>" + totalText + "</td>");
         }
         html.push("</tr>");
      }
      html.push("</tbody></table></body></html>");
      return html.join("");
   }

   function preparePrint(layout, config) {
      if (!layout) return { html: null, error: "empty" };
      var html = null;
      try { html = buildPrintHtml(layout, config); } catch (err) {
         _logger.error("build print html failed: " + (err && err.message ? err.message : err));
      }
      if (!html) return { html: null, error: "empty" };
      return { html: html, error: null };
   }

   function openPrint(self, html) {
      try {
         if (self._printFrame && self._printFrame.parentNode) {
            self._printFrame.parentNode.removeChild(self._printFrame);
         }
         var iframe = document.createElement("iframe");
         iframe.setAttribute("title", "Report print");
         iframe.setAttribute("style", "position:fixed;width:0;height:0;border:0;right:0;bottom:0;");
         document.body.appendChild(iframe);
         self._printFrame = iframe;
         var win = iframe.contentWindow;
         var doc = win.document;
         doc.open();
         doc.write(html);
         doc.close();
         win.focus();
         win.print();
         win.onafterprint = function () {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            if (self._printFrame === iframe) self._printFrame = null;
         };
         return true;
      } catch (e) {
         _logger.error("print failed: " + (e && e.message ? e.message : e));
         return false;
      }
   }

   ReportPrintViz.prototype._render = function (oTransientRenderingContext) {
      try {
         this._paint(oTransientRenderingContext);
      } finally {
         try { this._setIsRendered(true); } catch (e) {}
      }
   };

   ReportPrintViz.prototype._paint = function (oTransientRenderingContext) {
      var elContainer = this.getContainerElem();
      if (!elContainer) return;
      this.loadConfig();
      var dl = null;
      try { dl = oTransientRenderingContext.get(DCP_DATA_LAYOUT); } catch (e) {}
      this._layout = dl;

      var $bar = $("<div class='rp-bar'></div>");
      var $text = $("<div></div>");
      $text.append($("<div class='rp-title'></div>").text("WSU Report Print"));
      var hint = LBL.HINT;
      if (!dl) hint = LBL.EMPTY;
      else {
         var nRows = 0, nCols = 0;
         try { nRows = dl.getEdgeExtent(PHYS_ROW) || 0; } catch (e2) {}
         try { nCols = dl.getEdgeExtent(PHYS_COLUMN) || 0; } catch (e3) {}
         if (!nCols) hint = LBL.EMPTY;
         else hint = groupThousands(nRows || 1) + " rows, " + groupThousands(nCols) + " columns. " + LBL.HINT;
      }
      $text.append($("<div class='rp-hint'></div>").text(hint));
      $text.append($("<div class='rp-error' style='display:none'></div>").text(LBL.PRINT_ERROR));
      var $btn = $("<button type='button' class='rp-btn'></button>").text(LBL.BUTTON);
      var self = this;
      $btn.on("click", function () {
         var $err = $bar.find(".rp-error");
         $err.hide();
         var prepared = preparePrint(self._layout, self.Config);
         if (prepared.error === "empty") {
            $err.text(LBL.EMPTY).show();
            return;
         }
         if (!openPrint(self, prepared.html)) $err.text(LBL.PRINT_ERROR).show();
      });
      $bar.append($text).append($btn);
      $(elContainer).empty().append($bar);
   };

   ReportPrintViz.prototype.render = function (oTransientRenderingContext) {
      this._render(oTransientRenderingContext);
   };

   ReportPrintViz.prototype.resizeVisualization = function (oVizDimensions, oTransientVizContext) {
      this._render(this.createRenderingContext(oTransientVizContext));
   };

   ReportPrintViz.prototype._doInitializeComponent = function () {
      ReportPrintViz.superClass._doInitializeComponent.call(this);
   };

   ReportPrintViz.prototype._doStopComponent = function () {
      if (this._printFrame && this._printFrame.parentNode) {
         this._printFrame.parentNode.removeChild(this._printFrame);
      }
      this._printFrame = null;
      ReportPrintViz.superClass._doStopComponent.apply(this, arguments);
   };

   function addSwitcher(panel, id, labelText, value, options, order) {
      var infos = options.map(function (o) { return new gadgets.OptionInfo(o.value, o.label); });
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_SWITCHER, value);
      panel.addChild(new gadgets.TextSwitcherGadgetInfo(id, labelText, labelText, gvp, order, false, infos));
   }

   function addToggle(panel, id, labelText, configValue) {
      var isOn = configValue !== "off";
      var gvp = new gadgets.CheckboxGadgetValueProperties(euidef.GadgetTypeIDs.TEXT_TOGGLE, id, isOn);
      panel.addChild(new gadgets.TextToggleGadgetInfo(id, labelText, null, gvp));
   }

   function addText(panel, factory, id, labelText, value) {
      var gvp = new gadgets.GadgetValueProperties(euidef.GadgetTypeIDs.TEXT_FIELD, value);
      panel.addChild(factory.createGadgetInfo(id, labelText, labelText, gvp));
   }

   ReportPrintViz.prototype._addVizSpecificPropsDialog = function (oTabbedPanelsGadgetInfo) {
      this.doAddVizSpecificPropsDialog(this, oTabbedPanelsGadgetInfo);
      ReportPrintViz.superClass._addVizSpecificPropsDialog.call(this, oTabbedPanelsGadgetInfo);
   };

   ReportPrintViz.prototype.doAddVizSpecificPropsDialog = function (oTransientRenderingContext, oTabbedPanelsGadgetInfo) {
      this.loadConfig();
      var factory = this.getGadgetFactory();
      var pGen = gadgetdialog.forcePanelByID(oTabbedPanelsGadgetInfo, euidef.GD_PANEL_ID_GENERAL);
      var base = euidef.GD_FIELD_ORDER_GENERAL_LINE_TYPE;
      addText(pGen, factory, "reportTitleGadget", "Print: Report Title", this.Config.reportTitle);
      addSwitcher(pGen, "orientationGadget", "Print: Page Orientation", this.Config.orientation,
         [{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }], base + 100);
      addToggle(pGen, "showGrandTotalGadget", "Print: Grand Total Row", this.Config.showGrandTotal);
      if (ReportPrintViz.superClass.doAddVizSpecificPropsDialog) {
         ReportPrintViz.superClass.doAddVizSpecificPropsDialog.apply(this, arguments);
      }
   };

   ReportPrintViz.prototype._handlePropChange = function (sGadgetID, oPropChange, oViewSettings, oActionContext) {
      var updateSettings = ReportPrintViz.superClass._handlePropChange.call(this, sGadgetID, oPropChange, oViewSettings, oActionContext);
      if (updateSettings) return updateSettings;
      var map = {
         reportTitleGadget: "reportTitle",
         orientationGadget: "orientation",
         showGrandTotalGadget: "showGrandTotal"
      };
      var key = map[sGadgetID];
      if (!key) return false;
      if (sGadgetID === "showGrandTotalGadget") this.Config[key] = oPropChange.checked ? "on" : "off";
      else this.Config[key] = oPropChange.value;
      if (oViewSettings && oViewSettings.setViewConfigJSON) oViewSettings.setViewConfigJSON(SETTINGS_CHART, this.Config);
      else this.getSettings().setViewConfigJSON(SETTINGS_CHART, this.Config);
      return true;
   };

   function createClientComponent(sID, sDisplayName, sOrigin) {
      return new ReportPrintViz(sID, sDisplayName, sOrigin, ReportPrintViz.VERSION);
   }

   return {
      createClientComponent: createClientComponent,
      _preparePrint: preparePrint,
      _buildPrintHtml: buildPrintHtml
   };
});
