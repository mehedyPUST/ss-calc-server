// backend/routes/auth.js
const express = require("express");
const Admin = require("../models/Admin");
const { generateToken, requireAuth } = require("../middleware/auth");

const router = express.Router();

// Login
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: "Username and password are required",
            });
        }

        // Find admin by username or email
        const admin = await Admin.findOne({
            $or: [{ username }, { email: username }],
        });

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        if (!admin.isActive) {
            return res.status(401).json({
                success: false,
                message: "Account is deactivated. Contact administrator.",
            });
        }

        // Check password
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        // Update last login
        admin.lastLogin = new Date();
        await admin.save();

        // Generate token
        const token = generateToken(admin._id, admin.username, admin.role);

        // Set cookie
        res.cookie("admin_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
        });

        res.json({
            success: true,
            message: "Login successful",
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

// Logout
router.post("/logout", async (req, res) => {
    res.clearCookie("admin_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    });

    res.json({
        success: true,
        message: "Logged out successfully",
    });
});

// Get current admin info
router.get("/me", requireAuth, async (req, res) => {
    try {
        const admin = await Admin.findById(req.adminId).select("-password");
        res.json({
            success: true,
            data: admin,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to get admin info",
            error: error.message,
        });
    }
});

// Check if authenticated
router.get("/check", async (req, res) => {
    try {
        const { verifyToken } = require("../middleware/auth");
        const auth = await verifyToken(req);

        if (auth) {
            res.json({
                success: true,
                authenticated: true,
                admin: {
                    id: auth.admin._id,
                    username: auth.admin.username,
                    role: auth.admin.role,
                },
            });
        } else {
            res.json({
                success: true,
                authenticated: false,
            });
        }
    } catch (error) {
        res.json({
            success: true,
            authenticated: false,
        });
    }
});

// Register first admin (should be disabled in production or protected)
router.post("/register", async (req, res) => {
    try {
        const { username, password, email, secret } = req.body;

        // Check if registration is allowed
        const adminCount = await Admin.countDocuments();
        const registrationSecret = process.env.ADMIN_REGISTRATION_SECRET || "admin123";

        if (adminCount > 0 && secret !== registrationSecret) {
            return res.status(403).json({
                success: false,
                message: "Registration is restricted. Only the first admin can be created without a secret.",
            });
        }

        const existing = await Admin.findOne({
            $or: [{ username }, { email }],
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "Username or email already exists",
            });
        }

        const admin = new Admin({
            username,
            password,
            email,
            role: adminCount === 0 ? "superadmin" : "admin",
        });

        await admin.save();

        res.status(201).json({
            success: true,
            message: "Admin created successfully",
            data: {
                id: admin._id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
            },
        });
    } catch (error) {
        console.error("Registration error:", error);
        res.status(500).json({
            success: false,
            message: "Registration failed",
            error: error.message,
        });
    }
});

module.exports = router;