const express = require("express");
const authenticateJWT = require("../middleware/authenticateJWT");
const validate = require("../middleware/validate");
const ctrl = require("../controllers/orgMap.controller");
const schemas = require("../schemas");

const router = express.Router();
router.use(authenticateJWT);

router.get("/overview", ctrl.overview);
router.get("/blocks", ctrl.listBlocks);
router.post("/blocks", validate(schemas.orgMapBlock), ctrl.createBlock);
router.patch("/blocks/:id", validate(schemas.orgMapBlock), ctrl.updateBlock);
router.delete("/blocks/:id", ctrl.deleteBlock);

router.get("/organizations", ctrl.listOrganizations);
router.post("/organizations", validate(schemas.orgMapOrganization), ctrl.createOrganization);
router.patch("/organizations/:id", validate(schemas.orgMapOrganization), ctrl.updateOrganization);
router.delete("/organizations/:id", ctrl.deleteOrganization);

router.get("/farm-areas", ctrl.listFarmAreas);
router.post("/farm-areas", validate(schemas.orgMapFarmArea), ctrl.createFarmArea);
router.patch("/farm-areas/:id", validate(schemas.orgMapFarmArea), ctrl.updateFarmArea);
router.delete("/farm-areas/:id", ctrl.deleteFarmArea);

router.get("/vendors", ctrl.listVendors);
router.post("/vendors", validate(schemas.orgMapVendor), ctrl.createVendor);
router.patch("/vendors/:id", validate(schemas.orgMapVendor), ctrl.updateVendor);
router.delete("/vendors/:id", ctrl.deleteVendor);

router.get("/asset-owners", ctrl.listAssetOwners);
router.post("/asset-owners", validate(schemas.orgMapAssetOwner), ctrl.createAssetOwner);
router.patch("/asset-owners/:id", validate(schemas.orgMapAssetOwner), ctrl.updateAssetOwner);
router.delete("/asset-owners/:id", ctrl.deleteAssetOwner);

module.exports = router;
