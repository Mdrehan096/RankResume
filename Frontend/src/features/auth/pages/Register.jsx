import React, { useState } from "react";
import { useNavigate, Link, Navigate } from "react-router";
import "../auth.form.scss";
import { useAuth } from "../hooks/useAuth";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register = () => {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");

    const { user, loading, submitting, handleRegister } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        const trimmedUsername = username.trim();
        const trimmedEmail = email.trim();

        if (trimmedUsername.length < 3) {
            setError("Username must be at least 3 characters.");
            return;
        }
        if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
            setError("Please enter a valid email address.");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        const result = await handleRegister({
            username: trimmedUsername,
            email: trimmedEmail,
            password,
        });

        if (result.success) {
            navigate("/", { replace: true });
        } else {
            setError(result.error || "Registration failed. Please try again.");
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
                <h1>Register</h1>
                {error && (
                    <div className="form-error" role="alert">
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} noValidate>
                    <div className="input-group">
                        <label htmlFor="username">Username</label>
                        <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            type="text"
                            id="username"
                            name="username"
                            autoComplete="username"
                            placeholder="Enter username"
                            required
                        />
                    </div>
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
                            autoComplete="new-password"
                            placeholder="Minimum 8 characters"
                            required
                        />
                    </div>

                    <button type="submit" className="button primary-button" disabled={submitting}>
                        {submitting ? "Creating account..." : "Register"}
                    </button>
                </form>

                <p>
                    Already have an account? <Link to="/login">Login</Link>
                </p>
            </div>
        </main>
    );
};

export default Register;
