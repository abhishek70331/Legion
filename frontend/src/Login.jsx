import { useState } from "react";
import { loginRequest, requestPasswordReset } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./ToastContext.jsx";

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
    const toast = useToast();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Forgot password modal state
    const [forgotModalOpen, setForgotModalOpen] = useState(false);
    const [forgotIdentifier, setForgotIdentifier] = useState("");
    const [forgotNotes, setForgotNotes] = useState("");
    const [forgotSubmitting, setForgotSubmitting] = useState(false);
    const [forgotStatus, setForgotStatus] = useState({ type: "", text: "" });

    const banner = message
        ? { type: "error", text: message }
        : notice
            ? { type: notice.type, text: notice.text }
            : null;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setMessage("");
        clearNotice();

        if (!identifier.trim() || !password) {
            const errText = "Please enter your username or email and password.";
            setMessage(errText);
            toast.error("Validation Error", errText);
            return;
        }

        setLoading(true);
        try {
            const result = await loginRequest(identifier.trim(), password);
            toast.success(
                "Access Granted",
                `Signed in as ${result.user.full_name || result.user.username}. Initializing authorized modules.`,
                result.user.role?.toUpperCase()
            );
            login(result.token, result.user, result.permissions);
        } catch (error) {
            const errText =
                error?.response?.data?.message ||
                "Login failed. Please verify your credentials or account status.";
            setMessage(errText);
            toast.error("Authentication Failed", errText);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotStatus({ type: "", text: "" });

        if (!forgotIdentifier.trim()) {
            const errText = "Please enter your username or registered email.";
            setForgotStatus({ type: "error", text: errText });
            toast.error("Validation Error", errText);
            return;
        }

        setForgotSubmitting(true);
        try {
            const res = await requestPasswordReset(forgotIdentifier.trim(), forgotNotes.trim());
            const successMsg = res.message || "Your password assistance request has been submitted to system administrators.";
            setForgotStatus({
                type: "success",
                text: successMsg
            });
            toast.success("Request Submitted", successMsg);
            setForgotIdentifier("");
            setForgotNotes("");
        } catch (error) {
            const errText = error?.response?.data?.message || "Failed to submit reset request. Please contact your administrator.";
            setForgotStatus({
                type: "error",
                text: errText
            });
            toast.error("Request Failed", errText);
        } finally {
            setForgotSubmitting(false);
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
                    <p className="brand-kicker">LEGION CONTROL PLATFORM</p>
                    <h1>Insulator Ultrasonic<br />Testing Suite</h1>
                    <p className="brand-copy">
                        Unified industrial access management, inspection records, shift analytics, and role-based permissions.
                    </p>
                    <div className="brand-line" />
                    <div className="brand-meta">
                        <span className="status-dot" />
                        <span>Role-Based Secure Workspace</span>
                    </div>
                </div>

                <div className="login-card">
                    <div className="login-heading">
                        <p className="login-eyebrow">ENTERPRISE ACCESS</p>
                        <h2>Sign in</h2>
                        <p>Authenticate with your username or registered email.</p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <label className="login-field">
                            <span>Username or Email</span>
                            <span className="input-wrap">
                                <span className="input-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24">
                                        <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                                        <path d="M5 20c.8-3.6 3.1-5.5 7-5.5s6.2 1.9 7 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    autoComplete="username"
                                    autoFocus
                                    placeholder="Username or user@legion.com"
                                />
                            </span>
                        </label>

                        <label className="login-field">
                            <div className="login-field-header">
                                <span>Password</span>
                                <button
                                    type="button"
                                    className="login-forgot-link"
                                    onClick={() => {
                                        setForgotModalOpen(true);
                                        setForgotStatus({ type: "", text: "" });
                                        if (identifier) setForgotIdentifier(identifier);
                                    }}
                                >
                                    Forgot password?
                                </button>
                            </div>
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
                                    placeholder="Enter your secure password"
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
                                    Authenticating...
                                </>
                            ) : (
                                <>Sign in <span className="login-arrow">→</span></>
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <span className="footer-lock">●</span>
                        <span>Protected by granular RBAC session policies</span>
                    </div>
                </div>
            </section>

            {/* FORGOT PASSWORD ASSISTANCE MODAL */}
            {forgotModalOpen && (
                <div className="record-modal-backdrop" onClick={() => !forgotSubmitting && setForgotModalOpen(false)}>
                    <div className="record-modal login-assist-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="record-modal-header">
                            <div>
                                <span className="section-kicker">CREDENTIAL ASSISTANCE</span>
                                <h2>Password Reset Request</h2>
                                <p>Submit a secure reset notification to system administrators.</p>
                            </div>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={() => !forgotSubmitting && setForgotModalOpen(false)}
                            >
                                ×
                            </button>
                        </div>

                        <form onSubmit={handleForgotSubmit}>
                            <div className="modal-body-content">
                                <label className="field">
                                    <span>Username or Registered Email *</span>
                                    <input
                                        type="text"
                                        value={forgotIdentifier}
                                        onChange={(e) => setForgotIdentifier(e.target.value)}
                                        placeholder="e.g. operator_shift1 or operator@workstation.com"
                                        required
                                    />
                                </label>

                                <label className="field">
                                    <span>Workstation or Notes (Optional)</span>
                                    <textarea
                                        rows={3}
                                        value={forgotNotes}
                                        onChange={(e) => setForgotNotes(e.target.value)}
                                        placeholder="e.g. Shift 1 Ultrasonic line operator locked out"
                                    />
                                </label>

                                {forgotStatus.text && (
                                    <div className={`um-alert ${forgotStatus.type === "success" ? "um-alert-success" : "um-alert-error"}`}>
                                        <span className="um-alert-icon">{forgotStatus.type === "success" ? "✓" : "!"}</span>
                                        <span>{forgotStatus.text}</span>
                                    </div>
                                )}
                            </div>

                            <div className="record-modal-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setForgotModalOpen(false)}
                                    disabled={forgotSubmitting}
                                >
                                    Close
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={forgotSubmitting}
                                >
                                    {forgotSubmitting ? "Submitting..." : "Submit Reset Request"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <p className="login-copyright">Legion · Insulator Ultrasonic Testing Operations</p>
        </main>
    );
}
