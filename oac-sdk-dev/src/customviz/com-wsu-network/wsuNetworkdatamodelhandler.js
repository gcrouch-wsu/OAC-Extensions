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

  var wsuNetworkDataModelHandler = {};

  function WsuNetworkDataModelHandler(oConfig, sId, sDisplayName, sOrigin, sVersion) {
    WsuNetworkDataModelHandler.baseConstructor.call(this, oConfig, sId, sDisplayName, sOrigin, sVersion);
  }

  jsx.extend(WsuNetworkDataModelHandler, genericDataModelHandler.GenericDataModelHandler);
  wsuNetworkDataModelHandler.WsuNetworkDataModelHandler = WsuNetworkDataModelHandler;

  WsuNetworkDataModelHandler.prototype.getLogicalMapper = function() {
    var oData = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.DATA);
    var oRow = new datamodelshapes.PhysicalPlacement(datamodelshapes.Physical.ROW);
    var oMapper = new vdm.Mapper();

    oMapper.addCategoricalMapping(datamodelshapes.Logical.ROW, oRow);
    oMapper.addCategoricalMapping(datamodelshapes.Logical.COLOR, oRow);
    oMapper.addCategoricalMapping(datamodelshapes.Logical.CATEGORY, oRow);
    oMapper.addCategoricalMapping(datamodelshapes.Logical.GLYPH, oRow);
    oMapper.addCategoricalMapping(datamodelshapes.Logical.SIZE, oRow);

    oMapper.addMeasureMapping(datamodelshapes.Logical.MEASURES, oData);
    oMapper.addMeasureMapping(datamodelshapes.Logical.CATEGORY, oRow);

    oMapper.setDefaultPhysicalMeasureLabel(datamodelshapes.Physical.COLUMN, this.getMeasureLabelConfig().visibility);
    return oMapper;
  };

  wsuNetworkDataModelHandler.getHandler = function(extensionPointName, config) {
    return new WsuNetworkDataModelHandler(config, extensionPointName);
  };

  return wsuNetworkDataModelHandler;
});
