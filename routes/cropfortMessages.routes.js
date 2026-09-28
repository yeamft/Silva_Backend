const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/cropfortMessages.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.post("/:id/messages", ctrl.postMessage);
router.post("/:id/close", ctrl.close);
router.post("/:id/reopen", ctrl.reopen);

module.exports = router;
