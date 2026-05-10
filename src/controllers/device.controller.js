const crypto = require("crypto");
const fs = require("fs");
const Device = require("../models/Device");
const PairingCode = require("../models/PairingCode");
const Command = require("../models/Command");
const ApiError = require("../utils/ApiError");
const { generatePairingCode } = require("../utils/pairingCode");
const {
  normalizeSerialNumber,
  buildDerivedDeviceSecretForVersion,
  getMasterSecretForVersion,
} = require("../utils/deviceIdentity");

function getBulkWindowMinutes(req) {
  const raw =
    req.body?.onlySeenWithinMinutes ??
    process.env.FACTORY_BULK_ONLINE_MINUTES ??
    "1440";
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 1440;
}

function buildBulkPairedFilter(req) {
  const minutes = getBulkWindowMinutes(req);
  const since = new Date(Date.now() - minutes * 60 * 1000);

  return {
    status: "paired",
    user: { $ne: null },
    lastSeenAt: { $gte: since },
  };
}

function assertTargetVersionConfigured(targetAuthVersion) {
  const masterSecret = getMasterSecretForVersion(targetAuthVersion);

  if (!masterSecret) {
    throw new ApiError(400, "Invalid target auth version");
  }

  return masterSecret;
}

async function resetDeviceState(device) {
  device.user = null;
  device.status = "unpaired";
  device.name = "";
  device.latestData = {};
  device.pairingCodeActive = false;
  device.lastSeenAt = new Date();

  await device.save();

  await Promise.all([
    PairingCode.deleteMany({ device: device._id }),
    Command.deleteMany({ device: device._id }),
  ]);
}

async function generateDeviceSecret(req, res) {
  const serialNumber = normalizeSerialNumber(req.params.serial);
  const targetAuthVersion = String(
    req.query.version || process.env.DEVICE_AUTH_CURRENT_VERSION || "",
  ).trim();

  if (!serialNumber) {
    throw new ApiError(400, "Serial is required");
  }

  assertTargetVersionConfigured(targetAuthVersion);

  const deviceSecret = buildDerivedDeviceSecretForVersion(
    serialNumber,
    targetAuthVersion,
  );

  res.json({
    serialNumber,
    authVersion: targetAuthVersion,
    deviceSecret,
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
        firmwareVersion: req.device.firmwareVersion,
      },
      pairingCode: null,
      code: null,
      expiresAt: null,
    });
  }

  await PairingCode.deleteMany({ device: req.device._id, usedAt: null });

  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const pairingCode = await PairingCode.create({
    code,
    device: req.device._id,
    expiresAt,
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
      firmwareVersion: req.device.firmwareVersion,
    },
    pairingCode: {
      code: pairingCode.code,
      expiresAt: pairingCode.expiresAt,
    },
    code: pairingCode.code,
    expiresAt: pairingCode.expiresAt,
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
    expiresAt: { $gt: new Date() },
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
      _id: { $ne: pairingCode._id },
    }),
  ]);

  res.json({
    message: "Device paired successfully",
    device,
  });
}

async function getMyDevices(req, res) {
  const devices = await Device.find({ user: req.user._id }).sort({
    createdAt: -1,
  });
  res.json({ devices });
}

async function getSingleDevice(req, res) {
  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id,
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  const commands = await Command.find({ device: device._id })
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    device,
    telemetry: device.latestData || {},
    meta: {
      lastSeenAt: device.lastSeenAt || null,
      pairingCodeActive: Boolean(device.pairingCodeActive),
    },
    recentCommands: commands,
  });
}

async function renameDevice(req, res) {
  const { name } = req.body;

  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id,
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  device.name = (name || "").trim();
  await device.save();

  res.json({
    message: "Device updated",
    device,
  });
}

