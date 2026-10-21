const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "app",
    },
    /** Max Load page ring filter: with = all data, without = no-ring only */
    maxLoadRingMode: {
      type: String,
      enum: ["with", "without"],
      default: "with",
    },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
