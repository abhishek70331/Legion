const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const pool = require("./db");
const { initializeAuthTables } = pool;
const {
    hashPassword,
    comparePassword,
    createToken,
    hashToken,
    getUserPermissions,
    requireAuth,
    requirePermission,
    requireAdminFresh,
    requireSuperAdminFresh,
    logAuditEvent
} = require("./auth");
const {
    loginRateLimit,
    recordLoginFailure,
    clearSuccessfulLogin
} = require("./security");

const app = express();

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
app.use(express.json({ limit: "150kb" }));

const distDir = path.resolve(__dirname, "../frontend/dist");
if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
}

app.get(["/health", "/api/health"], (_req, res) => {
    res.json({ ok: true, service: "legion-api" });
});

app.get("/api", (_req, res) => {
    res.json({ message: "Legion Ultrasonic Testing API is active" });
});

// ------------------------------------
// HELPERS
// ------------------------------------

function parseUserId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function publicUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email || null,
        full_name: row.full_name || null,
        role: row.role,
        status: row.status || (row.is_banned ? "suspended" : "active"),
        is_banned: Boolean(row.is_banned),
        created_at: row.created_at
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
        await client.query("BEGIN");
        const tokenHash = hashToken(token);
        await client.query(
            `INSERT INTO active_sessions
                (user_id, token_hash, ip_address, user_agent)
             VALUES ($1, $2, $3, $4)`,
            [user.id, tokenHash, req.ip || null, req.get("user-agent") || null]
        );

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
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// ------------------------------------
// AUTHENTICATION ENDPOINTS
// ------------------------------------

/**
 * Login: accepts username OR email, plus password.
 */
