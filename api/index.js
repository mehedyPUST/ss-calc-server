// backend/api/index.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const calculationsRouter = require("../routes/calculations");

const app = express();

// CORS configuration
app.use(
    cors({
        origin: "*", // Allow all origins (or specify your frontend URL)
        methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

app.use(express.json({ limit: "1mb" }));

// MongoDB connection helper
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

// Routes - connect DB before handling
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

// Export for Vercel
module.exports = app;