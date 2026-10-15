import "dotenv/config";
import bcrypt from "bcryptjs";
import pool from "./db.js";

async function createAdmin() {
  try {
    const fullName = process.env.INITIAL_ADMIN_NAME?.trim();
    const username =
      process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
    const password = process.env.INITIAL_ADMIN_PASSWORD;

    if (
      !fullName ||
      fullName.length > 120 ||
      !username ||
      !/^[a-z0-9._-]{3,50}$/.test(username) ||
      !password ||
      password.length < 4 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      throw new Error("Check the INITIAL_ADMIN settings in server/.env.");
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    if (existing.length) {
      throw new Error(
        "That username already exists. No account was changed."
      );
    }

    const hash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (
         full_name, username, password_hash,
         role, status, counter_id
       )
       VALUES (?, ?, ?, 'admin', 'active', NULL)`,
      [fullName, username, hash]
    );

    console.log("Administrator account created successfully.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await createAdmin();