// backend/api/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const calculationsRouter = require("../routes/calculations");

const app = express();

// Middleware
app.use(
    cors({
        origin: ["https://your-frontend-domain.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", async (_req, res) => {
    let db = "disconnected";
    try {
        if (mongoose.connection.readyState === 0) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        db = mongoose.connection.readyState === 1 ? "connected" : "error";
    } catch {
        db = "error";
    }

    res.json({
        success: true,
        message: "Load Calculator API is running",
        db,
    });
});

// Routes
app.use("/api/calculations", calculationsRouter);

// 404
app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// Export for Vercel
module.exports = app;