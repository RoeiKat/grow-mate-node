const Device = require("../models/Device");
const Command = require("../models/Command");
const ApiError = require("../utils/ApiError");

const ALLOWED_COMMAND_TYPES = [
  "refresh_telemetry",
  "water_plant",
  "firmware_update",
  "rotate_auth_secret"
];

async function createCommand(req, res) {
  const { deviceId, type, payload } = req.body;

  if (!deviceId || !type) {
    throw new ApiError(400, "deviceId and type are required");
  }

  const normalizedType = String(type).trim();

  if (!ALLOWED_COMMAND_TYPES.includes(normalizedType)) {
    throw new ApiError(
      400,
      `Invalid command type. Allowed types: ${ALLOWED_COMMAND_TYPES.join(", ")}`
    );
  }

  const device = await Device.findOne({
    _id: deviceId,
    user: req.user._id,
    status: "paired"
  });

  if (!device) {
    throw new ApiError(404, "Paired device not found");
  }

  const command = await Command.create({
    user: req.user._id,
    device: device._id,
    type: normalizedType,
    payload: payload || {}
  });

  res.status(201).json({
    message: "Command queued",
    command
  });
}

async function getCommandsForDevice(req, res) {
  const device = await Device.findOne({
    _id: req.params.deviceId,
    user: req.user._id
  });

  if (!device) {
    throw new ApiError(404, "Device not found");
  }

  const commands = await Command.find({ device: device._id }).sort({ createdAt: -1 });

  res.json({
    commands
  });
}

async function cancelCommand(req, res) {
  const command = await Command.findOne({
    _id: req.params.commandId,
    user: req.user._id
  });

  if (!command) {
    throw new ApiError(404, "Command not found");
  }

  if (command.status !== "pending") {
    throw new ApiError(400, "Only pending commands can be canceled");
  }

  command.status = "canceled";
  command.canceledAt = new Date();
  await command.save();

  res.json({
    message: "Command canceled",
    command
  });
}

module.exports = {
  createCommand,
  getCommandsForDevice,
  cancelCommand
};