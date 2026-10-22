import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import pool from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// This runs after authentication, so limits are per account.
const passwordLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.user.id),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many password attempts. Try again later.",
  },
});

router.use(passwordLimit);

function validNewPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 6 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}

function validCurrentPassword(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 72
  );
}

// PUT /api/passwords/me
// Body: { current_password, new_password }
router.put("/me", async (req, res) => {
  const { current_password, new_password } = req.body || {};

  if (!validCurrentPassword(current_password)) {
    return res.status(400).json({
      message: "Enter your current password.",
    });
  }

  if (!validNewPassword(new_password)) {
    return res.status(400).json({
      message:
        "New password must contain at least 6 characters and at most 72 bytes.",
    });
  }

  if (current_password === new_password) {
    return res.status(400).json({
      message: "Choose a different new password.",
    });
  }

  try {
    const users = await pool.query(
      `SELECT password_hash, token_version
       FROM users
       WHERE id = ? AND status = 'active'`,
      [req.user.id]
    );

    const user = users[0];

    if (
      !user ||
      Number(user.token_version) !== Number(req.user.token_version)
    ) {
      return res.status(401).json({
        message: "Your session has ended. Please sign in again.",
      });
    }

    const matches = await bcrypt.compare(
      current_password,
      user.password_hash
    );

    if (!matches) {
      return res.status(400).json({
        message: "Your current password is incorrect.",
      });
    }

    const passwordHash = await bcrypt.hash(new_password, 12);

    // The version condition prevents overwriting a concurrent reset.
    const result = await pool.query(
      `UPDATE users
       SET password_hash = ?,
           token_version = token_version + 1
       WHERE id = ?
         AND token_version = ?
         AND status = 'active'`,
      [passwordHash, req.user.id, user.token_version]
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        message: "Your account changed. Sign in again before retrying.",
      });
    }

    res.json({
      success: true,
      message: "Password changed. Please sign in with your new password.",
      requires_login: true,
    });
  } catch (error) {
    console.error("Change password error:", error.code || error.name);

    res.status(500).json({
      message: "Unable to change your password.",
    });
  }
});

// PUT /api/passwords/tellers/:id
// Body: { new_password }
// Only administrators can reset teller passwords.
router.put("/tellers/:id", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const newPassword = req.body?.new_password;

  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: "Select a valid teller.",
    });
  }

  if (!validNewPassword(newPassword)) {
    return res.status(400).json({
      message:
        "New password must contain at least 6 characters and at most 72 bytes.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await pool.query(
      `UPDATE users
       SET password_hash = ?,
           token_version = token_version + 1
       WHERE id = ? AND role = 'teller'`,
      [passwordHash, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Teller account not found.",
      });
    }

    res.json({
      success: true,
      message:
        "Teller password reset. Previous sessions can no longer access protected routes.",
    });
  } catch (error) {
    console.error("Reset password error:", error.code || error.name);

    res.status(500).json({
      message: "Unable to reset the teller password.",
    });
  }
});

export default router;