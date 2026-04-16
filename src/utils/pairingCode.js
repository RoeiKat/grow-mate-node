const crypto = require("crypto");

function generatePairingCode() {
  // 6-digit numeric code
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
  return code;
}

module.exports = {
  generatePairingCode
};
