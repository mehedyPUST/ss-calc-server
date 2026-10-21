// backend/routes/calculations.js
const express = require("express");
const Calculation = require("../models/Calculation");
const { requireAuth, requireAdmin, optionalAuth } = require("../middleware/auth");

const router = express.Router();

// Auto-purge disabled — retain soft-deleted records until user permanently deletes
const activeFilter = {
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
};
const trashFilter = { deletedAt: { $ne: null } };

async function purgeExpiredTrash() {
  return 0;
}

// POST /api/calculations - Requires authentication
router.post("/", requireAuth, async (req, res) => {
  try {
    const { busVoltages, feeders, bottail11kV, totalMW, note, action, ids } = req.body;

    // Handle bulk operations
    if (action && Array.isArray(ids)) {
      const uniqueIds = [...new Set((ids || []).filter(Boolean).map(String))];

      if (uniqueIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No items selected",
        });
      }

      await purgeExpiredTrash();

      if (action === "trash") {
        const result = await Calculation.updateMany(
          {
            _id: { $in: uniqueIds },
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          },
          { $set: { deletedAt: new Date() } }
        );
        return res.json({
          success: true,
          message: "Moved to trash",
          modified: result.modifiedCount,
        });
      }

      if (action === "restore") {
        const result = await Calculation.updateMany(
          { _id: { $in: uniqueIds }, deletedAt: { $ne: null } },
          { $set: { deletedAt: null } }
        );
        return res.json({
          success: true,
          message: "Restored to history",
          modified: result.modifiedCount,
        });
      }

      if (action === "purge") {
        const result = await Calculation.deleteMany({
          _id: { $in: uniqueIds },
          deletedAt: { $ne: null },
        });
        return res.json({
          success: true,
          message: "Permanently deleted",
          deleted: result.deletedCount,
        });
      }

      if (action === "empty_trash") {
        await purgeExpiredTrash();
        const result = await Calculation.deleteMany(trashFilter);
        return res.json({
          success: true,
          message: "Trash emptied",
          deleted: result.deletedCount,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Unknown action",
      });
    }

    // Regular save
    if (
      !busVoltages ||
      busVoltages.bus1 == null ||
      busVoltages.bus2 == null ||
      !Array.isArray(feeders)
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: busVoltages and feeders",
      });
    }

    const body = req.body;
    let calculatedAt = new Date();
    if (body.calculatedAt) {
      const parsed = new Date(body.calculatedAt);
      if (!Number.isNaN(parsed.getTime())) calculatedAt = parsed;
    }
    const hourSlot =
      typeof body.hourSlot === "string" && body.hourSlot.trim()
        ? body.hourSlot.trim()
        : null;
    const isHourly = body.isHourly === true || !!hourSlot;

    const fields = {
      busVoltages: {
        bus1: Number(busVoltages.bus1),
        bus2: Number(busVoltages.bus2),
      },
      feeders,
      bottail11kV: Number(bottail11kV) || 0,
      totalMW: Number(totalMW) || 0,
      note: note || "",
      calculatedAt,
      hourSlot,
      isHourly,
      deletedAt: null,
      createdBy: req.adminId,
    };

    // Replace existing same-day / same-slot record when requested
    if (body.replaceExistingId) {
      const updated = await Calculation.findOneAndUpdate(
        {
          _id: body.replaceExistingId,
          $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        },
        { $set: fields },
        { new: true }
      );
      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Existing slot record not found or already removed",
        });
      }
      return res.status(200).json({
        success: true,
        message: "Slot data replaced successfully",
        replaced: true,
        data: updated,
      });
    }

    const doc = await Calculation.create(fields);

    res.status(201).json({
      success: true,
      message: "Calculation saved successfully",
      data: doc,
    });
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to save calculation",
      error: err.message,
    });
  }
});

