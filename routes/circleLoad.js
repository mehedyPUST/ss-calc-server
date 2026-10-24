const express = require("express");
const CircleLoadEntry = require("../models/CircleLoadEntry");
const Calculation = require("../models/Calculation");
const Admin = require("../models/Admin");
const {
  requireAuth,
  requireDuty,
  requireAdmin,
  optionalAuth,
  normalizeRole,
} = require("../middleware/auth");
const {
  CIRCLE_STATIONS,
  isSlotEditable,
  windowMinutes,
  dayKeyDhaka,
} = require("../lib/circleStations");

const router = express.Router();

function toNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function publicEntry(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    dayKey: o.dayKey,
    hourSlot: o.hourSlot,
    stationId: o.stationId,
    actualLoad: o.actualLoad,
    pgcbAllotment: o.pgcbAllotment,
    loadshed: o.loadshed,
    pbsLoad: o.pbsLoad,
    pbsAllotment: o.pbsAllotment,
    pbsLoadshed: o.pbsLoadshed,
    note: o.note || "",
    source: o.source || "manual",
    updatedByUsername: o.updatedByUsername || "",
    updatedAt: o.updatedAt,
  };
}

async function pullBottailFromCalculations(dayKey, hourSlot) {
  const dayStart = new Date(`${dayKey}T00:00:00+06:00`);
  const dayEnd = new Date(`${dayKey}T24:00:00+06:00`);
  const docs = await Calculation.find({
    hourSlot: String(hourSlot).trim(),
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
    calculatedAt: { $gte: dayStart, $lt: dayEnd },
  })
    .sort({ calculatedAt: -1 })
    .limit(1)
    .lean();

  if (!docs.length) return null;
  const c = docs[0];
  const total = Number(c.totalMW);
  if (!Number.isFinite(total)) return null;

  const entry = await CircleLoadEntry.findOneAndUpdate(
    { dayKey, hourSlot: String(hourSlot).trim(), stationId: "bottail" },
    {
      $set: {
        actualLoad: total,
        source: "calculator",
        note: c.note || "From Bottail calculator",
        updatedByUsername: c.updatedByUsername || c.createdByUsername || "",
      },
      $setOnInsert: {
        dayKey,
        hourSlot: String(hourSlot).trim(),
        stationId: "bottail",
        pgcbAllotment: null,
        loadshed: null,
        pbsLoad: null,
        pbsAllotment: null,
        pbsLoadshed: null,
      },
    },
    { upsert: true, new: true }
  );
  return entry;
}

/** GET /api/circle-load/stations */
router.get("/stations", optionalAuth, (_req, res) => {
  res.json({ success: true, data: CIRCLE_STATIONS });
});

