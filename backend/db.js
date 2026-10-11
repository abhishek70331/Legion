const { Pool, types } = require("pg");

// Keep PostgreSQL DATE values as YYYY-MM-DD strings. Converting DATE to a
// JavaScript Date can shift the displayed date by one day because of timezone
// conversion.
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
    // 1. Users table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL,
            email VARCHAR(255),
            full_name VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            status VARCHAR(20) NOT NULL DEFAULT 'active',
            is_banned BOOLEAN NOT NULL DEFAULT FALSE,
            permissions_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

    // Clean up legacy subscription data from previous versions
    await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS subscription_expires_at`);
    await pool.query(`DROP TABLE IF EXISTS subscription_events`);

    // Synchronize status and is_banned flags
    await pool.query(`
        UPDATE users
        SET status = 'suspended'
        WHERE is_banned = TRUE AND (status IS NULL OR status = 'active')
    `);

    // 2. Active Sessions table
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

    // 3. Roles table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS roles (
            name VARCHAR(50) PRIMARY KEY,
            label VARCHAR(100) NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        INSERT INTO roles (name, label, description)
        VALUES 
            ('superadmin', 'Super Admin', 'Full access to all system features, user management, and security controls'),
            ('admin', 'Administrator', 'Administrative access to assigned features and operational oversight'),
            ('user', 'Regular User', 'Access restricted to explicitly authorized operational modules')
        ON CONFLICT (name) DO UPDATE 
        SET label = EXCLUDED.label, description = EXCLUDED.description
    `);

    // 4. Modules table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS modules (
            module_key VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            category VARCHAR(50) NOT NULL,
            description TEXT,
            supported_actions TEXT[] NOT NULL
        )
    `);

    const standardModules = [
        {
            key: 'overview',
            name: 'Overview & Shift KPI',
            category: 'Operations',
            desc: 'Real-time dashboard cards, shift status, and production metrics',
            actions: ['view']
        },
        {
            key: 'records',
            name: 'Ultrasonic Inspection Records',
            category: 'Data & Records',
            desc: 'View, add, edit, search, and delete ultrasonic testing records and sensor readings',
            actions: ['view', 'create', 'edit', 'delete', 'search', 'export']
        },
        {
            key: 'shift_analytics',
            name: 'Shift Analytics & Reports',
            category: 'Reports',
            desc: '7-day shift composition, historical date lookup, and shift distributions',
            actions: ['view', 'export']
        },
        {
            key: 'user_management',
            name: 'User Management',
            category: 'Administration',
            desc: 'Provision user accounts, reset passwords, and manage account statuses',
            actions: ['view', 'create', 'edit', 'delete', 'manage_status']
        },
        {
            key: 'permission_management',
            name: 'Permission Management',
            category: 'Administration',
            desc: 'Granular feature-level permission assignment and access control',
            actions: ['view', 'edit']
        },
        {
            key: 'audit_logs',
            name: 'Security & Audit Logs',
            category: 'Administration',
            desc: 'Comprehensive audit trail of logins, credential updates, and record actions',
            actions: ['view', 'export']
        }
    ];

    for (const m of standardModules) {
        await pool.query(`
            INSERT INTO modules (module_key, name, category, description, supported_actions)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (module_key) DO UPDATE 
            SET name = EXCLUDED.name, category = EXCLUDED.category, 
                description = EXCLUDED.description, supported_actions = EXCLUDED.supported_actions
        `, [m.key, m.name, m.category, m.desc, m.actions]);
    }

    // 5. User Permissions table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_permissions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            module VARCHAR(50) NOT NULL,
            action VARCHAR(50) NOT NULL,
            is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
            granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, module, action)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id
        ON user_permissions(user_id)
    `);

    // 6. Audit Logs table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            actor_username VARCHAR(100),
            action VARCHAR(100) NOT NULL,
            target_type VARCHAR(50),
            target_id VARCHAR(100),
            details JSONB,
            ip_address VARCHAR(45),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)
    `);

    // 7. Password Reset Requests table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id SERIAL PRIMARY KEY,
            username_or_email VARCHAR(255) NOT NULL,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            notes TEXT,
            ip_address VARCHAR(45)
        )
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
}

pool.on("error", (err) => {
    console.error("❌ Unexpected database pool error:", err.message);
});

module.exports = pool;
module.exports.initializeAuthTables = initializeAuthTables;