// GET /api/calculations/slot-check?hourSlot=08:00&dayStart=...&dayEnd=...
// Find existing active hourly record for the same calendar slot
router.get("/slot-check", optionalAuth, async (req, res) => {
  try {
    const hourSlot = String(req.query.hourSlot || "").trim();
    const dayStart = req.query.dayStart
      ? new Date(req.query.dayStart)
      : null;
    const dayEnd = req.query.dayEnd ? new Date(req.query.dayEnd) : null;

    if (!hourSlot || !dayStart || !dayEnd || Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
      return res.status(400).json({
        success: false,
        message: "hourSlot, dayStart and dayEnd are required",
      });
    }

    const existing = await Calculation.findOne({
      $and: [
        activeFilter,
        { hourSlot },
        {
          $or: [
            { calculatedAt: { $gte: dayStart, $lt: dayEnd } },
            {
              calculatedAt: { $exists: false },
              createdAt: { $gte: dayStart, $lt: dayEnd },
            },
          ],
        },
      ],
    })
      .sort({ calculatedAt: -1 })
      .lean();

    res.json({
      success: true,
      exists: !!existing,
      data: existing
        ? {
            _id: existing._id,
            hourSlot: existing.hourSlot,
            calculatedAt: existing.calculatedAt,
            totalMW: existing.totalMW,
            note: existing.note || "",
          }
        : null,
    });
  } catch (err) {
    console.error("Slot-check error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to check slot",
      error: err.message,
    });
  }
});

// GET /api/calculations - Optional auth (view without login for read-only)
router.get("/", optionalAuth, async (req, res) => {
  try {
    await purgeExpiredTrash();

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const trash = req.query.trash === "1" || req.query.trash === "true";

    const filter = trash ? trashFilter : activeFilter;

    const [docs, inboxCount, trashCount] = await Promise.all([
      Calculation.find(filter)
        .sort(trash ? { deletedAt: -1 } : { createdAt: -1 })
        .limit(limit)
        .lean(),
      Calculation.countDocuments(activeFilter),
      Calculation.countDocuments(trashFilter),
    ]);

    res.json({
      success: true,
      count: docs.length,
      inboxCount,
      trashCount,
      trash,
      data: docs,
      isAuthenticated: !!req.admin,
    });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch calculations",
      error: err.message,
    });
  }
});

