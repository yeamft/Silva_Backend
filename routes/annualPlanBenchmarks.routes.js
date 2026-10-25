const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const controller = require("../controllers/annualPlanBenchmarks.controller");

const router = express.Router();
router.use(authenticateJWT);
router.get("/", controller.getLatest);

module.exports = router;