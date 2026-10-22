import { useCallback, useEffect, useRef, useState } from "react";
import CounterServices from "./CounterServices";
import PasswordForm from "./PasswordForm";

const API = "/api";

export default function Admin({ session, onLogout }) {
  const [tellers, setTellers] = useState([]);
  const [counters, setCounters] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resetTeller, setResetTeller] = useState(null);

  const saving = useRef(false);
  const passwordRunning = useRef(false);

  const controlsDisabled = loading || busy || passwordBusy;

  function handlePasswordBusy(value) {
    passwordRunning.current = value;
    setPasswordBusy(value);
  }

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          ...options.headers,
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        onLogout();

        throw new Error(
          "Please sign in with an active administrator account."
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }

      return data;
    },
    [session.token, onLogout]
  );

  const loadData = useCallback(
    async (signal) => {
      const [users, counterList] = await Promise.all([
        request("/admin/tellers", { signal }),
        request("/counters", { signal }),
      ]);

      if (signal?.aborted) return;

      setTellers(users);
      setCounters(
        counterList.filter((counter) => counter.is_active)
      );

      const selected = {};

      for (const user of users) {
        selected[user.id] = user.counter_id
          ? String(user.counter_id)
          : "";
      }

      setAssignments(selected);
    },
    [request]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        await loadData(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => controller.abort();
  }, [loadData]);

  async function refreshData() {
    if (
      saving.current ||
      passwordRunning.current ||
      loading
    ) {
      return;
    }

    saving.current = true;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      saving.current = false;
      setLoading(false);
    }
  }

  async function updateTeller(user, action) {
    if (
      saving.current ||
      passwordRunning.current ||
      loading
    ) {
      return;
    }

    if (!["assignment", "disable"].includes(action)) {
      return;
    }

    const counterId = Number(assignments[user.id]);

    if (
      action === "assignment" &&
      (!Number.isInteger(counterId) || counterId < 1)
    ) {
      setError(`Select a counter for ${user.full_name}.`);
      setMessage("");
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

      setMessage(data.message || "Teller account updated.");

      try {
        await loadData();
      } catch (err) {
        setError(
          `The change was saved, but the list could not refresh. ${err.message}`
        );
      }
    } catch (err) {
      setError(err.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  function openPasswordReset(user) {
    if (
      saving.current ||
      passwordRunning.current ||
      loading
    ) {
      return;
    }

    setResetTeller(user);
    setError("");
    setMessage("");
  }

  return (
    <main className="kiosk admin-page">
      <header className="page-header">
        <span className="office-label">
          CITY TREASURY OFFICE
        </span>
        <h1>Teller account management</h1>
        <p>
          Approve registrations, assign counters, and manage passwords.
        </p>
      </header>

      <div className="admin-toolbar">
        <span>Signed in as {session.user.full_name}</span>

        <div className="ticket-actions">
          <button
            type="button"
            disabled={controlsDisabled}
            onClick={refreshData}
          >
            Refresh
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={controlsDisabled}
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
          <h2>
            {error
              ? "Teller accounts unavailable"
              : "No teller registrations yet"}
          </h2>
          <p>
            {error
              ? "Click Refresh to try loading the accounts again."
              : "Registered tellers will appear here for approval."}
          </p>
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
                    <span
                      className={`account-status ${user.status}`}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td>
                    <select
                      className="assignment-select"
                      aria-label={`Counter for ${user.full_name}`}
                      value={assignments[user.id] || ""}
                      disabled={controlsDisabled}
                      onChange={(event) =>
                        setAssignments((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select counter</option>

                      {counters.map((counter) => (
                        <option
                          key={counter.id}
                          value={counter.id}
                        >
                          {counter.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <div className="ticket-actions row-actions">
                      <button
                        type="button"
                        disabled={
                          controlsDisabled ||
                          !assignments[user.id]
                        }
                        onClick={() =>
                          updateTeller(user, "assignment")
                        }
                      >
                        {user.status === "pending"
                          ? "Approve"
                          : user.status === "disabled"
                            ? "Enable"
                            : "Save assignment"}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          controlsDisabled ||
                          user.status === "disabled"
                        }
                        onClick={() =>
                          updateTeller(user, "disable")
                        }
                      >
                        Disable
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={controlsDisabled}
                        onClick={() => openPasswordReset(user)}
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
          disabled={controlsDisabled}
          onBusyChange={handlePasswordBusy}
          onCancel={() => setResetTeller(null)}
        />
      )}

      <PasswordForm
        session={session}
        onLogout={onLogout}
        disabled={controlsDisabled}
        onBusyChange={handlePasswordBusy}
      />

      <CounterServices
        session={session}
        onLogout={onLogout}
      />
    </main>
  );
}