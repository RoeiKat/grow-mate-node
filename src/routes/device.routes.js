const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireFactoryAuth } = require("../middleware/factoryAuth");
const deviceController = require("../controllers/device.controller");

const router = express.Router();

// Factory/manufacturer routes
router.get(
  "/factory/generate-secret/:serial",
  requireFactoryAuth,
  asyncHandler(deviceController.generateDeviceSecret)
);

router.post(
  "/factory/:deviceId/firmware-update",
  requireFactoryAuth,
  asyncHandler(deviceController.queueFirmwareUpdateForDevice)
);

router.post(
  "/factory/firmware-update-all",
  requireFactoryAuth,
  asyncHandler(deviceController.queueFirmwareUpdateForAll)
);

router.post(
  "/factory/:deviceId/auth-rotate",
  requireFactoryAuth,
  asyncHandler(deviceController.queueAuthRotationForDevice)
);

router.post(
  "/factory/auth-rotate-all",
  requireFactoryAuth,
  asyncHandler(deviceController.queueAuthRotationForAll)
);

// User routes
router.post("/pair", requireAuth, asyncHandler(deviceController.confirmPairing));
router.get("/me", requireAuth, asyncHandler(deviceController.getMyDevices));
router.get("/:deviceId", requireAuth, asyncHandler(deviceController.getSingleDevice));
router.patch("/:deviceId", requireAuth, asyncHandler(deviceController.renameDevice));
router.delete("/:deviceId", requireAuth, asyncHandler(deviceController.unpairDevice));

module.exports = router;