import axios from "axios";

// Dev: falls back to the local backend. Production (Vercel): set VITE_API_URL.
const API_URL = (
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? "http://localhost:5000/api" : "/api")
).replace(/\/+$/, "");

// Authentication is intentionally kept only in JavaScript memory.
// Therefore a full page refresh/reload clears the token and shows Login again.
let authToken = null;

export const setAuthToken = (token) => {
    authToken = token || null;
};

export const getAuthToken = () => authToken;

export const clearAuthToken = () => {
    authToken = null;
};

// Called when the server rejects the current session (signed out by an admin,
// banned, subscription expired, token expired...). AuthContext uses this to
// return to the login page immediately instead of leaving a broken screen.
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
        const isAuthEndpoint = url.includes("/auth/login") || url.includes("/auth/logout");

        // Only react once per session: if the token is already cleared, another
        // request has already ended the session.
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

export const loginRequest = async (username, password) => {
    const response = await api.post("/auth/login", { username, password });
    return response.data;
};

export const logoutRequest = async (token) => {
    // The token is passed explicitly because the in-memory token is cleared
    // before this request is sent.
    const response = await api.post("/auth/logout", null, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        timeout: 8000
    });
    return response.data;
};

export const getCurrentUser = async () => {
    const response = await api.get("/auth/me");
    return response.data.user;
};

export const getAllRecords = async () => {
    const response = await api.get("/data");
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

// Returns { users: [...], meta: { today, timezone } }
export const getUsers = async () => {
    const response = await api.get("/users");
    return response.data;
};

export const createUser = async (data) => {
    const response = await api.post("/users", data);
    return response.data;
};

export const resetUserPassword = async (id, password) => {
    const response = await api.patch(`/users/${id}/password`, { password });
    return response.data;
};

export const deleteUser = async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
};

export const banUser = async (id, is_banned) => {
    const response = await api.patch(`/users/${id}/ban`, { is_banned });
    return response.data;
};

export const logoutUser = async (id) => {
    const response = await api.post(`/users/${id}/logout`);
    return response.data;
};

// payload: { mode: "set", expires_on } | { mode: "extend", days } | { mode: "remove" }
export const updateUserSubscription = async (id, payload) => {
    const response = await api.patch(`/users/${id}/subscription`, payload);
    return response.data;
};

export const getSubscriptionHistory = async (id) => {
    const response = await api.get(`/users/${id}/subscription-history`);
    return response.data;
};

export const getErrorMessage = (
    error,
    fallback = "Something went wrong."
) => {
    return (
        error?.response?.data?.message ||
        error?.message ||
        fallback
    );
};
