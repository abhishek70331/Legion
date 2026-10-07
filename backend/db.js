const { Pool, types } = require("pg");

// Keep PostgreSQL DATE values as YYYY-MM-DD strings. Converting DATE to a
// JavaScript Date can shift the displayed date by one day because of timezone
// conversion (for example, 28-09-2026 becoming 27-09-2026).
types.setTypeParser(1082, (value) => value);
require("dotenv").config();

const connectionString = process.env.DATABASE_URL || "";
const useSsl =
    process.env.DATABASE_SSL === "true" ||
    process.env.NODE_ENV === "production" ||
    /render\.com|neon\.tech|supabase\.co|amazonaws\.com/i.test(connectionString);

const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function initializeAuthTables() {
    // Create the auth table for a fresh database. Existing Legion databases
    // may already have a users table, so the ALTER statements below keep it compatible.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            is_banned BOOLEAN NOT NULL DEFAULT FALSE
        )
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE
    `);

    // Subscription system has been removed. Clean up legacy subscription data
    // and tables from databases created by older Legion versions.
    await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS subscription_expires_at`);
    await pool.query(`DROP TABLE IF EXISTS subscription_events`);

    // Create active_sessions table for tracking logged-in users
    await pool.query(`
        CREATE TABLE IF NOT EXISTS active_sessions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash VARCHAR(255) NOT NULL,
            ip_address VARCHAR(45),
            user_agent TEXT,
            logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, token_hash)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id
        ON active_sessions(user_id)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity
        ON active_sessions(last_activity_at)
    `);

    // Older versions of this login feature used a column named `password`.
    // Copy any existing hashes to the canonical password_hash column.
    const oldPasswordColumn = await pool.query(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'password'
    `);

    if (oldPasswordColumn.rowCount > 0) {
        await pool.query(`
            UPDATE users
            SET password_hash = password
            WHERE (password_hash IS NULL OR password_hash = '')
              AND password IS NOT NULL
        `);
    }

    // Existing databases may have password_hash defined NOT NULL. Make sure
    // the new column is populated before any user inserts/updates.
    const missingHashes = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE password_hash IS NULL OR password_hash = ''
    `);

    if (missingHashes.rows[0].count > 0) {
        console.warn(`⚠️ ${missingHashes.rows[0].count} user(s) have no password hash yet.`);
    }
}


pool.on("error", (err) => {
    console.error("❌ Unexpected database pool error:");
    console.error(err.message);
});

module.exports = pool;
module.exports.initializeAuthTables = initializeAuthTables;

