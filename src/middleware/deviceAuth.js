const Device = require("../models/Device");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const {
  normalizeSerialNumber,
  getMasterSecretForVersion,
  buildDerivedDeviceSecret,
  timingSafeEqualStrings
} = require("../utils/deviceIdentity");

const requireDeviceAuth = asyncHandler(async (req, res, next) => {
  const serialNumber = normalizeSerialNumber(req.headers["x-device-serial"]);
  const deviceSecret = (req.headers["x-device-secret"] || "").toString().trim();
  const authVersion = (req.headers["x-device-auth-version"] || "").toString().trim();
  const headerModel = (req.headers["x-device-model"] || "").toString().trim();
  const headerFirmware = (req.headers["x-device-firmware"] || "").toString().trim();

  if (!serialNumber || !deviceSecret || !authVersion) {
    throw new ApiError(401, "Missing device authentication headers");
  }

  const masterSecret = getMasterSecretForVersion(authVersion);

  if (!masterSecret) {
    throw new ApiError(401, "Invalid auth version");
  }

  const expectedSecret = buildDerivedDeviceSecret(serialNumber, masterSecret);

  if (!timingSafeEqualStrings(expectedSecret, deviceSecret)) {
    throw new ApiError(401, "Invalid device credentials");
  }

  let device = await Device.findOne({ serialNumber });

  if (!device) {
    device = await Device.create({
      serialNumber,
      authVersion,
      name: "",
      model: headerModel || "GrowMate",
      firmwareVersion: headerFirmware || "",
      status: "unpaired",
      user: null,
      pairingCodeActive: false,
      latestData: {}
    });
  } else {
    if (device.status === "disabled") {
      throw new ApiError(403, "Device is disabled");
    }

    let changed = false;

    if (device.authVersion !== authVersion) {
      device.authVersion = authVersion;
      changed = true;
    }

    if (headerModel && device.model !== headerModel) {
      device.model = headerModel;
      changed = true;
    }

    if (headerFirmware && device.firmwareVersion !== headerFirmware) {
      device.firmwareVersion = headerFirmware;
      changed = true;
    }

    if (changed) {
      await device.save();
    }
  }

  req.device = device;
  next();
});

module.exports = {
  requireDeviceAuth
};