import React from "react";

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Critical Application Render Error:", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    handleResetSession = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/";
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "linear-gradient(135deg, #06172b 0%, #0d2b4c 50%, #114268 100%)",
                    color: "#f8fafc",
                    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
                    padding: "2rem"
                }}>
                    <div style={{
                        maxWidth: "580px",
                        width: "100%",
                        background: "rgba(15, 23, 42, 0.95)",
                        border: "1px solid rgba(239, 68, 68, 0.45)",
                        borderRadius: "16px",
                        padding: "2.5rem 2rem",
                        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.25)",
                        textAlign: "center"
                    }}>
                        <div style={{
                            width: "56px",
                            height: "56px",
                            margin: "0 auto 1.25rem",
                            borderRadius: "14px",
                            background: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#ef4444",
                            fontSize: "1.75rem"
                        }}>
                            ⚠️
                        </div>
                        <span style={{
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            letterSpacing: "0.1em",
                            color: "#f87171",
                            textTransform: "uppercase",
                            display: "block",
                            marginBottom: "0.5rem"
                        }}>
                            Application Diagnostic State
                        </span>
                        <h1 style={{ fontSize: "1.45rem", margin: "0 0 0.75rem", color: "#ffffff", fontWeight: 700 }}>
                            Workspace Render Interrupted
                        </h1>
                        <p style={{ fontSize: "0.9rem", color: "#94a3b8", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                            An unexpected interface exception was caught. Your database records and sessions remain secure.
                        </p>
                        {this.state.error && (
                            <div style={{
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                borderRadius: "8px",
                                padding: "0.85rem",
                                marginBottom: "1.75rem",
                                textAlign: "left",
                                fontSize: "0.8rem",
                                color: "#fca5a5",
                                fontFamily: "monospace",
                                overflowX: "auto",
                                whiteSpace: "pre-wrap"
                            }}>
                                {this.state.error.message || String(this.state.error)}
                            </div>
                        )}
                        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                            <button
                                onClick={this.handleReload}
                                style={{
                                    padding: "0.75rem 1.4rem",
                                    background: "#2563eb",
                                    color: "#ffffff",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontWeight: 600,
                                    fontSize: "0.88rem",
                                    cursor: "pointer"
                                }}
                            >
                                ↻ Reload Interface
                            </button>
                            <button
                                onClick={this.handleResetSession}
                                style={{
                                    padding: "0.75rem 1.4rem",
                                    background: "rgba(255, 255, 255, 0.08)",
                                    color: "#cbd5e1",
                                    border: "1px solid rgba(255, 255, 255, 0.2)",
                                    borderRadius: "8px",
                                    fontWeight: 600,
                                    fontSize: "0.88rem",
                                    cursor: "pointer"
                                }}
                            >
                                Reset Session & Sign In
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
