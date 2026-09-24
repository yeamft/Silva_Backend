const express = require("express");
const rateLimit = require("../middleware/rateLimit");
const validate = require("../middleware/validate");
const schemas = require("../schemas");
const contactController = require("../controllers/contact.controller");

const router = express.Router();

router.post("/", rateLimit, validate(schemas.contactInquiry), contactController.submit);

module.exports = router;
