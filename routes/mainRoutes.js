const express = require("express");
const router = express.Router();

const Controller = require("../controllers/AuthController");
const MainController = require("../controllers/MainController");
const authenticate = require("../middlewares/auth");
const assetController = require("../controllers/AssetController");

router.post("/register", Controller.register);
router.post("/login", Controller.login);
router.post("/logout?/:regdNo", Controller.logout);
router.get("/sample?/:regdNo", authenticate, MainController.sample);
router.post("/generateAndStoreOtp", Controller.generateAndStoreOtp);
router.post("/loginWithOtp", Controller.loginWithOtp);
router.post("/uploadImage", assetController.uploadImage);
router.post("/reportViolation", MainController.reportViolation);
router.get("/getImage?/:name", assetController.getImaage);
router.get("/getViolations", MainController.getViolations);
router.post("/updateVisitors", MainController.updateVisitors);

module.exports = router;
