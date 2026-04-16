const Device = require("../models/Device");
const PairingCode = require("../models/PairingCode");
const Command = require("../models/Command");
const ApiError = require("../utils/ApiError");
const { generatePairingCode } = require("../utils/pairingCode");
const {
  normalizeSerialNumber,
  buildDerivedDeviceSecretForVersion,
  getMasterSecretForVersion
} = require("../utils/deviceIdentity");

function getBulkWindowMinutes(req) {
  const raw = req.body?.onlySeenWithinMinutes ?? process.env.FACTORY_BULK_ONLINE_MINUTES ?? "1440";
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1440;
}

function buildBulkPairedFilter(req) {
  const minutes = getBulkWindowMinutes(req);
  const since = new Date(Date.now() - minutes * 60 * 1000);

  return {
    status: "paired",
    user: { $ne: null },
    lastSeenAt: { $gte: since }
  };
}

function assertTargetVersionConfigured(targetAuthVersion) {
  const masterSecret = getMasterSecretForVersion(targetAuthVersion);

  if (!masterSecret) {
    throw new ApiError(400, "Invalid target auth version");
  }

  return masterSecret;
}

async function generateDeviceSecret(req, res) {
  const serialNumber = normalizeSerialNumber(req.params.serial);
  const targetAuthVersion = String(
    req.query.version || process.env.DEVICE_AUTH_CURRENT_VERSION || ""
  ).trim();

  if (!serialNumber) {
    throw new ApiError(400, "Serial is required");
  }

  assertTargetVersionConfigured(targetAuthVersion);

  const deviceSecret = buildDerivedDeviceSecretForVersion(serialNumber, targetAuthVersion);

  res.json({
    serialNumber,
    authVersion: targetAuthVersion,
    deviceSecret
  });
}

async function requestPairingCode(req, res) {
  const ttlMinutes = Number(process.env.PAIRING_CODE_TTL_MINUTES || 5);
  const { model, firmwareVersion } = req.body || {};

  if (model?.trim()) {
    req.device.model = model.trim();
  }

  if (firmwareVersion?.trim()) {
    req.device.firmwareVersion = firmwareVersion.trim();
  }

  req.device.lastSeenAt = new Date();

  if (req.device.user) {
    req.device.status = "paired";
    req.device.pairingCodeActive = false;
    await req.device.save();

    return res.json({
      serialNumber: req.device.serialNumber,
      isPaired: true,
      device: {
        isPaired: true,
        status: req.device.status,
        authVersion: req.device.authVersion,
        firmwareVersion: req.device.firmwareVersion
      },
      pairingCode: null,
      code: null,
      expiresAt: null
    });
  }

  await PairingCode.deleteMany({ device: req.device._id, usedAt: null });

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const pairingCode = await PairingCode.create({
    code,
    device: req.device._id,
    expiresAt
  });

  req.device.status = "unpaired";
  req.device.pairingCodeActive = true;
  await req.device.save();

  res.json({
    serialNumber: req.device.serialNumber,
    isPaired: false,
    device: {
      isPaired: false,
      status: req.device.status,
      authVersion: req.device.authVersion,
      firmwareVersion: req.device.firmwareVersion
    },
    pairingCode: {
      code: pairingCode.code,
      expiresAt: pairingCode.expiresAt
    },
    code: pairingCode.code,
    expiresAt: pairingCode.expiresAt
  });
}

async function confirmPairing(req, res) {
  const { code, deviceName } = req.body;

  if (!code) {
    throw new ApiError(400, "Pairing code is required");
  }

  const pairingCode = await PairingCode.findOne({
    code: code.trim(),
    usedAt: null,
    expiresAt: { $gt: new Date() }
  }).populate("device");

  if (!pairingCode) {
    throw new ApiError(400, "Invalid or expired pairing code");
  }

  const device = pairingCode.device;

  if (!device) {
    throw new ApiError(404, "Device was not found");
  }

  if (device.user) {
    throw new ApiError(409, "Device is already paired");
  }

  device.user = req.user._id;
  device.status = "paired";
  device.pairingCodeActive = false;
  device.lastSeenAt = new Date();

  if (deviceName?.trim()) {
    device.name = deviceName.trim();
  }

  pairingCode.usedAt = new Date();

  await Promise.all([
    device.save(),
    pairingCode.save(),
    PairingCode.deleteMany({
      device: device._id,
      usedAt: null,
      _id: { $ne: pairingCode._id }
    })
  ]);

  res.json({
    message: "Device paired successfully",
    device
  });
}

async function getMyDevices(req, res) {
  const devices = await Device.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ devices });
}

