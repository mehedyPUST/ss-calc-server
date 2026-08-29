// backend/middleware/auth.js
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "7d";

// Generate JWT token
function generateToken(adminId, username, role) {
    return jwt.sign(
        { id: adminId, username, role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

// Verify JWT token from cookie
async function verifyToken(req) {
    const token = req.cookies?.admin_token;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const admin = await Admin.findById(decoded.id).select("-password");
        if (!admin || !admin.isActive) return null;
        return { admin, decoded };
    } catch (error) {
        return null;
    }
}

// Middleware: Require authentication
async function requireAuth(req, res, next) {
    const auth = await verifyToken(req);
    if (!auth) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in.",
            code: "UNAUTHORIZED",
        });
    }
    req.admin = auth.admin;
    req.adminId = auth.decoded.id;
    next();
}

// Middleware: Require admin role
async function requireAdmin(req, res, next) {
    const auth = await verifyToken(req);
    if (!auth) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in.",
            code: "UNAUTHORIZED",
        });
    }
    if (auth.admin.role !== "admin" && auth.admin.role !== "superadmin") {
        return res.status(403).json({
            success: false,
            message: "Admin privileges required.",
            code: "FORBIDDEN",
        });
    }
    req.admin = auth.admin;
    req.adminId = auth.decoded.id;
    next();
}

// Middleware: Require superadmin role
async function requireSuperAdmin(req, res, next) {
    const auth = await verifyToken(req);
    if (!auth) {
        return res.status(401).json({
            success: false,
            message: "Authentication required. Please log in.",
            code: "UNAUTHORIZED",
        });
    }
    if (auth.admin.role !== "superadmin") {
        return res.status(403).json({
            success: false,
            message: "Super admin privileges required.",
            code: "FORBIDDEN",
        });
    }
    req.admin = auth.admin;
    req.adminId = auth.decoded.id;
    next();
}

// Optional auth (doesn't fail if not authenticated)
async function optionalAuth(req, res, next) {
    const auth = await verifyToken(req);
    if (auth) {
        req.admin = auth.admin;
        req.adminId = auth.decoded.id;
    }
    next();
}

module.exports = {
    generateToken,
    verifyToken,
    requireAuth,
    requireAdmin,
    requireSuperAdmin,
    optionalAuth,
    JWT_SECRET,
};