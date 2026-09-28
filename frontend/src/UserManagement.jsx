import { useEffect, useState } from "react";
import {
    createUser,
    deleteUser,
    getUsers,
    resetUserPassword,
    getErrorMessage
} from "./api.js";
import { useAuth } from "./AuthContext.jsx";

export default function UserManagement() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState({
        username: "",
        password: "",
        role: "user"
    });
    const [message, setMessage] = useState({ type: "", text: "" });
    const [loading, setLoading] = useState(false);

    const loadUsers = async () => {
        try {
            setUsers(await getUsers());
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to load users.") });
        }
    };

    useEffect(() => {
        if (user?.role === "admin") loadUsers();
    }, [user]);

    if (user?.role !== "admin") return null;

    const addUser = async (event) => {
        event.preventDefault();
        setMessage({ type: "", text: "" });

        try {
            await createUser(form);
            setForm({ username: "", password: "", role: "user" });
            setMessage({ type: "success", text: "User created successfully." });
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to create user.") });
        }
    };

    const resetPassword = async (id, username) => {
        const password = window.prompt(`Enter a new password for ${username}:`);
        if (password === null) return;

        try {
            await resetUserPassword(id, password);
            setMessage({ type: "success", text: `Password updated for ${username}.` });
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to reset password.") });
        }
    };

    const removeUser = async (id, username) => {
        if (!window.confirm(`Delete user "${username}"?`)) return;

        try {
            await deleteUser(id);
            setMessage({ type: "success", text: "User deleted successfully." });
            await loadUsers();
        } catch (error) {
            setMessage({ type: "error", text: getErrorMessage(error, "Failed to delete user.") });
        }
    };

    return (
        <section className="panel user-panel">
            <h2>Manage Users</h2>

            <form className="user-form" onSubmit={addUser}>
                <input
                    type="text"
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
                <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                </select>
                <button className="btn btn-primary" disabled={loading}>
                    Add User
                </button>
            </form>

            {message.text && (
                <p className={`message message-${message.type}`}>{message.text}</p>
            )}

            <div className="table-scroll user-table">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((item) => (
                            <tr key={item.id}>
                                <td>{item.id}</td>
                                <td>{item.username}</td>
                                <td>{item.role}</td>
                                <td>{new Date(item.created_at).toLocaleString()}</td>
                                <td>
                                    <button
                                        type="button"
                                        className="btn btn-secondary small-btn"
                                        onClick={() => resetPassword(item.id, item.username)}
                                    >
                                        Reset Password
                                    </button>{" "}
                                    {item.id !== user.id && (
                                        <button
                                            type="button"
                                            className="btn btn-danger small-btn"
                                            onClick={() => removeUser(item.id, item.username)}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
