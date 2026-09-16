const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/programs.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.adminProgram), ctrl.create);
router.patch("/:id", validate(schemas.adminProgramUpdate), ctrl.update);
router.delete("/:id", ctrl.archive);

module.exports = router;
