const express = require("express");
const router = express.Router();

const MainController = require("../controllers/MainController");

router.get("/getCardsByID", MainController.getCardByID);

module.exports = router;
