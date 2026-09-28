const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/auditLog.controller");

const router = express.Router();
router.use(authenticateJWT);
router.get("/", ctrl.list);

module.exports = router;