app.post("/api/auth/login", loginRateLimit, async (req, res) => {
    try {
        const identifier = String(req.body.username || req.body.email || "").trim();
        const password = String(req.body.password || "");

        if (!identifier || !password) {
            return res.status(400).json({ message: "Username or email and password are required" });
        }
        if (identifier.length > 255 || password.length > 128) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const result = await pool.query(
            `SELECT id, username, email, full_name, password_hash, role, status, is_banned, created_at 
             FROM users 
             WHERE LOWER(username) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($1))
             LIMIT 1`,
            [identifier]
        );
        const user = result.rows[0];

        const DUMMY_HASH = "$2b$12$ozWhC8vseZnjGcl34/dTwOmV07ASZtwMnyDSPQKMZVo9Nk6r0DQ9e";
        const passwordMatches = await comparePassword(password, user?.password_hash || DUMMY_HASH);

        if (!user || !passwordMatches) {
            const limiter = req.loginRateLimit || { ip: req.ip, username: identifier };
            recordLoginFailure(limiter);

            await logAuditEvent({
                actorUsername: identifier,
                action: "LOGIN_FAILED",
                targetType: "user",
                targetId: user?.id,
                details: { reason: "Bad credentials", identifier },
                ipAddress: req.ip
            });

            return res.status(401).json({ message: "Invalid username/email or password" });
        }

        if (user.is_banned || user.status === "suspended") {
            await logAuditEvent({
                actorId: user.id,
                actorUsername: user.username,
                action: "LOGIN_BLOCKED",
                targetType: "user",
                targetId: user.id,
                details: { reason: "Account suspended" },
                ipAddress: req.ip
            });

            return res.status(403).json({
                code: "ACCOUNT_BANNED",
                message: "Your account has been suspended. Please contact a Super Administrator."
            });
        }

        if (user.status === "inactive") {
            await logAuditEvent({
                actorId: user.id,
                actorUsername: user.username,
                action: "LOGIN_BLOCKED",
                targetType: "user",
                targetId: user.id,
                details: { reason: "Account deactivated" },
                ipAddress: req.ip
            });

            return res.status(403).json({
                code: "ACCOUNT_INACTIVE",
                message: "Your account is currently inactive. Please contact an administrator to reactivate it."
            });
        }

        clearSuccessfulLogin(req.loginRateLimit || { ip: req.ip, username: user.username });
        const token = createToken(user);
        await purgeStaleSessions(user.id);
        await createSessionWithLimit(user, token, req);

        const permissions = await getUserPermissions(user.id, user.role);

        await logAuditEvent({
            actorId: user.id,
            actorUsername: user.username,
            action: "LOGIN_SUCCESS",
            targetType: "user",
            targetId: user.id,
            details: { role: user.role, ip: req.ip },
            ipAddress: req.ip
        });

        res.json({
            token,
            user: publicUser(user),
            permissions
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Login failed" });
    }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM active_sessions WHERE user_id = $1 AND token_hash = $2",
            [req.user.id, req.tokenHash]
        );

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "LOGOUT",
            targetType: "session",
            details: { ip: req.ip },
            ipAddress: req.ip
        });

        res.json({ message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ message: "Failed to log out" });
    }
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, email, full_name, role, status, is_banned, created_at, permissions_updated_at 
             FROM users WHERE id = $1`,
            [req.user.id]
        );
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ code: "USER_NOT_FOUND", message: "User no longer exists" });
        }

        if (user.is_banned || user.status === "suspended") {
            return res.status(403).json({ code: "ACCOUNT_BANNED", message: "Your account has been suspended." });
        }
        if (user.status === "inactive") {
            return res.status(403).json({ code: "ACCOUNT_INACTIVE", message: "Your account is deactivated." });
        }

        const permissions = await getUserPermissions(user.id, user.role);

        res.json({
            user: publicUser(user),
            permissions
        });
    } catch (error) {
        console.error("Auth check error:", error);
        res.status(500).json({ message: "Failed to verify session" });
    }
});

/**
 * Forgot password request submission
 */
app.post("/api/auth/forgot-password", loginRateLimit, async (req, res) => {
    try {
        const identifier = String(req.body.username_or_email || "").trim();
        const notes = String(req.body.notes || "").trim();

        if (!identifier) {
            return res.status(400).json({ message: "Please provide your username or email address" });
        }

        const userRes = await pool.query(
            `SELECT id, username, email FROM users 
             WHERE LOWER(username) = LOWER($1) OR (email IS NOT NULL AND LOWER(email) = LOWER($1))`,
            [identifier]
        );
        const user = userRes.rows[0];

        await pool.query(
            `INSERT INTO password_reset_requests (username_or_email, user_id, notes, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [identifier, user?.id || null, notes || "User requested password reset from login screen", req.ip]
        );

        await logAuditEvent({
            actorId: user?.id || null,
            actorUsername: user?.username || identifier,
            action: "PASSWORD_RESET_REQUESTED",
            targetType: "user",
            targetId: user?.id,
            details: { identifier, notes },
            ipAddress: req.ip
        });

        res.json({
            message: "Your password assistance request has been recorded. An administrator will review your account and issue reset instructions."
        });
    } catch (error) {
        console.error("Forgot password request error:", error);
        res.status(500).json({ message: "Failed to submit password reset request" });
    }
});

// ------------------------------------
// MODULES & PERMISSION METADATA
// ------------------------------------

app.get("/api/modules", requireAuth, async (_req, res) => {
    try {
        const result = await pool.query(
            "SELECT module_key, name, category, description, supported_actions FROM modules ORDER BY category, name"
        );
        res.json(result.rows);
    } catch (error) {
        console.error("Get modules error:", error);
        res.status(500).json({ message: "Failed to load modules list" });
    }
});

app.get("/api/roles", requireAuth, async (_req, res) => {
    try {
        const result = await pool.query("SELECT name, label, description FROM roles ORDER BY name");
        res.json(result.rows);
    } catch (error) {
        console.error("Get roles error:", error);
        res.status(500).json({ message: "Failed to load roles" });
    }
});

// ------------------------------------
// USER MANAGEMENT ENDPOINTS
// ------------------------------------

