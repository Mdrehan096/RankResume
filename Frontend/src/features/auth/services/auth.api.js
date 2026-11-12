import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

function extractErrorMessage(err, fallback) {
    return err?.response?.data?.message || err?.message || fallback;
}

export async function register({ username, email, password }) {
    try {
        const response = await api.post("/api/auth/register", {
            username,
            email,
            password,
        });
        return response.data;
    } catch (err) {
        throw new Error(extractErrorMessage(err, "Registration failed. Please try again."));
    }
}

export async function login({ email, password }) {
    try {
        const response = await api.post("/api/auth/login", {
            email,
            password,
        });
        return response.data;
    } catch (err) {
        throw new Error(extractErrorMessage(err, "Login failed. Please check your credentials."));
    }
}

export async function logout() {
    try {
        const response = await api.get("/api/auth/logout");
        return response.data;
    } catch (err) {
        throw new Error(extractErrorMessage(err, "Logout failed."));
    }
}

export async function getMe() {
    try {
        const response = await api.get("/api/auth/get-me");
        return response.data;
    } catch (err) {
        throw new Error(extractErrorMessage(err, "Not authenticated."));
    }
}
