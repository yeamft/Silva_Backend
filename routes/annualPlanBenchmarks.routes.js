const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const uploadWorkbook = require("../middleware/uploadWorkbook");
const controller = require("../controllers/annualPlanBenchmarks.controller");

const router = express.Router();
router.use(authenticateJWT);
router.get("/", controller.getLatest);
router.post("/import", uploadWorkbook.single("workbook"), controller.importWorkbook);
router.get("/settings", controller.getScenarioSettings);
router.put("/settings", controller.updateScenarioSettings);

module.exports = router;
