const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortAfes.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.cropfortAfeCreate), ctrl.create);
router.get("/:id", ctrl.get);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/decide", validate(schemas.cropfortAfeDecide), ctrl.decide);

module.exports = router;
