const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const c = require("../controllers/farmRates.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", c.listFarms);

router.get("/:farmId/benchmark-surveys", c.listSurveys);
router.post("/:farmId/benchmark-surveys", c.createSurvey);

router.get("/:farmId/rate-card-proposals", c.listProposals);
router.get("/:farmId/locked-benchmarks", c.listLockedSurveysForProposals);
router.post("/:farmId/rate-card-proposals", c.createProposalFromSurvey);
router.post("/:farmId/rate-card-proposals/import", c.createProposalImport);

router.get("/:farmId/activities", c.listActivities);
router.get("/:farmId/activities/:activityId/resolved-rate", c.resolvedRate);

router.get("/:farmId/labor-rate-cards", c.listLabor);
router.post("/:farmId/labor-rate-cards", c.createLabor);
router.patch("/:farmId/labor-rate-cards/:id", c.updateLabor);

router.get("/:farmId/material-rate-cards", c.listMaterial);
router.post("/:farmId/material-rate-cards", c.createMaterial);
router.patch("/:farmId/material-rate-cards/:id", c.updateMaterial);

router.get("/:farmId/service-rate-cards", c.listService);
router.post("/:farmId/service-rate-cards", c.createService);
router.patch("/:farmId/service-rate-cards/:id", c.updateService);

module.exports = router;
