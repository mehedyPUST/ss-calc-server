const express = require("express");
const Admin = require("../models/Admin");
const { generateToken, requireAuth, getTokenFromRequest } = require("../middleware/auth");
const jwt = require("jsonwebtoken");

const router = express.Router();

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  // Cross-site cookie (frontend on *.vercel.app, API on another host)
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    const admin = await Admin.findOne({
      $or: [
        { username: String(username).trim() },
        { email: String(username).trim().toLowerCase() },
      ],
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (admin.isActive === false) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated. Contact administrator.",
      });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin._id, admin.username, admin.role);

    res.cookie("admin_token", token, cookieOptions());

    // Always return token in body for cross-origin clients (Vercel)
    res.json({
      success: true,
      message: "Login successful",
      token,
      data: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: error.message,
    });
  }
});

// POST /api/auth/logout
router.post("/logout", async (req, res) => {
  res.clearCookie("admin_token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
  res.json({ success: true, message: "Logged out" });
});

// GET /api/auth/check
router.get("/check", async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.json({ success: true, authenticated: false });
    }
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "dev-only-change-me"
    );
    const admin = await Admin.findById(decoded.id).select(
      "username email role isActive lastLogin"
    );
    if (!admin || admin.isActive === false) {
      return res.json({ success: true, authenticated: false });
    }
    res.json({
      success: true,
      authenticated: true,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch {
    res.json({ success: true, authenticated: false });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select(
      "username email role isActive lastLogin"
    );
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.json({
      success: true,
      data: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load profile",
      error: error.message,
    });
  }
});

// POST /api/auth/register — first admin free, later need secret
router.post("/register", async (req, res) => {
  try {
    const { username, password, email, secret } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const count = await Admin.countDocuments();
    if (count > 0) {
      const expected = process.env.ADMIN_REGISTRATION_SECRET;
      if (!expected || secret !== expected) {
        return res.status(403).json({
          success: false,
          message: "Registration closed. Valid secret required.",
        });
      }
    }

    const exists = await Admin.findOne({
      $or: [
        { username: String(username).trim() },
        ...(email ? [{ email: String(email).trim().toLowerCase() }] : []),
      ],
    });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists",
      });
    }

    const admin = await Admin.create({
      username: String(username).trim(),
      password,
      email: email ? String(email).trim().toLowerCase() : undefined,
      role: count === 0 ? "superadmin" : "admin",
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Admin registered",
      data: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: error.message,
    });
  }
});

module.exports = router;
