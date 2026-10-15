import { Router } from "express";
import pool from "../db.js";
import {
  requireAuth,
  requireAdmin,
} from "../middleware/auth.js";

const router = Router();

// Every route in this file requires an active administrator.
router.use(requireAuth, requireAdmin);

router.get("/tellers", async (req, res) => {
  try {
    const tellers = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.status,
              u.counter_id, c.name AS counter_name
       FROM users u
       LEFT JOIN counters c ON c.id = u.counter_id
       WHERE u.role = 'teller'
       ORDER BY
         CASE WHEN u.status = 'pending' THEN 0 ELSE 1 END,
         u.id DESC`
    );

    res.json(tellers);
  } catch (error) {
    console.error("Load tellers error:", error.code);

    res.status(500).json({
      message: "Unable to load teller accounts.",
    });
  }
});

// Approve an account or change its counter assignment.
router.put("/tellers/:id/assignment", async (req, res) => {
  const userId = Number(req.params.id);
  const counterId = Number(req.body?.counter_id);

  if (
    !Number.isInteger(userId) ||
    userId < 1 ||
    !Number.isInteger(counterId) ||
    counterId < 1
  ) {
    return res.status(400).json({
      message: "Select a valid teller and counter.",
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const users = await connection.query(
      `SELECT id, counter_id
       FROM users
       WHERE id = ? AND role = 'teller'
       FOR UPDATE`,
      [userId]
    );

    if (!users.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Teller account not found.",
      });
    }

    const counters = await connection.query(
      `SELECT id
       FROM counters
       WHERE id = ? AND is_active = TRUE
       FOR UPDATE`,
      [counterId]
    );

    if (!counters.length) {
      await connection.rollback();

      return res.status(400).json({
        message: "Select an active counter.",
      });
    }

    await connection.query(
      `UPDATE users
       SET counter_id = ?, status = 'active'
       WHERE id = ? AND role = 'teller'`,
      [counterId, userId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Teller approved and counter assignment saved.",
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("Assign teller error:", error.code);

    res.status(500).json({
      message: "Unable to save the counter assignment.",
    });
  } finally {
    if (connection) await connection.release();
  }
});

router.put("/tellers/:id/disable", async (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: "Invalid teller.",
    });
  }

  try {
    const users = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role = 'teller'",
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        message: "Teller account not found.",
      });
    }

    await pool.query(
      `UPDATE users
       SET status = 'disabled'
       WHERE id = ? AND role = 'teller'`,
      [userId]
    );

    res.json({
      success: true,
      message: "Teller account disabled.",
    });
  } catch (error) {
    console.error("Disable teller error:", error.code);

    res.status(500).json({
      message: "Unable to disable the teller.",
    });
  }
});
// List counters and their assigned services.
router.get("/counter-services", async (req, res) => {
  try {
    const counters = await pool.query(
      `SELECT id, counter_number, name, is_active
       FROM counters
       ORDER BY counter_number`
    );

    const services = await pool.query(
      `SELECT id, name, prefix
       FROM services
       WHERE is_active = TRUE
       ORDER BY id`
    );

    const assignments = await pool.query(
      "SELECT counter_id, service_id FROM counter_services"
    );

    res.json({
      services,
      counters: counters.map((counter) => ({
        ...counter,
        service_ids: assignments
          .filter((item) => item.counter_id === counter.id)
          .map((item) => item.service_id),
      })),
    });
  } catch (error) {
    console.error("Load counter services error:", error.code);

    res.status(500).json({
      message: "Unable to load counter service assignments.",
    });
  }
});

// Replace a counter's service assignments in one transaction.
router.put("/counter-services/:id", async (req, res) => {
  const counterId = Number(req.params.id);
  const submittedIds = req.body?.service_ids;

  if (
    !Number.isInteger(counterId) ||
    counterId < 1 ||
    !Array.isArray(submittedIds) ||
    submittedIds.length > 100 ||
    submittedIds.some(
      (id) => !Number.isInteger(id) || id < 1
    )
  ) {
    return res.status(400).json({
      message: "Invalid counter or service selection.",
    });
  }

  const serviceIds = [...new Set(submittedIds)];
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Call Next also locks this counter row.
    const counters = await connection.query(
      "SELECT id FROM counters WHERE id = ? FOR UPDATE",
      [counterId]
    );

    if (!counters.length) {
      await connection.rollback();

      return res.status(404).json({
        message: "Counter not found.",
      });
    }

    for (const serviceId of serviceIds) {
      const services = await connection.query(
        `SELECT id
         FROM services
         WHERE id = ? AND is_active = TRUE`,
        [serviceId]
      );

      if (!services.length) {
        await connection.rollback();

        return res.status(400).json({
          message: "One of the selected services is unavailable.",
        });
      }
    }

    await connection.query(
      "DELETE FROM counter_services WHERE counter_id = ?",
      [counterId]
    );

    for (const serviceId of serviceIds) {
      await connection.query(
        `INSERT INTO counter_services (counter_id, service_id)
         VALUES (?, ?)`,
        [counterId, serviceId]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Counter services updated.",
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error("Save counter services error:", error.code);

    res.status(500).json({
      message: "Unable to save counter services.",
    });
  } finally {
    if (connection) await connection.release();
  }
});

export default router;