import { Router } from "express";
import pool from "../db.js";

const router = Router();

const todaySQL =
  "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))";

router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const serving = await pool.query(
      `SELECT
         t.id,
         t.ticket_number,
         t.service_id,
         c.counter_number,
         c.name AS counter_name,
         s.name AS service_name
       FROM tickets t
       JOIN counters c ON c.id = t.counter_id
       JOIN services s ON s.id = t.service_id
       WHERE t.status = 'serving'
         AND t.queue_date = ${todaySQL}
       ORDER BY c.counter_number, t.id`
    );

    const waiting = await pool.query(
      `SELECT
         ranked.id,
         ranked.ticket_number,
         ranked.service_id,
         ranked.service_name
       FROM (
         SELECT
           t.id,
           t.ticket_number,
           t.service_id,
           s.name AS service_name,
           ROW_NUMBER() OVER (
             PARTITION BY t.service_id
             ORDER BY t.id
           ) AS queue_position
         FROM tickets t
         JOIN services s ON s.id = t.service_id
         WHERE t.status = 'waiting'
           AND t.queue_date = ${todaySQL}
       ) AS ranked
       WHERE ranked.queue_position <= 12
       ORDER BY ranked.id`
    );

    res.json({
      serving,
      waiting,
    });
  } catch (error) {
    console.error("Display error:", error.code || error.message);

    res.status(500).json({
      message: "Unable to load the queue display.",
    });
  }
});

export default router;