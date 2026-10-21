const express = require("express");
const Settings = require("../models/Settings");

const router = express.Router();

async function getOrCreateSettings() {
  let doc = await Settings.findOne({ key: "app" }).lean();
  if (!doc) {
    const created = await Settings.create({
      key: "app",
      maxLoadRingMode: "with",
    });
    doc = created.toObject();
  }
  return doc;
}

/** GET /api/settings — public read */
router.get("/", async (_req, res) => {
  try {
    const doc = await getOrCreateSettings();
    res.json({
      success: true,
      data: {
        maxLoadRingMode:
          doc.maxLoadRingMode === "without" ? "without" : "with",
      },
    });
  } catch (err) {
    console.error("GET /api/settings:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load settings",
      error: err.message,
    });
  }
});

/** PATCH /api/settings — save ring mode (and future prefs) to DB */
router.patch("/", async (req, res) => {
  try {
    let mode = String(req.body?.maxLoadRingMode || "").toLowerCase();
    if (mode !== "with" && mode !== "without") {
      return res.status(400).json({
        success: false,
        message: 'maxLoadRingMode must be "with" or "without"',
      });
    }

    const doc = await Settings.findOneAndUpdate(
      { key: "app" },
      { $set: { maxLoadRingMode: mode } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      success: true,
      data: {
        maxLoadRingMode:
          doc.maxLoadRingMode === "without" ? "without" : "with",
      },
    });
  } catch (err) {
    console.error("PATCH /api/settings:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save settings",
      error: err.message,
    });
  }
});

module.exports = router;
