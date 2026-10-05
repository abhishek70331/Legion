// Lightweight in-memory abuse protection for the login endpoint.
// This intentionally uses no extra dependency. It is effective per backend
// instance; for multi-instance deployments, use a shared store such as Redis.

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_PER_ACCOUNT = 30;
const MAX_FAILURES_PER_IP_ACCOUNT = 5;

const attempts = new Map();

function now() {
    return Date.now();
}

function getEntry(key) {
    const current = attempts.get(key);
    if (!current) {
        return { failures: 0, firstFailureAt: now(), blockedUntil: 0 };
    }

    if (current.blockedUntil > now()) {
        return current;
    }

    if (now() - current.firstFailureAt > WINDOW_MS) {
        return { failures: 0, firstFailureAt: now(), blockedUntil: 0 };
    }

    return current;
}

function isBlocked(keys) {
    let blockedUntil = 0;

    for (const key of keys) {
        const entry = getEntry(key);
        blockedUntil = Math.max(blockedUntil, entry.blockedUntil || 0);
    }

    return blockedUntil > now() ? blockedUntil : 0;
}

function recordFailure(key, maxFailures) {
    const timestamp = now();
    const entry = getEntry(key);

    entry.failures += 1;
    if (entry.failures >= maxFailures) {
        entry.blockedUntil = timestamp + BLOCK_MS;
    }

    attempts.set(key, entry);
}

function recordLoginFailure({ ip, username }) {
    const normalizedUsername = String(username || "").trim().toLowerCase();
    recordFailure(`ip:${ip}`, MAX_FAILURES_PER_IP);

    if (normalizedUsername) {
        recordFailure(`account:${normalizedUsername}`, MAX_FAILURES_PER_ACCOUNT);
        recordFailure(`ip-account:${ip}:${normalizedUsername}`, MAX_FAILURES_PER_IP_ACCOUNT);
    }
}

function clearSuccessfulLogin({ ip, username }) {
    const normalizedUsername = String(username || "").trim().toLowerCase();

    // Do not clear the IP-wide counter: it protects against attackers cycling
    // through usernames. Clear only the account-specific counters after success.
    if (normalizedUsername) {
        attempts.delete(`account:${normalizedUsername}`);
        attempts.delete(`ip-account:${ip}:${normalizedUsername}`);
    }
}

function loginRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const username = String(req.body?.username || "").trim().toLowerCase();
    const keys = [`ip:${ip}`];

    if (username) {
        keys.push(`account:${username}`, `ip-account:${ip}:${username}`);
    }

    const blockedUntil = isBlocked(keys);
    if (blockedUntil) {
        const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil - now()) / 1000));
        res.set("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
            message: "Too many login attempts. Please try again later."
        });
    }

    req.loginRateLimit = { ip, username };
    next();
}

function cleanupRateLimitStore() {
    const expiry = now() - WINDOW_MS;
    for (const [key, entry] of attempts) {
        if (entry.blockedUntil <= now() && entry.firstFailureAt < expiry) {
            attempts.delete(key);
        }
    }
}

setInterval(cleanupRateLimitStore, 5 * 60 * 1000).unref();

module.exports = {
    loginRateLimit,
    recordLoginFailure,
    clearSuccessfulLogin
};
