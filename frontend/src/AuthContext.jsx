import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
    clearAuthToken,
    getAuthToken,
    getCurrentUser,
    logoutRequest,
    setAuthToken,
    setUnauthorizedHandler
} from "./api.js";

const AuthContext = createContext(null);

// How often a signed-in browser re-checks its session with the server. This is
// what makes "Force logout", bans take effect within
// seconds, even if the user is not clicking anything.
const SESSION_CHECK_MS = 30 * 1000;

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading] = useState(false);
    // Message shown on the login page after the session ended unexpectedly.
    const [notice, setNotice] = useState(null);

    const endSession = useCallback((nextNotice = null) => {
        clearAuthToken();
        setUser(null);
        setNotice(nextNotice);
    }, []);

    // Intentionally do NOT restore authentication from localStorage/sessionStorage.
    // A full browser refresh starts a new React session and therefore requires login again.
    useEffect(() => {
        clearAuthToken();
        localStorage.removeItem("legion_token");
        localStorage.removeItem("legion_user");
        sessionStorage.removeItem("legion_token");
        sessionStorage.removeItem("legion_user");

        setUnauthorizedHandler(({ code, message }) => {
            endSession({
                type: code === "TOKEN_INVALID" ? "info" : "error",
                text: message || "Your session has ended. Please sign in again."
            });
        });

        return () => setUnauthorizedHandler(null);
    }, [endSession]);

    // Keep the session fresh while signed in.
    useEffect(() => {
        if (!user) return undefined;

        let cancelled = false;

        const check = async () => {
            try {
                const current = await getCurrentUser();
                if (cancelled) return;

                setUser((previous) => {
                    if (!previous) return previous;
                    const same =
                        previous.role === current.role &&
                        previous.username === current.username &&
                        true;
                    return same ? previous : { ...previous, ...current };
                });
            } catch {
                // A 401 is handled by the API interceptor (it ends the session).
                // Network hiccups are ignored and retried on the next check.
            }
        };

        const onVisible = () => {
            if (document.visibilityState === "visible") check();
        };

        const timer = setInterval(check, SESSION_CHECK_MS);
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);

        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const login = (token, loggedInUser) => {
        // Token lives only in this page's JavaScript memory.
        // It is intentionally not persisted, so F5/reload requires login again.
        setAuthToken(token);
        setNotice(null);
        setUser(loggedInUser);
    };

    const logout = () => {
        const token = getAuthToken();

        // Leave the app immediately, then close the session on the server so the
        // token cannot be reused and the user no longer shows as "online".
        endSession(null);

        if (token) {
            logoutRequest(token).catch(() => {
                // Best effort: the session still expires on its own.
            });
        }
    };

    const clearNotice = () => setNotice(null);

    return (
        <AuthContext.Provider value={{ user, loading, notice, clearNotice, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
