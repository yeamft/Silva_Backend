const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const c = require("../controllers/activities.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", c.list);
router.get("/:id", c.get);

module.exports = router;
