const express = require("express");
const Admin = require("../models/Admin");
const { requireAuth, requireAdmin, normalizeRole } = require("../middleware/auth");

const router = express.Router();

function publicUser(doc) {
  const o = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    id: String(o._id),
    username: o.username,
    email: o.email || "",
    displayName: o.displayName || "",
    role: normalizeRole(o.role),
    assignedStation: o.assignedStation || "",
    isActive: o.isActive !== false,
    lastLogin: o.lastLogin || null,
    createdAt: o.createdAt || null,
    updatedAt: o.updatedAt || null,
  };
}

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const list = await Admin.find()
      .select("username email displayName role isActive assignedStation lastLogin createdAt updatedAt")
      .sort({ role: 1, username: 1 })
      .lean();
    res.json({
      success: true,
      data: list.map((u) => publicUser(u)),
      count: list.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to list users" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  try {
    const { username, password, email, displayName, role, assignedStation } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    let nextRole = normalizeRole(role || "viewer");
    if (!["viewer", "duty", "admin", "circle-load-input"].includes(nextRole))
      nextRole = "viewer";

    const exists = await Admin.findOne({
      $or: [
        { username: String(username).trim() },
        ...(email ? [{ email: String(email).trim().toLowerCase() }] : []),
      ],
    });
    if (exists) {
      return res.status(409).json({ success: false, message: "Username or email already exists" });
    }

    const createPayload = {
      username: String(username).trim(),
      password: String(password),
      displayName: displayName ? String(displayName).trim() : "",
      role: nextRole,
      isActive: true,
      assignedStation: assignedStation || "",
    };
    const emailTrim = email != null ? String(email).trim().toLowerCase() : "";
    if (emailTrim) createPayload.email = emailTrim;

    const user = await Admin.create(createPayload);

    res.status(201).json({ success: true, message: "User created", data: publicUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to create user" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  try {
    const user = await Admin.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const { email, displayName, role, isActive, password } = req.body || {};
    if (email != null) {
      const emailTrim = String(email).trim().toLowerCase();
      if (emailTrim) user.email = emailTrim;
      else user.email = undefined;
    }
    if (displayName != null) user.displayName = String(displayName).trim();
    if (typeof isActive === "boolean") {
      if (String(user._id) === String(req.admin.id) && isActive === false) {
        return res.status(400).json({ success: false, message: "You cannot deactivate your own account" });
      }
      user.isActive = isActive;
    }
    if (role != null) {
      user.role = normalizeRole(role);
    }
    if (req.body.assignedStation != null) {
      user.assignedStation = String(req.body.assignedStation || "");
    }
    if (password != null && String(password).length > 0) {
      if (String(password).length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
      }
      user.password = String(password);
    }
    await user.save();
    res.json({ success: true, message: "User updated", data: publicUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to update user" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    if (String(req.params.id) === String(req.admin.id)) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account" });
    }
    const user = await Admin.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Failed to delete user" });
  }
});

module.exports = router;
