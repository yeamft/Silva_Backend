const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/programmePlans.controller");
const schemas = require("../schemas");
const assessment = require("../controllers/farmAssessment.controller");
const assessmentSchemas = require("../schemas/farmAssessment");
const uploadAssessment = require("../middleware/uploadAssessment");
const { assertEdit } = require("../utils/modularRateAccess");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.programmePlanCreate), ctrl.create);
router.get("/current", ctrl.getOrCreate);
router.get("/farm-assessments", assessment.list);
router.get("/:id/farm-assessment", assessment.get);
router.get("/:id/farm-assessment/report", assessment.download);
router.put("/:id/farm-assessment", (req, _res, next) => {
  try { assertEdit(req.user); next(); } catch (err) { next(err); }
}, uploadAssessment.single("report"), validate(assessmentSchemas.save), assessment.save);
router.post("/:id/farm-assessment/submit", validate(assessmentSchemas.submit), assessment.submit);
router.post("/:id/farm-assessment/decide", validate(assessmentSchemas.decide), assessment.decide);
router.get("/:id", ctrl.get);
router.put("/:id", validate(schemas.programmePlanUpsert), ctrl.upsert);
router.patch("/:id/schedule", validate(schemas.programmePlanSchedule), ctrl.patchSchedule);
router.get("/:id/readiness", ctrl.readiness);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.programmePlanDecide), ctrl.decide);
router.post("/:id/duplicate", ctrl.duplicate);
router.post("/:id/archive", ctrl.archive);

module.exports = router;
