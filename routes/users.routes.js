const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const usersController = require("../controllers/users.controller");
const schemas = require("../schemas");

const router = express.Router();

router.use(authenticateJWT);

router.get("/", usersController.list);
router.get("/meta", usersController.meta);
router.post("/", validate(schemas.adminUser), usersController.create);
router.patch("/:id", validate(schemas.adminUser), usersController.update);
router.post("/:id/suspend", usersController.suspend);
router.post("/:id/activate", usersController.activate);
router.post("/:id/revoke-sessions", usersController.revokeSessions);
router.delete("/:id", usersController.remove);
router.get("/:id/audit", usersController.audit);

module.exports = router;
