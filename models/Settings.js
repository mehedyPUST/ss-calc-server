const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "app",
    },
    maxLoadRingMode: {
      type: String,
      enum: ["with", "without"],
      default: "with",
    },
    calculatorRingActive: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
