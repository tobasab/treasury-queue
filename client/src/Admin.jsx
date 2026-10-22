import { useCallback, useEffect, useRef, useState } from "react";
import CounterServices from "./CounterServices";
import "./Admin.css";

const API = "/api";

export default function Admin({ session, onLogout }) {
  const [tab, setTab] = useState("tellers");
  const [tellers, setTellers] = useState([]);
  const [counters, setCounters] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const saving = useRef(false);

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
        throw new Error("Please sign in with an administrator account.");
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
      setCounters(counterList.filter((counter) => counter.is_active));

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
    if (saving.current || loading) return;

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
    if (saving.current || loading) return;

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

      setMessage(data.message || "Account updated successfully.");

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

  const disabled = loading || busy;

  const totals = {
    active: tellers.filter((user) => user.status === "active").length,
    pending: tellers.filter((user) => user.status === "pending").length,
    disabled: tellers.filter((user) => user.status === "disabled").length,
  };

  function summaryValue(value) {
    return loading ? "…" : value;
  }

  return (
    <main className="treasury-admin">
      <header className="ta-header">
        <div>
          <p className="ta-eyebrow">CITY TREASURY OFFICE</p>
          <h1>Queue administration</h1>
          <p className="ta-subtitle">
            Manage your team and counter assignments.
          </p>
        </div>

        <div className="ta-account">
          <div>
            <strong>{session.user.full_name}</strong>
            <span>Administrator</span>
          </div>

          <button
            type="button"
            className="ta-button ta-button-secondary"
            disabled={disabled}
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="ta-stats" aria-label="Account summary">
        <article className="ta-stat">
          <span>Total tellers</span>
          <strong>{summaryValue(tellers.length)}</strong>
          <small>Registered accounts</small>
        </article>

        <article className="ta-stat ta-stat-active">
          <span>Active</span>
          <strong>{summaryValue(totals.active)}</strong>
          <small>Approved accounts</small>
        </article>

        <article className="ta-stat ta-stat-pending">
          <span>Pending approval</span>
          <strong>{summaryValue(totals.pending)}</strong>
          <small>Awaiting administrator review</small>
        </article>

        <article className="ta-stat">
          <span>Disabled</span>
          <strong>{summaryValue(totals.disabled)}</strong>
          <small>Access suspended</small>
        </article>
      </section>

      <nav className="ta-tabs" aria-label="Administration sections">
        <button
          type="button"
          className={tab === "tellers" ? "is-selected" : ""}
          aria-pressed={tab === "tellers"}
          disabled={busy}
          onClick={() => setTab("tellers")}
        >
          Teller accounts
        </button>

        <button
          type="button"
          className={tab === "services" ? "is-selected" : ""}
          aria-pressed={tab === "services"}
          disabled={busy}
          onClick={() => setTab("services")}
        >
          Counter services
        </button>
      </nav>

      <section className="ta-panel" hidden={tab !== "tellers"}>
        <div className="ta-panel-heading">
          <div>
            <h2>Teller accounts</h2>
            <p>Approve access and choose each teller’s counter.</p>
          </div>

          <button
            type="button"
            className="ta-button ta-button-secondary"
            disabled={disabled}
            onClick={refreshData}
          >
            {loading ? "Loading…" : "Refresh list"}
          </button>
        </div>

        {error && (
          <div className="ta-notice ta-notice-error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="ta-notice ta-notice-success" role="status">
            {message}
          </div>
        )}

        {loading ? (
          <div className="ta-empty">Loading teller accounts…</div>
        ) : tellers.length === 0 ? (
          <div className="ta-empty">
            <h3>
              {error ? "Unable to load accounts" : "No teller accounts yet"}
            </h3>
            <p>
              {error
                ? "Use Refresh list to try again."
                : "New registrations will appear here for approval."}
            </p>
          </div>
        ) : (
          <div className="ta-table-scroll">
            <table className="ta-table">
              <thead>
                <tr>
                  <th scope="col">Teller</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Counter assignment</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>

              <tbody>
                {tellers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="ta-person">
                        <span className="ta-avatar" aria-hidden="true">
                          {user.full_name?.trim().charAt(0).toUpperCase() || "T"}
                        </span>

                        <div>
                          <strong>{user.full_name}</strong>
                          <small>@{user.username}</small>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className={`ta-status ta-status-${user.status}`}>
                        {user.status}
                      </span>
                    </td>

                    <td>
                      <select
                        className="ta-select"
                        aria-label={`Counter for ${user.full_name}`}
                        value={assignments[user.id] || ""}
                        disabled={disabled}
                        onChange={(event) =>
                          setAssignments((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select counter</option>

                        {user.counter_id &&
                          !counters.some(
                            (counter) =>
                              Number(counter.id) === Number(user.counter_id)
                          ) && (
                            <option value={user.counter_id} disabled>
                              {user.counter_name || "Assigned counter"} (inactive)
                            </option>
                          )}

                        {counters.map((counter) => (
                          <option key={counter.id} value={counter.id}>
                            {counter.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td>
                      <div className="ta-row-actions">
                        <button
                          type="button"
                          className="ta-button ta-button-primary"
                          disabled={
                            disabled ||
                            !counters.some(
                              (counter) =>
                                Number(counter.id) ===
                                Number(assignments[user.id])
                            )
                          }
                          onClick={() => updateTeller(user, "assignment")}
                        >
                          {user.status === "pending"
                            ? "Approve"
                            : user.status === "disabled"
                              ? "Enable account"
                              : "Save assignment"}
                        </button>

                        {user.status !== "disabled" && (
                          <button
                            type="button"
                            className="ta-button ta-button-danger"
                            disabled={disabled}
                            onClick={() => updateTeller(user, "disable")}
                          >
                            Disable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="ta-panel ta-services"
        hidden={tab !== "services"}
      >
        <CounterServices session={session} onLogout={onLogout} />
      </section>
    </main>
  );
}