const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortInterventions.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.interventionCreate), ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/start", ctrl.start);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.projectDecide), ctrl.decide);
router.post("/:id/complete", ctrl.complete);
router.post("/:id/steps/:stepId/toggle", ctrl.toggleStep);
router.post("/:id/link-afe", validate(schemas.linkAfe), ctrl.linkAfe);

module.exports = router;
