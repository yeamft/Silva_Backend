const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const ctrl = require("../controllers/cropfortScenarios.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.patch("/:id", ctrl.rename);
router.delete("/:id", ctrl.remove);

module.exports = router;
