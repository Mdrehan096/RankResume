import React, { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router";
import "../auth.form.scss";
import { useAuth } from "../hooks/useAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = () => {
    const { user, loading, submitting, handleLogin } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const trimmedEmail = email.trim();
        if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
            setError("Please enter a valid email address.");
            return;
        }
        if (!password) {
            setError("Please enter your password.");
            return;
        }

        const result = await handleLogin({ email: trimmedEmail, password });
        if (result.success) {
            navigate("/", { replace: true });
        } else {
            setError(result.error || "Invalid email or password.");
        }
    };

    if (loading) {
        return (
            <main className="auth-page">
                <h1>Loading...</h1>
            </main>
        );
    }

    if (user) {
        return <Navigate to="/" replace />;
    }

    return (
        <main className="auth-page">
            <div className="form-container">
                <h1>Login</h1>
                {error && (
                    <div className="form-error" role="alert">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} noValidate>
                    <div className="input-group">
                        <label htmlFor="email">Email</label>
                        <input
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            type="email"
                            id="email"
                            name="email"
                            autoComplete="email"
                            placeholder="Enter email address"
                            required
                        />
                    </div>
                    <div className="input-group">
                        <label htmlFor="password">Password</label>
                        <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            placeholder="Enter password"
                            required
                        />
                    </div>
                    <button type="submit" className="button primary-button" disabled={submitting}>
                        {submitting ? "Signing in..." : "Login"}
                    </button>
                </form>
                <p>
                    Don&apos;t have an account? <Link to="/register">Register</Link>
                </p>
            </div>
        </main>
    );
};

export default Login;
