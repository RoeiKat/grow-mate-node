const crypto = require("crypto");

function normalizeSerialNumber(serialNumber) {
  return String(serialNumber || "").trim().toUpperCase();
}

function getVersionSecretMap() {
  const currentVersion = String(process.env.DEVICE_AUTH_CURRENT_VERSION || "").trim();
  const currentSecret = String(process.env.DEVICE_AUTH_CURRENT_SECRET || "").trim();

  if (!currentVersion || !currentSecret) {
    throw new Error("DEVICE_AUTH_CURRENT_VERSION and DEVICE_AUTH_CURRENT_SECRET must be set");
  }

  const map = new Map();
  map.set(currentVersion, currentSecret);

  const previousVersion = String(process.env.DEVICE_AUTH_PREVIOUS_VERSION || "").trim();
  const previousSecret = String(process.env.DEVICE_AUTH_PREVIOUS_SECRET || "").trim();

  if (previousVersion && previousSecret) {
    map.set(previousVersion, previousSecret);
  }

  return map;
}

function getMasterSecretForVersion(version) {
  const normalizedVersion = String(version || "").trim();
  const map = getVersionSecretMap();
  return map.get(normalizedVersion) || "";
}

function buildDerivedDeviceSecret(serialNumber, masterSecret) {
  const normalizedSerial = normalizeSerialNumber(serialNumber);

  return crypto
    .createHmac("sha256", String(masterSecret || ""))
    .update(normalizedSerial)
    .digest("hex");
}

function buildDerivedDeviceSecretForVersion(serialNumber, version) {
  const masterSecret = getMasterSecretForVersion(version);
  if (!masterSecret) {
    throw new Error(`No master secret configured for auth version "${version}"`);
  }

  return buildDerivedDeviceSecret(serialNumber, masterSecret);
}

function timingSafeEqualStrings(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  normalizeSerialNumber,
  getVersionSecretMap,
  getMasterSecretForVersion,
  buildDerivedDeviceSecret,
  buildDerivedDeviceSecretForVersion,
  timingSafeEqualStrings
};