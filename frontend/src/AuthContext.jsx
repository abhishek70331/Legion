import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUser, getAuthToken, setAuthToken, clearAuthToken } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false);

    // Intentionally do NOT restore authentication from localStorage/sessionStorage.
    // A full browser refresh starts a new React session and therefore requires login again.
    useEffect(() => {
        // Clear any token that may have been left by an older version.
        clearAuthToken();
        localStorage.removeItem("legion_token");
        localStorage.removeItem("legion_user");
        sessionStorage.removeItem("legion_token");
        sessionStorage.removeItem("legion_user");
        setUser(null);
        setLoading(false);
    }, []);

    const refreshUser = async () => {
        const token = getAuthTokenSafe();

        if (!token) {
            setUser(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const current = await getCurrentUser();
            setUser(current);
        } catch {
            clearAuthToken();
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const login = (token, loggedInUser) => {
        // Token lives only in this page's JavaScript memory.
        // It is intentionally not persisted, so F5/reload requires login again.
        setAuthToken(token);
        setUser(loggedInUser);
    };

    const logout = () => {
        clearAuthToken();
        localStorage.removeItem("legion_token");
        localStorage.removeItem("legion_user");
        sessionStorage.removeItem("legion_token");
        sessionStorage.removeItem("legion_user");
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

function getAuthTokenSafe() {
    return getAuthToken();
}

export function useAuth() {
    return useContext(AuthContext);
}
