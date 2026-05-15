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

  var wsuLatticeScatterDataModelHandler = {};

  function WsuLatticeScatterDataModelHandler(oConfig, sId, sDisplayName, sOrigin, sVersion) {
     WsuLatticeScatterDataModelHandler.baseConstructor.call(this, oConfig, sId, sDisplayName, sOrigin, sVersion);
  }

  jsx.extend(WsuLatticeScatterDataModelHandler, genericDataModelHandler.GenericDataModelHandler);
  wsuLatticeScatterDataModelHandler.WsuLatticeScatterDataModelHandler = WsuLatticeScatterDataModelHandler;

  WsuLatticeScatterDataModelHandler.prototype.getLogicalMapper = function () {
     var oData = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.DATA);
     var oRow = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.ROW);
     var oMapper = new vdm.Mapper();

     oMapper.addCategoricalMapping(datamodelshapes.Logical.ROW, oRow);
     oMapper.addCategoricalMapping(datamodelshapes.Logical.ITEM, oRow);
     oMapper.addCategoricalMapping(datamodelshapes.Logical.COLOR, oRow);
     oMapper.addCategoricalMapping(datamodelshapes.Logical.GLYPH, oRow);
     oMapper.addCategoricalMapping(datamodelshapes.Logical.CATEGORY, oRow);
     oMapper.addCategoricalMapping(datamodelshapes.Logical.SIZE, oRow);

     oMapper.addMeasureMapping(datamodelshapes.Logical.MEASURES, oData);
     oMapper.addMeasureMapping(datamodelshapes.Logical.CATEGORY, oRow);
     oMapper.addMeasureMapping(datamodelshapes.Logical.SIZE, oRow);

     oMapper.setDefaultPhysicalMeasureLabel(datamodelshapes.Physical.COLUMN, this.getMeasureLabelConfig().visibility);
     return oMapper;
  };

  wsuLatticeScatterDataModelHandler.getHandler = function(extensionPointName, config) {
     return new WsuLatticeScatterDataModelHandler(config, extensionPointName);
  };

  return wsuLatticeScatterDataModelHandler;
});
