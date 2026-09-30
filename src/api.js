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
        if (error.response?.status === 401) {
            clearAuthToken();
        }
        return Promise.reject(error);
    }
);

export const loginRequest = async (username, password) => {
    const response = await api.post("/auth/login", { username, password });
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
