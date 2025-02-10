const express = require("express");
const router = express.Router();

const Controller = require("../controllers/AuthController");
const MainController = require("../controllers/MainController");
const authenticate = require("../middlewares/auth");
const assetController = require("../controllers/AssetController");

router.post("/register", Controller.register);
router.post("/login", Controller.login);
router.post("/logout?/:regdNo", Controller.logout);
router.post("/loginWithOtp", Controller.loginWithOtp);
router.get("/sample?/:regdNo", authenticate, MainController.sample);
router.get("/getImage?/:name", assetController.getImaage);
router.get("/getViolations", MainController.getViolations);
router.post("/generateAndStoreOtp", Controller.generateAndStoreOtp);
router.post("/uploadImage", assetController.uploadImage);
router.post("/reportViolation", MainController.reportViolation);
router.post("/updateVisitors", MainController.updateVisitors);
router.post("/expoPushtoken", MainController.expoPushToken);
router.post("/expoPushNotification", MainController.expoPushNotification);
router.post("/communications", MainController.communications);
router.get("/getAllPushTokens?/:regdNo", MainController.getAllPushTokens);
router.get("/getAllMessages", MainController.getAllMessages);
router.post(
  "/selectedUsersPushNotifications",
  MainController.selectedUsersPushNotifications
);

module.exports = router;