async function getSingleDevice(req, res) {
  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  const commands = await Command.find({ device: device._id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    device,
    recentCommands: commands
  });
}

async function renameDevice(req, res) {
  const { name } = req.body;

  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  device.name = (name || "").trim();
  await device.save();

  res.json({
    message: "Device updated",
    device
  });
}

async function unpairDevice(req, res) {
  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  device.user = null;
  device.status = "unpaired";
  device.name = "";
  device.latestData = {};
  device.pairingCodeActive = false;
  await device.save();

  await PairingCode.deleteMany({ device: device._id });
  await Command.deleteMany({ device: device._id });

  res.json({
    message: "Device unpaired"
  });
}

async function queueFirmwareUpdateForDevice(req, res) {
  const { version, url, sha256, force = false } = req.body || {};

  if (!version || !url) {
    throw new ApiError(400, "version and url are required");
  }

  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  if (!device.user) {
    throw new ApiError(400, "Device must be paired before queueing firmware updates");
  }

  if (device.status !== "paired") {
    throw new ApiError(400, "Only paired devices can receive firmware updates");
  }

  const command = await Command.create({
    user: device.user,
    device: device._id,
    type: "firmware_update",
    payload: {
      version: String(version).trim(),
      url: String(url).trim(),
      sha256: sha256 ? String(sha256).trim() : "",
      force: Boolean(force)
    }
  });

  res.status(201).json({
    message: "Firmware update command queued",
    command
  });
}

async function queueFirmwareUpdateForAll(req, res) {
  const { version, url, sha256, force = false } = req.body || {};

  if (!version || !url) {
    throw new ApiError(400, "version and url are required");
  }

  const devices = await Device.find(buildBulkPairedFilter(req));

  if (devices.length === 0) {
    return res.json({
      message: "No eligible devices found",
      queuedCount: 0
    });
  }

  const docs = devices.map((device) => ({
    user: device.user,
    device: device._id,
    type: "firmware_update",
    payload: {
      version: String(version).trim(),
      url: String(url).trim(),
      sha256: sha256 ? String(sha256).trim() : "",
      force: Boolean(force)
    }
  }));

  const commands = await Command.insertMany(docs);

  res.status(201).json({
    message: "Firmware update commands queued",
    queuedCount: commands.length,
    deviceIds: devices.map((device) => device._id)
  });
}

async function queueAuthRotationForDevice(req, res) {
  const { targetAuthVersion } = req.body || {};

  if (!targetAuthVersion) {
    throw new ApiError(400, "targetAuthVersion is required");
  }

  assertTargetVersionConfigured(targetAuthVersion);

  const device = await Device.findById(req.params.deviceId);

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  if (!device.user) {
    throw new ApiError(400, "Device must be paired before queueing auth rotation");
  }

  if (device.status !== "paired") {
    throw new ApiError(400, "Only paired devices can rotate auth");
  }

  const targetAuthSecret = buildDerivedDeviceSecretForVersion(
    device.serialNumber,
    String(targetAuthVersion).trim()
  );

  const command = await Command.create({
    user: device.user,
    device: device._id,
    type: "rotate_auth_secret",
    payload: {
      targetAuthVersion: String(targetAuthVersion).trim(),
      targetAuthSecret
    }
  });

  res.status(201).json({
    message: "Auth rotation command queued",
    command
  });
}

async function queueAuthRotationForAll(req, res) {
  const { targetAuthVersion } = req.body || {};

  if (!targetAuthVersion) {
    throw new ApiError(400, "targetAuthVersion is required");
  }

  assertTargetVersionConfigured(targetAuthVersion);

  const devices = await Device.find(buildBulkPairedFilter(req));

  if (devices.length === 0) {
    return res.json({
      message: "No eligible devices found",
      queuedCount: 0
    });
  }

  const normalizedVersion = String(targetAuthVersion).trim();

  const docs = devices.map((device) => ({
    user: device.user,
    device: device._id,
    type: "rotate_auth_secret",
    payload: {
      targetAuthVersion: normalizedVersion,
      targetAuthSecret: buildDerivedDeviceSecretForVersion(
        device.serialNumber,
        normalizedVersion
      )
    }
  }));

  const commands = await Command.insertMany(docs);

  res.status(201).json({
    message: "Auth rotation commands queued",
    queuedCount: commands.length,
    deviceIds: devices.map((device) => device._id)
  });
}

module.exports = {
  generateDeviceSecret,
  requestPairingCode,
  confirmPairing,
  getMyDevices,
  getSingleDevice,
  renameDevice,
  unpairDevice,
  queueFirmwareUpdateForDevice,
  queueFirmwareUpdateForAll,
  queueAuthRotationForDevice,
  queueAuthRotationForAll
};