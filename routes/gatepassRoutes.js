const express = require("express");
const router = express.Router();

const GatePassController = require("../controllers/GatePassController");

router.post("/createGatePass", GatePassController.createGatePass);

router.get("/getAllGatePass", GatePassController.getAllGatePass);
router.post("/updateParticulars", GatePassController.updateParticularQty);

module.exports = router;
