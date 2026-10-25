const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/farmAssessment.controller");
const schemas = require("../schemas/farmAssessment");
const uploadAssessment = require("../middleware/uploadAssessment");
const { assertEditAssessment } = require("../utils/modularRateAccess");

const router = express.Router();
router.use(authenticateJWT);

// Register + summary
router.get("/", ctrl.list);
router.get("/counts", ctrl.summaryCounts);

// Create standalone assessment
router.post("/", validate(schemas.create), ctrl.create);

// Assessment detail
router.get("/:id", ctrl.get);
router.put("/:id", (req, _res, next) => {
  try { assertEditAssessment(req.user); next(); } catch (err) { next(err); }
}, uploadAssessment.single("report"), validate(schemas.save), ctrl.save);
router.post("/:id/submit", validate(schemas.submit), ctrl.submit);
router.post("/:id/decide", validate(schemas.decide), ctrl.decide);
router.get("/:id/report", ctrl.download);

module.exports = router;
