import { useCallback, useEffect, useMemo, useState } from "react";
import {
    banUser,
    createUser,
    deleteUser,
    getErrorMessage,
    getSubscriptionHistory,
    getUsers,
    logoutUser,
    resetUserPassword,
    updateUserSubscription
} from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import {
    STATE_LABELS,
    addDaysToDate,
    daysBetween,
    daysLeftText,
    formatDate,
    formatDateTime,
    formatRelative,
    localToday,
    validUntilText
} from "./subscriptionUtils.js";

const PLAN_PRESETS = [
    { key: "7", label: "7 days", days: 7 },
    { key: "30", label: "30 days", days: 30 },
    { key: "90", label: "90 days", days: 90 },
    { key: "365", label: "1 year", days: 365 }
];

const EXTEND_PRESETS = [
    { days: 7, label: "+7 days" },
    { days: 30, label: "+30 days" },
    { days: 90, label: "+90 days" },
    { days: 365, label: "+1 year" }
];

const FILTERS = [
    { key: "all", label: "All users" },
    { key: "active", label: "Active" },
    { key: "expiring", label: "Expiring soon" },
    { key: "expired", label: "Expired" },
    { key: "online", label: "Online now" },
    { key: "banned", label: "Banned" }
];

const HISTORY_ACTIONS = {
    granted: "Subscription granted",
    set: "End date set",
    extended: "Extended",
    removed: "Expiry removed"
};

const isUsable = (u) =>
    u.role !== "admin" && !u.is_banned && (u.subscription.state === "active" || u.subscription.state === "unlimited");

/* =========================================================
   Small building blocks
========================================================= */

function SubscriptionPill({ state, role }) {
    const effective = role === "admin" ? "unlimited" : state;
    const label = role === "admin" ? "Unlimited" : STATE_LABELS[effective];
    return <span className={`sub-pill sub-pill-${effective}`}>{label}</span>;
}

function StatCard({ label, value, tone = "neutral", hint }) {
    return (
        <div className={`stat-card stat-${tone}`}>
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
            {hint && <span className="stat-hint">{hint}</span>}
        </div>
    );
}

