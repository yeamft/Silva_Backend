const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/programmePlans.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.programmePlanCreate), ctrl.create);
router.get("/current", ctrl.getOrCreate);
router.get("/:id", ctrl.get);
router.put("/:id", validate(schemas.programmePlanUpsert), ctrl.upsert);
router.patch("/:id/schedule", validate(schemas.programmePlanSchedule), ctrl.patchSchedule);
router.get("/:id/readiness", ctrl.readiness);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.programmePlanDecide), ctrl.decide);
router.post("/:id/duplicate", ctrl.duplicate);
router.post("/:id/archive", ctrl.archive);

module.exports = router;
