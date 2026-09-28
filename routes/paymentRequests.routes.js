const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/paymentRequests.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/settlements", ctrl.listSettlements);
router.post("/settlements/:id/settle", ctrl.markSettlementSettled);

router.get("/", ctrl.list);
router.post("/", validate(schemas.paymentRequestCreate), ctrl.create);
router.post("/:id/verify", ctrl.verify);
router.post("/:id/return", validate(schemas.paymentRequestReturn), ctrl.returnPr);
router.post(
  "/:id/authorize-settlement",
  validate(schemas.paymentRequestAuthorizeSettlement),
  ctrl.authorizeSettlement,
);

module.exports = router;