function Modal({ title, subtitle, onClose, children, footer, wide = false }) {
    useEffect(() => {
        const onKey = (event) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="record-modal-backdrop" onClick={onClose}>
            <div
                className={`subscription-modal${wide ? " subscription-modal-wide" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="record-modal-header">
                    <div>
                        <h2>{title}</h2>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="modal-body">{children}</div>
                {footer && <div className="record-modal-actions">{footer}</div>}
            </div>
        </div>
    );
}

function ConfirmDialog({ dialog, busy, onCancel, onConfirm }) {
    return (
        <Modal
            title={dialog.title}
            onClose={busy ? () => {} : onCancel}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={`btn ${dialog.tone === "danger" ? "btn-danger-solid" : "btn-primary"}`}
                        onClick={onConfirm}
                        disabled={busy}
                    >
                        {busy ? "Please wait…" : dialog.confirmLabel}
                    </button>
                </>
            }
        >
            <p className="confirm-text">{dialog.message}</p>
        </Modal>
    );
}

function PasswordDialog({ target, busy, error, onCancel, onSubmit }) {
    const [password, setPassword] = useState("");
    const [visible, setVisible] = useState(false);
    const tooShort = password.length > 0 && password.length < 12;

    return (
        <Modal
            title="Reset password"
            subtitle={`Set a new password for ${target.username}. They will be signed out of all devices.`}
            onClose={busy ? () => {} : onCancel}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onSubmit(password)}
                        disabled={busy || password.length < 12}
                    >
                        {busy ? "Saving…" : "Update password"}
                    </button>
                </>
            }
        >
            <div className="subscription-field">
                <label htmlFor="reset-password">
                    <span>New password</span>
                    <p className="field-help">At least 12 characters.</p>
                </label>
                <div className="password-row">
                    <input
                        id="reset-password"
                        type={visible ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                        autoFocus
                    />
                    <button type="button" className="btn btn-secondary small-btn" onClick={() => setVisible((v) => !v)}>
                        {visible ? "Hide" : "Show"}
                    </button>
                </div>
                {tooShort && <p className="field-error">Password must be at least 12 characters.</p>}
                {error && <p className="field-error">{error}</p>}
            </div>
        </Modal>
    );
}

/* =========================================================
   Subscription modal
========================================================= */

function SubscriptionModal({ target, today, onClose, onApply }) {
    const subscription = target.subscription;
    const isLive = subscription.state === "active" || subscription.state === "expiring";

    // pending: { mode: "extend", days } | { mode: "set", expires_on } | { mode: "remove" } | null
    const [pending, setPending] = useState(null);
    const [customDate, setCustomDate] = useState("");
    const [history, setHistory] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        getSubscriptionHistory(target.id)
            .then((rows) => !cancelled && setHistory(rows))
            .catch(() => !cancelled && setHistory([]));
        return () => {
            cancelled = true;
        };
    }, [target.id]);

    // Renewing early keeps the remaining time: extend from the current end date
    // when still valid, otherwise from today. (Matches the server's rule.)
    const extendBase = isLive ? subscription.expires_on : today;

    const preview = useMemo(() => {
        if (!pending) return null;
        if (pending.mode === "remove") {
            return { title: "No expiry", detail: "This user will keep access until you set a new end date." };
        }
        const endDate =
            pending.mode === "extend" ? addDaysToDate(extendBase, pending.days) : pending.expires_on;
        const left = daysBetween(today, endDate);
        const detail =
            left < 0
                ? "This date is in the past — the user will be signed out and blocked immediately."
                : left === 0
                    ? "Access ends at the end of today."
                    : `${left} day${left === 1 ? "" : "s"} from today.`;
        return { title: formatDate(endDate, { weekday: true }), detail, isPast: left < 0 };
    }, [pending, extendBase, today]);

    const apply = async () => {
        if (!pending) return;
        setSaving(true);
        setError("");
        try {
            await onApply(target, pending);
        } catch (err) {
            setError(getErrorMessage(err, "Failed to update subscription."));
            setSaving(false);
        }
    };

    return (
        <Modal
            wide
            title="Manage subscription"
            subtitle={`${target.username} · ${target.role === "admin" ? "Administrator" : "User"}`}
            onClose={saving ? () => {} : onClose}
            footer={
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className={`btn ${preview?.isPast || pending?.mode === "remove" ? "btn-danger-solid" : "btn-primary"}`}
                        onClick={apply}
                        disabled={!pending || saving}
                    >
                        {saving ? "Saving…" : pending?.mode === "remove" ? "Remove expiry" : "Save changes"}
                    </button>
                </>
            }
        >
            <div className="sub-current">
                <div>
                    <span className="sub-current-label">Current subscription</span>
                    <strong className="sub-current-date">
                        {subscription.state === "unlimited"
                            ? "No expiry date"
                            : `Valid until ${validUntilText(subscription, { weekday: true })}`}
                    </strong>
                    <span className="sub-current-left">{daysLeftText(subscription)}</span>
                </div>
                <SubscriptionPill state={subscription.state} role={target.role} />
            </div>

            <section className="sub-section">
                <h3>{isLive ? "Extend subscription" : "Renew subscription"}</h3>
                <p className="field-help">
                    {isLive
                        ? `Days are added to the current end date (${formatDate(subscription.expires_on)}), so no remaining time is lost.`
                        : "Days are counted from today."}
                </p>
                <div className="chip-row">
                    {EXTEND_PRESETS.map((preset) => {
                        const selected = pending?.mode === "extend" && pending.days === preset.days;
                        return (
                            <button
                                key={preset.days}
                                type="button"
                                className={`choice-chip${selected ? " choice-chip-selected" : ""}`}
                                onClick={() => {
                                    setCustomDate("");
                                    setPending({ mode: "extend", days: preset.days });
                                }}
                            >
                                <strong>{preset.label}</strong>
                                <span>→ {formatDate(addDaysToDate(extendBase, preset.days))}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="sub-section">
                <h3>Or choose an exact end date</h3>
                <div className="subscription-field">
                    <label htmlFor="subscription-date">
                        <span className="sr-only">Last day of access</span>
                    </label>
                    <input
                        id="subscription-date"
                        type="date"
                        value={customDate}
                        onChange={(event) => {
                            const value = event.target.value;
                            setCustomDate(value);
                            setPending(value ? { mode: "set", expires_on: value } : null);
                        }}
                    />
                    <p className="field-help">The user can sign in through the end of this day.</p>
                </div>
            </section>

            {preview && (
                <div className={`sub-preview${preview.isPast ? " sub-preview-warn" : ""}`}>
                    <span className="sub-preview-label">
                        {pending.mode === "remove" ? "Result" : "New end date"}
                    </span>
                    <strong>{preview.title}</strong>
                    <span>{preview.detail}</span>
                </div>
            )}

            {error && <p className="message message-error">{error}</p>}

            {subscription.state !== "unlimited" && target.role !== "admin" && (
                <button
                    type="button"
                    className="link-danger"
                    onClick={() => {
                        setCustomDate("");
                        setPending({ mode: "remove" });
                    }}
                >
                    Remove expiry date (give unlimited access)
                </button>
            )}

            <section className="sub-section">
                <h3>History</h3>
                {history === null ? (
                    <p className="field-help">Loading…</p>
                ) : history.length === 0 ? (
                    <p className="field-help">No subscription changes recorded yet.</p>
                ) : (
                    <ul className="history-list">
                        {history.map((event) => (
                            <li key={event.id}>
                                <div>
                                    <strong>{HISTORY_ACTIONS[event.action] || event.action}</strong>
                                    <span>
                                        {event.previous_expires_on ? formatDate(event.previous_expires_on) : "No expiry"}
                                        {" → "}
                                        {event.new_expires_on ? formatDate(event.new_expires_on) : "No expiry"}
                                    </span>
                                </div>
                                <time>
                                    {formatDateTime(event.created_at)}
                                    {event.changed_by ? ` · ${event.changed_by}` : ""}
                                </time>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </Modal>
    );
}

/* =========================================================
   Main component
========================================================= */

const EMPTY_FORM = { username: "", password: "", role: "user", plan: "30", customDate: "" };

export default function UserManagement() {
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";

    const [users, setUsers] = useState([]);
    const [meta, setMeta] = useState({ today: localToday(), timezone: "" });
    const [form, setForm] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [dialog, setDialog] = useState(null); // confirm | password | subscription
    const [busy, setBusy] = useState(false);
    const [dialogError, setDialogError] = useState("");

    const today = meta.today;

    const loadUsers = useCallback(async () => {
        try {
            const data = await getUsers();
            setUsers(data.users);
            setMeta(data.meta);
        } catch (error) {
            // 401s end the session globally; show other failures here.
            if (error?.response?.status !== 401) {
                setMessage({ type: "error", text: getErrorMessage(error, "Failed to load users.") });
            }
        }
    }, []);

    useEffect(() => {
        if (!isAdmin) return undefined;
        loadUsers();
        // Keep online status and expiry states fresh.
        const timer = setInterval(loadUsers, 30000);
        return () => clearInterval(timer);
    }, [isAdmin, loadUsers]);

    const stats = useMemo(() => {
        const regular = users.filter((u) => u.role !== "admin");
        return {
            total: users.length,
            active: regular.filter(isUsable).length,
            expiring: regular.filter((u) => u.subscription.state === "expiring").length,
            expired: regular.filter((u) => u.subscription.state === "expired").length,
            online: users.filter((u) => u.is_online).length
        };
    }, [users]);

    const visibleUsers = useMemo(() => {
        const term = search.trim().toLowerCase();
        return users.filter((u) => {
            if (term && !u.username.toLowerCase().includes(term)) return false;
            switch (filter) {
                case "active": return isUsable(u);
                case "expiring": return u.role !== "admin" && u.subscription.state === "expiring";
                case "expired": return u.role !== "admin" && u.subscription.state === "expired";
                case "online": return u.is_online;
                case "banned": return u.is_banned;
                default: return true;
            }
        });
    }, [users, search, filter]);

    if (!isAdmin) return null;

    const notify = (type, text) => setMessage({ type, text });
    const closeDialog = () => {
        setDialog(null);
        setDialogError("");
        setBusy(false);
    };

    /* ---------- add user ---------- */

    const planPreview = (() => {
        if (form.role === "admin") return "Administrators have unlimited access.";
        if (form.plan === "none") return "No expiry date — access continues until you set one.";
        if (form.plan === "custom") {
            return form.customDate
                ? `Access until ${formatDate(form.customDate, { weekday: true })}`
                : "Choose the last day of access.";
        }
        const preset = PLAN_PRESETS.find((p) => p.key === form.plan);
        return `Access until ${formatDate(addDaysToDate(today, preset.days), { weekday: true })}`;
    })();

    const addUser = async (event) => {
        event.preventDefault();
        setMessage({ type: "", text: "" });

        if (form.role === "user" && form.plan === "custom" && !form.customDate) {
            notify("error", "Please choose the subscription end date.");
            return;
        }

        const payload = { username: form.username.trim(), password: form.password, role: form.role };
        if (form.role === "user") {
            if (form.plan === "custom") payload.expires_on = form.customDate;
            else if (form.plan !== "none") payload.plan_days = Number(form.plan);
        }

        setCreating(true);
        try {
            const result = await createUser(payload);
            setForm(EMPTY_FORM);
            notify("success", result.message || "User created successfully.");
            await loadUsers();
        } catch (error) {
            notify("error", getErrorMessage(error, "Failed to create user."));
        } finally {
            setCreating(false);
        }
    };

    /* ---------- row actions ---------- */

    const runConfirmed = async (action, successText, failText) => {
        setBusy(true);
        try {
            const result = await action();
            notify("success", typeof successText === "function" ? successText(result) : successText);
            closeDialog();
            await loadUsers();
        } catch (error) {
            notify("error", getErrorMessage(error, failText));
            closeDialog();
        }
    };

    const askBan = (item) => {
        const unban = item.is_banned;
        setDialog({
            type: "confirm",
            title: unban ? `Unban ${item.username}?` : `Ban ${item.username}?`,
            message: unban
                ? "They will be able to sign in again (subject to their subscription)."
                : "They will be signed out immediately and blocked from signing in.",
            confirmLabel: unban ? "Unban user" : "Ban user",
            tone: unban ? "primary" : "danger",
            run: () => runConfirmed(
                () => banUser(item.id, !unban),
                `${item.username} was ${unban ? "unbanned" : "banned"}.`,
                `Failed to ${unban ? "unban" : "ban"} user.`
            )
        });
    };

    const askLogout = (item) => {
        setDialog({
            type: "confirm",
            title: `Sign out ${item.username}?`,
            message: "All of their active sessions end right away. They can sign in again with their password.",
            confirmLabel: "Sign out user",
            tone: "danger",
            run: () => runConfirmed(
                () => logoutUser(item.id),
                (result) => `${item.username} was signed out (${result.sessions_terminated} session${result.sessions_terminated === 1 ? "" : "s"} ended).`,
                "Failed to sign out user."
            )
        });
    };

    const askDelete = (item) => {
        setDialog({
            type: "confirm",
            title: `Delete ${item.username}?`,
            message: "This permanently removes the account and its subscription history. This cannot be undone.",
            confirmLabel: "Delete user",
            tone: "danger",
            run: () => runConfirmed(() => deleteUser(item.id), `${item.username} was deleted.`, "Failed to delete user.")
        });
    };

    const submitPassword = async (target, password) => {
        setBusy(true);
        setDialogError("");
        try {
            await resetUserPassword(target.id, password);
            notify("success", `Password updated for ${target.username}.`);
            closeDialog();
            await loadUsers();
        } catch (error) {
            setDialogError(getErrorMessage(error, "Failed to reset password."));
            setBusy(false);
        }
    };

    const applySubscription = async (target, pending) => {
        const payload = { mode: pending.mode };
        if (pending.mode === "extend") payload.days = pending.days;
        if (pending.mode === "set") payload.expires_on = pending.expires_on;

        // Throws on failure so the modal can show the error and stay open.
        const result = await updateUserSubscription(target.id, payload);
        notify("success", result.message || "Subscription updated.");
        closeDialog();
        await loadUsers();
    };

    /* ---------- render ---------- */

    return (
        <>
            <section className="panel user-panel">
                <div className="um-header">
                    <div>
                        <h2>Manage Users</h2>
                        <p className="um-subtitle">
                            Create accounts, manage subscriptions and control access.
                            {meta.timezone && <> Dates use the {meta.timezone} time zone.</>}
                        </p>
                    </div>
                </div>

                <div className="stat-grid">
                    <StatCard label="Total accounts" value={stats.total} />
                    <StatCard label="Active" value={stats.active} tone="good" hint="Valid subscription" />
                    <StatCard label="Expiring ≤ 7 days" value={stats.expiring} tone="warn" />
                    <StatCard label="Expired" value={stats.expired} tone="bad" />
                    <StatCard label="Online now" value={stats.online} tone="info" />
                </div>

                <form className="add-user-card" onSubmit={addUser}>
                    <h3>Add new user</h3>

                    <div className="add-user-grid">
                        <label className="field">
                            <span>Username</span>
                            <input
                                type="text"
                                placeholder="e.g. rahul.sharma"
                                value={form.username}
                                onChange={(e) => setForm({ ...form, username: e.target.value })}
                                autoComplete="off"
                                minLength={3}
                                required
                            />
                        </label>
                        <label className="field">
                            <span>Password</span>
                            <input
                                type="password"
                                placeholder="Minimum 12 characters"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                                autoComplete="new-password"
                                minLength={12}
                                required
                            />
                        </label>
                        <label className="field">
                            <span>Role</span>
                            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </label>
                    </div>

                    {form.role === "user" && (
                        <div className="plan-picker">
                            <span className="plan-picker-label">Subscription</span>
                            <div className="chip-row">
                                {PLAN_PRESETS.map((preset) => (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        className={`choice-chip${form.plan === preset.key ? " choice-chip-selected" : ""}`}
                                        onClick={() => setForm({ ...form, plan: preset.key })}
                                    >
                                        <strong>{preset.label}</strong>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    className={`choice-chip${form.plan === "custom" ? " choice-chip-selected" : ""}`}
                                    onClick={() => setForm({ ...form, plan: "custom" })}
                                >
                                    <strong>Custom date</strong>
                                </button>
                                <button
                                    type="button"
                                    className={`choice-chip${form.plan === "none" ? " choice-chip-selected" : ""}`}
                                    onClick={() => setForm({ ...form, plan: "none" })}
                                >
                                    <strong>No expiry</strong>
                                </button>
                            </div>
                            {form.plan === "custom" && (
                                <input
                                    type="date"
                                    className="plan-date-input"
                                    value={form.customDate}
                                    min={today}
                                    onChange={(e) => setForm({ ...form, customDate: e.target.value })}
                                    aria-label="Last day of access"
                                />
                            )}
                        </div>
                    )}

                    <div className="add-user-footer">
                        <p className="plan-summary">{planPreview}</p>
                        <button className="btn btn-primary" disabled={creating}>
                            {creating ? "Creating…" : "Create user"}
                        </button>
                    </div>
                </form>

                {message.text && (
                    <p className={`message message-${message.type}`} role="status">{message.text}</p>
                )}

                <div className="um-toolbar">
                    <input
                        type="search"
                        className="um-search"
                        placeholder="Search by username…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search users"
                    />
                    <div className="filter-row" role="tablist" aria-label="Filter users">
                        {FILTERS.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                role="tab"
                                aria-selected={filter === item.key}
                                className={`filter-chip${filter === item.key ? " filter-chip-selected" : ""}`}
                                onClick={() => setFilter(item.key)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="table-scroll user-table">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                <th>Account</th>
                                <th>Subscription</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleUsers.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="empty-row">No users match your search.</td>
                                </tr>
                            )}
                            {visibleUsers.map((item) => {
                                const sub = item.subscription;
                                const isSelf = item.id === user.id;
                                return (
                                    <tr key={item.id} className={item.is_banned ? "banned-user" : ""}>
                                        <td>
                                            <div className="user-cell">
                                                <span className="user-name">
                                                    {item.username}
                                                    {isSelf && <span className="you-tag">you</span>}
                                                </span>
                                                <span className="user-meta">
                                                    {item.is_online ? (
                                                        <><span className="online-dot" aria-hidden="true" />Online now</>
                                                    ) : (
                                                        <>Last active: {formatRelative(item.last_seen_at)}</>
                                                    )}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="cell-role">{item.role}</td>
                                        <td>
                                            {item.is_banned ? (
                                                <span className="status-badge status-banned">Banned</span>
                                            ) : (
                                                <span className="status-badge status-active">Enabled</span>
                                            )}
                                        </td>
                                        <td>
                                            {item.role === "admin" ? (
                                                <div className="sub-cell">
                                                    <SubscriptionPill state="unlimited" role="admin" />
                                                    <span className="sub-cell-left">Admin access never expires</span>
                                                </div>
                                            ) : (
                                                <div className="sub-cell">
                                                    <SubscriptionPill state={sub.state} role={item.role} />
                                                    <span className="sub-cell-date">
                                                        {sub.state === "unlimited"
                                                            ? "No expiry date"
                                                            : `${sub.state === "expired" ? "Ended" : "Until"} ${formatDate(sub.expires_on)}`}
                                                    </span>
                                                    <span className="sub-cell-left">{daysLeftText(sub)}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td>{formatDateTime(item.created_at)}</td>
                                        <td>
                                            <div className="action-buttons">
                                                {item.role !== "admin" && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-info small-btn"
                                                        onClick={() => setDialog({ type: "subscription", target: item })}
                                                    >
                                                        Subscription
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary small-btn"
                                                    onClick={() => {
                                                        setDialogError("");
                                                        setDialog({ type: "password", target: item });
                                                    }}
                                                >
                                                    Reset password
                                                </button>
                                                {!isSelf && (
                                                    <>
                                                        {item.is_online && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-warning small-btn"
                                                                onClick={() => askLogout(item)}
                                                            >
                                                                Sign out
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className={`btn small-btn ${item.is_banned ? "btn-success" : "btn-warning"}`}
                                                            onClick={() => askBan(item)}
                                                        >
                                                            {item.is_banned ? "Unban" : "Ban"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-danger small-btn"
                                                            onClick={() => askDelete(item)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            {dialog?.type === "confirm" && (
                <ConfirmDialog dialog={dialog} busy={busy} onCancel={closeDialog} onConfirm={dialog.run} />
            )}

            {dialog?.type === "password" && (
                <PasswordDialog
                    target={dialog.target}
                    busy={busy}
                    error={dialogError}
                    onCancel={closeDialog}
                    onSubmit={(password) => submitPassword(dialog.target, password)}
                />
            )}

            {dialog?.type === "subscription" && (
                <SubscriptionModal
                    target={dialog.target}
                    today={today}
                    onClose={closeDialog}
                    onApply={applySubscription}
                />
            )}
        </>
    );
}
