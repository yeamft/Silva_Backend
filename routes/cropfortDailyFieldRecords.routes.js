const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/cropfortDailyFieldRecords.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", ctrl.list);
router.post("/", validate(schemas.dfrCreate), ctrl.create);
router.get("/:id", ctrl.get);
router.patch("/:id", validate(schemas.dfrUpdate), ctrl.update);
router.post("/:id/submit", ctrl.submit);
router.post("/:id/site-check", validate(schemas.dfrSiteCheck), ctrl.siteCheck);
router.post("/:id/validate", validate(schemas.dfrValidate), ctrl.validate);
router.post("/:id/return", validate(schemas.dfrReturn), ctrl.returnDfr);
router.post("/:id/correct", validate(schemas.dfrCorrect), ctrl.correct);

module.exports = router;
