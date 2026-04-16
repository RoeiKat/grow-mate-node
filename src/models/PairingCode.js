const mongoose = require("mongoose");

const pairingCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    device: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Device",
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

pairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PairingCode", pairingCodeSchema);