// GET /api/calculations/max-load?year=YYYY&month=MM
// Top 5 max MW peaks per feeder (prefer hourly / hourSlot saves)
router.get("/max-load", optionalAuth, async (req, res) => {
  try {
    await purgeExpiredTrash();

    const now = new Date();
    let year = parseInt(req.query.year, 10);
    let month = parseInt(req.query.month, 10); // 1–12

    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      year = now.getFullYear();
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      month = now.getMonth() + 1;
    }

    // Use local calendar month (server local TZ)
    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0, 0);

    const dateMatch = {
      $or: [
        { calculatedAt: { $gte: start, $lt: end } },
        {
          calculatedAt: { $exists: false },
          createdAt: { $gte: start, $lt: end },
        },
      ],
    };

    // Prefer dedicated hourly saves; fall back to all if none exist
    const hourlyMatch = {
      $and: [
        activeFilter,
        dateMatch,
        {
          $or: [
            { isHourly: true },
            { hourSlot: { $type: "string", $ne: "" } },
          ],
        },
      ],
    };
    const anyMatch = { $and: [activeFilter, dateMatch] };

    const hourlyCount = await Calculation.countDocuments(hourlyMatch);
    const baseMatch = hourlyCount > 0 ? hourlyMatch : anyMatch;

    const pipeline = [
      { $match: baseMatch },
      { $unwind: "$feeders" },
      {
        $addFields: {
          eventAt: { $ifNull: ["$calculatedAt", "$createdAt"] },
        },
      },
      { $sort: { "feeders.mw": -1, eventAt: 1 } },
      {
        $group: {
          _id: "$feeders.id",
          name: { $first: "$feeders.name" },
          bus: { $first: "$feeders.bus" },
          peaks: {
            $push: {
              maxMW: "$feeders.mw",
              maxLoadAt: "$eventAt",
              ampsAtMax: "$feeders.amps",
              hourSlot: "$hourSlot",
            },
          },
          recordCount: { $sum: 1 },
        },
      },
      {
        $project: {
          name: 1,
          bus: 1,
          recordCount: 1,
          peaks: { $slice: ["$peaks", 5] },
          maxMW: { $arrayElemAt: ["$peaks.maxMW", 0] },
          maxLoadAt: { $arrayElemAt: ["$peaks.maxLoadAt", 0] },
          ampsAtMax: { $arrayElemAt: ["$peaks.ampsAtMax", 0] },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const rows = await Calculation.aggregate(pipeline);

    const totalPeak = await Calculation.aggregate([
      { $match: baseMatch },
      { $addFields: { eventAt: { $ifNull: ["$calculatedAt", "$createdAt"] } } },
      { $sort: { totalMW: -1, eventAt: 1 } },
      { $limit: 1 },
      {
        $project: {
          _id: 0,
          maxTotalMW: "$totalMW",
          maxTotalAt: "$eventAt",
          hourSlot: 1,
        },
      },
    ]);

    // Top 5 Bottail 11 kV peaks (H-3 + T-3 combined field)
    const bottail11Peaks = await Calculation.aggregate([
      { $match: baseMatch },
      { $addFields: { eventAt: { $ifNull: ["$calculatedAt", "$createdAt"] } } },
      { $sort: { bottail11kV: -1, eventAt: 1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          maxMW: { $ifNull: ["$bottail11kV", 0] },
          maxLoadAt: "$eventAt",
          hourSlot: 1,
          ampsAtMax: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$feeders",
                    as: "f",
                    cond: { $in: ["$$f.id", [8, 9]] },
                  },
                },
                as: "f",
                in: { $ifNull: ["$$f.amps", 0] },
              },
            },
          },
        },
      },
    ]);

    const sampleCount = await Calculation.countDocuments(baseMatch);

    res.json({
      success: true,
      year,
      month,
      start: start.toISOString(),
      end: end.toISOString(),
      sampleCount,
      hourlyOnly: hourlyCount > 0,
      data: rows.map((r) => ({
        feederId: r._id,
        name: r.name,
        bus: r.bus,
        maxMW: r.maxMW ?? 0,
        maxLoadAt: r.maxLoadAt,
        ampsAtMax: r.ampsAtMax ?? 0,
        recordCount: r.recordCount ?? 0,
        peaks: (r.peaks || []).map((p) => ({
          maxMW: p.maxMW ?? 0,
          maxLoadAt: p.maxLoadAt,
          ampsAtMax: p.ampsAtMax ?? 0,
          hourSlot: p.hourSlot || null,
        })),
      })),
      bottail11Peaks: (bottail11Peaks || []).map((p) => ({
        maxMW: p.maxMW ?? 0,
        maxLoadAt: p.maxLoadAt,
        ampsAtMax: p.ampsAtMax ?? 0,
        hourSlot: p.hourSlot || null,
      })),
      totalPeak: totalPeak[0] || null,
      isAuthenticated: !!req.admin,
    });
  } catch (err) {
    console.error("Max-load error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to compute max load",
      error: err.message,
    });
  }
});

// GET /api/calculations/:id - Optional auth
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    await purgeExpiredTrash();
    const doc = await Calculation.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch calculation",
      error: err.message,
    });
  }
});

// DELETE /api/calculations/:id - Requires authentication
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await purgeExpiredTrash();
    const { id } = req.params;
    const permanent = req.query.permanent === "1" || req.query.permanent === "true";

    if (permanent) {
      const doc = await Calculation.findOneAndDelete({
        _id: id,
        deletedAt: { $ne: null },
      });
      if (!doc) {
        const exists = await Calculation.findById(id).lean();
        if (exists) {
          return res.status(400).json({
            success: false,
            message: "Item is in History. Move to Trash first.",
          });
        }
        return res.status(404).json({
          success: false,
          message: "Not found",
        });
      }
      return res.json({
        success: true,
        message: "Permanently deleted",
      });
    }

    const doc = await Calculation.findOneAndUpdate(
      {
        _id: id,
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Not found or already in trash",
      });
    }

    res.json({
      success: true,
      message: "Moved to trash",
      data: doc,
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete",
      error: err.message,
    });
  }
});

// PATCH /api/calculations/:id - Requires authentication
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    await purgeExpiredTrash();
    const { id } = req.params;
    const { action } = req.body;

    if (action !== "restore") {
      return res.status(400).json({
        success: false,
        message: "Unsupported action. Use { action: 'restore' }",
      });
    }

    const doc = await Calculation.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
      { new: true }
    );

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Not found in trash",
      });
    }

    res.json({
      success: true,
      message: "Restored",
      data: doc,
    });
  } catch (err) {
    console.error("Restore error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to restore",
      error: err.message,
    });
  }
});

module.exports = router;