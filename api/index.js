// backend/api/index.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const calculationsRouter = require("../routes/calculations");

const app = express();

// Connect to MongoDB
let isConnected = false;

async function connectDB() {
    if (isConnected) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        isConnected = true;
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection error:", err.message);
    }
}

// Middleware
app.use(
    cors({
        origin: ["https://your-frontend.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
        credentials: true,
    })
);
app.use(express.json({ limit: "1mb" }));

// Health check with DB connection
app.get("/api/health", async (_req, res) => {
    await connectDB();
    res.json({
        success: true,
        message: "Load Calculator API is running",
        db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    });
});

// Routes - connect DB before handling
app.use("/api/calculations", async (req, res, next) => {
    await connectDB();
    next();
}, calculationsRouter);

// 404
app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

module.exports = app;