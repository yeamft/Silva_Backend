const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/notifications.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/acknowledge-all", ctrl.acknowledgeAll);
router.post("/:id/acknowledge", ctrl.acknowledge);

module.exports = router;