/** GET /api/circle-load/sheet?day=&slot= */
router.get("/sheet", optionalAuth, async (req, res) => {
  try {
    const dayKey = String(req.query.day || dayKeyDhaka()).slice(0, 10);
    const hourSlot = String(req.query.slot || "").trim();
    if (!hourSlot) {
      return res.status(400).json({ success: false, message: "slot required" });
    }

    // Sync Bottail from calculator for this slot
    await pullBottailFromCalculations(dayKey, hourSlot);

    const rows = await CircleLoadEntry.find({ dayKey, hourSlot }).lean();
    const byStation = {};
    for (const r of rows) byStation[r.stationId] = publicEntry(r);

    const editable = isSlotEditable(dayKey, hourSlot);
    const win = windowMinutes(hourSlot);

    const role = normalizeRole(req.admin?.role);
    let assignedStation = "";
    if (req.admin?.id) {
      const u = await Admin.findById(req.admin.id).select("assignedStation").lean();
      assignedStation = u?.assignedStation || "";
    }

    const canEditStation = (stationId) => {
      if (!req.admin) return false;
      if (!editable) return false;
      // Admin may edit any station including Bottail override
      if (role === "admin") return true;
      // Circle-load-input / duty: assigned station only (never auto-block bottail if assigned — but bottail normally not assigned for input)
      if (role === "circle-load-input" || role === "duty") {
        if (!assignedStation) return false;
        return assignedStation === stationId;
      }
      return false;
    };

    const sheet = CIRCLE_STATIONS.map((s) => {
      const e = byStation[s.id] || {
        dayKey,
        hourSlot,
        stationId: s.id,
        actualLoad: null,
        pgcbAllotment: null,
        loadshed: null,
        pbsLoad: null,
        pbsAllotment: null,
        pbsLoadshed: null,
        source: s.source,
      };
      const actual = Number(e.actualLoad) || 0;
      const ls = Number(e.loadshed) || 0;
      return {
        ...s,
        entry: e,
        demand: actual + ls,
        canEdit: canEditStation(s.id),
      };
    });

    const totals = sheet.reduce(
      (acc, r) => {
        acc.actualLoad += Number(r.entry.actualLoad) || 0;
        acc.pgcbAllotment += Number(r.entry.pgcbAllotment) || 0;
        acc.loadshed += Number(r.entry.loadshed) || 0;
        acc.pbsLoad += Number(r.entry.pbsLoad) || 0;
        acc.demand += r.demand || 0;
        return acc;
      },
      { actualLoad: 0, pgcbAllotment: 0, loadshed: 0, pbsLoad: 0, demand: 0 }
    );

    res.json({
      success: true,
      data: {
        dayKey,
        hourSlot,
        editable,
        windowMinutes: win,
        assignedStation,
        role,
        stations: sheet,
        totals,
      },
    });
  } catch (err) {
    console.error("circle sheet:", err);
    res.status(500).json({ success: false, message: err.message || "Failed" });
  }
});

/** POST /api/circle-load/entry — upsert one station row */
router.post("/entry", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const dayKey = String(body.dayKey || "").slice(0, 10);
    const hourSlot = String(body.hourSlot || "").trim();
    const stationId = String(body.stationId || "").trim();

    if (!dayKey || !hourSlot || !stationId) {
      return res.status(400).json({
        success: false,
        message: "dayKey, hourSlot, stationId required",
      });
    }
    if (!CIRCLE_STATIONS.some((s) => s.id === stationId)) {
      return res.status(400).json({ success: false, message: "Invalid station" });
    }
    const role = normalizeRole(req.admin?.role);

    if (stationId === "bottail" && role !== "admin") {
      return res.status(403).json({
        success: false,
        message:
          "Bottail is filled from the Calculator. Only admin can override it here.",
      });
    }

    if (role === "admin") {
      // full access
    } else if (role === "circle-load-input" || role === "duty") {
      const u = await Admin.findById(req.admin.id)
        .select("assignedStation")
        .lean();
      if (!u || u.assignedStation !== stationId) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your assigned station",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Not allowed to edit circle load",
      });
    }

    if (!isSlotEditable(dayKey, hourSlot)) {
      return res.status(409).json({
        success: false,
        message: `Slot ${hourSlot} is outside the edit window (±${windowMinutes(hourSlot)} min)`,
      });
    }

    const fields = {
      actualLoad: toNum(body.actualLoad),
      pgcbAllotment: toNum(body.pgcbAllotment),
      loadshed: toNum(body.loadshed),
      pbsLoad: toNum(body.pbsLoad),
      pbsAllotment: toNum(body.pbsAllotment),
      pbsLoadshed: toNum(body.pbsLoadshed),
      note: body.note != null ? String(body.note) : "",
      source:
        stationId === "bottail"
          ? role === "admin"
            ? "admin-override"
            : "calculator"
          : "manual",
      updatedBy: req.admin.id,
      updatedByUsername: req.admin.username || "",
    };

    const doc = await CircleLoadEntry.findOneAndUpdate(
      { dayKey, hourSlot, stationId },
      {
        $set: fields,
        $setOnInsert: {
          dayKey,
          hourSlot,
          stationId,
          createdBy: req.admin.id,
          createdByUsername: req.admin.username || "",
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Saved", data: publicEntry(doc) });
  } catch (err) {
    console.error("circle entry:", err);
    res.status(500).json({ success: false, message: err.message || "Failed" });
  }
});

module.exports = router;
