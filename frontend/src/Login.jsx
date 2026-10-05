import { useState } from "react";
import { loginRequest } from "./api.js";
import { useAuth } from "./AuthContext.jsx";

function ShieldIcon() {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="login-logo-icon">
            <path d="M24 4l16 6v11c0 10.7-6.5 18.4-16 23-9.5-4.6-16-12.3-16-23V10l16-6z" fill="currentColor" opacity=".18" />
            <path d="M24 7l13 4.9v9.1c0 8.7-5 15.4-13 19.6-8-4.2-13-10.9-13-19.6v-9.1L24 7z" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <path d="M17.5 24l4.2 4.2 8.9-9.1" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function EyeIcon({ visible }) {
    return visible ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18M10.6 6.3A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-3.1 3.5M6.2 6.9C3.5 8.7 2 12 2 12s3.5 6 10 6c1.4 0 2.7-.3 3.8-.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export default function Login() {
    const { login, notice, clearNotice } = useAuth();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Errors from this form win; otherwise show why the previous session ended
    // (signed out by an admin, subscription expired, etc.).
    const banner = message
        ? { type: "error", text: message }
        : notice
            ? { type: notice.type, text: notice.text }
            : null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage("");
        clearNotice();

        if (!username.trim() || !password) {
            setMessage("Please enter your username and password.");
            return;
        }

        setLoading(true);
        try {
            const result = await loginRequest(username.trim(), password);
            login(result.token, result.user);
        } catch (error) {
            setMessage(
                error?.response?.data?.message ||
                "Login failed. Please check your username and password."
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page">
            <div className="login-glow login-glow-one" />
            <div className="login-glow login-glow-two" />

            <section className="login-shell">
                <div className="login-brand-panel">
                    <div className="brand-mark">
                        <ShieldIcon />
                    </div>
                    <p className="brand-kicker">LEGION SYSTEM</p>
                    <h1>Insulator Ultrasonic<br />Testing Data</h1>
                    <p className="brand-copy">
                        Secure access to your inspection records, testing data and operational tools.
                    </p>
                    <div className="brand-line" />
                    <div className="brand-meta">
                        <span className="status-dot" />
                        <span>Secure workspace</span>
                    </div>
                </div>

                <div className="login-card">
                    <div className="login-heading">
                        <p className="login-eyebrow">WELCOME BACK</p>
                        <h2>Sign in</h2>
                        <p>Enter your credentials to continue.</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <label className="login-field">
                            <span>Username</span>
                            <span className="input-wrap">
                                <span className="input-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24">
                                        <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                        <path d="M5 20c.8-3.6 3.1-5.5 7-5.5s6.2 1.9 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    autoFocus
                                    placeholder="Enter your username"
                                />
                            </span>
                        </label>

                        <label className="login-field">
                            <span>Password</span>
                            <span className="input-wrap">
                                <span className="input-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24">
                                        <rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                        <path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    placeholder="Enter your password"
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword((value) => !value)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    <EyeIcon visible={showPassword} />
                                </button>
                            </span>
                        </label>

                        {banner && (
                            <div className={`login-error ${banner.type === "info" ? "login-info" : ""}`} role="alert">
                                <span className="error-icon">{banner.type === "info" ? "ℹ" : "!"}</span>
                                <span>{banner.text}</span>
                            </div>
                        )}

                        <button className="login-button" disabled={loading} type="submit">
                            {loading ? (
                                <>
                                    <span className="login-spinner" />
                                    Signing in...
                                </>
                            ) : (
                                <>Sign in <span className="login-arrow">→</span></>
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <span className="footer-lock">●</span>
                        <span>Your session is protected</span>
                    </div>
                </div>
            </section>

            <p className="login-copyright">Legion · Insulator Ultrasonic Testing</p>
        </main>
    );
}