app.get("/api/users", requireAuth, requirePermission("user_management", "view"), async (req, res) => {
    try {
        const { q, role, status } = req.query;

        let query = `
            SELECT
                u.id,
                u.username,
                u.email,
                u.full_name,
                u.role,
                u.status,
                u.is_banned,
                u.created_at,
                u.permissions_updated_at,
                COALESCE(s.session_count, 0)::int AS session_count,
                s.last_login_at,
                s.last_seen_at,
                COALESCE(s.last_seen_at > NOW() - INTERVAL '5 minutes', false) AS is_online,
                COALESCE(p.perm_count, 0)::int AS permissions_count
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
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS perm_count
                FROM user_permissions
                WHERE is_allowed = TRUE
                GROUP BY user_id
            ) p ON p.user_id = u.id
            WHERE 1 = 1
        `;

        const values = [];
        let pIndex = 1;

        if (q && q.trim()) {
            query += ` AND (u.username ILIKE $${pIndex} OR u.email ILIKE $${pIndex} OR u.full_name ILIKE $${pIndex})`;
            values.push(`%${q.trim()}%`);
            pIndex++;
        }

        if (role && role !== "all") {
            query += ` AND u.role = $${pIndex}`;
            values.push(role);
            pIndex++;
        }

        if (status && status !== "all") {
            if (status === "banned" || status === "suspended") {
                query += ` AND (u.status = 'suspended' OR u.is_banned = TRUE)`;
            } else if (status === "active") {
                query += ` AND (u.status = 'active' AND u.is_banned = FALSE)`;
            } else if (status === "inactive") {
                query += ` AND u.status = 'inactive'`;
            }
        }

        query += ` ORDER BY u.id ASC`;

        const result = await pool.query(query, values);

        const users = result.rows.map((row) => ({
            id: row.id,
            username: row.username,
            email: row.email,
            full_name: row.full_name,
            role: row.role,
            status: row.status || (row.is_banned ? "suspended" : "active"),
            is_banned: row.is_banned,
            is_online: row.is_online,
            session_count: row.session_count,
            last_login_at: row.last_login_at,
            last_seen_at: row.last_seen_at,
            created_at: row.created_at,
            permissions_count: row.role === "superadmin" ? "All (Super Admin)" : row.permissions_count
        }));

        res.json({
            users,
            meta: { total: users.length, queryDate: new Date().toISOString() }
        });
    } catch (error) {
        console.error("List users error:", error);
        res.status(500).json({ message: "Failed to load users" });
    }
});

app.post("/api/users", requireAuth, requirePermission("user_management", "create"), async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const email = req.body.email ? String(req.body.email).trim() : null;
        const fullName = req.body.full_name ? String(req.body.full_name).trim() : null;
        const password = String(req.body.password || "");
        const role = ["admin", "user", "superadmin"].includes(req.body.role) ? req.body.role : "user";
        const status = ["active", "inactive", "suspended"].includes(req.body.status) ? req.body.status : "active";
        const permissions = req.body.permissions; // Optional map or list of permissions

        if (role === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "Only an existing Super Admin can create another Super Admin account." });
        }

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }
        if (username.length < 3 || username.length > 100) {
            return res.status(400).json({ message: "Username must be between 3 and 100 characters" });
        }
        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({ message: "Password must be at least 12 characters long" });
        }

        const isBanned = status === "suspended";
        const hash = await hashPassword(password);

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const insertRes = await client.query(
                `INSERT INTO users (username, email, full_name, password_hash, role, status, is_banned)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, username, email, full_name, role, status, is_banned, created_at`,
                [username, email, fullName, hash, role, status, isBanned]
            );
            const created = insertRes.rows[0];

            // If permissions provided for this user, insert them
            if (permissions && typeof permissions === "object" && role !== "superadmin") {
                for (const [moduleKey, actions] of Object.entries(permissions)) {
                    if (typeof actions === "object") {
                        for (const [actionName, allowed] of Object.entries(actions)) {
                            if (allowed) {
                                await client.query(
                                    `INSERT INTO user_permissions (user_id, module, action, is_allowed, granted_by)
                                     VALUES ($1, $2, $3, TRUE, $4)
                                     ON CONFLICT (user_id, module, action) DO NOTHING`,
                                    [created.id, moduleKey, actionName, req.user.id]
                                );
                            }
                        }
                    }
                }
            }

            await client.query("COMMIT");

            await logAuditEvent({
                actorId: req.user.id,
                actorUsername: req.user.username,
                action: "USER_CREATED",
                targetType: "user",
                targetId: created.id,
                details: { username: created.username, role: created.role, status: created.status },
                ipAddress: req.ip
            });

            res.status(201).json({
                message: `Account "${username}" provisioned successfully.`,
                user: publicUser(created)
            });
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Create user error:", error);
        if (error.code === "23505") {
            return res.status(409).json({ message: "A user with this username or email already exists" });
        }
        res.status(500).json({ message: "Failed to create user" });
    }
});

