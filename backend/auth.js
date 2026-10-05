const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = require("./db");
const { describeSubscription } = require("./subscription");

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

// How often (at most) a session's "last seen" time is written to the database.
const ACTIVITY_TOUCH_SECONDS = 60;

function reject(res, code, message) {
    return res.status(401).json({ code, message });
}

// Validates the JWT AND the server-side session on every request. A signed
// token alone is not enough: the matching row in active_sessions must still
// exist, so "Logout", "Force logout" and "Ban" take effect immediately instead
// of waiting for the JWT to expire. Subscription expiry is enforced the same way.
async function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return reject(res, "AUTH_REQUIRED", "Authentication required");
    }

    const token = header.slice(7);
    let payload;

    try {
        payload = jwt.verify(token, JWT_SECRET, {
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        });
    } catch (error) {
        return reject(res, "TOKEN_INVALID", "Your login session has expired. Please sign in again.");
    }

    try {
        const tokenHash = hashToken(token);
        const result = await pool.query(
            `SELECT u.id, u.username, u.role, u.is_banned, u.subscription_expires_at,
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
            return reject(res, "USER_NOT_FOUND", "This account no longer exists.");
        }

        if (row.is_banned) {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [row.id]);
            return reject(res, "ACCOUNT_BANNED", "Your account has been banned. Please contact an administrator.");
        }

        if (!row.session_id) {
            return reject(res, "SESSION_ENDED", "You were signed out by an administrator. Please sign in again.");
        }

        const subscription = describeSubscription(row);
        if (subscription.state === "expired") {
            await pool.query("DELETE FROM active_sessions WHERE user_id = $1", [row.id]);
            return reject(
                res,
                "SUBSCRIPTION_EXPIRED",
                "Your subscription has expired. Please contact an administrator to renew."
            );
        }

        if (row.needs_touch) {
            // Fire-and-forget: a failed "last seen" update must not fail the request.
            pool.query(
                "UPDATE active_sessions SET last_activity_at = NOW() WHERE id = $1",
                [row.session_id]
            ).catch((error) => console.error("Session touch error:", error.message));
        }

        req.user = {
            id: row.id,
            username: row.username,
            role: row.role,
            subscription_expires_at: row.subscription_expires_at
        };
        req.token = token;
        req.tokenHash = tokenHash;
        next();
    } catch (error) {
        console.error("Session validation error:", error);
        return res.status(500).json({ message: "Failed to verify your login session" });
    }
}

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
}

module.exports = {
    hashPassword,
    comparePassword,
    createToken,
    hashToken,
    requireAuth,
    requireAdmin
};
