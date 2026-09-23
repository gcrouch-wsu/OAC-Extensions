define(['obitech-framework/jsx',
        'obitech-reportservices/datamodelshapes',
        'obitech-viz/genericDataModelHandler',
        'obitech-report/vizdatamodelsmanager',
        'obitech-appservices/logger'],
        function(jsx,
                 datamodelshapes,
                 genericDataModelHandler,
                 vdm,
                 logger) {
   "use strict";

   var MODULE_NAME = 'com-wsu-report-print/reportPrintVizdatamodelhandler';
   var _logger = new logger.Logger(MODULE_NAME);

   var reportPrintDataModelHandler = {};

   /**
    * Same pivot edges as Glossary Pivot. This plugin does not draw the
    * table on the canvas; it reads the same layout in order to print it.
    * The logical column member is probed because Oracle's public
    * datamodelshapes page does not list it.
    *
    * @constructor
    * @extends module:obitech-viz/vizDataModelHandlerBase#VisualizationHandlerBase
    */
   function ReportPrintDataModelHandler(oConfig, sId, sDisplayName, sOrigin, sVersion) {
      ReportPrintDataModelHandler.baseConstructor.call(this, oConfig, sId, sDisplayName, sOrigin, sVersion);
   }
   jsx.extend(ReportPrintDataModelHandler, genericDataModelHandler.GenericDataModelHandler);
   reportPrintDataModelHandler.ReportPrintDataModelHandler = ReportPrintDataModelHandler;

   function resolveLogicalColumn() {
      var L = datamodelshapes.Logical || {};
      var candidates = ["COLUMN", "COL", "COLUMNS"];
      for (var i = 0; i < candidates.length; i++) {
         if (L[candidates[i]] !== undefined) {
            _logger.info("Logical column member resolved to '" + candidates[i] + "' = " + L[candidates[i]]);
            return L[candidates[i]];
         }
      }
      _logger.warning("No Logical column member found among [" + candidates.join(", ") +
                       "]. Available Logical members: " + Object.keys(L).join(", ") +
                       " — the Columns tray will not map to the COLUMN edge.");
      return undefined;
   }

   ReportPrintDataModelHandler.prototype.getLogicalMapper = function () {
      var oData = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.DATA);
      var oRow  = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.ROW);
      var oCol  = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.COLUMN);
      var oMapper = new vdm.Mapper();
      var logicalColumn = resolveLogicalColumn();

      oMapper.addCategoricalMapping(datamodelshapes.Logical.ROW, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.CATEGORY, oRow);
      if (logicalColumn !== undefined) {
         oMapper.addCategoricalMapping(logicalColumn, oCol);
      }

      oMapper.addMeasureMapping(datamodelshapes.Logical.MEASURES, oData);
      oMapper.addMeasureMapping(datamodelshapes.Logical.CATEGORY, oRow);
      oMapper.setDefaultPhysicalMeasureLabel(datamodelshapes.Physical.COLUMN,
                                             this.getMeasureLabelConfig().visibility);
      return oMapper;
   };

   reportPrintDataModelHandler.getHandler = function (extensionPointName, config) {
      return new ReportPrintDataModelHandler(config, extensionPointName);
   };

   return reportPrintDataModelHandler;
});