app.patch("/api/users/:id", requireAuth, requirePermission("user_management", "edit"), async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid user ID" });

        const targetRes = await pool.query("SELECT id, username, role, status, is_banned FROM users WHERE id = $1", [id]);
        const target = targetRes.rows[0];
        if (!target) return res.status(404).json({ message: "User not found" });

        // Non-superadmin cannot edit a superadmin
        if (target.role === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "Only a Super Admin can modify a Super Admin account." });
        }

        const email = req.body.email !== undefined ? (req.body.email ? String(req.body.email).trim() : null) : undefined;
        const fullName = req.body.full_name !== undefined ? (req.body.full_name ? String(req.body.full_name).trim() : null) : undefined;
        const requestedRole = req.body.role;
        const requestedStatus = req.body.status;

        // Privilege escalation check
        if (requestedRole === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "You cannot promote an account to Super Admin." });
        }

        if (id === req.user.id && requestedRole && requestedRole !== req.user.role) {
            return res.status(400).json({ message: "You cannot modify your own role." });
        }
        if (id === req.user.id && requestedStatus && requestedStatus !== "active") {
            return res.status(400).json({ message: "You cannot deactivate or suspend your own account." });
        }

        const updates = [];
        const values = [];
        let pIdx = 1;

        if (email !== undefined) {
            updates.push(`email = $${pIdx}`);
            values.push(email);
            pIdx++;
        }
        if (fullName !== undefined) {
            updates.push(`full_name = $${pIdx}`);
            values.push(fullName);
            pIdx++;
        }
        if (requestedRole && ["admin", "user", "superadmin"].includes(requestedRole)) {
            updates.push(`role = $${pIdx}`);
            values.push(requestedRole);
            pIdx++;
        }
        if (requestedStatus && ["active", "inactive", "suspended"].includes(requestedStatus)) {
            updates.push(`status = $${pIdx}`);
            values.push(requestedStatus);
            pIdx++;
            updates.push(`is_banned = $${pIdx}`);
            values.push(requestedStatus === "suspended");
            pIdx++;
        }

        if (updates.length === 0) {
            return res.json({ message: "No changes specified", user: publicUser(target) });
        }

        values.push(id);
        const updateQuery = `UPDATE users SET ${updates.join(", ")}, permissions_updated_at = NOW() WHERE id = $${pIdx} RETURNING id, username, email, full_name, role, status, is_banned, created_at`;

        const updateRes = await pool.query(updateQuery, values);
        const updated = updateRes.rows[0];

        // If deactivated or suspended, kill all remote active sessions immediately
        if (updated.status !== "active") {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [id]);
        }

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "USER_UPDATED",
            targetType: "user",
            targetId: id,
            details: { previous: target, updated: publicUser(updated) },
            ipAddress: req.ip
        });

        res.json({ message: "User updated successfully", user: publicUser(updated) });
    } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({ message: "Failed to update user profile" });
    }
});

app.patch("/api/users/:id/password", requireAuth, requirePermission("user_management", "edit"), async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        const password = String(req.body.password || "");

        if (!id) return res.status(400).json({ message: "Invalid user ID" });
        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({ message: "Password must be at least 12 characters long" });
        }

        const targetRes = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [id]);
        const target = targetRes.rows[0];
        if (!target) return res.status(404).json({ message: "User not found" });

        if (target.role === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "Only a Super Admin can reset a Super Admin's password." });
        }

        const hash = await hashPassword(password);
        await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, id]);

        // Terminate existing sessions to enforce re-authentication with new password
        if (id === req.user.id) {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1 AND token_hash <> $2", [id, req.tokenHash]);
        } else {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [id]);
        }

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "PASSWORD_RESET",
            targetType: "user",
            targetId: id,
            details: { username: target.username },
            ipAddress: req.ip
        });

        res.json({ message: `Password reset successfully for account "${target.username}". Remote sessions invalidated.` });
    } catch (error) {
        console.error("Reset password error:", error);
        res.status(500).json({ message: "Failed to reset password" });
    }
});

