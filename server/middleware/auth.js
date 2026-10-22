import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../db.js";

dotenv.config();

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("Set JWT_SECRET to at least 32 characters.");
}

export function createToken(userId, tokenVersion) {
  const version = Number(tokenVersion);

  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("Invalid token version.");
  }

  return jwt.sign({ version }, secret, {
    subject: String(userId),
    algorithm: "HS256",
    expiresIn: "8h",
  });
}

export async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please sign in.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(authorization.slice(7), secret, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload !== "object" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      !Number.isSafeInteger(Number(payload.sub)) ||
      !Number.isSafeInteger(payload.version) ||
      payload.version < 0
    ) {
      throw new Error("Invalid token.");
    }
  } catch {
    return res.status(401).json({
      message: "Your session is invalid or expired. Please sign in again.",
    });
  }

  try {
    const users = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.role,
              u.status, u.counter_id, u.token_version,
              c.name AS counter_name,
              c.is_active AS counter_active
       FROM users u
       LEFT JOIN counters c ON c.id = u.counter_id
       WHERE u.id = ?`,
      [Number(payload.sub)]
    );

    const user = users[0];

    if (!user) {
      return res.status(401).json({
        message: "Your account is unavailable. Please sign in again.",
      });
    }

    if (Number(user.token_version) !== payload.version) {
      return res.status(401).json({
        message: "Your session has ended. Please sign in again.",
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Your account is pending approval or disabled.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication database error:", error.code);

    res.status(503).json({
      message: "Unable to verify your account. Please try again.",
    });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Administrator access required.",
    });
  }

  next();
}