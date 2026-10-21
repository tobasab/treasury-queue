import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { Server } from "socket.io";

import pool from "./db.js";
import ticketRoutes from "./routes/tickets.js";
import tellerRoutes from "./routes/teller.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import displayRoutes from "./routes/display.js";

dotenv.config();

// Configuration
const PORT = Number(process.env.PORT) || 3000;
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

const currentDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);

const clientBuildDirectory = path.resolve(
  currentDirectory,
  "../client/dist"
);

// Express and HTTP server
const app = express();
const httpServer = createServer(app);

// Socket.IO uses the same HTTP server as Express.
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

// Middleware
app.use(
  cors({
    origin: CLIENT_ORIGIN,
  })
);

app.use(express.json({ limit: "100kb" }));

// Application routes
app.use("/api/tickets", ticketRoutes);
app.use("/api/teller", tellerRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/display", displayRoutes);

// Application health
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "City Treasury API is running",
  });
});

// Database connection test
app.get("/api/db-test", async (req, res) => {
  try {
    const rows = await pool.query(
      "SELECT DATABASE() AS database_name, 1 AS connected"
    );

    res.json({
      success: true,
      message: "MariaDB connected successfully",
      database: rows[0].database_name,
    });
  } catch (error) {
    console.error(
      "Database connection failed:",
      error.code || error.message
    );

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Active services
app.get("/api/services", async (req, res) => {
  try {
    const services = await pool.query(`
      SELECT id, name, prefix
      FROM services
      WHERE is_active = TRUE
      ORDER BY id
    `);

    res.json(services);
  } catch (error) {
    console.error(
      "Failed to load services:",
      error.code || error.message
    );

    res.status(500).json({
      message: "Unable to load services",
    });
  }
});

// Counters
app.get("/api/counters", async (req, res) => {
  try {
    const counters = await pool.query(`
      SELECT id, counter_number, name, is_active
      FROM counters
      ORDER BY counter_number
    `);

    res.json(counters);
  } catch (error) {
    console.error(
      "Failed to load counters:",
      error.code || error.message
    );

    res.status(500).json({
      message: "Unable to load counters",
    });
  }
});

// Unknown API endpoints return JSON.
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "API endpoint not found",
  });
});

// Serve the React production build.
// Docker must place the build in /app/client/dist
// when this file is located at /app/server/index.js.
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientBuildDirectory));

  // Express 5 requires a named wildcard.
  app.get("/{*path}", (req, res) => {
    res.sendFile(
      path.join(clientBuildDirectory, "index.html")
    );
  });
}

// Central error handler
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(
    "Request error:",
    error.code || error.message
  );

  const status =
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status < 600
      ? error.status
      : 500;

  res.status(status).json({
    success: false,
    message:
      status === 400
        ? "Invalid request"
        : "Unable to process the request",
  });
});

// Start Express and Socket.IO together.
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Treasury server listening on port ${PORT}`);
});