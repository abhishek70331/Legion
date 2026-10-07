const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");
const { initializeAuthTables } = pool;
const {
    hashPassword,
    comparePassword,
    createToken,
    hashToken,
    requireAuth
} = require("./auth");
const {
    loginRateLimit,
    recordLoginFailure,
    clearSuccessfulLogin
} = require("./security");

const app = express();


// Re-check the current database role for every privileged operation. This prevents
// a deleted/demoted account's still-valid JWT from retaining elevated privileges.
async function requireAdminFresh(req, res, next) {
    try {
        const result = await pool.query(
            "SELECT id, username, role FROM users WHERE id = $1",
            [req.user?.id]
        );

        const currentUser = result.rows[0];
        if (!currentUser) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        if (!["admin", "superadmin"].includes(currentUser.role)) {
            return res.status(403).json({ message: "Admin access required" });
        }

        req.user = { ...req.user, ...currentUser };
        next();
    } catch (error) {
        console.error("Admin authorization check error:", error);
        return res.status(500).json({ message: "Failed to verify admin access" });
    }
}

// User management is reserved for the Super Admin role.
async function requireSuperAdminFresh(req, res, next) {
    try {
        const result = await pool.query(
            "SELECT id, username, role FROM users WHERE id = $1",
            [req.user?.id]
        );

        const currentUser = result.rows[0];
        if (!currentUser) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        if (currentUser.role !== "superadmin") {
            return res.status(403).json({ message: "Super Admin access required" });
        }

        req.user = { ...req.user, ...currentUser };
        next();
    } catch (error) {
        console.error("Super Admin authorization check error:", error);
        return res.status(500).json({ message: "Failed to verify Super Admin access" });
    }
}

// Render/Vercel-style reverse proxy: use the first trusted proxy hop for req.ip.
app.set("trust proxy", 1);
app.disable("x-powered-by");

const configuredOrigins = (process.env.FRONTEND_URL || "http://localhost:5173,http://localhost:5174,http://localhost:3000")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);

function isOriginAllowed(origin) {
    if (!origin) return true;
    if (configuredOrigins.includes("*")) return true;
    const normalizedOrigin = origin.trim().replace(/\/+$/, "").toLowerCase();
    if (configuredOrigins.some((allowed) => allowed.toLowerCase() === normalizedOrigin)) {
        return true;
    }
    try {
        const parsed = new URL(origin);
        if (
            parsed.hostname.endsWith(".vercel.app") ||
            parsed.hostname.endsWith(".onrender.com") ||
            parsed.hostname === "localhost" ||
            parsed.hostname === "127.0.0.1"
        ) {
            return true;
        }
    } catch {
        // malformed origin
    }
    return false;
}

app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store"
    });

    if (process.env.NODE_ENV === "production") {
        res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }

    next();
});

app.use(cors({
    origin(origin, callback) {
        if (isOriginAllowed(origin)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));
app.use(express.json({ limit: "100kb" }));

app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ ok: true, service: "legion-api" });
});


// ------------------------------------
// AUTH INITIALIZATION
// ------------------------------------

async function ensurePrivilegedUsers() {
    const adminUsername = (process.env.ADMIN_USERNAME || "admin").trim();
    const adminPassword = process.env.ADMIN_PASSWORD;
    const superAdminUsername = (process.env.SUPERADMIN_USERNAME || "superadmin").trim();
    const superAdminPassword = process.env.SUPERADMIN_PASSWORD;

    if (!adminPassword) {
        throw new Error("ADMIN_PASSWORD must be set in backend/.env");
    }
    if (!superAdminPassword) {
        throw new Error("SUPERADMIN_PASSWORD must be set in backend/.env");
    }
    if (adminUsername.toLowerCase() === superAdminUsername.toLowerCase()) {
        throw new Error("ADMIN_USERNAME and SUPERADMIN_USERNAME must be different");
    }

    const ensureAccount = async ({ username, password, role, label }) => {
        const existing = await pool.query(
            "SELECT id, role FROM users WHERE username = $1",
            [username]
        );

        if (existing.rows.length === 0) {
            const hash = await hashPassword(password);
            await pool.query(
                "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)",
                [username, hash, role]
            );
            console.log(`✅ ${label} user created: ${username}`);
        } else {
            const current = existing.rows[0];
            if (current.role !== role) {
                const hash = await hashPassword(password);
                await pool.query(
                    "UPDATE users SET role = $1, password_hash = $2, is_banned = FALSE WHERE id = $3",
                    [role, hash, current.id]
                );
                console.log(`✅ ${label} role corrected and password initialized: ${username}`);
            } else {
                console.log(`✅ ${label} user ready: ${username}`);
            }
        }
    };

    await ensureAccount({
        username: adminUsername,
        password: adminPassword,
        role: "admin",
        label: "Admin"
    });

    await ensureAccount({
        username: superAdminUsername,
        password: superAdminPassword,
        role: "superadmin",
        label: "Super Admin"
    });
}


