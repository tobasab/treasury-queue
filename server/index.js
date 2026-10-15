import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db.js";
import ticketRoutes from "./routes/tickets.js";
import tellerRoutes from "./routes/teller.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import displayRoutes from "./routes/display.js";
import { createServer } from "node:http";
import { Server } from "socket.io";


dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);
const PORT = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);

app.use(express.json());
app.use("/api/tickets", ticketRoutes);
app.use("/api/teller", tellerRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/display", displayRoutes);

// Check whether the backend is running.
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "City Treasury API is running",
  });
});

// Temporary service list. We will move this into MariaDB next.
// app.get("/api/services", (req, res) => {
//   res.json([
//     {
//       id: 1,
//       name: "RPT Collections",
//       prefix: "RPT",
//     },
//     {
//       id: 2,
//       name: "General Collections",
//       prefix: "GEN",
//     },
//     {
//       id: 3,
//       name: "Certificates",
//       prefix: "CERT",
//     },
//   ]);
// });
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
    console.error("Database connection failed:", error.code);

    res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

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
    console.error("Failed to load services:", error.code);

    res.status(500).json({
      message: "Unable to load services",
    });
  }
});
app.get("/api/counters", async (req, res) => {
  try {
    const counters = await pool.query(`
      SELECT id, counter_number, name, is_active
      FROM counters
      ORDER BY counter_number
    `);

    res.json(counters);
  } catch (error) {
    console.error("Failed to load counters:", error.code);

    res.status(500).json({
      message: "Unable to load counters",
    });
  }
});
httpServer.listen(PORT, () => {
  console.log(`Treasury API: http://localhost:${PORT}`);
});