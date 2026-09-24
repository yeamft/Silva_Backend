const catchAsync = require("../utils/catchAsync");
const catalogIe = require("../services/catalogImportExport.service");

function makeCatalogImportExportController(catalogType) {
  return {
    importPreview: catchAsync(async (req, res) => {
      const data = await catalogIe.preview(req.user, catalogType, req.file);
      res.json({ data });
    }),
    importCommit: catchAsync(async (req, res) => {
      const list = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const data = await catalogIe.commit(req.user, catalogType, list);
      res.json({ data });
    }),
    exportXlsx: catchAsync(async (req, res) => {
      const { buffer, filename, contentType } = await catalogIe.buildExport(
        req.user,
        catalogType,
        req.query || {},
      );
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    }),
  };
}

module.exports = { makeCatalogImportExportController };
