const express = require("express");
const crypto = require("crypto");

const router = express.Router();

// TEMP ROUTE — REMOVE BEFORE PRODUCTION
router.get("/device-temp-secret", (req, res) => {
  const secret = crypto.randomBytes(32).toString("hex");

  res.json({
    secret,
    configSnippet: `const char* DEVICE_SECRET = "${secret}";`
  });
});

module.exports = router;