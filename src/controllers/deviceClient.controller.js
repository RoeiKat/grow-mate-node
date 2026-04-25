const Command = require("../models/Command");
const ApiError = require("../utils/ApiError");
const deviceController = require("./device.controller");

async function heartbeat(req, res) {
  req.device.lastSeenAt = new Date();
  await req.device.save();

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    paired: Boolean(req.device.user),
    device: {
      isPaired: Boolean(req.device.user),
      status: req.device.status,
      authVersion: req.device.authVersion,
      firmwareVersion: req.device.firmwareVersion
    }
  });
}

async function pushLatestData(req, res) {
  if (!req.device.user) {
    throw new ApiError(409, "Device is not paired");
  }

  req.device.latestData = req.body || {};
  req.device.lastSeenAt = new Date();
  await req.device.save();

  res.json({
    ok: true
  });
}

async function getPendingCommands(req, res) {
  if (!req.device.user) {
    throw new ApiError(409, "Device is not paired");
  }

  const commands = await Command.find({
    device: req.device._id,
    status: "pending"
  }).sort({ createdAt: 1 });

  const now = new Date();

  if (commands.length > 0) {
    await Command.updateMany(
      { _id: { $in: commands.map((command) => command._id) } },
      { $set: { deliveredAt: now } }
    );
  }

  req.device.lastSeenAt = now;
  await req.device.save();

  res.json({
    commands
  });
}

async function updateCommandStatus(req, res) {
  const { status, result } = req.body || {};

  const command = await Command.findOne({
    _id: req.params.commandId,
    device: req.device._id
  });

  if (!command) {
    return res.status(404).json({ message: "Command not found" });
  }

  if (!["in_progress", "finished", "failed", "canceled"].includes(status)) {
    return res.status(400).json({
      message: "status must be in_progress, finished, failed or canceled"
    });
  }

  const now = new Date();

  command.status = status;
  command.result = result ?? command.result;

  if (status === "in_progress") {
    command.startedAt = command.startedAt || now;
  }

  if (status === "finished") {
    command.startedAt = command.startedAt || now;
    command.finishedAt = now;
    command.failedAt = null;

    if (command.type === "rotate_auth_secret" && result?.authVersion) {
      req.device.authVersion = String(result.authVersion).trim();
    }

    if (command.type === "firmware_update" && result?.firmwareVersion) {
      req.device.firmwareVersion = String(result.firmwareVersion).trim();
    }
  }

  if (status === "failed") {
    command.startedAt = command.startedAt || now;
    command.failedAt = now;
  }

  if (status === "canceled") {
    command.canceledAt = now;
  }

  req.device.lastSeenAt = now;

  await Promise.all([command.save(), req.device.save()]);

  res.json({
    message: "Command updated",
    command
  });
}

async function resetSelf(req, res) {
  await deviceController.resetDeviceState(req.device);

  res.json({
    ok: true,
    message: "Device reset successfully",
    device: {
      isPaired: false,
      status: req.device.status,
      authVersion: req.device.authVersion,
      firmwareVersion: req.device.firmwareVersion
    }
  });
}

module.exports = {
  heartbeat,
  pushLatestData,
  getPendingCommands,
  updateCommandStatus,
  resetSelf
};