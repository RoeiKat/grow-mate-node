const express = require("express");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const commandController = require("../controllers/command.controller");

const router = express.Router();

router.post("/", requireAuth, asyncHandler(commandController.createCommand));
router.get("/device/:deviceId", requireAuth, asyncHandler(commandController.getCommandsForDevice));
router.patch("/:commandId/cancel", requireAuth, asyncHandler(commandController.cancelCommand));

module.exports = router;
