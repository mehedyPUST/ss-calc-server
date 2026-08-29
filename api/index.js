require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const calculationsRouter = require("../routes/calculations");
const authRouter = require("../routes/auth");

const app = express();

function getAllowedOrigins() {
  const list = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
  ];
  if (process.env.FRONTEND_URL) {
    process.env.FRONTEND_URL.split(",").forEach((o) => {
      const t = o.trim();
      if (t) list.push(t);
    });
  }
  return list;
}

app.use(
  cors({
    origin(origin, cb) {
      const allowed = getAllowedOrigins();
      // Allow non-browser / same-origin tools (no Origin header)
      if (!origin || allowed.includes(origin)) {
        return cb(null, true);
      }
      console.warn("CORS blocked origin:", origin, "allowed:", allowed);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, { bufferCommands: false })
      .then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Ensure DB for every API request (including auth login)
app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("DB connection failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
    });
  }
});

app.get("/api/health", async (req, res) => {
  res.json({
    success: true,
    message: "Load Calculator API is running",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: process.env.NODE_ENV || "development",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/calculations", calculationsRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Local server
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`API running on http://localhost:${PORT}`);
      });
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = app;
