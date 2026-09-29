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
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

