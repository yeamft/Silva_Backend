const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const requireRole = require("../middleware/requireRole");
const c = require("../controllers/activities.controller");
const uploadCatalog = require("../middleware/uploadCatalog");

const router = express.Router();
router.use(authenticateJWT);
const activityManagers = [
  "system_admin",
  "spx_platform_admin",
  "spx_validator",
  "spx_principal",
  "spx_account_handler",
];

router.get("/", c.list);
router.post("/", requireRole(activityManagers), c.create);
router.post("/import/preview", requireRole(activityManagers), uploadCatalog.single("file"), c.previewWorkbookImport);
router.post("/import/commit", requireRole(activityManagers), c.commitWorkbookImport);
router.patch("/bulk", requireRole(activityManagers), c.bulkUpdate);
router.post("/bulk/deactivate", requireRole(activityManagers), c.deactivateMany);
router.patch("/:id", requireRole(activityManagers), c.update);
router.get("/:id", c.get);

module.exports = router;
