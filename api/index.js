// backend/api/index.js
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const calculationsRouter = require("../routes/calculations");
const authRouter = require("../routes/auth");

const app = express();

// CORS configuration
app.use(
    cors({
        origin: [
            "http://localhost:3000",
            "http://localhost:3001",
            "https://your-frontend-domain.vercel.app",
        ],
        credentials: true,
        methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

// MongoDB connection
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };
        cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        });
    }
    cached.conn = await cached.promise;
    return cached.conn;
}

// Health check
app.get("/api/health", async (req, res) => {
    try {
        await connectDB();
        res.json({
            success: true,
            message: "Load Calculator API is running",
            db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
            environment: process.env.NODE_ENV || "development",
        });
    } catch (error) {
        res.json({
            success: true,
            message: "Load Calculator API is running",
            db: "error: " + error.message,
            environment: process.env.NODE_ENV || "development",
        });
    }
});

// Auth routes (no auth required for login/register)
app.use("/api/auth", authRouter);

// Calculation routes with auth
app.use("/api/calculations", async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Database connection failed",
            error: error.message,
        });
    }
}, calculationsRouter);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        path: req.path,
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
});

module.exports = app;