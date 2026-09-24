const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const c = require("../controllers/rateCardProposal.controller");

const router = express.Router();
router.use(authenticateJWT);

router.get("/", c.listProgram);
router.get("/:id", c.get);
router.patch("/:id", c.update);
router.post("/:id/submit", c.submit);
router.post("/:id/approve", c.approve);
router.post("/:id/reject", c.reject);
router.post("/:id/archive", c.archive);
router.post("/:id/restore", c.restore);

module.exports = router;
