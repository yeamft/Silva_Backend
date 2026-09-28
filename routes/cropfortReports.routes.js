const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/cropfortReports.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id", ctrl.get);
router.patch("/:id", ctrl.update);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/release", ctrl.release);
router.post("/:id/return", ctrl.returnReport);
router.delete("/:id", ctrl.remove);

module.exports = router;
