require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const calculationsRouter = require("./routes/calculations");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    message: "Load Calculator API is running",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// Routes
app.use("/api/calculations", calculationsRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Start server after DB connect
async function start() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error(
      "❌ MONGODB_URI is missing. Copy .env.example to .env and set your Atlas connection string."
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("✅ Connected to MongoDB Atlas");

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

start();