app.patch("/api/users/:id/status", requireAuth, requirePermission("user_management", "manage_status"), async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        const newStatus = String(req.body.status || "").toLowerCase();

        if (!id) return res.status(400).json({ message: "Invalid user ID" });
        if (!["active", "inactive", "suspended"].includes(newStatus)) {
            return res.status(400).json({ message: "Status must be 'active', 'inactive', or 'suspended'" });
        }

        if (id === req.user.id) {
            return res.status(400).json({ message: "You cannot change your own account status." });
        }

        const targetRes = await pool.query("SELECT id, username, role, status FROM users WHERE id = $1", [id]);
        const target = targetRes.rows[0];
        if (!target) return res.status(404).json({ message: "User not found" });

        if (target.role === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "Only a Super Admin can change a Super Admin's account status." });
        }

        const isBanned = newStatus === "suspended";
        await pool.query(
            "UPDATE users SET status = $1, is_banned = $2 WHERE id = $3",
            [newStatus, isBanned, id]
        );

        if (newStatus !== "active") {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [id]);
        }

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "STATUS_CHANGED",
            targetType: "user",
            targetId: id,
            details: { previousStatus: target.status, newStatus },
            ipAddress: req.ip
        });

        res.json({
            message: `Account status updated to '${newStatus}' for ${target.username}.`,
            status: newStatus
        });
    } catch (error) {
        console.error("Status update error:", error);
        res.status(500).json({ message: "Failed to update account status" });
    }
});

app.delete("/api/users/:id", requireAuth, requirePermission("user_management", "delete"), async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid user ID" });

        if (id === req.user.id) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }

        const targetRes = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [id]);
        const target = targetRes.rows[0];
        if (!target) return res.status(404).json({ message: "User not found" });

        if (target.role === "superadmin" && req.user.role !== "superadmin") {
            return res.status(403).json({ message: "Only a Super Admin can delete a Super Admin account." });
        }

        await pool.query("DELETE FROM users WHERE id = $1", [id]);

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "USER_DELETED",
            targetType: "user",
            targetId: id,
            details: { username: target.username, role: target.role },
            ipAddress: req.ip
        });

        res.json({ message: `Account "${target.username}" has been permanently removed.` });
    } catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ message: "Failed to delete user" });
    }
});

app.post("/api/users/:id/logout", requireAuth, requirePermission("user_management", "manage_status"), async (req, res) => {
    try {
        const id = parseUserId(req.params.id);
        if (!id) return res.status(400).json({ message: "Invalid user ID" });

        if (id === req.user.id) {
            return res.status(400).json({ message: "Use the Sign Out button to terminate your current session." });
        }

        const exists = await pool.query("SELECT id, username FROM users WHERE id = $1", [id]);
        if (!exists.rows[0]) return res.status(404).json({ message: "User not found" });

        const result = await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [id]);

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "SESSIONS_TERMINATED",
            targetType: "user",
            targetId: id,
            details: { sessionsCount: result.rowCount },
            ipAddress: req.ip
        });

        res.json({
            message: `Remote sessions successfully terminated for ${exists.rows[0].username}.`,
            sessions_terminated: result.rowCount
        });
    } catch (error) {
        console.error("Terminate sessions error:", error);
        res.status(500).json({ message: "Failed to terminate remote sessions" });
    }
});

// ------------------------------------
// FEATURE PERMISSION MANAGEMENT
// ------------------------------------

