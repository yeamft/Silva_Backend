const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const rateCardController = require("../controllers/rateCard.controller");
const schemas = require("../schemas");

const router = express.Router();

router.use(authenticateJWT);

router.get("/categories", rateCardController.listCategories);
router.post("/categories", validate(schemas.rateCardCategory), rateCardController.createCategory);
router.patch("/categories/:id", validate(schemas.rateCardCategory), rateCardController.updateCategory);
router.delete("/categories/:id", rateCardController.deleteCategory);

router.get("/lines", rateCardController.listLines);
router.post("/lines", validate(schemas.rateCardLine), rateCardController.createLine);
router.patch("/lines/:id", validate(schemas.rateCardLine), rateCardController.updateLine);
router.delete("/lines/:id", rateCardController.deleteLine);
router.post("/lines/submit", validate(schemas.rateCardSubmit), rateCardController.submitLines);
router.post("/lines/:id/approve", rateCardController.approveLine);
router.post("/lines/:id/return", validate(schemas.rateCardReturn), rateCardController.returnLine);

module.exports = router;
