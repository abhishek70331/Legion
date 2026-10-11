import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./ToastContext.jsx";
import {
    getUsers,
    createUser,
    updateUser,
    resetUserPassword,
    updateUserStatus,
    deleteUser,
    logoutUser,
    getModules,
    getUserPermissions,
    saveUserPermissions,
    getAuditLogs,
    getPasswordRequests,
    updatePasswordRequest,
    getErrorMessage
} from "./api.js";

const EMPTY_FORM = {
    username: "",
    full_name: "",
    email: "",
    password: "",
    role: "user",
    status: "active"
};

function roleLabel(role) {
    if (role === "superadmin") return "Super Admin";
    if (role === "admin") return "Administrator";
    return "Operator (User)";
}

function roleClass(role) {
    if (role === "superadmin") return "um-role-super";
    if (role === "admin") return "um-role-admin";
    return "um-role-user";
}

function initials(username = "") {
    return username.trim().slice(0, 2).toUpperCase() || "OP";
}

function EyeIcon({ visible }) {
    return visible ? (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M3 3l18 18M10.6 6.3A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.5M6.2 6.9C3.5 8.7 2 12 2 12s3.5 6 10 6c1.4 0 2.7-.3 3.8-.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function UserManagement() {
    const { user, hasPermission } = useAuth();
    const toast = useToast();
    const isSuperAdmin = user?.role === "superadmin";
    const canManageUsers = isSuperAdmin || hasPermission("user_management", "view");
    const canEditUsers = isSuperAdmin || hasPermission("user_management", "edit");
    const canCreateUsers = isSuperAdmin || hasPermission("user_management", "create");
    const canDeleteUsers = isSuperAdmin || hasPermission("user_management", "delete");
    const canManageStatus = isSuperAdmin || hasPermission("user_management", "manage_status");
    const canManagePermissions = isSuperAdmin || hasPermission("permission_management", "edit");
    const canViewAuditLogs = isSuperAdmin || hasPermission("audit_logs", "view");

    // Sub-navigation tab inside Admin Dashboard
    const [adminSection, setAdminSection] = useState("users"); // 'users' | 'permissions' | 'audit' | 'resets' | 'roles'

    const [users, setUsers] = useState([]);
    const [modules, setModules] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    // Selected user for Feature Permissions tab / modal
    const [selectedPermUser, setSelectedPermUser] = useState(null);
    const [permMatrix, setPermMatrix] = useState({});
    const [permLoading, setPermLoading] = useState(false);
    const [permSaving, setPermSaving] = useState(false);
    const [permMessage, setPermMessage] = useState({ type: "", text: "" });

    // Modals
    const [passwordModalUser, setPasswordModalUser] = useState(null);
    const [newPassword, setNewPassword] = useState("");
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);

    const [editModalUser, setEditModalUser] = useState(null);
    const [editForm, setEditForm] = useState({ full_name: "", email: "", role: "user", status: "active" });
    const [editSubmitting, setEditSubmitting] = useState(false);

    const [deleteModalUser, setDeleteModalUser] = useState(null);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);

    // Audit logs state
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditSearch, setAuditSearch] = useState("");

    // Password reset requests
    const [resetRequests, setResetRequests] = useState([]);
    const [resetsLoading, setResetsLoading] = useState(false);

    // Load registered users
    const loadUsers = useCallback(async () => {
        if (!canManageUsers) return;
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data.users || []);
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to load directory accounts.") });
        } finally {
            setLoading(false);
        }
    }, [canManageUsers]);

    // Load system modules metadata
    const loadModules = useCallback(async () => {
        try {
            const data = await getModules();
            setModules(data || []);
        } catch (error) {
            console.error("Failed to load modules:", error);
        }
    }, []);

    // Load audit logs
    const loadAuditLogs = useCallback(async () => {
        if (!canViewAuditLogs) return;
        setAuditLoading(true);
        try {
            const data = await getAuditLogs({ limit: 100 });
            setAuditLogs(data || []);
        } catch (error) {
            console.error("Failed to load audit logs:", error);
        } finally {
            setAuditLoading(false);
        }
    }, [canViewAuditLogs]);

    // Load pending password reset requests
    const loadResetRequests = useCallback(async () => {
        if (!canEditUsers) return;
        setResetsLoading(true);
        try {
            const data = await getPasswordRequests();
            setResetRequests(data || []);
        } catch (error) {
            console.error("Failed to load password requests:", error);
        } finally {
            setResetsLoading(false);
        }
    }, [canEditUsers]);

    useEffect(() => {
        loadUsers();
        loadModules();
        if (canViewAuditLogs) loadAuditLogs();
        if (canEditUsers) loadResetRequests();
    }, [loadUsers, loadModules, loadAuditLogs, loadResetRequests, canViewAuditLogs, canEditUsers]);

    // Open permission matrix for a user
    const openPermissionEditor = async (targetUser) => {
        setSelectedPermUser(targetUser);
        setAdminSection("permissions");
        setPermLoading(true);
        setPermMessage({ type: "", text: "" });

        try {
            const data = await getUserPermissions(targetUser.id);
            setPermMatrix(data.permissions || {});
        } catch (error) {
            setPermMessage({ type: "error", text: getErrorMessage(error, "Failed to load user permissions.") });
        } finally {
            setPermLoading(false);
        }
    };

    // Toggle specific permission in matrix
    const togglePermission = (moduleKey, actionName) => {
        setPermMatrix((prev) => {
            const currentMod = prev[moduleKey] || {};
            const nextVal = !currentMod[actionName];
            return {
                ...prev,
                [moduleKey]: {
                    ...currentMod,
                    [actionName]: nextVal
                }
            };
        });
    };

    // Apply quick permission presets
    const applyPreset = (presetName) => {
        const matrix = {};
        modules.forEach((mod) => {
            matrix[mod.module_key] = {};
        });

        if (presetName === "operator") {
            matrix.overview = { view: true };
            matrix.records = { view: true, create: true, search: true };
            matrix.shift_analytics = { view: true };
        } else if (presetName === "auditor") {
            matrix.overview = { view: true };
            matrix.records = { view: true, search: true, export: true };
            matrix.shift_analytics = { view: true, export: true };
            matrix.audit_logs = { view: true };
        } else if (presetName === "admin") {
            matrix.overview = { view: true };
            matrix.records = { view: true, create: true, edit: true, delete: true, search: true, export: true };
            matrix.shift_analytics = { view: true, export: true };
            matrix.user_management = { view: true, create: true, edit: true, manage_status: true };
            matrix.permission_management = { view: true };
            matrix.audit_logs = { view: true, export: true };
        } else if (presetName === "clear") {
            // all false
        }

        setPermMatrix(matrix);
        setPermMessage({ type: "info", text: `Applied '${presetName}' permission preset template.` });
        toast.info(
            "Preset Loaded",
            `Loaded '${presetName.toUpperCase()}' permission preset. Click "Save Matrix Changes" to apply.`,
            presetName
        );
    };

    // Save permissions
    const handleSavePermissions = async () => {
        if (!selectedPermUser) return;
        setPermSaving(true);
        setPermMessage({ type: "", text: "" });

        try {
            const res = await saveUserPermissions(selectedPermUser.id, permMatrix);
            const msg = res.message || "Permissions updated successfully.";
            setPermMessage({ type: "success", text: msg });
            toast.success(
                "Permissions Saved Successfully",
                `Feature matrix updated for ${selectedPermUser.username}. Changes take effect immediately without requiring relogin.`,
                selectedPermUser.role
            );
            await loadUsers();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to save permissions.");
            setPermMessage({ type: "error", text: errText });
            toast.error("Error Saving Permissions", errText);
        } finally {
            setPermSaving(false);
        }
    };

    // Create user submission
    const submitCreateUser = async (event) => {
        event.preventDefault();
        setMessage({ type: "", text: "" });

        if (!form.username.trim() || !form.password) {
            const errText = "Username and password are required.";
            setMessage({ type: "error", text: errText });
            toast.error("Validation Error", errText);
            return;
        }

        if (form.password.length < 12) {
            const errText = "Password must be at least 12 characters long.";
            setMessage({ type: "error", text: errText });
            toast.error("Validation Error", errText);
            return;
        }

        setCreating(true);
        try {
            const result = await createUser({
                username: form.username.trim(),
                full_name: form.full_name.trim(),
                email: form.email.trim(),
                password: form.password,
                role: form.role,
                status: form.status
            });
            const successMsg = result.message || `Account created successfully for ${form.username}.`;
            setMessage({ type: "success", text: successMsg });
            toast.success("User Account Created", successMsg, roleLabel(form.role));
            setForm(EMPTY_FORM);
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to create user.");
            setMessage({ type: "error", text: errText });
            toast.error("Account Creation Failed", errText);
        } finally {
            setCreating(false);
        }
    };

    // Open edit user modal
    const openEditModal = (targetUser) => {
        setEditModalUser(targetUser);
        setEditForm({
            full_name: targetUser.full_name || "",
            email: targetUser.email || "",
            role: targetUser.role,
            status: targetUser.status || "active"
        });
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!editModalUser) return;

        setEditSubmitting(true);
        try {
            await updateUser(editModalUser.id, editForm);
            const successMsg = `Profile updated for ${editModalUser.username}.`;
            setMessage({ type: "success", text: successMsg });
            toast.success("Profile Updated", successMsg);
            setEditModalUser(null);
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to update user profile.");
            setMessage({ type: "error", text: errText });
            toast.error("Update Failed", errText);
        } finally {
            setEditSubmitting(false);
        }
    };

    // Password reset modal submit
    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        if (!passwordModalUser) return;

        if (newPassword.length < 12) {
            const errText = "Password must be at least 12 characters long.";
            setMessage({ type: "error", text: errText });
            toast.error("Validation Error", errText);
            return;
        }

        setPasswordSubmitting(true);
        try {
            await resetUserPassword(passwordModalUser.id, newPassword);
            const successMsg = `Password successfully updated for ${passwordModalUser.username}. Remote sessions closed.`;
            setMessage({ type: "success", text: successMsg });
            toast.success("Password Reset Successful", successMsg);
            setPasswordModalUser(null);
            setNewPassword("");
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to reset password.");
            setMessage({ type: "error", text: errText });
            toast.error("Password Reset Failed", errText);
        } finally {
            setPasswordSubmitting(false);
        }
    };

    // Toggle user status (active / suspended)
    const handleToggleStatus = async (targetUser) => {
        const nextStatus = targetUser.status === "active" ? "suspended" : "active";
        try {
            await updateUserStatus(targetUser.id, nextStatus);
            const successMsg = `Account "${targetUser.username}" is now ${nextStatus === "active" ? "activated" : "suspended"}.`;
            setMessage({
                type: "success",
                text: successMsg
            });
            toast.success("Account Status Updated", successMsg, nextStatus.toUpperCase());
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to update status.");
            setMessage({ type: "error", text: errText });
            toast.error("Status Change Failed", errText);
        }
    };

    // Terminate sessions
    const handleTerminateSessions = async (targetUser) => {
        try {
            const res = await logoutUser(targetUser.id);
            const successMsg = res.message || `Sessions cleared for ${targetUser.username}.`;
            setMessage({ type: "success", text: successMsg });
            toast.success("Sessions Terminated", successMsg);
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to terminate sessions.");
            setMessage({ type: "error", text: errText });
            toast.error("Session Action Failed", errText);
        }
    };

    // Delete user
    const handleDeleteSubmit = async () => {
        if (!deleteModalUser || deleteModalUser.id === user?.id) return;
        setDeleteSubmitting(true);
        try {
            await deleteUser(deleteModalUser.id);
            const successMsg = `User account "${deleteModalUser.username}" permanently deleted.`;
            setMessage({ type: "success", text: successMsg });
            toast.success("Account Deleted", successMsg);
            setDeleteModalUser(null);
            await loadUsers();
            if (canViewAuditLogs) loadAuditLogs();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to delete user.");
            setMessage({ type: "error", text: errText });
            toast.error("Deletion Failed", errText);
        } finally {
            setDeleteSubmitting(false);
        }
    };

    // Handle password reset request action
    const handleResolveResetRequest = async (reqId, status) => {
        try {
            await updatePasswordRequest(reqId, status);
            toast.success("Request Updated", `Password reset request marked as ${status}.`);
            loadResetRequests();
        } catch (error) {
            const errText = getErrorMessage(error, "Failed to update request.");
            toast.error("Update Failed", errText);
        }
    };

    // Overall stats
    const stats = useMemo(() => ({
        total: users.length,
        admins: users.filter((u) => u.role === "admin").length,
        superadmins: users.filter((u) => u.role === "superadmin").length,
        operators: users.filter((u) => u.role === "user").length,
        active: users.filter((u) => u.status === "active" && !u.is_banned).length,
        online: users.filter((u) => u.is_online).length,
        suspended: users.filter((u) => u.status === "suspended" || u.is_banned).length,
        inactive: users.filter((u) => u.status === "inactive").length,
        pendingResets: resetRequests.length
    }), [users, resetRequests]);

    // Filter users list
    const filteredUsers = useMemo(() => {
        return users.filter((item) => {
            const query = search.trim().toLowerCase();
            const matchesSearch = !query ||
                item.username.toLowerCase().includes(query) ||
                (item.email && item.email.toLowerCase().includes(query)) ||
                (item.full_name && item.full_name.toLowerCase().includes(query)) ||
                roleLabel(item.role).toLowerCase().includes(query);

            const matchesRole = roleFilter === "all" || item.role === roleFilter;

            const matchesStatus = statusFilter === "all"
                || (statusFilter === "online" && item.is_online)
                || (statusFilter === "active" && item.status === "active" && !item.is_banned)
                || (statusFilter === "suspended" && (item.status === "suspended" || item.is_banned))
                || (statusFilter === "inactive" && item.status === "inactive");

            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    // Permission summary counts for currently opened user
    const permissionSummary = useMemo(() => {
        if (!selectedPermUser) return { granted: 0, total: 0 };
        let granted = 0;
        let total = 0;
        modules.forEach((mod) => {
            mod.supported_actions.forEach((act) => {
                total++;
                if (permMatrix[mod.module_key]?.[act]) granted++;
            });
        });
        return { granted, total };
    }, [selectedPermUser, modules, permMatrix]);

    if (!canManageUsers && !canManagePermissions && !canViewAuditLogs) {
        return (
            <div className="access-denied-panel">
                <div className="denied-icon">🔒</div>
                <h2>Access Restricted</h2>
                <p>You do not have administrative permissions to view the User Management console.</p>
            </div>
        );
    }

    return (
        <div className="user-management um-pro">
            {/* HERO HEADER */}
            <div className="um-hero">
                <div>
                    <div className="um-eyebrow">ENTERPRISE ADMINISTRATION & RBAC</div>
                    <h2>Administrator Console</h2>
                    <p>Manage accounts, granular feature permissions, credentials, audit trail, and security policies.</p>
                </div>
                <div className="um-hero-actions">
                    <button className="um-refresh" onClick={loadUsers} disabled={loading} title="Reload accounts">
                        <span className={loading ? "um-spin" : ""}>↻</span> {loading ? "Refreshing..." : "Refresh Accounts"}
                    </button>
                </div>
            </div>

            {/* METRICS KPI CARDS */}
            <div className="um-stat-grid">
                <div className="um-stat">
                    <span className="um-stat-icon">👥</span>
                    <div>
                        <strong>{stats.total}</strong>
                        <span>Total Users</span>
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
                        <strong>{stats.admins + stats.superadmins}</strong>
                        <span>Administrators</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-purple">🛡️</span>
                    <div>
                        <strong>{stats.active}</strong>
                        <span>Active Accounts</span>
                    </div>
                </div>
                <div className="um-stat">
                    <span className="um-stat-icon um-red">🚫</span>
                    <div>
                        <strong>{stats.suspended + stats.inactive}</strong>
                        <span>Suspended / Inactive</span>
                    </div>
                </div>
                {stats.pendingResets > 0 && (
                    <div className="um-stat um-stat-alert" onClick={() => setAdminSection("resets")} title="View pending reset requests">
                        <span className="um-stat-icon">🔑</span>
                        <div>
                            <strong>{stats.pendingResets}</strong>
                            <span>Reset Requests</span>
                        </div>
                    </div>
                )}
            </div>

            {/* SUB-NAVIGATION BAR */}
            <div className="um-subnav">
                <button
                    type="button"
                    className={`um-subnav-btn ${adminSection === "users" ? "active" : ""}`}
                    onClick={() => setAdminSection("users")}
                >
                    <span className="subnav-icon">👤</span>
                    <span>Manage Users</span>
                    <span className="subnav-pill">{users.length}</span>
                </button>

                {canManagePermissions && (
                    <button
                        type="button"
                        className={`um-subnav-btn ${adminSection === "permissions" ? "active" : ""}`}
                        onClick={() => {
                            setAdminSection("permissions");
                            if (!selectedPermUser && users.length > 0) {
                                openPermissionEditor(users.find((u) => u.role !== "superadmin") || users[0]);
                            }
                        }}
                    >
                        <span className="subnav-icon">🛡️</span>
                        <span>Feature Permissions</span>
                    </button>
                )}

                <button
                    type="button"
                    className={`um-subnav-btn ${adminSection === "roles" ? "active" : ""}`}
                    onClick={() => setAdminSection("roles")}
                >
                    <span className="subnav-icon">🏷️</span>
                    <span>Role Management</span>
                </button>

                {canViewAuditLogs && (
                    <button
                        type="button"
                        className={`um-subnav-btn ${adminSection === "audit" ? "active" : ""}`}
                        onClick={() => {
                            setAdminSection("audit");
                            loadAuditLogs();
                        }}
                    >
                        <span className="subnav-icon">📋</span>
                        <span>Security & Audit Logs</span>
                    </button>
                )}

                {canEditUsers && resetRequests.length > 0 && (
                    <button
                        type="button"
                        className={`um-subnav-btn ${adminSection === "resets" ? "active" : ""}`}
                        onClick={() => setAdminSection("resets")}
                    >
                        <span className="subnav-icon">🔑</span>
                        <span>Password Requests ({resetRequests.length})</span>
                    </button>
                )}
            </div>

            {/* ALERT BANNER */}
            {message.text && (
                <div className={`um-alert ${message.type === "success" ? "um-alert-success" : "um-alert-error"}`}>
                    <span className="um-alert-icon">{message.type === "success" ? "✓" : "!"}</span>
                    <span>{message.text}</span>
                    <button type="button" className="um-alert-close" onClick={() => setMessage({ type: "", text: "" })}>×</button>
                </div>
            )}

            {/* =========================================================
                SECTION 1: MANAGE USERS DIRECTORY
            ========================================================= */}
            {adminSection === "users" && (
                <div className="um-view-container">
                    {/* PROVISION USER PANEL */}
                    {canCreateUsers && (
                        <div className="um-create-panel">
                            <div className="um-panel-heading">
                                <div className="um-panel-icon">＋</div>
                                <div>
                                    <h3>Provision New User Account</h3>
                                    <p>Create credentials and assign standard role. Passwords must be at least 12 characters.</p>
                                </div>
                            </div>

                            <form className="um-create-grid" onSubmit={submitCreateUser}>
                                <label>
                                    <span>Username *</span>
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
                                    <span>Full Name</span>
                                    <input
                                        value={form.full_name}
                                        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                        placeholder="e.g. Aman Sharma"
                                    />
                                </label>

                                <label>
                                    <span>Email Address</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                                        placeholder="user@legion.com"
                                    />
                                </label>

                                <label className="input-with-toggle">
                                    <span>Password (min. 12 chars) *</span>
                                    <div className="input-wrap">
                                        <input
                                            type={showCreatePassword ? "text" : "password"}
                                            value={form.password}
                                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                                            placeholder="••••••••••••"
                                            minLength={12}
                                            maxLength={128}
                                            required
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle small-toggle"
                                            onClick={() => setShowCreatePassword(!showCreatePassword)}
                                        >
                                            <EyeIcon visible={showCreatePassword} />
                                        </button>
                                    </div>
                                </label>

                                <label>
                                    <span>Account Role *</span>
                                    <select
                                        value={form.role}
                                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    >
                                        <option value="user">Regular User (Operator)</option>
                                        <option value="admin">Administrator</option>
                                        {isSuperAdmin && <option value="superadmin">Super Admin (Universal Access)</option>}
                                    </select>
                                </label>

                                <label>
                                    <span>Initial Status</span>
                                    <select
                                        value={form.status}
                                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                                    >
                                        <option value="active">Active (Permitted to sign in)</option>
                                        <option value="inactive">Inactive (Deactivated)</option>
                                        <option value="suspended">Suspended</option>
                                    </select>
                                </label>

                                <div className="um-create-action-cell">
                                    <button className="um-create-btn" type="submit" disabled={creating}>
                                        {creating ? "Provisioning..." : "+ Create User ID"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* DIRECTORY LIST PANEL */}
                    <div className="um-list-panel">
                        <div className="um-list-heading">
                            <div>
                                <h3>Registered Directory Accounts <span className="um-counter">{filteredUsers.length}</span></h3>
                                <p>Search, filter, assign individual permissions, and manage active sessions.</p>
                            </div>
                            <div className="um-filters">
                                <div className="um-search-box">
                                    <span className="um-search-icon">🔍</span>
                                    <input
                                        placeholder="Search by username, name, email..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                    />
                                </div>
                                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                                    <option value="all">All Roles</option>
                                    <option value="user">Regular Users</option>
                                    <option value="admin">Administrators</option>
                                    <option value="superadmin">Super Admins</option>
                                </select>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="online">Online Now</option>
                                    <option value="suspended">Suspended</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>

                        <div className="um-table-wrap">
                            <table className="um-table">
                                <thead>
                                    <tr>
                                        <th>USER ACCOUNT</th>
                                        <th>ROLE</th>
                                        <th>STATUS</th>
                                        <th>PERMISSIONS</th>
                                        <th>SESSION</th>
                                        <th className="um-actions-head">ADMIN ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((item) => (
                                        <tr key={item.id} className={item.is_banned || item.status === "suspended" ? "row-banned" : item.status === "inactive" ? "row-inactive" : ""}>
                                            <td>
                                                <div className="um-account">
                                                    <div className={`um-avatar ${roleClass(item.role)}`}>
                                                        {initials(item.username)}
                                                    </div>
                                                    <div>
                                                        <strong>{item.username}</strong>
                                                        <div className="um-account-sub">
                                                            {item.full_name && <span>{item.full_name} · </span>}
                                                            {item.email ? <span>{item.email}</span> : <small>ID: #{item.id}</small>}
                                                        </div>
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
                                                <span className={`um-status ${item.is_banned || item.status === "suspended" ? "banned" : item.status === "inactive" ? "inactive" : item.is_online ? "online" : "offline"}`}>
                                                    <i />
                                                    {item.is_banned || item.status === "suspended"
                                                        ? "Suspended"
                                                        : item.status === "inactive"
                                                        ? "Inactive"
                                                        : item.is_online
                                                        ? "Online Now"
                                                        : "Active (Offline)"}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="um-perm-cell">
                                                    <span className="um-perm-badge">
                                                        {item.role === "superadmin" ? "All Features" : `${item.permissions_count || 0} operations`}
                                                    </span>
                                                    {canManagePermissions && item.role !== "superadmin" && (
                                                        <button
                                                            type="button"
                                                            className="btn-link-action"
                                                            onClick={() => openPermissionEditor(item)}
                                                            title="Configure feature permissions"
                                                        >
                                                            Configure →
                                                        </button>
                                                    )}
                                                </div>
                                            </td>

                                            <td>
                                                <span className="um-session">
                                                    {item.session_count || 0} active
                                                </span>
                                            </td>

                                            <td>
                                                <div className="um-actions">
                                                    {/* Assign Permissions button */}
                                                    {canManagePermissions && item.role !== "superadmin" && (
                                                        <button
                                                            type="button"
                                                            className="um-btn-action um-btn-perm"
                                                            onClick={() => openPermissionEditor(item)}
                                                            title="Review and assign permissions"
                                                        >
                                                            Permissions
                                                        </button>
                                                    )}

                                                    {/* Edit details */}
                                                    {canEditUsers && (
                                                        <button
                                                            type="button"
                                                            className="um-btn-action"
                                                            onClick={() => openEditModal(item)}
                                                            title="Edit user details"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}

                                                    {/* Reset Password */}
                                                    {canEditUsers && (
                                                        <button
                                                            type="button"
                                                            className="um-btn-action"
                                                            onClick={() => {
                                                                setPasswordModalUser(item);
                                                                setNewPassword("");
                                                                setShowNewPassword(false);
                                                            }}
                                                            title="Reset password securely"
                                                        >
                                                            Password
                                                        </button>
                                                    )}

                                                    {item.id !== user?.id && (
                                                        <>
                                                            {/* Remote session termination */}
                                                            {canManageStatus && item.session_count > 0 && (
                                                                <button
                                                                    type="button"
                                                                    className="um-btn-action"
                                                                    onClick={() => handleTerminateSessions(item)}
                                                                    title="Force logout active sessions"
                                                                >
                                                                    Logout
                                                                </button>
                                                            )}

                                                            {/* Activate / Suspend */}
                                                            {canManageStatus && (
                                                                <button
                                                                    type="button"
                                                                    className={`um-btn-action ${item.status === "suspended" || item.is_banned ? "um-btn-unban" : "um-btn-ban"}`}
                                                                    onClick={() => handleToggleStatus(item)}
                                                                    title={item.status === "suspended" ? "Reactivate user" : "Suspend user"}
                                                                >
                                                                    {item.status === "suspended" || item.is_banned ? "Activate" : "Suspend"}
                                                                </button>
                                                            )}

                                                            {/* Delete */}
                                                            {canDeleteUsers && (
                                                                <button
                                                                    type="button"
                                                                    className="um-btn-action delete"
                                                                    onClick={() => setDeleteModalUser(item)}
                                                                    title="Delete account"
                                                                >
                                                                    Delete
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}

                                    {!filteredUsers.length && (
                                        <tr>
                                            <td colSpan={6} className="um-empty">
                                                No users matching "{search}" in directory.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
                SECTION 2: FEATURE PERMISSIONS MANAGEMENT
            ========================================================= */}
            {adminSection === "permissions" && (
                <div className="um-permissions-panel">
                    <div className="um-perm-header-card">
                        <div className="um-perm-user-select-bar">
                            <label className="um-perm-user-picker">
                                <span>Select User to Manage:</span>
                                <select
                                    value={selectedPermUser?.id || ""}
                                    onChange={(e) => {
                                        const target = users.find((u) => u.id === Number(e.target.value));
                                        if (target) openPermissionEditor(target);
                                    }}
                                >
                                    {users.filter((u) => u.role !== "superadmin").map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.username} ({roleLabel(u.role)})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            {selectedPermUser && (
                                <div className="um-perm-user-summary">
                                    <div className={`um-avatar small-avatar ${roleClass(selectedPermUser.role)}`}>
                                        {initials(selectedPermUser.username)}
                                    </div>
                                    <div>
                                        <strong>{selectedPermUser.username}</strong>
                                        <span className={`um-role small-role ${roleClass(selectedPermUser.role)}`}>
                                            {roleLabel(selectedPermUser.role)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* PRESET BUTTONS */}
                            <div className="um-preset-bar">
                                <span className="preset-label">Apply Preset:</span>
                                <button type="button" className="btn-preset" onClick={() => applyPreset("operator")}>
                                    Operator
                                </button>
                                <button type="button" className="btn-preset" onClick={() => applyPreset("auditor")}>
                                    Auditor
                                </button>
                                <button type="button" className="btn-preset" onClick={() => applyPreset("admin")}>
                                    Admin Full
                                </button>
                                <button type="button" className="btn-preset preset-clear" onClick={() => applyPreset("clear")}>
                                    Clear All
                                </button>
                            </div>
                        </div>

                        {permMessage.text && (
                            <div className={`um-alert ${permMessage.type === "success" ? "um-alert-success" : permMessage.type === "info" ? "um-alert-info" : "um-alert-error"}`}>
                                <span className="um-alert-icon">{permMessage.type === "success" ? "✓" : "!"}</span>
                                <span>{permMessage.text}</span>
                                <button type="button" className="um-alert-close" onClick={() => setPermMessage({ type: "", text: "" })}>×</button>
                            </div>
                        )}
                    </div>

                    {permLoading ? (
                        <div className="um-loading-box">
                            <span className="um-spin">⏳</span>
                            <span>Loading user permissions matrix...</span>
                        </div>
                    ) : (
                        <div className="um-modules-matrix">
                            <div className="um-matrix-header">
                                <div>
                                    <h3>Granular Feature Access Matrix</h3>
                                    <p>Toggle individual operations per module. Permissions are enforced on both the UI and backend APIs.</p>
                                </div>
                                <div className="um-matrix-stats">
                                    <span>Authorized Operations:</span>
                                    <strong>{permissionSummary.granted} / {permissionSummary.total}</strong>
                                </div>
                            </div>

                            <div className="um-modules-grid">
                                {modules.map((mod) => (
                                    <div className="um-module-card" key={mod.module_key}>
                                        <div className="module-card-header">
                                            <div className="module-card-title">
                                                <span className="module-category-tag">{mod.category}</span>
                                                <h4>{mod.name}</h4>
                                                <p>{mod.description}</p>
                                            </div>
                                        </div>

                                        <div className="module-actions-list">
                                            {mod.supported_actions.map((act) => {
                                                const isAllowed = Boolean(permMatrix[mod.module_key]?.[act]);
                                                return (
                                                    <label className={`action-toggle-row ${isAllowed ? "allowed" : "denied"}`} key={act}>
                                                        <div className="action-toggle-label">
                                                            <span className="action-name">{act.toUpperCase()}</span>
                                                            <span className="action-desc">
                                                                {act === "view" && "View module interface, records, and data cards"}
                                                                {act === "create" && "Submit and save new records / items"}
                                                                {act === "edit" && "Modify existing records and data points"}
                                                                {act === "delete" && "Permanently remove records / data"}
                                                                {act === "search" && "Query and filter records database"}
                                                                {act === "export" && "Download data extracts to CSV / Reports"}
                                                                {act === "manage_status" && "Activate, suspend, or terminate sessions"}
                                                            </span>
                                                        </div>

                                                        <div className="toggle-switch-wrap">
                                                            <input
                                                                type="checkbox"
                                                                checked={isAllowed}
                                                                onChange={() => togglePermission(mod.module_key, act)}
                                                            />
                                                            <span className="switch-slider" />
                                                            <span className="switch-text">{isAllowed ? "ALLOW" : "DENY"}</span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* PERMISSION SUMMARY & SAVE BAR */}
                            <div className="um-save-bar">
                                <div className="um-save-summary">
                                    <span className="summary-icon">ℹ️</span>
                                    <span>
                                        Configuring permissions for <strong>{selectedPermUser?.username}</strong> ({permissionSummary.granted} operations granted, {permissionSummary.total - permissionSummary.granted} denied).
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary um-btn-save-perms"
                                    onClick={handleSavePermissions}
                                    disabled={permSaving}
                                >
                                    {permSaving ? "Saving Configuration..." : "Save Feature Permissions"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* =========================================================
                SECTION 3: ROLE MANAGEMENT
            ========================================================= */}
            {adminSection === "roles" && (
                <div className="um-roles-panel">
                    <div className="roles-overview-header">
                        <h3>Role Hierarchy & Privilege Separation</h3>
                        <p>Legion system enforces three strict organizational tiers to prevent privilege escalation.</p>
                    </div>

                    <div className="roles-cards-grid">
                        <div className="role-card card-superadmin">
                            <div className="role-card-badge">TIER 1 · UNIVERSAL</div>
                            <h4>Super Admin</h4>
                            <p>Full, unrestricted access to all system modules, operational data, administrative controls, and security policies.</p>
                            <ul>
                                <li>✓ Universal bypass on all feature permissions</li>
                                <li>✓ Provision and manage Administrator accounts</li>
                                <li>✓ Assign and revoke permissions for any account</li>
                                <li>✓ Security audit log review & system exports</li>
                            </ul>
                            <div className="role-card-footer">
                                <span>Active Super Admins:</span>
                                <strong>{stats.superadmins}</strong>
                            </div>
                        </div>

                        <div className="role-card card-admin">
                            <div className="role-card-badge">TIER 2 · DELEGATED</div>
                            <h4>Administrator</h4>
                            <p>Delegated operational and management authority. Can only access features explicitly granted by the Super Admin.</p>
                            <ul>
                                <li>✓ Access permitted operational and inspection tools</li>
                                <li>✓ Manage regular user accounts if authorized</li>
                                <li>✗ Cannot promote accounts to Super Admin</li>
                                <li>✗ Cannot grant permissions they do not possess</li>
                            </ul>
                            <div className="role-card-footer">
                                <span>Active Admins:</span>
                                <strong>{stats.admins}</strong>
                            </div>
                        </div>

                        <div className="role-card card-user">
                            <div className="role-card-badge">TIER 3 · OPERATIONAL</div>
                            <h4>Regular User (Operator)</h4>
                            <p>Restricted to specific testing and data entry workflows assigned by administrators.</p>
                            <ul>
                                <li>✓ Log ultrasonic inspections if granted</li>
                                <li>✓ View test records in read-only mode if granted</li>
                                <li>✗ Unauthorized tabs and API calls strictly blocked</li>
                                <li>✗ Zero access to administrative features</li>
                            </ul>
                            <div className="role-card-footer">
                                <span>Active Operators:</span>
                                <strong>{stats.operators}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* =========================================================
                SECTION 4: SECURITY & AUDIT LOGS
            ========================================================= */}
            {adminSection === "audit" && canViewAuditLogs && (
                <div className="um-audit-panel">
                    <div className="um-list-heading">
                        <div>
                            <h3>Real-Time Security & Audit Trail</h3>
                            <p>Immutable record of authentication events, user provisioning, credential changes, and data modifications.</p>
                        </div>
                        <div className="um-filters">
                            <div className="um-search-box">
                                <span className="um-search-icon">🔍</span>
                                <input
                                    placeholder="Filter audit events..."
                                    value={auditSearch}
                                    onChange={(e) => setAuditSearch(e.target.value)}
                                />
                            </div>
                            <button type="button" className="btn btn-secondary small-btn" onClick={loadAuditLogs} disabled={auditLoading}>
                                {auditLoading ? "Refreshing..." : "↻ Refresh Audit"}
                            </button>
                        </div>
                    </div>

                    <div className="um-table-wrap">
                        <table className="um-table audit-table">
                            <thead>
                                <tr>
                                    <th>TIMESTAMP</th>
                                    <th>EVENT ACTION</th>
                                    <th>ACTOR</th>
                                    <th>TARGET</th>
                                    <th>DETAILS</th>
                                    <th>IP ADDRESS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {auditLogs
                                    .filter((l) => {
                                        const q = auditSearch.trim().toLowerCase();
                                        return !q ||
                                            l.action.toLowerCase().includes(q) ||
                                            (l.actor_username && l.actor_username.toLowerCase().includes(q)) ||
                                            (l.target_type && l.target_type.toLowerCase().includes(q));
                                    })
                                    .map((log) => (
                                        <tr key={log.id}>
                                            <td className="audit-time">
                                                {new Date(log.created_at).toLocaleString("en-IN", {
                                                    day: "2-digit",
                                                    month: "short",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    second: "2-digit"
                                                })}
                                            </td>
                                            <td>
                                                <span className={`audit-badge badge-${log.action.toLowerCase().replace(/_/g, "-")}`}>
                                                    {log.action}
                                                </span>
                                            </td>
                                            <td>
                                                <strong>{log.actor_username || "System"}</strong>
                                            </td>
                                            <td>
                                                <span className="audit-target">
                                                    {log.target_type ? `${log.target_type}:${log.target_id || ""}` : "—"}
                                                </span>
                                            </td>
                                            <td className="audit-details-cell">
                                                {log.details ? JSON.stringify(log.details) : "—"}
                                            </td>
                                            <td className="audit-ip">{log.ip_address || "—"}</td>
                                        </tr>
                                    ))}

                                {!auditLogs.length && (
                                    <tr>
                                        <td colSpan={6} className="um-empty">
                                            No audit entries found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* =========================================================
                SECTION 5: PASSWORD RESET REQUESTS
            ========================================================= */}
            {adminSection === "resets" && canEditUsers && (
                <div className="um-resets-panel">
                    <div className="um-list-heading">
                        <div>
                            <h3>Pending Password Reset Requests</h3>
                            <p>Requests submitted by users locked out at the sign-in screen.</p>
                        </div>
                        <button type="button" className="btn btn-secondary small-btn" onClick={loadResetRequests} disabled={resetsLoading}>
                            ↻ Refresh Requests
                        </button>
                    </div>

                    <div className="um-table-wrap">
                        <table className="um-table">
                            <thead>
                                <tr>
                                    <th>REQUEST TIME</th>
                                    <th>IDENTIFIER / USERNAME</th>
                                    <th>MATCHED ACCOUNT</th>
                                    <th>NOTES</th>
                                    <th>IP ADDRESS</th>
                                    <th>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resetRequests.map((req) => (
                                    <tr key={req.id}>
                                        <td>{new Date(req.requested_at).toLocaleString("en-IN")}</td>
                                        <td><strong>{req.username_or_email}</strong></td>
                                        <td>{req.username ? `${req.username} (${roleLabel(req.role)})` : "Unmatched"}</td>
                                        <td>{req.notes || "—"}</td>
                                        <td>{req.ip_address || "—"}</td>
                                        <td>
                                            <div className="um-actions">
                                                {req.user_id && (
                                                    <button
                                                        type="button"
                                                        className="um-btn-action"
                                                        onClick={() => {
                                                            const match = users.find((u) => u.id === req.user_id);
                                                            if (match) {
                                                                setPasswordModalUser(match);
                                                                setNewPassword("");
                                                            }
                                                        }}
                                                    >
                                                        Reset Password
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="um-btn-action"
                                                    onClick={() => handleResolveResetRequest(req.id, "resolved")}
                                                >
                                                    Mark Resolved
                                                </button>
                                                <button
                                                    type="button"
                                                    className="um-btn-action delete"
                                                    onClick={() => handleResolveResetRequest(req.id, "dismissed")}
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}

                                {!resetRequests.length && (
                                    <tr>
                                        <td colSpan={6} className="um-empty">
                                            No pending password reset requests.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: EDIT USER PROFILE
            ========================================================= */}
            {editModalUser && (
                <div className="record-modal-backdrop" onClick={() => !editSubmitting && setEditModalUser(null)}>
                    <div className="record-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker">USER DIRECTORY</span>
                                <h2>Edit Account: {editModalUser.username}</h2>
                                <p>Update profile details, organizational role, or access status.</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !editSubmitting && setEditModalUser(null)}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit}>
                            <div className="modal-body-content">
                                <label className="field">
                                    <span>Full Name</span>
                                    <input
                                        type="text"
                                        value={editForm.full_name}
                                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                                        placeholder="e.g. Aman Sharma"
                                    />
                                </label>

                                <label className="field">
                                    <span>Email Address</span>
                                    <input
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                        placeholder="user@legion.com"
                                    />
                                </label>

                                {editModalUser.id !== user?.id && (
                                    <>
                                        <label className="field">
                                            <span>Account Role</span>
                                            <select
                                                value={editForm.role}
                                                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                            >
                                                <option value="user">Regular User (Operator)</option>
                                                <option value="admin">Administrator</option>
                                                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                                            </select>
                                        </label>

                                        <label className="field">
                                            <span>Account Status</span>
                                            <select
                                                value={editForm.status}
                                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                            >
                                                <option value="active">Active (Access allowed)</option>
                                                <option value="inactive">Inactive (Deactivated)</option>
                                                <option value="suspended">Suspended (Banned)</option>
                                            </select>
                                        </label>
                                    </>
                                )}
                            </div>

                            <div className="record-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setEditModalUser(null)}
                                    disabled={editSubmitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={editSubmitting}
                                >
                                    {editSubmitting ? "Saving..." : "Save Profile"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: RESET USER PASSWORD
            ========================================================= */}
            {passwordModalUser && (
                <div className="record-modal-backdrop" onClick={() => !passwordSubmitting && setPasswordModalUser(null)}>
                    <div className="record-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker">CREDENTIAL SECURITY</span>
                                <h2>Reset Password: {passwordModalUser.username}</h2>
                                <p>Set a new strong password. Existing active sessions will be terminated immediately.</p>
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
                            <div className="modal-body-content">
                                <label className="field input-with-toggle">
                                    <span>New Password (minimum 12 characters) *</span>
                                    <div className="input-wrap">
                                        <input
                                            type={showNewPassword ? "text" : "password"}
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            placeholder="Enter minimum 12 characters"
                                            minLength={12}
                                            maxLength={128}
                                            required
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle small-toggle"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                        >
                                            <EyeIcon visible={showNewPassword} />
                                        </button>
                                    </div>
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
                                    disabled={passwordSubmitting}
                                >
                                    {passwordSubmitting ? "Resetting Password..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =========================================================
                MODAL: DELETE USER CONFIRMATION
            ========================================================= */}
            {deleteModalUser && (
                <div className="record-modal-backdrop" onClick={() => !deleteSubmitting && setDeleteModalUser(null)}>
                    <div className="record-modal um-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker section-kicker-danger">DESTRUCTIVE ACTION</span>
                                <h2>Delete User Account</h2>
                                <p>Permanently remove account "{deleteModalUser.username}".</p>
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
                                Are you sure you want to permanently delete account <strong>{deleteModalUser.username}</strong>?
                                All active sessions and assigned permissions for this user will be deleted immediately.
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
