const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/workOrders.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.workOrderCreate), ctrl.create);
router.get("/tickets", ctrl.listTickets);
router.post("/tickets/:ticketId/transition", validate(schemas.fieldTicketTransition), ctrl.transitionTicket);
router.get("/:id", ctrl.get);
router.patch("/:id", validate(schemas.workOrderUpdate), ctrl.update);
router.post("/:id/transition", validate(schemas.workOrderTransition), ctrl.transition);
router.post("/:id/vendor-report", validate(schemas.workOrderVendorReport), ctrl.vendorReport);
router.post("/:id/review", validate(schemas.workOrderReview), ctrl.review);
router.get("/:id/tickets", ctrl.listTickets);
router.post("/:id/tickets", validate(schemas.fieldTicketCreate), ctrl.createTicket);

module.exports = router;
