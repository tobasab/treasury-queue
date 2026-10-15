import { Router } from "express";
import pool from "../db.js";

const router = Router();

function getManilaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const value = (type) =>
    parts.find((part) => part.type === type).value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

router.post("/", async (req, res) => {
  const serviceId = Number(req.body.service_id);
  const requestId = req.body.request_id;

  if (!Number.isInteger(serviceId) || serviceId < 1) {
    return res.status(400).json({
      message: "Please select a valid service.",
    });
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (
    typeof requestId !== "string" ||
    !uuidPattern.test(requestId)
  ) {
    return res.status(400).json({
      message: "A valid request ID is required.",
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();

    // Reusing a request ID returns the same ticket.
    const existing = await connection.query(
      `SELECT id, service_id, ticket_number, status
       FROM tickets
       WHERE request_id = ?`,
      [requestId]
    );

    if (existing.length > 0) {
      if (existing[0].service_id !== serviceId) {
        return res.status(409).json({
          message: "This request ID belongs to another service.",
        });
      }

      return res.json({
        success: true,
        ticket: existing[0],
      });
    }

    await connection.beginTransaction();

    const services = await connection.query(
      `SELECT id, prefix
       FROM services
       WHERE id = ? AND is_active = TRUE
       LOCK IN SHARE MODE`,
      [serviceId]
    );

    if (services.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: "Service not found or inactive.",
      });
    }

    const queueDate = getManilaDate();

    // This locks this service's daily sequence until commit.
    await connection.query(
      `INSERT INTO queue_sequences (
         queue_date, service_id, last_number
       )
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE last_number = last_number + 1`,
      [queueDate, serviceId]
    );

    const sequences = await connection.query(
      `SELECT last_number
       FROM queue_sequences
       WHERE queue_date = ? AND service_id = ?`,
      [queueDate, serviceId]
    );

    const queueNumber = sequences[0].last_number;

    const ticketNumber =
      `${services[0].prefix}-` +
      String(queueNumber).padStart(3, "0");

    const result = await connection.query(
      `INSERT INTO tickets (
         request_id,
         queue_date,
         service_id,
         queue_number,
         ticket_number
       )
       VALUES (?, ?, ?, ?, ?)`,
      [
        requestId,
        queueDate,
        serviceId,
        queueNumber,
        ticketNumber,
      ]
    );

    await connection.commit();

    req.app.get("io").emit("queue:changed");

    return res.status(201).json({
      success: true,
      ticket: {
        id: Number(result.insertId),
        service_id: serviceId,
        ticket_number: ticketNumber,
        status: "waiting",
      },
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();

      // Handle two simultaneous attempts with the same request ID.
      if (error.code === "ER_DUP_ENTRY") {
        const existing = await connection.query(
          `SELECT id, service_id, ticket_number, status
           FROM tickets
           WHERE request_id = ?`,
          [requestId]
        );

        if (existing.length > 0) {
          if (existing[0].service_id !== serviceId) {
            return res.status(409).json({
              message: "This request ID belongs to another service.",
            });
          }

          return res.json({
            success: true,
            ticket: existing[0],
          });
        }
      }
    }

    console.error("Ticket creation failed:", error.code);

    return res.status(500).json({
      message: "Unable to issue ticket. Retry with the same request ID.",
    });
  } finally {
    if (connection) {
      await connection.release();
    }
  }
});

export default router;