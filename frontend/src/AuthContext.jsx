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

const SESSION_CHECK_MS = 25 * 1000;

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState({});
    const [loading] = useState(false);
    const [notice, setNotice] = useState(null);

    const endSession = useCallback((nextNotice = null) => {
        clearAuthToken();
        setUser(null);
        setPermissions({});
        setNotice(nextNotice);
    }, []);

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

    // Keep session and permissions fresh while signed in
    useEffect(() => {
        if (!user) return undefined;

        let cancelled = false;

        const check = async () => {
            try {
                const data = await getCurrentUser();
                if (cancelled) return;

                if (data.user) {
                    setUser((prev) => {
                        if (!prev) return data.user;
                        const isSame =
                            prev.role === data.user.role &&
                            prev.username === data.user.username &&
                            prev.status === data.user.status;
                        return isSame ? prev : { ...prev, ...data.user };
                    });
                }
                if (data.permissions) {
                    setPermissions(data.permissions);
                }
            } catch {
                // Handled by unauthorizedHandler if 401
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
    }, [user?.id]);

    const login = (token, loggedInUser, initialPermissions = {}) => {
        setAuthToken(token);
        setNotice(null);
        setUser(loggedInUser);
        setPermissions(initialPermissions || {});
    };

    const logout = () => {
        const token = getAuthToken();
        endSession(null);

        if (token) {
            logoutRequest(token).catch(() => {});
        }
    };

    const clearNotice = () => setNotice(null);

    /**
     * Checks if current user is authorized for specific module:action
     */
    const hasPermission = useCallback((moduleKey, actionName) => {
        if (!user) return false;
        if (user.role === "superadmin") return true;
        if (!permissions || typeof permissions !== "object") return false;
        return Boolean(permissions[moduleKey]?.[actionName]);
    }, [user, permissions]);

    /**
     * Checks if current user has ANY permission in this module (for tab visibility)
     */
    const canAccessModule = useCallback((moduleKey) => {
        if (!user) return false;
        if (user.role === "superadmin") return true;
        if (!permissions || typeof permissions !== "object") return false;
        const mod = permissions[moduleKey];
        if (!mod || typeof mod !== "object") return false;
        return Object.values(mod).some(Boolean);
    }, [user, permissions]);

    return (
        <AuthContext.Provider
            value={{
                user,
                permissions,
                loading,
                notice,
                clearNotice,
                login,
                logout,
                hasPermission,
                canAccessModule
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
