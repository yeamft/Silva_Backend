const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortProjects.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.projectCreate), ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.projectDecide), ctrl.decide);
router.post("/:id/start", ctrl.start);
router.post("/:id/milestones/:milestoneId/toggle", ctrl.toggleMilestone);
router.post("/:id/link-afe", validate(schemas.linkAfe), ctrl.linkAfe);

module.exports = router;
