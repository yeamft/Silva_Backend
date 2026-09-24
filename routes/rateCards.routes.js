const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const schemas = require("../schemas");
const controller = require("../controllers/rateCards.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", controller.list);
router.get("/summary", controller.summary);
router.post("/", validate(schemas.modularRateCard), controller.create);
router.get("/:id", controller.get);
router.patch("/:id", validate(schemas.modularRateCardUpdate), controller.update);

router.post("/:id/line-items", validate(schemas.rateCardLineItem), controller.addLineItem);
router.patch("/:id/line-items/:lineId", validate(schemas.rateCardLineItemUpdate), controller.updateLineItem);
router.delete("/:id/line-items/:lineId", controller.deleteLineItem);

router.post("/:id/submit", controller.submit);
router.post("/:id/approve", controller.approve);
router.post("/:id/reject", validate(schemas.rateCardReject), controller.reject);
router.post("/:id/publish", controller.publish);
router.post("/:id/archive", controller.archive);
router.post("/:id/restore", controller.restore);

module.exports = router;
