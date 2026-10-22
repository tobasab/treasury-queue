import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import pool from "../db.js";
import {
  createToken,
  requireAuth,
} from "../middleware/auth.js";

const router = Router();

const registrationLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many registration attempts. Try again later.",
  },
});

const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many login attempts. Try again later.",
  },
});

// Public registration always creates a pending teller.
router.post("/register", registrationLimit, async (req, res) => {
  const body = req.body || {};

  const fullName =
    typeof body.full_name === "string"
      ? body.full_name.trim()
      : "";

  const username =
    typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (fullName.length < 2 || fullName.length > 120) {
    return res.status(400).json({
      message: "Full name must contain 2–120 characters.",
    });
  }

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    return res.status(400).json({
      message:
        "Username must contain 3–50 letters, numbers, dots, underscores, or hyphens.",
    });
  }

if (
  password.length < 6 ||
  Buffer.byteLength(password, "utf8") > 72
) {
  return res.status(400).json({
    message:
      "Password must contain at least 6 characters and at most 72 bytes.",
  });
}

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (
         full_name, username, password_hash,
         role, status, counter_id
       )
       VALUES (?, ?, ?, 'teller', 'pending', NULL)`,
      [fullName, username, passwordHash]
    );

    res.status(201).json({
      success: true,
      message:
        "Registration submitted. Wait for administrator approval and counter assignment.",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "That username is already taken.",
      });
    }

    console.error("Registration error:", error.code);

    res.status(500).json({
      message: "Unable to register your account.",
    });
  }
});

router.post("/login", loginLimit, async (req, res) => {
  const body = req.body || {};

  const username =
    typeof body.username === "string"
      ? body.username.trim().toLowerCase()
      : "";

  const password =
    typeof body.password === "string"
      ? body.password
      : "";

  if (
    !username ||
    username.length > 50 ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return res.status(400).json({
      message: "Enter a valid username and password.",
    });
  }

  try {
    const users = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    const user = users[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: "Incorrect username or password.",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message:
          user.status === "pending"
            ? "Your account is waiting for administrator approval."
            : "Your account is disabled. Contact the administrator.",
      });
    }

    if (user.role === "teller") {
      const counters = await pool.query(
        `SELECT id FROM counters
         WHERE id = ? AND is_active = TRUE`,
        [user.counter_id]
      );

      if (!counters.length) {
        return res.status(403).json({
          message: "Ask the administrator to assign an active counter.",
        });
      }
    }

    res.json({
      success: true,
      token: createToken(user.id, user.token_version),
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        role: user.role,
        counter_id: user.counter_id,
      },
    });
  } catch (error) {
    console.error("Login error:", error.code || error.name);

    res.status(500).json({
      message: "Unable to sign in.",
    });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;