async function unpairDevice(req, res) {
  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id,
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  await resetDeviceState(device);

  res.json({
    message: "Device unpaired",
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
    throw new ApiError(
      400,
      "Device must be paired before queueing firmware updates",
    );
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
      force: Boolean(force),
    },
  });

  res.status(201).json({
    message: "Firmware update command queued",
    command,
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
      queuedCount: 0,
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
      force: Boolean(force),
    },
  }));

  const commands = await Command.insertMany(docs);

  res.status(201).json({
    message: "Firmware update commands queued",
    queuedCount: commands.length,
    deviceIds: devices.map((device) => device._id),
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
    throw new ApiError(
      400,
      "Device must be paired before queueing auth rotation",
    );
  }

  if (device.status !== "paired") {
    throw new ApiError(400, "Only paired devices can rotate auth");
  }

  const targetAuthSecret = buildDerivedDeviceSecretForVersion(
    device.serialNumber,
    String(targetAuthVersion).trim(),
  );

  const command = await Command.create({
    user: device.user,
    device: device._id,
    type: "rotate_auth_secret",
    payload: {
      targetAuthVersion: String(targetAuthVersion).trim(),
      targetAuthSecret,
    },
  });

  res.status(201).json({
    message: "Auth rotation command queued",
    command,
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
      queuedCount: 0,
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
        normalizedVersion,
      ),
    },
  }));

  const commands = await Command.insertMany(docs);

  res.status(201).json({
    message: "Auth rotation commands queued",
    queuedCount: commands.length,
    deviceIds: devices.map((device) => device._id),
  });
}

