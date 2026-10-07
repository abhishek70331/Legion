import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import {
    getUsers,
    createUser,
    resetUserPassword,
    deleteUser,
    banUser,
    logoutUser,
    getErrorMessage
} from "./api.js";

const EMPTY_FORM = { username: "", password: "", role: "user" };

function roleLabel(role) {
    if (role === "superadmin") return "Super Admin";
    if (role === "admin") return "Admin";
    return "Operator";
}

function roleClass(role) {
    if (role === "superadmin") return "um-role-super";
    if (role === "admin") return "um-role-admin";
    return "um-role-user";
}

function initials(username = "") {
    return username.trim().slice(0, 2).toUpperCase() || "OP";
}

export default function UserManagement() {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === "superadmin";
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    // In-app modal states
    const [passwordModalUser, setPasswordModalUser] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);

    const [deleteModalUser, setDeleteModalUser] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    const loadUsers = useCallback(async () => {
        if (!isSuperAdmin) return;
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data.users || []);
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to load users.") });
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const submit = async (event) => {
        event.preventDefault();
        setMessage({ type: "", text: "" });

        if (!form.username.trim() || !form.password) {
            setMessage({ type: "error", text: "Username and password are required." });
            return;
        }

        if (form.password.length < 12) {
            setMessage({ type: "error", text: "Password must be at least 12 characters long." });
            return;
        }

        setCreating(true);
        try {
            const result = await createUser({
                username: form.username.trim(),
                password: form.password,
                role: form.role
            });
            setMessage({ type: "success", text: result.message || `Account created successfully for ${form.username}.` });
            setForm(EMPTY_FORM);
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to create user.") });
        } finally {
            setCreating(false);
        }
    };

    const action = async (fn, successMessage) => {
        setMessage({ type: "", text: "" });
        try {
            await fn();
            setMessage({ type: "success", text: successMessage });
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Operation failed.") });
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!passwordModalUser) return;

        if (newPassword.length < 12) {
            setMessage({ type: "error", text: "Password must be at least 12 characters." });
            return;
        }

        setPasswordSubmitting(true);
        try {
            await resetUserPassword(passwordModalUser.id, newPassword);
            setMessage({ type: "success", text: `Password successfully updated for ${passwordModalUser.username}.` });
            setPasswordModalUser(null);
            setNewPassword("");
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to reset password.") });
        } finally {
            setPasswordSubmitting(false);
        }
    };

    const handleDeleteSubmit = async () => {
        if (!deleteModalUser || deleteModalUser.id === user?.id) return;
        setDeleteSubmitting(true);
        try {
            await deleteUser(deleteModalUser.id);
            setMessage({ type: "success", text: `User account "${deleteModalUser.username}" permanently removed.` });
            setDeleteModalUser(null);
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to delete user.") });
        } finally {
            setDeleteSubmitting(false);
        }
    };

    const stats = useMemo(() => ({
        total: users.length,
        admins: users.filter((u) => u.role === "admin").length,
        superadmins: users.filter((u) => u.role === "superadmin").length,
        operators: users.filter((u) => u.role === "user").length,
        online: users.filter((u) => u.is_online).length,
        banned: users.filter((u) => u.is_banned).length
    }), [users]);

    const filtered = users.filter((item) => {
        const query = search.trim().toLowerCase();
        const matchesSearch = !query ||
            item.username.toLowerCase().includes(query) ||
            roleLabel(item.role).toLowerCase().includes(query);
        const matchesRole = roleFilter === "all" || item.role === roleFilter;
        const matchesStatus = statusFilter === "all"
            || (statusFilter === "online" && item.is_online && !item.is_banned)
            || (statusFilter === "offline" && !item.is_online && !item.is_banned)
            || (statusFilter === "banned" && item.is_banned);
        return matchesSearch && matchesRole && matchesStatus;
    });

    if (!isSuperAdmin) return null;

    return (
        <div className="user-management um-pro">
            <div className="um-hero">
                <div>
                    <div className="um-eyebrow">IDENTITY & ACCESS CONTROL</div>
                    <h2>User & Access Management</h2>
                    <p>Manage accounts, credentials, administrative roles, and active sessions across workstations.</p>
                </div>
                <button className="um-refresh" onClick={loadUsers} disabled={loading} title="Refresh users list">
                    <span className={loading ? "um-spin" : ""}>↻</span> {loading ? "Updating..." : "Refresh Accounts"}
                </button>
            </div>

            <div className="um-stat-grid">
                <div className="um-stat">
                    <span className="um-stat-icon">👥</span>
                    <div>
                        <strong>{stats.total}</strong>
                        <span>Total Accounts</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-green">🟢</span>
                    <div>
                        <strong>{stats.online}</strong>
                        <span>Active Online</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-blue">⚡</span>
                    <div>
                        <strong>{stats.admins}</strong>
                        <span>Admins</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-purple">🛡️</span>
                    <div>
                        <strong>{stats.superadmins}</strong>
                        <span>Super Admins</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-red">🚫</span>
                    <div>
                        <strong>{stats.banned}</strong>
                        <span>Suspended</span>
                    </div>
                </div>
            </div>

            <div className="um-create-panel">
                <div className="um-panel-heading">
                    <div className="um-panel-icon">＋</div>
                    <div>
                        <h3>Provision New Account</h3>
                        <p>Generate secure credentials for a test operator or administrator.</p>
                    </div>
                </div>
                <form className="um-create-grid" onSubmit={submit}>
                    <label>
                        <span>Username</span>
                        <input
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            placeholder="e.g. operator_shift1"
                            minLength={3}
                            maxLength={100}
                            required
                        />
                    </label>
                    <label>
                        <span>Password (min. 12 characters)</span>
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            placeholder="••••••••••••"
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </label>
                    <label>
                        <span>Account Role</span>
                        <select
                            value={form.role}
                            onChange={(e) => setForm({ ...form, role: e.target.value })}
                        >
                            <option value="user">Operator (Standard)</option>
                            <option value="admin">Administrator (Edit & Delete Records)</option>
                            <option value="superadmin">Super Admin (Full System Control)</option>
                        </select>
                    </label>
                    <button className="um-create-btn" type="submit" disabled={creating}>
                        {creating ? "Provisioning..." : "+ Create Account"}
                    </button>
                </form>
            </div>

            {message.text && (
                <div className={`um-alert ${message.type === "success" ? "um-alert-success" : "um-alert-error"}`}>
                    <span className="um-alert-icon">{message.type === "success" ? "✓" : "!"}</span>
                    <span>{message.text}</span>
                    <button type="button" className="um-alert-close" onClick={() => setMessage({ type: "", text: "" })}>×</button>
                </div>
            )}

            <div className="um-list-panel">
                <div className="um-list-heading">
                    <div>
                        <h3>Directory Accounts <span className="um-counter">{filtered.length}</span></h3>
                        <p>Real-time status, active logins, and privilege management.</p>
                    </div>
                    <div className="um-filters">
                        <div className="um-search-box">
                            <span className="um-search-icon">🔍</span>
                            <input
                                placeholder="Filter by username or role..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                            <option value="all">All Roles</option>
                            <option value="user">Operators</option>
                            <option value="admin">Admins</option>
                            <option value="superadmin">Super Admins</option>
                        </select>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            <option value="all">All Status</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                            <option value="banned">Suspended</option>
                        </select>
                    </div>
                </div>

                <div className="um-table-wrap">
                    <table className="um-table">
                        <thead>
                            <tr>
                                <th>USER ACCOUNT</th>
                                <th>ROLE</th>
                                <th>SESSION STATUS</th>
                                <th>ACTIVE LOGINS</th>
                                <th className="um-actions-head">ADMIN ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((item) => (
                                <tr key={item.id} className={item.is_banned ? "row-banned" : ""}>
                                    <td>
                                        <div className="um-account">
                                            <div className={`um-avatar ${roleClass(item.role)}`}>
                                                {initials(item.username)}
                                            </div>
                                            <div>
                                                <strong>{item.username}</strong>
                                                <small>{item.id === user?.id ? "Current logged-in session" : `ID: #${item.id}`}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`um-role ${roleClass(item.role)}`}>
                                            <i />
                                            {roleLabel(item.role)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`um-status ${item.is_banned ? "banned" : item.is_online ? "online" : "offline"}`}>
                                            <i />
                                            {item.is_banned ? "Suspended" : item.is_online ? "Online Now" : "Offline"}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="um-session">
                                            {item.session_count || 0} active
                                        </span>
                                    </td>
                                    <td>
                                        <div className="um-actions">
                                            <button
                                                type="button"
                                                className="um-btn-action"
                                                onClick={() => {
                                                    setPasswordModalUser(item);
                                                    setNewPassword("");
                                                    setShowNewPassword(false);
                                                }}
                                                title="Reset account password"
                                            >
                                                Password
                                            </button>
                                            {item.id !== user?.id && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="um-btn-action"
                                                        onClick={() => action(() => logoutUser(item.id), `Sessions cleared for ${item.username}.`)}
                                                        title="Terminate remote sessions"
                                                    >
                                                        Logout
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`um-btn-action ${item.is_banned ? "um-btn-unban" : "um-btn-ban"}`}
                                                        onClick={() => action(() => banUser(item.id, !item.is_banned), item.is_banned ? `Account unbanned for ${item.username}.` : `Account suspended for ${item.username}.`)}
                                                        title={item.is_banned ? "Unban account" : "Suspend account"}
                                                    >
                                                        {item.is_banned ? "Unban" : "Suspend"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="um-btn-action delete"
                                                        onClick={() => setDeleteModalUser(item)}
                                                        title="Delete account permanently"
                                                    >
                                                        Delete
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {!filtered.length && (
                                <tr>
                                    <td colSpan="5">
                                        <div className="um-empty">
                                            <strong>No user accounts found</strong>
                                            <span>No accounts match your current search or filter settings.</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* PASSWORD RESET MODAL */}
            {passwordModalUser && (
                <div className="record-modal-backdrop" onClick={() => !passwordSubmitting && setPasswordModalUser(null)}>
                    <div className="record-modal um-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker">SECURITY CONTROL</span>
                                <h2>Reset Password</h2>
                                <p>Set a new password for account: <strong>{passwordModalUser.username}</strong></p>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !passwordSubmitting && setPasswordModalUser(null)}
                            >
                                ×
                            </button>
                        </div>
                        <form onSubmit={handlePasswordSubmit}>
                            <div className="modal-form-content">
                                <label className="field">
                                    <span>New Password</span>
                                    <div className="password-input-wrapper">
                                        <input
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter minimum 12 characters"
                                            minLength={12}
                                            maxLength={128}
                                            autoFocus
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="modal-pw-toggle"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                        >
                                            {showNewPassword ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                    <small className="field-hint">
                                        Must be at least 12 characters with high entropy.
                                    </small>
                                </label>
                            </div>
                            <div className="record-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setPasswordModalUser(null)}
                                    disabled={passwordSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={passwordSubmitting || newPassword.length < 12}
                                >
                                    {passwordSubmitting ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE ACCOUNT CONFIRMATION MODAL */}
            {deleteModalUser && (
                <div className="record-modal-backdrop" onClick={() => !deleteSubmitting && setDeleteModalUser(null)}>
                    <div className="record-modal um-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker section-kicker-danger">DESTRUCTIVE ACTION</span>
                                <h2>Delete User Account</h2>
                                <p>Are you sure you want to permanently delete <strong>{deleteModalUser.username}</strong>?</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !deleteSubmitting && setDeleteModalUser(null)}
                            >
                                ×
                            </button>
                        </div>
                        <div className="modal-warning-body">
                            <p>
                                This will permanently remove the login account for <strong>{deleteModalUser.username}</strong> ({roleLabel(deleteModalUser.role)}) and terminate all active sessions. This action cannot be undone.
                            </p>
                        </div>
                        <div className="record-modal-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setDeleteModalUser(null)}
                                disabled={deleteSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={handleDeleteSubmit}
                                disabled={deleteSubmitting}
                            >
                                {deleteSubmitting ? "Deleting..." : "Permanently Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
