define(['obitech-framework/jsx',
        'obitech-reportservices/datamodelshapes',
        'obitech-viz/genericDataModelHandler',
        'obitech-report/vizdatamodelsmanager'],
        function(jsx,
                 datamodelshapes,
                 genericDataModelHandler,
                 vdm) {
   "use strict";

   jsx.assertObject(datamodelshapes.Physical, "datamodelshapes.Physical");
   jsx.assertObject(datamodelshapes.Logical, "datamodelshapes.Logical");

   var wsuDumbbellDataModelHandler = {};

   function WsuDumbbellDataModelHandler(oConfig, sId, sDisplayName, sOrigin, sVersion) {
      WsuDumbbellDataModelHandler.baseConstructor.call(this, oConfig, sId, sDisplayName, sOrigin, sVersion);
   }

   jsx.extend(WsuDumbbellDataModelHandler, genericDataModelHandler.GenericDataModelHandler);
   wsuDumbbellDataModelHandler.WsuDumbbellDataModelHandler = WsuDumbbellDataModelHandler;

   WsuDumbbellDataModelHandler.prototype.getLogicalMapper = function () {
      var oData = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.DATA);
      var oRow = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.ROW);
      var oMapper = new vdm.Mapper();

      oMapper.addCategoricalMapping(datamodelshapes.Logical.ROW, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.CATEGORY, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.ITEM, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.COLOR, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.SIZE, oRow);
      oMapper.addCategoricalMapping(datamodelshapes.Logical.GLYPH, oRow);

      oMapper.addMeasureMapping(datamodelshapes.Logical.MEASURES, oData);
      oMapper.addMeasureMapping(datamodelshapes.Logical.CATEGORY, oRow);
      oMapper.addMeasureMapping(datamodelshapes.Logical.ITEM, oRow);
      oMapper.addMeasureMapping(datamodelshapes.Logical.COLOR, oRow);
      oMapper.addMeasureMapping(datamodelshapes.Logical.SIZE, oRow);
      oMapper.addMeasureMapping(datamodelshapes.Logical.GLYPH, oRow);

      oMapper.setDefaultPhysicalMeasureLabel(datamodelshapes.Physical.COLUMN, this.getMeasureLabelConfig().visibility);
      return oMapper;
   };

   wsuDumbbellDataModelHandler.getHandler = function(extensionPointName, config) {
      return new WsuDumbbellDataModelHandler(config, extensionPointName);
   };

   return wsuDumbbellDataModelHandler;
});
