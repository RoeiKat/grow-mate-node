const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    serialNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    authVersion: {
      type: String,
      default: "v1",
      trim: true
    },
    name: {
      type: String,
      default: ""
    },
    model: {
      type: String,
      default: "GrowMate"
    },
    status: {
      type: String,
      enum: ["unpaired", "paired", "disabled"],
      default: "unpaired"
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    firmwareVersion: {
      type: String,
      default: ""
    },
    pairingCodeActive: {
      type: Boolean,
      default: false
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    latestData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Device", deviceSchema);