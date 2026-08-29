const express = require("express");
const Calculation = require("../models/Calculation");

const router = express.Router();

// Constants
const TRASH_RETENTION_DAYS = 30;
const activeFilter = {
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
};
const trashFilter = { deletedAt: { $ne: null } };

// Helper: Purge expired trash
async function purgeExpiredTrash() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

  const result = await Calculation.deleteMany({
    deletedAt: { $ne: null, $lt: cutoff },
  });

  return result.deletedCount || 0;
}

// POST /api/calculations
router.post("/", async (req, res) => {
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

    const doc = await Calculation.create({
      busVoltages: {
        bus1: Number(busVoltages.bus1),
        bus2: Number(busVoltages.bus2),
      },
      feeders,
      bottail11kV: Number(bottail11kV) || 0,
      totalMW: Number(totalMW) || 0,
      note: note || "",
      calculatedAt: new Date(),
      deletedAt: null,
    });

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

// GET /api/calculations
router.get("/", async (req, res) => {
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

// GET /api/calculations/:id
router.get("/:id", async (req, res) => {
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

// DELETE /api/calculations/:id
router.delete("/:id", async (req, res) => {
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

// PATCH /api/calculations/:id - Restore
router.patch("/:id", async (req, res) => {
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