app.get("/api/permissions/:userId", requireAuth, requirePermission("permission_management", "view"), async (req, res) => {
    try {
        const userId = parseUserId(req.params.userId);
        if (!userId) return res.status(400).json({ message: "Invalid user ID" });

        const userRes = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [userId]);
        const targetUser = userRes.rows[0];
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        const permissions = await getUserPermissions(userId, targetUser.role);

        res.json({
            user: { id: targetUser.id, username: targetUser.username, role: targetUser.role },
            permissions
        });
    } catch (error) {
        console.error("Get user permissions error:", error);
        res.status(500).json({ message: "Failed to load permissions" });
    }
});

app.put("/api/permissions/:userId", requireAuth, requirePermission("permission_management", "edit"), async (req, res) => {
    try {
        const userId = parseUserId(req.params.userId);
        if (!userId) return res.status(400).json({ message: "Invalid user ID" });

        const targetRes = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [userId]);
        const targetUser = targetRes.rows[0];
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (targetUser.role === "superadmin") {
            return res.status(400).json({ message: "Super Admin accounts have full universal permissions and cannot have permissions restricted." });
        }

        const requestedPermissions = req.body.permissions || {};

        // Security check: non-superadmins cannot grant permissions they don't possess
        if (req.user.role !== "superadmin") {
            const myPermissions = await getUserPermissions(req.user.id, req.user.role);
            for (const [mod, actions] of Object.entries(requestedPermissions)) {
                for (const [act, allowed] of Object.entries(actions || {})) {
                    if (allowed && (!myPermissions[mod] || !myPermissions[mod][act])) {
                        return res.status(403).json({
                            message: `Privilege escalation blocked: You cannot grant '${mod}:${act}' because you do not possess this permission yourself.`
                        });
                    }
                }
            }
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Clear previous assigned permissions
            await client.query("DELETE FROM user_permissions WHERE user_id = $1", [userId]);

            let grantedCount = 0;
            for (const [modKey, actions] of Object.entries(requestedPermissions)) {
                if (typeof actions === "object" && actions !== null) {
                    for (const [actName, isAllowed] of Object.entries(actions)) {
                        if (isAllowed === true) {
                            await client.query(
                                `INSERT INTO user_permissions (user_id, module, action, is_allowed, granted_by)
                                 VALUES ($1, $2, $3, TRUE, $4)
                                 ON CONFLICT (user_id, module, action) DO UPDATE SET is_allowed = TRUE, granted_at = NOW()`,
                                [userId, modKey, actName, req.user.id]
                            );
                            grantedCount++;
                        }
                    }
                }
            }

            await client.query("UPDATE users SET permissions_updated_at = NOW() WHERE id = $1", [userId]);
            await client.query("COMMIT");

            await logAuditEvent({
                actorId: req.user.id,
                actorUsername: req.user.username,
                action: "PERMISSIONS_UPDATED",
                targetType: "user",
                targetId: userId,
                details: { targetUsername: targetUser.username, grantedCount },
                ipAddress: req.ip
            });

            const freshPermissions = await getUserPermissions(userId, targetUser.role);

            res.json({
                message: `Permissions updated successfully for ${targetUser.username} (${grantedCount} operations granted).`,
                permissions: freshPermissions
            });
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Save permissions error:", error);
        res.status(500).json({ message: "Failed to update permissions" });
    }
});

// ------------------------------------
// AUDIT LOGS & METRICS
// ------------------------------------

