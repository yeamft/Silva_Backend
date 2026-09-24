const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const schemas = require("../schemas");
const upload = require("../middleware/uploadCatalog");
const controller = require("../controllers/materials.controller");
const { makeCatalogImportExportController } = require("../controllers/catalogImportExport.controller");

const ie = makeCatalogImportExportController("materials");
const router = express.Router();
router.use(authenticateJWT);

router.get("/export", ie.exportXlsx);
router.post("/import/preview", upload.single("file"), ie.importPreview);
router.post("/import/commit", ie.importCommit);

router.get("/", controller.list);
router.post("/", validate(schemas.materialResource), controller.create);
router.patch("/:id", validate(schemas.materialResourceUpdate), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
