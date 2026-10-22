import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const todaySQL =
  "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00'))";

// Validate the counter and the user's assignment.
router.param("counterId", (req, res, next, value) => {
  const counterId = Number(value);

  if (!Number.isInteger(counterId) || counterId < 1) {
    return res.status(400).json({
      message: "Invalid counter.",
    });
  }

  if (req.user.role !== "admin") {
    if (
      Number(req.user.counter_id) !== counterId ||
      !req.user.counter_active
    ) {
      return res.status(403).json({
        message: "You can only operate your assigned active counter.",
      });
    }
  }

  req.counterId = counterId;
  next();
});

// Get today's ticket currently assigned to this counter.
router.get("/:counterId/current", async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT t.id, t.ticket_number, t.status,
              s.name AS service_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       WHERE t.counter_id = ?
         AND t.status = 'serving'
         AND t.queue_date = ${todaySQL}
       ORDER BY t.id
       LIMIT 1`,
      [req.counterId]
    );

    res.set("Cache-Control", "no-store");
    res.json({ ticket: rows[0] || null });
  } catch (error) {
    console.error("Current ticket error:", error.code || error.message);

    res.status(500).json({
      message: "Unable to load the current ticket.",
    });
  }
});

// Call today's oldest eligible waiting ticket.
router.post("/:counterId/next", async (req, res) => {
  let connection;
  let transactionOpen = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionOpen = true;

    // Serialize Call Next requests for this counter.
    const counters = await connection.query(
      `SELECT id, counter_number
       FROM counters
       WHERE id = ? AND is_active = TRUE
       FOR UPDATE`,
      [req.counterId]
    );

    if (!counters.length) {
      await connection.rollback();
      transactionOpen = false;

      return res.status(404).json({
        message: "Counter not found or inactive.",
      });
    }

    // Repeated clicks return today's active ticket.
    const current = await connection.query(
      `SELECT t.id, t.ticket_number, t.status,
              s.name AS service_name
       FROM tickets t
       JOIN services s ON s.id = t.service_id
       WHERE t.counter_id = ?
         AND t.status = 'serving'
         AND t.queue_date = ${todaySQL}
       ORDER BY t.id
       LIMIT 1
       FOR UPDATE`,
      [req.counterId]
    );

    if (current.length) {
      await connection.commit();
      transactionOpen = false;

      return res.json({ ticket: current[0] });
    }

    const waiting = await connection.query(
      `SELECT t.id, t.ticket_number, t.service_id
       FROM tickets t
       WHERE t.queue_date = ${todaySQL}
         AND t.status = 'waiting'
         AND EXISTS (
           SELECT 1
           FROM counter_services cs
           WHERE cs.counter_id = ?
             AND cs.service_id = t.service_id
         )
       ORDER BY t.id
       LIMIT 1
       FOR UPDATE`,
      [req.counterId]
    );

    if (!waiting.length) {
      await connection.commit();
      transactionOpen = false;

      return res.json({
        ticket: null,
        message: "No waiting tickets for this counter today.",
      });
    }

    const ticket = waiting[0];

    await connection.query(
      `UPDATE tickets
       SET status = 'serving',
           counter_id = ?,
           called_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.counterId, ticket.id]
    );

    const services = await connection.query(
      "SELECT name FROM services WHERE id = ?",
      [ticket.service_id]
    );

    await connection.commit();
    transactionOpen = false;

    const io = req.app.get("io");

    io.emit("ticket:called", {
      ticket_number: ticket.ticket_number,
      counter_number: counters[0].counter_number,
    });

    io.emit("queue:changed");

    res.json({
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: "serving",
        service_name: services[0].name,
      },
    });
  } catch (error) {
    if (connection && transactionOpen) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Call next rollback error:",
          rollbackError.code || rollbackError.message
        );
      }
    }

    console.error("Call next error:", error.code || error.message);

    res.status(500).json({
      message: "Unable to call the next ticket. Please retry.",
    });
  } finally {
    if (connection) connection.release();
  }
});

// Complete or skip a specific active ticket from today's queue.
router.post("/:counterId/finish", async (req, res) => {
  const ticketId = Number(req.body?.ticket_id);
  const action = req.body?.action;

  if (
    !Number.isInteger(ticketId) ||
    ticketId < 1 ||
    !["complete", "skip"].includes(action)
  ) {
    return res.status(400).json({
      message: "Invalid ticket or action.",
    });
  }

  const status = action === "complete" ? "completed" : "skipped";

  try {
    const result = await pool.query(
      `UPDATE tickets
       SET status = ?,
           completed_at = CASE
             WHEN ? = 'completed' THEN CURRENT_TIMESTAMP
             ELSE NULL
           END
       WHERE id = ?
         AND counter_id = ?
         AND status = 'serving'
         AND queue_date = ${todaySQL}`,
      [status, status, ticketId, req.counterId]
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        message:
          "This ticket is no longer active in today's queue. Refresh the counter.",
      });
    }

    req.app.get("io").emit("queue:changed");

    res.json({ success: true });
  } catch (error) {
    console.error("Finish ticket error:", error.code || error.message);

    res.status(500).json({
      message: "Unable to update the ticket.",
    });
  }
});

// Repeat the announcement for today's active ticket.
router.post("/:counterId/recall", async (req, res) => {
  const ticketId = Number(req.body?.ticket_id);

  if (!Number.isInteger(ticketId) || ticketId < 1) {
    return res.status(400).json({
      message: "Select a valid current ticket.",
    });
  }

  try {
    const tickets = await pool.query(
      `SELECT t.id, t.ticket_number, c.counter_number
       FROM tickets t
       JOIN counters c ON c.id = t.counter_id
       WHERE t.id = ?
         AND t.counter_id = ?
         AND t.status = 'serving'
         AND t.queue_date = ${todaySQL}
         AND c.is_active = TRUE`,
      [ticketId, req.counterId]
    );

    if (!tickets.length) {
      return res.status(409).json({
        message:
          "This ticket is no longer active in today's queue. Refresh your workspace.",
      });
    }

    const ticket = tickets[0];

    req.app.get("io").emit("ticket:called", {
      ticket_number: ticket.ticket_number,
      counter_number: ticket.counter_number,
    });

    res.json({
      success: true,
      message: `${ticket.ticket_number} announcement sent again.`,
    });
  } catch (error) {
    console.error("Recall ticket error:", error.code || error.message);

    res.status(500).json({
      message: "Unable to recall the ticket.",
    });
  }
});

export default router;