import { useState } from "react";

const API = "http://localhost:3000/api";

export default function Auth({ onLogin }) {
    const [registering, setRegistering] = useState(false);
    const [fullName, setFullName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(event) {
        event.preventDefault();
        if (busy) return;

        setError("");
        setMessage("");

        if (registering && password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setBusy(true);

        try {
            const response = await fetch(
                `${API}/auth/${registering ? "register" : "login"}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ...(registering ? { full_name: fullName } : {}),
                        username,
                        password,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to process your request.");
            }

            if (registering) {
                setMessage(data.message);
                setRegistering(false);
                setPassword("");
                setConfirmPassword("");
            } else {
                onLogin(data);
            }
        } catch (err) {
            setError(
                err.message === "Failed to fetch"
                    ? "Cannot connect to Express. Check that the server is running."
                    : err.message
            );
        } finally {
            setBusy(false);
        }
    }

    function switchMode() {
        setRegistering(!registering);
        setError("");
        setMessage("");
        setPassword("");
        setConfirmPassword("");
    }

    return (
        <main className="kiosk">
            <header className="page-header">
                <span className="office-label">CITY TREASURY OFFICE</span>
                <h1>{registering ? "Create teller account" : "Staff sign in"}</h1>
                <p>
                    {registering
                        ? "An administrator will approve your account and assign your counter."
                        : "Sign in with your administrator or teller account."}
                </p>
            </header>

            <form className="auth-panel" onSubmit={handleSubmit}>
                {error && (
                    <div className="error-message" role="alert">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="success-message" role="status">
                        {message}
                    </div>
                )}

                {registering && (
                    <label>
                        Full name
                        <input
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            autoComplete="name"
                            minLength={2}
                            maxLength={120}
                            required
                            disabled={busy}
                        />
                    </label>
                )}

                <label>
                    Username
                    <input
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        minLength={3}
                        maxLength={50}
                        required
                        disabled={busy}
                    />
                </label>

                <label>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={
                            registering ? "new-password" : "current-password"
                        }
                        minLength={registering ? 6 : undefined}
                        required
                        disabled={busy}
                    />
                </label>

                {registering && (
                    <label>
                        Confirm password
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={6}
                            required
                            disabled={busy}
                        />
                    </label>
                )}

                <button className="auth-submit" type="submit" disabled={busy}>
                    {busy
                        ? "Please wait…"
                        : registering
                            ? "Submit registration"
                            : "Sign in"}
                </button>

                <button
                    className="auth-switch"
                    type="button"
                    disabled={busy}
                    onClick={switchMode}
                >
                    {registering
                        ? "Already registered? Sign in"
                        : "New teller? Create an account"}
                </button>
            </form>
        </main>
    );
}