// ------------------------------------
// HOME
// ------------------------------------

app.get("/", (req, res) => {
    res.json({
        message: "UID Data API is running"
    });
});


// ------------------------------------
// USER MANAGEMENT (SUPER ADMIN ONLY)
// ------------------------------------

function parseUserId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function publicUser(row) {
    return {
        id: row.id,
        username: row.username,
        role: row.role
    };
}

const MAX_ACTIVE_SESSIONS = Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS || 1));

async function purgeStaleSessions(userId) {
    await pool.query(
        `DELETE FROM active_sessions
         WHERE user_id = $1
           AND last_activity_at < NOW() - INTERVAL '8 hours'`,
        [userId]
    );
}

async function createSessionWithLimit(user, token, req) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const tokenHash = hashToken(token);
        await client.query(
            `INSERT INTO active_sessions
                (user_id, token_hash, ip_address, user_agent)
             VALUES ($1, $2, $3, $4)`,
            [user.id, tokenHash, req.ip || null, req.get('user-agent') || null]
        );

        // Keep only the newest allowed number of sessions. MAX_ACTIVE_SESSIONS
        // is 1 by default, so a new login replaces the previous login.
        await client.query(
            `DELETE FROM active_sessions
             WHERE user_id = $1
               AND id NOT IN (
                   SELECT id FROM active_sessions
                   WHERE user_id = $1
                   ORDER BY logged_in_at DESC, id DESC
                   LIMIT $2
               )`,
            [user.id, MAX_ACTIVE_SESSIONS]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

// ------------------------------------
// LOGIN
// ------------------------------------

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }
        if (username.length > 100 || password.length > 128) {
            return res.status(400).json({ message: 'Invalid username or password' });
        }

        const result = await pool.query(
            'SELECT id, username, password_hash, role, is_banned FROM users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];
        const DUMMY_PASSWORD_HASH = '$2b$12$ozWhC8vseZnjGcl34/dTwOmV07ASZtwMnyDSPQKMZVo9Nk6r0DQ9e';
        const passwordMatches = await comparePassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);

        if (!user || !passwordMatches) {
            const limiter = req.loginRateLimit || { ip: req.ip, username };
            recordLoginFailure(limiter);
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        if (user.is_banned) {
            return res.status(403).json({
                code: 'ACCOUNT_BANNED',
                message: 'Your account has been banned. Please contact an administrator.'
            });
        }

        clearSuccessfulLogin(req.loginRateLimit || { ip: req.ip, username });
        const token = createToken(user);
        await purgeStaleSessions(user.id);
        await createSessionWithLimit(user, token, req);

        res.json({ token, user: publicUser(user) });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Login failed' });
    }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM active_sessions WHERE user_id = $1 AND token_hash = $2',
            [req.user.id, req.tokenHash]
        );
        res.json({ message: 'Logged out' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ message: 'Failed to log out' });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, role FROM users WHERE id = $1',
            [req.user.id]
        );
        if (!result.rows[0]) {
            return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'User no longer exists' });
        }
        res.json({ user: publicUser(result.rows[0]) });
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(500).json({ message: 'Failed to verify login' });
    }
});

