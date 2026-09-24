const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const c = require("../controllers/farmRates.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", c.listProgramSurveys);
router.get("/:id", c.getSurvey);
router.patch("/:id", c.updateSurvey);
router.post("/:id/lock", c.lockSurvey);
router.post("/:id/submit", c.submitSurvey);
router.post("/:id/approve", c.approveSurvey);
router.post("/:id/reject", c.rejectSurvey);

module.exports = router;
