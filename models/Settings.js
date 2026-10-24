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
    /** Station branding */
    stationName: { type: String, default: "Bottail SS" },
    stationOrg: { type: String, default: "WZPDCL" },
    /** Default bus voltages for calculator (kV) */
    defaultBus1Kv: { type: Number, default: 33 },
    defaultBus2Kv: { type: Number, default: 33 },
    /** Soft guidance ceilings used in night-log voltage logic */
    bus1MaxKv: { type: Number, default: 36 },
    bus2MaxKv: { type: Number, default: 35.6 },
    /** Days soft-deleted history is kept before purge */
    trashRetentionDays: { type: Number, default: 30 },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
