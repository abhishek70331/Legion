// Helpers for showing subscription information.
//
// The API sends calendar dates as "YYYY-MM-DD" strings (already resolved in the
// business time zone). They are formatted by splitting the string rather than
// via `new Date("YYYY-MM-DD")`, so the shown date can never shift by a day
// because of the viewer's own time zone.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(dateString) {
    const [y, m, d] = dateString.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
}

// "28 Oct 2026" or, with weekday, "Wed, 28 Oct 2026"
export function formatDate(dateString, { weekday = false } = {}) {
    if (!dateString) return "—";
    const [y, m, d] = dateString.split("-").map(Number);
    const base = `${d} ${MONTHS[m - 1]} ${y}`;
    return weekday ? `${WEEKDAYS[new Date(toUtcMs(dateString)).getUTCDay()]}, ${base}` : base;
}

export function addDaysToDate(dateString, days) {
    return new Date(toUtcMs(dateString) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromDate, toDate) {
    return Math.round((toUtcMs(toDate) - toUtcMs(fromDate)) / DAY_MS);
}

// Today's date in the viewer's own zone; only a fallback until the server's
// business-zone date is known.
export function localToday() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function formatDateTime(value) {
    if (!value) return "—";
    return new Date(value).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

export function formatRelative(value) {
    if (!value) return "Never";
    const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
    if (seconds < 60) return "Just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return formatDateTime(value);
}

export const STATE_LABELS = {
    active: "Active",
    expiring: "Expiring soon",
    expired: "Expired",
    unlimited: "No expiry"
};

// "23 days left", "Expires tomorrow", "Expired 3 days ago" ...
export function daysLeftText(subscription) {
    if (!subscription || subscription.state === "unlimited") return "No expiry date";

    const days = subscription.days_remaining;

    if (subscription.state === "expired") {
        const ago = Math.abs(days);
        if (ago <= 0) return "Expired today";
        if (ago === 1) return "Expired yesterday";
        return `Expired ${ago} days ago`;
    }

    if (days === 0) return "Expires today";
    if (days === 1) return "Expires tomorrow";
    return `${days} days left`;
}

// The date the user is able to use the system until, e.g. "Wed, 28 Oct 2026".
export function validUntilText(subscription, options) {
    if (!subscription || subscription.state === "unlimited" || !subscription.expires_on) {
        return "No expiry";
    }
    return formatDate(subscription.expires_on, options);
}