app.get("/api/audit-logs", requireAuth, requirePermission("audit_logs", "view"), async (req, res) => {
    try {
        const rawLimit = Number(req.query.limit) || 50;
        const limit = Math.min(Math.max(1, rawLimit), 200);
        const { action, actor, target } = req.query;

        let query = `
            SELECT id, actor_id, actor_username, action, target_type, target_id, details, ip_address, created_at
            FROM audit_logs
            WHERE 1 = 1
        `;
        const values = [];
        let pIndex = 1;

        if (action && action.trim()) {
            query += ` AND action ILIKE $${pIndex}`;
            values.push(`%${action.trim()}%`);
            pIndex++;
        }
        if (actor && actor.trim()) {
            query += ` AND actor_username ILIKE $${pIndex}`;
            values.push(`%${actor.trim()}%`);
            pIndex++;
        }
        if (target && target.trim()) {
            query += ` AND (target_type ILIKE $${pIndex} OR target_id ILIKE $${pIndex})`;
            values.push(`%${target.trim()}%`);
            pIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${pIndex}`;
        values.push(limit);

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error("Get audit logs error:", error);
        res.status(500).json({ message: "Failed to load audit logs" });
    }
});

app.get("/api/admin/metrics", requireAuth, async (req, res) => {
    try {
        const userStats = await pool.query(`
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE status = 'active' AND is_banned = FALSE)::int AS active_users,
                COUNT(*) FILTER (WHERE status = 'inactive' OR is_banned = TRUE)::int AS inactive_users,
                COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
                COUNT(*) FILTER (WHERE role = 'superadmin')::int AS superadmins,
                COUNT(*) FILTER (WHERE role = 'user')::int AS operators
            FROM users
        `);

        const onlineStats = await pool.query(`
            SELECT COUNT(DISTINCT user_id)::int AS online_users
            FROM active_sessions
            WHERE last_activity_at > NOW() - INTERVAL '5 minutes'
        `);

        const recordsStats = await pool.query("SELECT COUNT(*)::int AS total_records FROM records");
        const auditStats = await pool.query("SELECT COUNT(*)::int AS total_audit_events FROM audit_logs");
        const pendingReset = await pool.query("SELECT COUNT(*)::int AS pending_resets FROM password_reset_requests WHERE status = 'pending'");

        res.json({
            users: {
                ...userStats.rows[0],
                online_users: onlineStats.rows[0].online_users
            },
            total_records: recordsStats.rows[0].total_records,
            total_audit_events: auditStats.rows[0].total_audit_events,
            pending_resets: pendingReset.rows[0].pending_resets
        });
    } catch (error) {
        console.error("Admin metrics error:", error);
        res.status(500).json({ message: "Failed to load admin metrics" });
    }
});

app.get("/api/admin/password-requests", requireAuth, requirePermission("user_management", "edit"), async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT pr.id, pr.username_or_email, pr.user_id, pr.requested_at, pr.status, pr.notes, pr.ip_address,
                   u.username, u.role
            FROM password_reset_requests pr
            LEFT JOIN users u ON u.id = pr.user_id
            WHERE pr.status = 'pending'
            ORDER BY pr.requested_at DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error("Get password requests error:", error);
        res.status(500).json({ message: "Failed to load password requests" });
    }
});

app.patch("/api/admin/password-requests/:id", requireAuth, requirePermission("user_management", "edit"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const status = req.body.status === "dismissed" ? "dismissed" : "resolved";

        await pool.query(
            "UPDATE password_reset_requests SET status = $1 WHERE id = $2",
            [status, id]
        );
        res.json({ message: `Password request marked as ${status}` });
    } catch (error) {
        console.error("Update password request error:", error);
        res.status(500).json({ message: "Failed to update request" });
    }
});

// ------------------------------------
// RECORD APIs - GRANULAR PERMISSIONS ENFORCED
// ------------------------------------

app.get("/api/data", requireAuth, requirePermission("records", "view"), async (req, res) => {
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
        res.status(500).json({ message: "Failed to fetch records" });
    }
});

app.get("/api/data/search", requireAuth, requirePermission("records", "search"), async (req, res) => {
    try {
        const { heading, uid, customer_name, record_date } = req.query;

        if (!heading && !uid && !customer_name && !record_date) {
            return res.status(400).json({ message: "Please provide at least one search field" });
        }

        let query = "SELECT * FROM records WHERE 1 = 1";
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

        query += " ORDER BY record_date DESC, record_time DESC";

        const result = await pool.query(query, values);
        res.json(result.rows);
    } catch (error) {
        console.error("Error searching records:", error);
        res.status(500).json({ message: "Failed to search records" });
    }
});

app.get("/api/data/last-7-days", requireAuth, requirePermission("shift_analytics", "view"), async (_req, res) => {
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
        res.status(500).json({ message: "Failed to fetch last 7 days summary" });
    }
});

app.get("/api/data/date-summary", requireAuth, requirePermission("shift_analytics", "view"), async (req, res) => {
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

app.patch("/api/data", requireAuth, requirePermission("records", "edit"), async (req, res) => {
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

        const sameLogicalKey =
            requestedHeading.toUpperCase() === String(originalRow.heading).toUpperCase() &&
            requestedCustomer.toUpperCase() === String(originalRow.customer_name).toUpperCase() &&
            requestedUid.toUpperCase() === String(originalRow.uid).toUpperCase();

        const nextHeading = sameLogicalKey ? originalRow.heading : requestedHeading.toUpperCase();
        const nextCustomer = sameLogicalKey ? originalRow.customer_name : requestedCustomer.toUpperCase();
        const nextUid = sameLogicalKey ? originalRow.uid : requestedUid.toUpperCase();

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

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "RECORD_EDITED",
            targetType: "record",
            targetId: `${nextHeading}|${nextCustomer}|${nextUid}`,
            details: { heading: nextHeading, customer: nextCustomer, uid: nextUid },
            ipAddress: req.ip
        });

        res.json({ message: "Record updated successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error updating record:", error);
        if (error.code === "23505") {
            return res.status(409).json({ message: "Another record already uses this Heading, Customer Name and UID combination" });
        }
        res.status(500).json({ message: "Failed to update record" });
    }
});

app.delete("/api/data", requireAuth, requirePermission("records", "delete"), async (req, res) => {
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

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "RECORD_DELETED",
            targetType: "record",
            targetId: `${heading}|${customer_name}|${uid}`,
            details: { heading, customer_name, uid },
            ipAddress: req.ip
        });

        res.json({ message: "Record deleted successfully", data: result.rows[0] });
    } catch (error) {
        console.error("Error deleting record:", error);
        res.status(500).json({ message: "Failed to delete record" });
    }
});

app.post("/api/data", requireAuth, requirePermission("records", "create"), async (req, res) => {
    try {
        const {
            uid, heading, customer_name, record_date, record_time,
            loc1, loc2, loc3, loc4, loc5, loc6,
            loc7, loc8, loc9, loc10, loc11, loc12
        } = req.body;

        if (!uid || !heading || !customer_name) {
            return res.status(400).json({ message: "UID, Heading, and Customer name are required" });
        }

        const headingUpper = heading.trim().toUpperCase();
        const customerUpper = customer_name.trim().toUpperCase();
        const uidUpper = uid.trim().toUpperCase();

        const query = `
            INSERT INTO records (
                heading, customer_name, uid, record_date, record_time,
                loc1, loc2, loc3, loc4, loc5, loc6,
                loc7, loc8, loc9, loc10, loc11, loc12
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17
            )
            RETURNING *
        `;

        const values = [
            headingUpper, customerUpper, uidUpper, record_date, record_time,
            loc1, loc2, loc3, loc4, loc5, loc6,
            loc7, loc8, loc9, loc10, loc11, loc12
        ];

        const result = await pool.query(query, values);

        if (result.rowCount !== 1 || !result.rows[0]) {
            console.error("Record INSERT returned no row.");
            return res.status(500).json({ message: "Record was not saved to the database" });
        }

        const savedRecord = result.rows[0];

        await logAuditEvent({
            actorId: req.user.id,
            actorUsername: req.user.username,
            action: "RECORD_CREATED",
            targetType: "record",
            targetId: `${headingUpper}|${customerUpper}|${uidUpper}`,
            details: { heading: headingUpper, customer_name: customerUpper, uid: uidUpper },
            ipAddress: req.ip
        });

        res.status(201).json({
            message: "Record created successfully",
            data: savedRecord
        });
    } catch (error) {
        console.error("Error creating record:", error);
        if (error.code === "23505") {
            return res.status(409).json({ message: "Heading, UID and Customer Name combination already exists" });
        }
        res.status(500).json({ message: "Failed to create record", error: error.message });
    }
});

if (fs.existsSync(distDir)) {
    app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
        res.sendFile(path.join(distDir, "index.html"));
    });
}

// ------------------------------------
// ERROR HANDLING
// ------------------------------------

app.use((error, _req, res, _next) => {
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
        console.log("✅ Authentication & RBAC tables ready");

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`🚀 Legion Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
