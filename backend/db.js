const { Pool, types } = require("pg");

// Keep PostgreSQL DATE values as YYYY-MM-DD strings. Converting DATE to a
// JavaScript Date can shift the displayed date by one day because of timezone
// conversion (for example, 28-09-2026 becoming 27-09-2026).
types.setTypeParser(1082, (value) => value);
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
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
            subscription_expires_at TIMESTAMPTZ,
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
        ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ
    `);

    await pool.query(`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE
    `);

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

    // Audit trail of every subscription change (who changed what, and when).
    await pool.query(`
        CREATE TABLE IF NOT EXISTS subscription_events (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action VARCHAR(30) NOT NULL,
            previous_expires_at TIMESTAMPTZ,
            new_expires_at TIMESTAMPTZ,
            changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            changed_by_username VARCHAR(100),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id
        ON subscription_events(user_id, created_at DESC)
    `);

    // One-time normalisation of older subscriptions. Earlier versions stored the
    // chosen date as midnight UTC, which cut access off part-way through the last
    // day. Subscriptions now run until the END of the chosen calendar day in the
    // business time zone (stored as the start of the next day). Values already in
    // that form are skipped, so this is safe to run on every start.
    const tz = process.env.SUBSCRIPTION_TIMEZONE || "Asia/Kolkata";
    const normalised = await pool.query(
        `UPDATE users
         SET subscription_expires_at =
             (((subscription_expires_at AT TIME ZONE $1::text)::date + 1)::timestamp AT TIME ZONE $1::text)
         WHERE subscription_expires_at IS NOT NULL
           AND (subscription_expires_at AT TIME ZONE $1::text)::time <> TIME '00:00:00'`,
        [tz]
    );
    if (normalised.rowCount > 0) {
        console.log(`✅ Normalised ${normalised.rowCount} subscription expiry value(s) to end-of-day`);
    }

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