app.get("/api/users", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id,
                u.username,
                u.role,
                u.created_at,
                u.is_banned,
                COALESCE(s.session_count, 0)::int AS session_count,
                s.last_login_at,
                s.last_seen_at,
                COALESCE(s.last_seen_at > NOW() - INTERVAL '5 minutes', false) AS is_online
            FROM users u
            LEFT JOIN (
                SELECT user_id,
                       COUNT(*) AS session_count,
                       MAX(logged_in_at) AS last_login_at,
                       MAX(last_activity_at) AS last_seen_at
                FROM active_sessions
                WHERE logged_in_at > NOW() - INTERVAL '8 hours'
                GROUP BY user_id
            ) s ON s.user_id = u.id
            ORDER BY u.id ASC
        `);

        const users = result.rows.map((row) => ({
            id: row.id,
            username: row.username,
            role: row.role,
            created_at: row.created_at,
            is_banned: row.is_banned,
            is_online: row.is_online,
            session_count: row.session_count,
            last_login_at: row.last_login_at,
            last_seen_at: row.last_seen_at,
            }));

        res.json({
            users,
            meta: { today: new Date().toISOString().slice(0,10) }
        });
    } catch (error) {
        console.error("List users error:", error);
        res.status(500).json({ message: "Failed to load users" });
    }
});


app.post("/api/users", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");
        const role = ["admin", "user", "superadmin"].includes(req.body.role) ? req.body.role : "user";

        if (!username || !password) return res.status(400).json({ message: "Username and password are required" });
        if (username.length < 3 || username.length > 100) return res.status(400).json({ message: "Username must be between 3 and 100 characters" });
        if (password.length < 12 || password.length > 128) return res.status(400).json({ message: "Password must be between 12 and 128 characters" });

        const hash = await hashPassword(password);
        const result = await pool.query(
            `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at`,
            [username, hash, role]
        );
        const created = result.rows[0];
        res.status(201).json({ message: `User "${username}" created.`, user: { ...publicUser(created), created_at: created.created_at } });
    } catch (error) {
        console.error("Create user error:", error);
        if (error.code === "23505") return res.status(409).json({ message: "Username already exists" });
        res.status(500).json({ message: "Failed to create user" });
    }
});

app.patch("/api/users/:id/password", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        const password = String(req.body.password || "");

        if (!id) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({
                message: "Password must be between 12 and 128 characters"
            });
        }

        const hash = await hashPassword(password);

        const result = await pool.query(
            "UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id, username, role",
            [hash, id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        // A password reset signs the user out everywhere (except the admin
        // resetting their own password from this session).
        if (id === req.user.id) {
            await pool.query(
                "DELETE FROM active_sessions WHERE user_id = $1 AND token_hash <> $2",
                [id, req.tokenHash]
            );
        } else {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [id]);
        }

        res.json({
            message: "Password updated successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Failed to reset password" });
    }
});


app.delete("/api/users/:id", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const id = parseUserId(req.params.id);

        if (!id) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (id === req.user.id) {
            return res.status(400).json({
                message: "You cannot delete your own account"
            });
        }

        const result = await pool.query(
            "DELETE FROM users WHERE id = $1 RETURNING id, username",
            [id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "User deleted successfully"
        });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user" });
    }
});


// ------------------------------------
// USER BAN / FORCE LOGOUT (ADMIN ONLY)
// ------------------------------------

app.patch("/api/users/:id/ban", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        const isBanned = req.body.is_banned === true;

        if (!id) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (id === req.user.id) {
            return res.status(400).json({
                message: "You cannot ban/unban your own account"
            });
        }

        const result = await pool.query(
            "UPDATE users SET is_banned = $1 WHERE id = $2 RETURNING id, username, is_banned",
            [isBanned, id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        // If banning, terminate all active sessions
        if (isBanned) {
            await pool.query(
                "DELETE FROM active_sessions WHERE user_id = $1",
                [id]
            );
        }

        res.json({
            message: isBanned ? "User banned successfully" : "User unbanned successfully",
            user: result.rows[0]
        });
    } catch (error) {
        console.error("Ban user error:", error);
        res.status(500).json({ message: "Failed to update ban status" });
    }
});

app.post("/api/users/:id/logout", requireAuth, requireSuperAdminFresh, async (req, res) => {
    try {
        const id = parseUserId(req.params.id);

        if (!id) {
            return res.status(400).json({ message: "Invalid user ID" });
        }

        if (id === req.user.id) {
            return res.status(400).json({
                message: "Use the Logout button to sign yourself out"
            });
        }

        const exists = await pool.query("SELECT id FROM users WHERE id = $1", [id]);
        if (!exists.rows[0]) {
            return res.status(404).json({ message: "User not found" });
        }

        // Deleting the session rows is what signs the user out: requireAuth
        // rejects any token that no longer has a matching session.
        const result = await pool.query(
            "DELETE FROM active_sessions WHERE user_id = $1",
            [id]
        );

        res.json({
            message: "User logged out successfully",
            sessions_terminated: result.rowCount
        });
    } catch (error) {
        console.error("Logout user error:", error);
        res.status(500).json({ message: "Failed to logout user" });
    }
});


// ------------------------------------
// ------------------------------------
// RECORD APIs - LOGIN REQUIRED
// ------------------------------------

app.get("/api/data", requireAuth, async (req, res) => {
    try {
        const rawLimit = req.query.limit;
        const limit = rawLimit ? Math.min(Math.max(1, parseInt(rawLimit, 10) || 50), 500) : 50;
        const result = await pool.query(
            "SELECT * FROM records ORDER BY record_date DESC, record_time DESC LIMIT $1",
            [limit]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching records:", error);

        res.status(500).json({
            message: "Failed to fetch records"
        });
    }
});


app.get("/api/data/search", requireAuth, async (req, res) => {
    try {
        const { heading, uid, customer_name, record_date } = req.query;

        if (!heading && !uid && !customer_name && !record_date) {
            return res.status(400).json({
                message: "Please provide at least one search field"
            });
        }

        let query = `
            SELECT *
            FROM records
            WHERE 1 = 1
        `;

        const values = [];
        let paramIndex = 1;

        if (heading) {
            query += ` AND heading ILIKE $${paramIndex}`;
            values.push(`%${heading}%`);
            paramIndex++;
        }

        if (uid) {
            query += ` AND uid ILIKE $${paramIndex}`;
            values.push(`%${uid}%`);
            paramIndex++;
        }

        if (customer_name) {
            query += ` AND customer_name ILIKE $${paramIndex}`;
            values.push(`%${customer_name}%`);
            paramIndex++;
        }

        if (record_date) {
            query += ` AND record_date = $${paramIndex}`;
            values.push(record_date);
            paramIndex++;
        }

        query += `
            ORDER BY record_date DESC, record_time DESC
        `;

        const result = await pool.query(query, values);

        res.json(result.rows);
    } catch (error) {
        console.error("Error searching records:", error);

        res.status(500).json({
            message: "Failed to search records"
        });
    }
});


app.get("/api/data/last-7-days", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            WITH settings AS (
                SELECT GREATEST(
                    CASE
                        WHEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::time < TIME '06:00:00'
                            THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1
                        ELSE (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                    END,
                    COALESCE((
                        SELECT MAX(
                            CASE
                                WHEN record_time < TIME '06:00:00' THEN record_date - 1
                                ELSE record_date
                            END
                        )
                        FROM records
                    ), (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)
                ) AS end_date
            ),
            days AS (
                SELECT generate_series(
                    (SELECT end_date FROM settings) - INTERVAL '6 days',
                    (SELECT end_date FROM settings),
                    INTERVAL '1 day'
                )::date AS record_date
            ),
            classified AS (
                SELECT
                    CASE
                        WHEN record_time < TIME '06:00:00' THEN record_date - 1
                        ELSE record_date
                    END AS shift_date,
                    record_time
                FROM records
            )
            SELECT
                TO_CHAR(days.record_date, 'YYYY-MM-DD') AS record_date,
                COUNT(classified.shift_date)::int AS data_count,
                COUNT(classified.shift_date) FILTER (
                    WHERE classified.record_time >= TIME '06:00:00'
                      AND classified.record_time < TIME '14:00:00'
                )::int AS a_shift_count,
                COUNT(classified.shift_date) FILTER (
                    WHERE classified.record_time >= TIME '14:00:00'
                      AND classified.record_time < TIME '22:00:00'
                )::int AS b_shift_count,
                COUNT(classified.shift_date) FILTER (
                    WHERE classified.record_time >= TIME '22:00:00'
                       OR classified.record_time < TIME '06:00:00'
                )::int AS c_shift_count
            FROM days
            LEFT JOIN classified
                ON classified.shift_date = days.record_date
            GROUP BY days.record_date
            ORDER BY days.record_date DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching last 7 days summary:", error);
        res.status(500).json({
            message: "Failed to fetch last 7 days summary"
        });
    }
});


app.get("/api/data/date-summary", requireAuth, async (req, res) => {
    try {
        const requestedDate = String(req.query.date || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
            return res.status(400).json({ message: "A valid date is required (YYYY-MM-DD)" });
        }

        const result = await pool.query(`
            WITH classified AS (
                SELECT
                    record_time,
                    CASE
                        WHEN record_time < TIME '06:00:00' THEN record_date - 1
                        ELSE record_date
                    END AS shift_date
                FROM records
            )
            SELECT
                $1::date::text AS record_date,
                COUNT(*)::int AS data_count,
                COUNT(*) FILTER (
                    WHERE record_time >= TIME '06:00:00'
                      AND record_time < TIME '14:00:00'
                )::int AS a_shift_count,
                COUNT(*) FILTER (
                    WHERE record_time >= TIME '14:00:00'
                      AND record_time < TIME '22:00:00'
                )::int AS b_shift_count,
                COUNT(*) FILTER (
                    WHERE record_time >= TIME '22:00:00'
                       OR record_time < TIME '06:00:00'
                )::int AS c_shift_count
            FROM classified
            WHERE shift_date = $1::date
        `, [requestedDate]);

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching date summary:", error);
        res.status(500).json({ message: "Failed to fetch date summary" });
    }
});

app.patch("/api/data", requireAuth, requireAdminFresh, async (req, res) => {
    try {
        const { original_heading, original_customer_name, original_uid, ...record } = req.body || {};

        if (!original_heading || !original_customer_name || !original_uid) {
            return res.status(400).json({ message: "Original record identifiers are required" });
        }

        const {
            heading, customer_name, uid, record_date, record_time,
            loc1, loc2, loc3, loc4, loc5, loc6,
            loc7, loc8, loc9, loc10, loc11, loc12
        } = record;

        if (!String(heading || "").trim() || !String(customer_name || "").trim() || !String(uid || "").trim()) {
            return res.status(400).json({ message: "Heading, Customer Name and UID are required" });
        }

        // First find the exact record being edited. This lets us distinguish
        // "editing the same record" from "changing it to another record's key".
        const originalResult = await pool.query(
            `SELECT heading, customer_name, uid
             FROM records
             WHERE heading = $1 AND customer_name = $2 AND uid = $3
             LIMIT 1`,
            [original_heading, original_customer_name, original_uid]
        );

        if (!originalResult.rows[0]) {
            return res.status(404).json({ message: "Record not found" });
        }

        const originalRow = originalResult.rows[0];
        const requestedHeading = String(heading).trim();
        const requestedCustomer = String(customer_name).trim();
        const requestedUid = String(uid).trim();

        // If the user did not actually change the three key fields (ignoring
        // case), preserve the database values exactly. This prevents a simple
        // edit such as changing Loc-1 from turning "Sg" into "SG" and hitting
        // an existing unique-key row.
        const sameLogicalKey =
            requestedHeading.toUpperCase() === String(originalRow.heading).toUpperCase() &&
            requestedCustomer.toUpperCase() === String(originalRow.customer_name).toUpperCase() &&
            requestedUid.toUpperCase() === String(originalRow.uid).toUpperCase();

        const nextHeading = sameLogicalKey
            ? originalRow.heading
            : requestedHeading.toUpperCase();
        const nextCustomer = sameLogicalKey
            ? originalRow.customer_name
            : requestedCustomer.toUpperCase();
        const nextUid = sameLogicalKey
            ? originalRow.uid
            : requestedUid.toUpperCase();

        const result = await pool.query(
            `UPDATE records SET
                heading = $1, customer_name = $2, uid = $3, record_date = $4, record_time = $5,
                loc1 = $6, loc2 = $7, loc3 = $8, loc4 = $9, loc5 = $10, loc6 = $11,
                loc7 = $12, loc8 = $13, loc9 = $14, loc10 = $15, loc11 = $16, loc12 = $17
             WHERE heading = $18 AND customer_name = $19 AND uid = $20
             RETURNING *`,
            [
                nextHeading, nextCustomer, nextUid,
                record_date, record_time,
                loc1, loc2, loc3, loc4, loc5, loc6,
                loc7, loc8, loc9, loc10, loc11, loc12,
                originalRow.heading, originalRow.customer_name, originalRow.uid
            ]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({ message: "Record updated successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error updating record:", error);
        if (error.code === "23505") {
            return res.status(409).json({ message: "Another record already uses this Heading, Customer Name and UID combination" });
        }
        res.status(500).json({ message: "Failed to update record" });
    }
});

app.delete("/api/data", requireAuth, requireAdminFresh, async (req, res) => {
    try {
        const { heading, customer_name, uid } = req.body || {};
        if (!heading || !customer_name || !uid) {
            return res.status(400).json({ message: "Record identifiers are required" });
        }

        const result = await pool.query(
            "DELETE FROM records WHERE UPPER(TRIM(heading)) = UPPER(TRIM($1)) AND UPPER(TRIM(customer_name)) = UPPER(TRIM($2)) AND UPPER(TRIM(uid)) = UPPER(TRIM($3)) RETURNING heading, customer_name, uid",
            [heading, customer_name, uid]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ message: "Record not found" });
        }

        res.json({ message: "Record deleted successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error deleting record:", error);
        res.status(500).json({ message: "Failed to delete record" });
    }
});

app.post("/api/data", requireAuth, async (req, res) => {
    try {
        const {
            uid,
            heading,
            customer_name,
            record_date,
            record_time,
            loc1,
            loc2,
            loc3,
            loc4,
            loc5,
            loc6,
            loc7,
            loc8,
            loc9,
            loc10,
            loc11,
            loc12
        } = req.body;

        if (!uid) {
            return res.status(400).json({
                message: "UID is required"
            });
        }

        if (!heading) {
            return res.status(400).json({
                message: "Heading is required"
            });
        }

        if (!customer_name) {
            return res.status(400).json({
                message: "Customer name is required"
            });
        }

        const headingUpper = heading.trim().toUpperCase();
        const customerUpper = customer_name.trim().toUpperCase();
        const uidUpper = uid.trim().toUpperCase();

        const query = `
            INSERT INTO records (
                heading,
                customer_name,
                uid,
                record_date,
                record_time,
                loc1,
                loc2,
                loc3,
                loc4,
                loc5,
                loc6,
                loc7,
                loc8,
                loc9,
                loc10,
                loc11,
                loc12
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING *
        `;

        const values = [
            headingUpper,
            customerUpper,
            uidUpper,
            record_date,
            record_time,
            loc1,
            loc2,
            loc3,
            loc4,
            loc5,
            loc6,
            loc7,
            loc8,
            loc9,
            loc10,
            loc11,
            loc12
        ];

        const result = await pool.query(query, values);

        // Never report success unless PostgreSQL actually inserted a row.
        if (result.rowCount !== 1 || !result.rows[0]) {
            console.error("Record INSERT returned no row.");
            return res.status(500).json({
                message: "Record was not saved to the database"
            });
        }

        const savedRecord = result.rows[0];

        res.status(201).json({
            message: "Record created successfully",
            data: savedRecord
        });
    } catch (error) {
        console.error("Error creating record:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Heading, UID and Customer Name combination already exists"
            });
        }

        res.status(500).json({
            message: "Failed to create record",
            error: error.message
        });
    }
});


// ------------------------------------
// ERROR HANDLING
// ------------------------------------

app.use((error, req, res, next) => {
    if (error?.message?.startsWith("Origin not allowed by CORS:")) {
        return res.status(403).json({ message: "Origin not allowed" });
    }

    if (error?.type === "entity.too.large") {
        return res.status(413).json({ message: "Request body is too large" });
    }

    console.error("Unhandled server error:", error);
    return res.status(500).json({ message: "Internal server error" });
});


// ------------------------------------
// START SERVER
// ------------------------------------

async function startServer() {
    try {
        await pool.query("SELECT 1");
        console.log("✅ Database connected successfully");
        await initializeAuthTables();
        console.log("✅ Authentication tables ready");
        await ensurePrivilegedUsers();

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Server startup failed:");
        console.error(error.message);
        process.exit(1);
    }
}

startServer();


