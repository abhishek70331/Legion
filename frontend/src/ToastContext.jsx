import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";

const ToastContext = createContext(null);

function ShieldCheckIcon() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(16, 185, 129, 0.18)" />
            <path d="M9 12l2 2 4-4" />
        </svg>
    );
}

function ShieldAlertIcon() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(239, 68, 68, 0.18)" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" fill="rgba(14, 165, 233, 0.18)" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    );
}

function ToastItem({ toast, onDismiss }) {
    const [paused, setPaused] = useState(false);
    const duration = toast.duration || (toast.type === "error" ? 6000 : 4500);
    const timerRef = useRef(null);
    const remainingRef = useRef(duration);
    const startTimeRef = useRef(Date.now());

    useEffect(() => {
        if (paused) return;

        startTimeRef.current = Date.now();
        timerRef.current = setTimeout(() => {
            onDismiss(toast.id);
        }, remainingRef.current);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [paused, toast.id, onDismiss]);

    const handleMouseEnter = () => {
        setPaused(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    };

    const handleMouseLeave = () => {
        setPaused(false);
    };

    const isSuccess = toast.type === "success";
    const isError = toast.type === "error";

    return (
        <div
            className={`floating-toast ${isSuccess ? "toast-success" : isError ? "toast-error" : "toast-info"} ${toast.closing ? "toast-closing" : ""}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            role="alert"
            aria-live="assertive"
        >
            <div className="toast-glow" />

            <div className="toast-icon-wrap">
                {isSuccess && <ShieldCheckIcon />}
                {isError && <ShieldAlertIcon />}
                {!isSuccess && !isError && <InfoIcon />}
            </div>

            <div className="toast-body">
                <div className="toast-header-row">
                    <strong className="toast-title">{toast.title}</strong>
                    {toast.details && <span className="toast-badge">{toast.details}</span>}
                </div>
                {toast.message && <p className="toast-message">{toast.message}</p>}
            </div>

            <button
                type="button"
                className="toast-close-btn"
                onClick={() => onDismiss(toast.id)}
                aria-label="Close notification"
            >
                ×
            </button>

            <div
                className="toast-progress-bar"
                style={{
                    animationDuration: `${duration}ms`,
                    animationPlayState: paused ? "paused" : "running"
                }}
            />
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const dismissToast = useCallback((id) => {
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, closing: true } : t))
        );
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 280);
    }, []);

    const showToast = useCallback(({ type = "success", title, message, details = "", duration }) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const newToast = { id, type, title, message, details, duration, closing: false };

        setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep up to 5 most recent
        return id;
    }, []);

    const toast = useMemo(() => ({
        success: (title, message, details, duration) =>
            showToast({ type: "success", title, message, details, duration }),
        error: (title, message, details, duration) =>
            showToast({ type: "error", title, message, details, duration: duration || 6500 }),
        info: (title, message, details, duration) =>
            showToast({ type: "info", title, message, details, duration }),
        show: showToast,
        dismiss: dismissToast
    }), [showToast, dismissToast]);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="floating-toast-container" aria-live="polite">
                {toasts.map((item) => (
                    <ToastItem key={item.id} toast={item} onDismiss={dismissToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        return {
            success: (title, msg, details) => console.log("[TOAST:SUCCESS]", title, msg, details),
            error: (title, msg, details) => console.error("[TOAST:ERROR]", title, msg, details),
            info: (title, msg, details) => console.info("[TOAST:INFO]", title, msg, details),
            show: () => "",
            dismiss: () => {}
        };
    }
    return context;
}
