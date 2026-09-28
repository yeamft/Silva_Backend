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
router.get("/:id/tickets", ctrl.listTickets);
router.post("/:id/tickets", validate(schemas.fieldTicketCreate), ctrl.createTicket);

module.exports = router;
