const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortMonthlyWorkOrders.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.monthlyWoCreate), ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.monthlyWoDecide), ctrl.decide);
router.post("/:id/activate", ctrl.activate);
router.post("/:id/loop", validate(schemas.monthlyWoLoop), ctrl.setLoop);
router.post(
  "/:id/out-of-plan-lines",
  validate(schemas.monthlyWoAddOutOfPlanLine),
  ctrl.addOutOfPlanLine,
);

module.exports = router;
