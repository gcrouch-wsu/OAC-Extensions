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

   var MODULE_NAME = 'com-wsu-glossary-pivot/glossaryPivotVizdatamodelhandler';
   var _logger = new logger.Logger(MODULE_NAME);

   var glossaryPivotDataModelHandler = {};

   /**
    * Data model handler for the WSU Glossary Pivot.
    *
    * Unlike the dumbbell (which places everything on ROW), a pivot needs BOTH
    * physical edges: categorical fields on ROW and COLUMN, measures on DATA.
    *
    * @constructor
    * @extends module:obitech-viz/vizDataModelHandlerBase#VisualizationHandlerBase
    */
   function GlossaryPivotDataModelHandler(oConfig, sId, sDisplayName, sOrigin, sVersion)
   {
      GlossaryPivotDataModelHandler.baseConstructor.call(this, oConfig, sId, sDisplayName, sOrigin, sVersion);
   }
   jsx.extend(GlossaryPivotDataModelHandler, genericDataModelHandler.GenericDataModelHandler);
   glossaryPivotDataModelHandler.GlossaryPivotDataModelHandler = GlossaryPivotDataModelHandler;

   /**
    * The logical name for the column edge is NOT confirmed in any Oracle
    * documentation — the datamodelshapes JSDoc page lists no members at all.
    * Rather than hard-coding a guess that could silently break the mapping,
    * resolve it at runtime and log what was found so the first upload tells us
    * the answer. This is symbol pinning taken one step further: normal pinning
    * (jsx.assertObject) fails fast on a KNOWN name; here the name itself is
    * unknown, so the fix is to enumerate plausible candidates and log the hit
    * loudly instead of guessing silently.
    *
    * @returns {*} the Logical enum member for the column edge, or undefined
    */
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

   /**
    * @returns module:obitech-report/vizdatamodelsmanager#Mapper
    */
   GlossaryPivotDataModelHandler.prototype.getLogicalMapper = function () {
      var oData = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.DATA);
      var oRow  = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.ROW);
      var oCol  = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.COLUMN);

      var oMapper = new vdm.Mapper();
      var logicalColumn = resolveLogicalColumn();

      // Categorical placements
      oMapper.addCategoricalMapping(datamodelshapes.Logical.ROW, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.CATEGORY, oRow);
      if (logicalColumn !== undefined) {
         oMapper.addCategoricalMapping(logicalColumn, oCol);
      }

      // Measures land on the DATA edge; a measure dropped in a categorical
      // tray still groups on ROW, matching stock pivot behaviour.
      oMapper.addMeasureMapping(datamodelshapes.Logical.MEASURES, oData);
      oMapper.addMeasureMapping(datamodelshapes.Logical.CATEGORY, oRow);

      // Measure labels form their own header layer. Putting them on COLUMN is
      // what makes several measures render as sibling columns.
      oMapper.setDefaultPhysicalMeasureLabel(datamodelshapes.Physical.COLUMN,
                                             this.getMeasureLabelConfig().visibility);

      return oMapper;
   };

   /**
    * Returns the handler
    * @param {String} extensionPointName
    * @param {Object} config
    */
   glossaryPivotDataModelHandler.getHandler = function(extensionPointName, config) {
      return new GlossaryPivotDataModelHandler(config, extensionPointName);
   };

   return glossaryPivotDataModelHandler;
});
