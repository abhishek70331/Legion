const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long.");
}

const TOKEN_EXPIRES_IN = "8h";
const JWT_ISSUER = "legion-api";
const JWT_AUDIENCE = "legion-frontend";

function hashPassword(password) {
    return bcrypt.hash(password, 12);
}

function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function createToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        JWT_SECRET,
        {
            expiresIn: TOKEN_EXPIRES_IN,
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        }
    );
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

const ACTIVITY_TOUCH_SECONDS = 60;

function reject(res, status, code, message) {
    return res.status(status).json({ code, message });
}

/**
 * Fetch full permission matrix for a user.
 * Super Admin gets universal access.
 */
async function getUserPermissions(userId, role) {
    if (role === "superadmin") {
        const modulesRes = await pool.query("SELECT module_key, supported_actions FROM modules");
        const map = { isSuperAdmin: true };
        for (const m of modulesRes.rows) {
            map[m.module_key] = {};
            for (const act of m.supported_actions) {
                map[m.module_key][act] = true;
            }
        }
        return map;
    }

    const result = await pool.query(
        `SELECT module, action, is_allowed 
         FROM user_permissions 
         WHERE user_id = $1 AND is_allowed = TRUE`,
        [userId]
    );

    const map = { isSuperAdmin: false };
    for (const row of result.rows) {
        if (!map[row.module]) {
            map[row.module] = {};
        }
        map[row.module][row.action] = true;
    }

    return map;
}

/**
 * Authenticates the user via JWT & active_sessions check.
 */
async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return reject(res, 401, "AUTH_REQUIRED", "Authentication required");
    }

    const token = header.slice(7);
    let payload;

    try {
        payload = jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
    } catch (error) {
        return reject(res, 401, "TOKEN_INVALID", "Your login session has expired. Please sign in again.");
    }

    try {
        const tokenHash = hashToken(token);
        const result = await pool.query(
            `SELECT u.id, u.username, u.email, u.full_name, u.role, u.status, u.is_banned,
                    s.id AS session_id,
                    (s.last_activity_at < NOW() - make_interval(secs => $3)) AS needs_touch
             FROM users u
             LEFT JOIN active_sessions s
                    ON s.user_id = u.id AND s.token_hash = $2
             WHERE u.id = $1`,
            [payload.id, tokenHash, ACTIVITY_TOUCH_SECONDS]
        );

        const row = result.rows[0];

        if (!row) {
            return reject(res, 401, "USER_NOT_FOUND", "This account no longer exists.");
        }

        if (row.is_banned || row.status === "suspended") {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [row.id]);
            return reject(res, 403, "ACCOUNT_BANNED", "Your account has been suspended. Please contact a Super Administrator.");
        }

        if (row.status === "inactive") {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [row.id]);
            return reject(res, 403, "ACCOUNT_INACTIVE", "Your account is deactivated. Please contact an administrator.");
        }

        if (!row.session_id) {
            return reject(res, 401, "SESSION_ENDED", "You were signed out from this workstation or by an administrator. Please sign in again.");
        }

        if (row.needs_touch) {
            pool.query(
                "UPDATE active_sessions SET last_activity_at = NOW() WHERE id = $1",
                [row.session_id]
            ).catch((error) => console.error("Session touch error:", error.message));
        }

        req.user = {
            id: row.id,
            username: row.username,
            email: row.email,
            full_name: row.full_name,
            role: row.role,
            status: row.status
        };
        req.token = token;
        req.tokenHash = tokenHash;
        next();
    } catch (error) {
        console.error("Session validation error:", error);
        return res.status(500).json({ message: "Failed to verify your login session" });
    }
}

/**
 * Middleware: Enforces that the logged-in user has the specific module & action permission,
 * OR has role === 'superadmin'.
 */
function requirePermission(module, action) {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return reject(res, 401, "AUTH_REQUIRED", "Authentication required");
            }

            // Super Admin always bypasses specific permission checks
            if (req.user.role === "superadmin") {
                return next();
            }

            const permRes = await pool.query(
                `SELECT 1 FROM user_permissions 
                 WHERE user_id = $1 AND module = $2 AND action = $3 AND is_allowed = TRUE`,
                [req.user.id, module, action]
            );

            if (permRes.rowCount === 0) {
                return res.status(403).json({
                    code: "PERMISSION_DENIED",
                    message: `Access Denied: You do not have permission to perform '${action}' on '${module}'. Please contact a Super Administrator.`
                });
            }

            next();
        } catch (error) {
            console.error(`Permission check error (${module}:${action}):`, error);
            res.status(500).json({ message: "Failed to verify user permissions" });
        }
    };
}

/**
 * Middleware: requires admin or superadmin
 */
async function requireAdminFresh(req, res, next) {
    try {
        const result = await pool.query(
            "SELECT id, username, role, status, is_banned FROM users WHERE id = $1",
            [req.user?.id]
        );

        const currentUser = result.rows[0];
        if (!currentUser) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        if (currentUser.is_banned || currentUser.status !== "active") {
            return res.status(403).json({ message: "Account is not active" });
        }

        if (!["admin", "superadmin"].includes(currentUser.role)) {
            return res.status(403).json({ message: "Administrator access required" });
        }

        req.user = { ...req.user, ...currentUser };
        next();
    } catch (error) {
        console.error("Admin authorization check error:", error);
        return res.status(500).json({ message: "Failed to verify admin access" });
    }
}

/**
 * Middleware: requires superadmin
 */
async function requireSuperAdminFresh(req, res, next) {
    try {
        const result = await pool.query(
            "SELECT id, username, role, status, is_banned FROM users WHERE id = $1",
            [req.user?.id]
        );

        const currentUser = result.rows[0];
        if (!currentUser) {
            return res.status(401).json({ message: "User no longer exists" });
        }

        if (currentUser.is_banned || currentUser.status !== "active") {
            return res.status(403).json({ message: "Account is not active" });
        }

        if (currentUser.role !== "superadmin") {
            return res.status(403).json({ message: "Super Admin privileges required" });
        }

        req.user = { ...req.user, ...currentUser };
        next();
    } catch (error) {
        console.error("Super Admin authorization check error:", error);
        return res.status(500).json({ message: "Failed to verify Super Admin access" });
    }
}

/**
 * Records an entry into the audit_logs table.
 */
async function logAuditEvent({ actorId = null, actorUsername = null, action, targetType = null, targetId = null, details = null, ipAddress = null }) {
    try {
        await pool.query(
            `INSERT INTO audit_logs 
                (actor_id, actor_username, action, target_type, target_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                actorId,
                actorUsername,
                action,
                targetType,
                targetId ? String(targetId) : null,
                details ? JSON.stringify(details) : null,
                ipAddress
            ]
        );
    } catch (err) {
        console.error("Failed to write audit log:", err.message);
    }
}

module.exports = {
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
};
