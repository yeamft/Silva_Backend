const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortDirectInstructions.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.directInstructionIssue), ctrl.issue);
router.get("/pending/:monthlyWoId", ctrl.pendingForMonthly);
router.get("/:id", ctrl.get);
router.post("/:id/confirm", ctrl.confirm);

module.exports = router;
