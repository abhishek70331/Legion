import axios from "axios";

// Dev: falls back to the local backend. Production (Vercel/Render): set VITE_API_URL.
const rawApiUrl = (
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? "http://localhost:5000/api" : "/api")
).trim();

// Ensure clean URL: remove trailing slashes
let normalizedUrl = rawApiUrl.replace(/\/+$/, "");
if (normalizedUrl.startsWith("http") && !normalizedUrl.endsWith("/api")) {
    normalizedUrl = `${normalizedUrl}/api`;
}

export const API_URL = normalizedUrl;

let authToken = null;

export const setAuthToken = (token) => {
    authToken = token || null;
};

export const getAuthToken = () => authToken;

export const clearAuthToken = () => {
    authToken = null;
};

let unauthorizedHandler = null;

export const setUnauthorizedHandler = (handler) => {
    unauthorizedHandler = handler;
};

const api = axios.create({
    baseURL: API_URL
});

api.interceptors.request.use((config) => {
    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const url = error.config?.url || "";
        const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/logout") || url.includes("/auth/forgot-password");

        if (error.response?.status === 401 && !isAuthEndpoint && authToken) {
            clearAuthToken();
            unauthorizedHandler?.({
                code: error.response.data?.code,
                message: error.response.data?.message
            });
        }
        return Promise.reject(error);
    }
);

// ------------------------------------
// AUTHENTICATION
// ------------------------------------

export const loginRequest = async (usernameOrEmail, password) => {
    const response = await api.post("/auth/login", {
        username: usernameOrEmail,
        password
    });
    return response.data;
};

export const logoutRequest = async (token) => {
    const response = await api.post("/auth/logout", null, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 8000
    });
    return response.data;
};

export const getCurrentUser = async () => {
    const response = await api.get("/auth/me");
    return response.data; // { user, permissions }
};

export const requestPasswordReset = async (username_or_email, notes) => {
    const response = await api.post("/auth/forgot-password", { username_or_email, notes });
    return response.data;
};

export const checkHealth = async () => {
    try {
        const response = await api.get("/health", { timeout: 6000 });
        return { ok: true, data: response.data };
    } catch (error) {
        return { ok: false, error };
    }
};

// ------------------------------------
// RECORDS
// ------------------------------------

export const getAllRecords = async (limit = 50) => {
    const response = await api.get("/data", { params: { limit } });
    return response.data;
};

export const getLast7DaysSummary = async () => {
    const response = await api.get("/data/last-7-days");
    return response.data;
};

export const getDateSummary = async (date) => {
    const response = await api.get("/data/date-summary", { params: { date } });
    return response.data;
};

export const createRecord = async (data) => {
    const response = await api.post("/data", data);
    return response.data;
};

export const updateRecord = async (data) => {
    const response = await api.patch("/data", data);
    return response.data;
};

export const deleteRecord = async ({ heading, customer_name, uid }) => {
    const response = await api.delete("/data", {
        data: { heading, customer_name, uid }
    });
    return response.data;
};

export const searchRecords = async ({ heading, customer_name, uid, record_date }) => {
    const response = await api.get("/data/search", {
        params: { heading, customer_name, uid, record_date }
    });
    return response.data;
};

// ------------------------------------
// USER & PERMISSION MANAGEMENT
// ------------------------------------

export const getUsers = async (params = {}) => {
    const response = await api.get("/users", { params });
    return response.data;
};

export const createUser = async (data) => {
    const response = await api.post("/users", data);
    return response.data;
};

export const updateUser = async (id, data) => {
    const response = await api.patch(`/users/${id}`, data);
    return response.data;
};

export const resetUserPassword = async (id, password) => {
    const response = await api.patch(`/users/${id}/password`, { password });
    return response.data;
};

export const updateUserStatus = async (id, status) => {
    const response = await api.patch(`/users/${id}/status`, { status });
    return response.data;
};

export const deleteUser = async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
};

export const logoutUser = async (id) => {
    const response = await api.post(`/users/${id}/logout`);
    return response.data;
};

export const getModules = async () => {
    const response = await api.get("/modules");
    return response.data;
};

export const getRoles = async () => {
    const response = await api.get("/roles");
    return response.data;
};

export const getUserPermissions = async (userId) => {
    const response = await api.get(`/permissions/${userId}`);
    return response.data;
};

export const saveUserPermissions = async (userId, permissions) => {
    const response = await api.put(`/permissions/${userId}`, { permissions });
    return response.data;
};

// ------------------------------------
// AUDIT & ADMIN METRICS
// ------------------------------------

export const getAuditLogs = async (params = {}) => {
    const response = await api.get("/audit-logs", { params });
    return response.data;
};

export const getAdminMetrics = async () => {
    const response = await api.get("/admin/metrics");
    return response.data;
};

export const getPasswordRequests = async () => {
    const response = await api.get("/admin/password-requests");
    return response.data;
};

export const updatePasswordRequest = async (id, status) => {
    const response = await api.patch(`/admin/password-requests/${id}`, { status });
    return response.data;
};

export const getErrorMessage = (error, fallback = "Something went wrong.") => {
    return (
        error?.response?.data?.message ||
        error?.message ||
        fallback
    );
};
