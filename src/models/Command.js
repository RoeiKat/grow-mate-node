const mongoose = require("mongoose");

const commandSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      trim: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "finished", "failed", "canceled"],
      default: "pending",
      index: true
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    finishedAt: {
      type: Date,
      default: null
    },
    failedAt: {
      type: Date,
      default: null
    },
    canceledAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Command", commandSchema);