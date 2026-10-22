import CounterServices from "./CounterServices";
import { useEffect, useRef, useState } from "react";
import PasswordForm from "./PasswordForm";

const API = "/api";

export default function Admin({ session, onLogout }) {
    const [tellers, setTellers] = useState([]);
    const [counters, setCounters] = useState([]);
    const [assignments, setAssignments] = useState({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [resetTeller, setResetTeller] = useState(null);

    const saving = useRef(false);

    async function request(path, options = {}) {
        const response = await fetch(`${API}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.token}`,
            },
        });

        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
            onLogout();
            throw new Error("Please sign in with an active administrator account.");
        }

        if (!response.ok) {
            throw new Error(data.message || "Request failed.");
        }

        return data;
    }

    async function loadData() {
        setLoading(true);
        setError("");

        try {
            const [users, counterList] = await Promise.all([
                request("/admin/tellers"),
                request("/counters"),
            ]);

            setTellers(users);
            setCounters(counterList.filter((counter) => counter.is_active));

            const selected = {};

            for (const user of users) {
                selected[user.id] = user.counter_id
                    ? String(user.counter_id)
                    : "";
            }

            setAssignments(selected);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [session.token]);

    async function updateTeller(user, action) {
        if (saving.current) return;

        const counterId = Number(assignments[user.id]);

        if (action === "assignment" && !counterId) {
            setError(`Select a counter for ${user.full_name}.`);
            return;
        }

        if (
            action === "disable" &&
            !window.confirm(`Disable access for ${user.full_name}?`)
        ) {
            return;
        }

        saving.current = true;
        setBusy(true);
        setError("");
        setMessage("");

        try {
            const data = await request(
                `/admin/tellers/${user.id}/${action}`,
                {
                    method: "PUT",
                    body: JSON.stringify(
                        action === "assignment"
                            ? { counter_id: counterId }
                            : {}
                    ),
                }
            );

            await loadData();
            setMessage(data.message);
        } catch (err) {
            setError(err.message);
        } finally {
            saving.current = false;
            setBusy(false);
        }
    }

    return (
        <main className="kiosk admin-page">
            <header className="page-header">
                <span className="office-label">CITY TREASURY OFFICE</span>
                <h1>Teller account management</h1>
                <p>Approve registrations and assign counters.</p>
            </header>

            <div className="admin-toolbar">
                <span>Signed in as {session.user.full_name}</span>

                <div className="ticket-actions">
                    <button disabled={busy || loading} onClick={loadData}>
                        Refresh
                    </button>
                    <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={onLogout}
                    >
                        Sign out
                    </button>
                </div>
            </div>

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

            {loading ? (
                <p>Loading teller accounts…</p>
            ) : tellers.length === 0 ? (
                <section className="ticket-panel">
                    <h2>No teller registrations yet</h2>
                    <p>Registered tellers will appear here for approval.</p>
                </section>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Teller</th>
                                <th>Status</th>
                                <th>Assigned counter</th>
                                <th>Actions</th>
                            </tr>
                        </thead>

                        <tbody>
                            {tellers.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <strong>{user.full_name}</strong>
                                        <small className="username-label">
                                            {user.username}
                                        </small>
                                    </td>

                                    <td>
                                        <span className={`account-status ${user.status}`}>
                                            {user.status}
                                        </span>
                                    </td>

                                    <td>
                                        <select
                                            className="assignment-select"
                                            aria-label={`Counter for ${user.full_name}`}
                                            value={assignments[user.id] || ""}
                                            disabled={busy}
                                            onChange={(event) =>
                                                setAssignments((current) => ({
                                                    ...current,
                                                    [user.id]: event.target.value,
                                                }))
                                            }
                                        >
                                            <option value="">Select counter</option>

                                            {counters.map((counter) => (
                                                <option key={counter.id} value={counter.id}>
                                                    {counter.name}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td>
                                        <div className="ticket-actions row-actions">
                                            <button
                                                disabled={busy || !assignments[user.id]}
                                                onClick={() => updateTeller(user, "assignment")}
                                            >
                                                {user.status === "pending"
                                                    ? "Approve"
                                                    : user.status === "disabled"
                                                        ? "Enable"
                                                        : "Save assignment"}
                                            </button>

                                            <button
                                                className="secondary-button"
                                                disabled={busy || user.status === "disabled"}
                                                onClick={() => updateTeller(user, "disable")}
                                            >
                                                Disable
                                            </button>
                                            <button
                                                type="button"
                                                className="secondary-button"
                                                disabled={busy}
                                                onClick={() => setResetTeller(user)}
                                                >
                                                Reset password
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
                            {resetTeller && (
                    <PasswordForm
                        key={resetTeller.id}
                        session={session}
                        onLogout={onLogout}
                        teller={resetTeller}
                        disabled={busy}
                        onBusyChange={setBusy}
                        onCancel={() => setResetTeller(null)}
                    />
                    )}

                    <PasswordForm
                    session={session}
                    onLogout={onLogout}
                    disabled={busy}
                    onBusyChange={setBusy}
                    />

                    <CounterServices session={session} onLogout={onLogout} />
        </main>
    );
}