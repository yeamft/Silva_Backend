const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const schemas = require("../schemas");
const upload = require("../middleware/uploadCatalog");
const controller = require("../controllers/laborActivities.controller");
const { makeCatalogImportExportController } = require("../controllers/catalogImportExport.controller");

const ie = makeCatalogImportExportController("labor");
const router = express.Router();
router.use(authenticateJWT);

router.get("/export", ie.exportXlsx);
router.post("/import/preview", upload.single("file"), ie.importPreview);
router.post("/import/commit", ie.importCommit);

router.get("/", controller.list);
router.post("/", validate(schemas.catalogResource), controller.create);
router.patch("/:id", validate(schemas.catalogResourceUpdate), controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
