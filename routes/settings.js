const express = require("express");
const Settings = require("../models/Settings");

const router = express.Router();

function normalizeRingMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  if (raw instanceof Map) {
    for (const [k, v] of raw.entries()) {
      if (v === true || v === "true" || v === 1) out[String(k)] = true;
    }
    return out;
  }
  for (const [k, v] of Object.entries(raw)) {
    if (v === true || v === "true" || v === 1) out[String(k)] = true;
  }
  return out;
}

function payload(doc) {
  const lean = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    maxLoadRingMode:
      lean.maxLoadRingMode === "without" ? "without" : "with",
    calculatorRingActive: normalizeRingMap(lean.calculatorRingActive),
  };
}

async function getOrCreateSettings() {
  let doc = await Settings.findOne({ key: "app" });
  if (!doc) {
    doc = await Settings.create({
      key: "app",
      maxLoadRingMode: "with",
      calculatorRingActive: {},
    });
  }
  return doc;
}

router.get("/", async (_req, res) => {
  try {
    const doc = await getOrCreateSettings();
    res.json({ success: true, data: payload(doc) });
  } catch (err) {
    console.error("GET /api/settings:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load settings",
      error: err.message,
    });
  }
});

router.patch("/", async (req, res) => {
  try {
    const body = req.body || {};
    let doc = await Settings.findOne({ key: "app" });
    if (!doc) {
      doc = new Settings({
        key: "app",
        maxLoadRingMode: "with",
        calculatorRingActive: {},
      });
    }

    let changed = false;
    if (body.maxLoadRingMode != null) {
      let mode = String(body.maxLoadRingMode || "").toLowerCase();
      if (mode !== "with" && mode !== "without") {
        return res.status(400).json({
          success: false,
          message: 'maxLoadRingMode must be "with" or "without"',
        });
      }
      doc.maxLoadRingMode = mode;
      changed = true;
    }

    if (body.calculatorRingActive != null) {
      if (
        typeof body.calculatorRingActive !== "object" ||
        Array.isArray(body.calculatorRingActive)
      ) {
        return res.status(400).json({
          success: false,
          message: "calculatorRingActive must be an object map",
        });
      }
      doc.calculatorRingActive = normalizeRingMap(body.calculatorRingActive);
      doc.markModified("calculatorRingActive");
      changed = true;
    }

    if (!changed) {
      return res.status(400).json({
        success: false,
        message: "No valid settings fields to update",
      });
    }

    await doc.save();
    res.json({ success: true, data: payload(doc) });
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