function factoryPageLayout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background: #f6f7f8;
      color: #1f2937;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 520px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 28px;
      box-shadow: 0 12px 35px rgba(0,0,0,0.06);
    }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 22px; color: #6b7280; }
    label {
      display: block;
      margin: 14px 0 6px;
      font-size: 14px;
      font-weight: 700;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      font-size: 15px;
      outline: none;
    }
    input:focus { border-color: #3F826D; }
    button {
      width: 100%;
      margin-top: 20px;
      padding: 13px 16px;
      border: none;
      border-radius: 12px;
      background: #3F826D;
      color: white;
      font-weight: 800;
      font-size: 15px;
      cursor: pointer;
    }
    button:disabled { opacity: 0.6; cursor: wait; }
    .alert {
      display: none;
      margin-top: 18px;
      padding: 14px;
      border-radius: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 14px;
    }
    .success {
      display: block;
      background: #ecfdf5;
      border: 1px solid #86efac;
      color: #166534;
    }
    .error {
      display: block;
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #991b1b;
    }
    .links {
      display: flex;
      gap: 12px;
      margin-top: 18px;
      font-size: 14px;
    }
    a { color: #3F826D; font-weight: 700; text-decoration: none; }
  </style>
</head>
<body>
  <main class="card">
    ${body}
  </main>
</body>
</html>`;
}

function renderFactorySecretPage(req, res) {
  res.type("html").send(
    factoryPageLayout(
      "Factory Device Secret",
      `
    <h1>Generate Device Secret</h1>
    <p>Enter the factory API key, device serial, and auth version.</p>

    <form id="secretForm">
      <label>Factory API Key</label>
      <input id="factoryApiKey" type="password" required />

      <label>Device Serial</label>
      <input id="serial" placeholder="00000AABBCCDDEEFF" required />

      <label>Auth Version</label>
      <input id="version" placeholder="v1" value="v1" required />

      <button id="submitBtn">Generate Secret</button>
    </form>

    <div id="alert" class="alert"></div>

    <div class="links">
      <a href="./firmware-page">Firmware update page</a>
    </div>

    <script>
      const form = document.getElementById("secretForm");
      const alertBox = document.getElementById("alert");
      const submitBtn = document.getElementById("submitBtn");

      function showAlert(type, text) {
        alertBox.className = "alert " + type;
        alertBox.textContent = text;
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        alertBox.className = "alert";
        submitBtn.disabled = true;

        const factoryApiKey = document.getElementById("factoryApiKey").value.trim();
        const serial = document.getElementById("serial").value.trim();
        const version = document.getElementById("version").value.trim();

        try {
          const response = await fetch("./generate-secret/" + encodeURIComponent(serial) + "?version=" + encodeURIComponent(version), {
            headers: {
              "x-factory-api-key": factoryApiKey
            }
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Failed to generate secret");
          }

          showAlert("success",
            "Serial: " + data.serialNumber +
            "\\nAuth Version: " + data.authVersion +
            "\\nDevice Secret:\\n" + data.deviceSecret
          );
        } catch (error) {
          showAlert("error", error.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
    </script>
  `,
    ),
  );
}

function renderFactoryFirmwarePage(req, res) {
  res.type("html").send(
    factoryPageLayout(
      "Factory Firmware Update",
      `
    <h1>Upload Firmware Update</h1>
    <p>Upload the latest build and queue an update for all eligible paired devices.</p>

    <form id="firmwareForm">
      <label>Factory API Key</label>
      <input id="factoryApiKey" type="password" required />

      <label>Firmware Version</label>
      <input id="version" placeholder="1.0.1" required />

      <label>Only devices seen within minutes</label>
      <input id="onlySeenWithinMinutes" type="number" min="1" value="1440" />

      <label>Firmware File</label>
      <input id="firmware" type="file" required />

      <label>
        <input id="force" type="checkbox" style="width:auto; margin-right:8px;" />
        Force update
      </label>

      <button id="submitBtn">Upload & Queue Update</button>
    </form>

    <div id="alert" class="alert"></div>

    <div class="links">
      <a href="./secret-page">Device secret page</a>
    </div>

    <script>
      const form = document.getElementById("firmwareForm");
      const alertBox = document.getElementById("alert");
      const submitBtn = document.getElementById("submitBtn");

      function showAlert(type, text) {
        alertBox.className = "alert " + type;
        alertBox.textContent = text;
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        alertBox.className = "alert";
        submitBtn.disabled = true;

        const factoryApiKey = document.getElementById("factoryApiKey").value.trim();
        const formData = new FormData();

        formData.append("version", document.getElementById("version").value.trim());
        formData.append("onlySeenWithinMinutes", document.getElementById("onlySeenWithinMinutes").value.trim());
        formData.append("force", document.getElementById("force").checked ? "true" : "false");
        formData.append("firmware", document.getElementById("firmware").files[0]);

        try {
          const response = await fetch("./firmware-upload-all", {
            method: "POST",
            headers: {
              "x-factory-api-key": factoryApiKey
            },
            body: formData
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Firmware upload failed");
          }

          showAlert("success",
            data.message +
            "\\nQueued devices: " + data.queuedCount +
            "\\nVersion: " + data.version +
            "\\nSHA256: " + data.sha256 +
            "\\nURL: " + data.url
          );
        } catch (error) {
          showAlert("error", error.message);
        } finally {
          submitBtn.disabled = false;
        }
      });
    </script>
  `,
    ),
  );
}

async function queueUploadedFirmwareUpdateForAll(req, res) {
  const { version, force = false } = req.body || {};

  if (!version) {
    throw new ApiError(400, "version is required");
  }

  if (!req.file) {
    throw new ApiError(400, "firmware file is required");
  }

  const fileBuffer = fs.readFileSync(req.file.path);
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const baseUrl =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;

  req.body.url = `${baseUrl}/api/devices/factory/firmware-files/${req.file.filename}`;
  req.body.sha256 = sha256;
  req.body.force = String(force) === "true" || force === true;

  const originalJson = res.json.bind(res);

  res.json = (payload) => {
    return originalJson({
      ...payload,
      version: String(version).trim(),
      url: req.body.url,
      sha256,
    });
  };

  return queueFirmwareUpdateForAll(req, res);
}

module.exports = {
  resetDeviceState,
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
  queueAuthRotationForAll,
  renderFactorySecretPage,
  renderFactoryFirmwarePage,
  queueUploadedFirmwareUpdateForAll,
};
