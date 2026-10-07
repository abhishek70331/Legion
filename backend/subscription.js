// Subscription rules for Legion.
//
// A subscription is granted "until a calendar date" (inclusive). Internally the
// database stores the exact instant access stops: the start of the NEXT day in
// the business time zone. Example: "valid until 28 Oct 2026" is stored as
// 29 Oct 2026 00:00 (Asia/Kolkata), so the user keeps access for all of 28 Oct.
//
// Admin accounts never expire.

const pool = require("./db");

const TIMEZONE = process.env.SUBSCRIPTION_TIMEZONE || "Asia/Kolkata";
const EXPIRING_SOON_DAYS = 7;
const MAX_YEARS_AHEAD = 10;
const MAX_EXTEND_DAYS = 3660;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fail fast on a misspelled time zone instead of producing wrong dates.
try {
    new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE });
} catch {
    throw new Error(`Invalid SUBSCRIPTION_TIMEZONE: "${TIMEZONE}"`);
}

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

// "YYYY-MM-DD" for the given instant, as seen in the business time zone.
function dateInZone(instant = new Date()) {
    return dateFormatter.format(instant);
}

function dateToUtcMs(dateString) {
    const [y, m, d] = dateString.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}

function addDays(dateString, days) {
    return new Date(dateToUtcMs(dateString) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
    return Math.round((dateToUtcMs(toDate) - dateToUtcMs(fromDate)) / DAY_MS);
}

function isValidDateString(value) {
    if (typeof value !== "string" || !DATE_RE.test(value)) return false;
    return new Date(dateToUtcMs(value)).toISOString().slice(0, 10) === value;
}

// Turns "YYYY-MM-DD" into the instant access stops (start of the next day in
// the business time zone). The conversion is done by PostgreSQL so DST/offset
// rules are always correct.
async function expiryInstantFor(dateString, db = pool) {
    const result = await db.query(
        "SELECT (($1::date + 1)::timestamp AT TIME ZONE $2::text) AS instant",
        [dateString, TIMEZONE]
    );
    return result.rows[0].instant;
}

// Public description of a user's subscription, used by every API response.
function describeSubscription(row, now = new Date()) {
    const today = dateInZone(now);
    const base = { today, timezone: TIMEZONE };

    if (!row || row.role === "admin" || !row.subscription_expires_at) {
        return {
            ...base,
            state: "unlimited",
            expires_at: null,
            expires_on: null,
            days_remaining: null
        };
    }

    const expiresAt = new Date(row.subscription_expires_at);
    // Last day on which the user still has access.
    const expiresOn = dateInZone(new Date(expiresAt.getTime() - 1000));
    const daysRemaining = daysBetween(today, expiresOn);

    let state = "active";
    if (now >= expiresAt) state = "expired";
    else if (daysRemaining <= EXPIRING_SOON_DAYS) state = "expiring";

    return {
        ...base,
        state,
        expires_at: expiresAt.toISOString(),
        expires_on: expiresOn,
        days_remaining: daysRemaining
    };
}

function isExpired(row, now = new Date()) {
    return describeSubscription(row, now).state === "expired";
}

// Validates a date chosen by an admin. Returns an error message or null.
function validateExpiryDate(dateString, { allowPast = false } = {}) {
    if (!isValidDateString(dateString)) {
        return "Subscription date must be a valid date (YYYY-MM-DD)";
    }

    const today = dateInZone();
    if (!allowPast && dateString < today) {
        return "Subscription date cannot be in the past";
    }

    const maxDate = addDays(today, MAX_YEARS_AHEAD * 366);
    if (dateString > maxDate) {
        return `Subscription date cannot be more than ${MAX_YEARS_AHEAD} years ahead`;
    }

    return null;
}

module.exports = {
    TIMEZONE,
    EXPIRING_SOON_DAYS,
    MAX_EXTEND_DAYS,
    dateInZone,
    addDays,
    daysBetween,
    isValidDateString,
    expiryInstantFor,
    describeSubscription,
    isExpired,
    validateExpiryDate
};
