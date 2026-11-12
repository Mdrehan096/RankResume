import { useContext, useCallback, useState } from "react";
import { AuthContext } from "../authContext";
import { login, register, logout } from "../services/auth.api";

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }

    const { user, setUser, loading } = context;
    const [submitting, setSubmitting] = useState(false);

    const handleLogin = useCallback(async ({ email, password }) => {
        setSubmitting(true);
        try {
            const data = await login({ email, password });
            setUser(data?.user ?? null);
            return { success: true, user: data?.user ?? null };
        } catch (err) {
            return { success: false, error: err?.message || "Invalid email or password" };
        } finally {
            setSubmitting(false);
        }
    }, [setUser]);

    const handleRegister = useCallback(async ({ username, email, password }) => {
        setSubmitting(true);
        try {
            const data = await register({ username, email, password });
            setUser(data?.user ?? null);
            return { success: true, user: data?.user ?? null };
        } catch (err) {
            return { success: false, error: err?.message || "Registration failed" };
        } finally {
            setSubmitting(false);
        }
    }, [setUser]);

    const handleLogout = useCallback(async () => {
        setSubmitting(true);
        try {
            await logout();
            setUser(null);
            return { success: true };
        } catch (err) {
            setUser(null);
            return { success: false, error: err?.message || "Logout failed" };
        } finally {
            setSubmitting(false);
        }
    }, [setUser]);

    return { user, loading, submitting, handleRegister, handleLogin, handleLogout };
};
