const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/cropfortAgreementConfig.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.get);
router.put("/", ctrl.put);

module.exports = router;
