const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { requireFactoryAuth } = require("../middleware/factoryAuth");
const deviceController = require("../controllers/device.controller");

const router = express.Router();

const firmwareDir = path.join(process.cwd(), "uploads", "firmware");
fs.mkdirSync(firmwareDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, firmwareDir),
  filename: (req, file, cb) => {
    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeOriginalName}`);
  },
});

const upload = multer({ storage });

// Serve uploaded firmware files
router.use("/factory/firmware-files", express.static(firmwareDir));

// Factory HTML pages
router.get("/factory/secret-page", deviceController.renderFactorySecretPage);
router.get(
  "/factory/firmware-page",
  deviceController.renderFactoryFirmwarePage,
);

// Factory/manufacturer routes
router.get(
  "/factory/generate-secret/:serial",
  requireFactoryAuth,
  asyncHandler(deviceController.generateDeviceSecret),
);

router.post(
  "/factory/:deviceId/firmware-update",
  requireFactoryAuth,
  asyncHandler(deviceController.queueFirmwareUpdateForDevice),
);

router.post(
  "/factory/firmware-update-all",
  requireFactoryAuth,
  asyncHandler(deviceController.queueFirmwareUpdateForAll),
);

router.post(
  "/factory/firmware-upload-all",
  requireFactoryAuth,
  upload.single("firmware"),
  asyncHandler(deviceController.queueUploadedFirmwareUpdateForAll),
);

router.post(
  "/factory/:deviceId/auth-rotate",
  requireFactoryAuth,
  asyncHandler(deviceController.queueAuthRotationForDevice),
);

router.post(
  "/factory/auth-rotate-all",
  requireFactoryAuth,
  asyncHandler(deviceController.queueAuthRotationForAll),
);

// User routes
router.post(
  "/pair",
  requireAuth,
  asyncHandler(deviceController.confirmPairing),
);
router.get("/me", requireAuth, asyncHandler(deviceController.getMyDevices));
router.get(
  "/:deviceId",
  requireAuth,
  asyncHandler(deviceController.getSingleDevice),
);
router.patch(
  "/:deviceId",
  requireAuth,
  asyncHandler(deviceController.renameDevice),
);
router.delete(
  "/:deviceId",
  requireAuth,
  asyncHandler(deviceController.unpairDevice),
);

module.exports = router;
