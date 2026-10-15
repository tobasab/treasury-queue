import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const serving = await pool.query(
      `SELECT t.id, t.ticket_number,
              c.counter_number, c.name AS counter_name,
              s.name AS service_name
       FROM tickets t
       JOIN counters c ON c.id = t.counter_id
       JOIN services s ON s.id = t.service_id
       WHERE t.status = 'serving'
       ORDER BY c.counter_number`
    );

    const waiting = await pool.query(
      `SELECT t.id, t.ticket_number,
              s.name AS service_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       WHERE t.status = 'waiting'
         AND t.queue_date =
           DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))
       ORDER BY t.id
       LIMIT 12`
    );

    res.set("Cache-Control", "no-store");
    res.json({ serving, waiting });
  } catch (error) {
    console.error("Display error:", error.code);

    res.status(500).json({
      message: "Unable to load the queue display.",
    });
  }
});

export default router;