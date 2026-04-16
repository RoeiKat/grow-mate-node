const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireDeviceAuth } = require("../middleware/deviceAuth");
const deviceController = require("../controllers/device.controller");
const deviceClientController = require("../controllers/deviceClient.controller");

const router = express.Router();

router.post("/pairing/request", requireDeviceAuth, asyncHandler(deviceController.requestPairingCode));
router.get("/heartbeat", requireDeviceAuth, asyncHandler(deviceClientController.heartbeat));
router.post("/data", requireDeviceAuth, asyncHandler(deviceClientController.pushLatestData));
router.get("/commands/pending", requireDeviceAuth, asyncHandler(deviceClientController.getPendingCommands));
router.patch("/commands/:commandId/status", requireDeviceAuth, asyncHandler(deviceClientController.updateCommandStatus));

module.exports = router;
