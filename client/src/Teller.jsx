import { useCallback, useEffect, useRef, useState } from "react";
import "./Teller.css";

const API = "/api";

export default function Teller({ session, onLogout }) {
  const [account, setAccount] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const actionRunning = useRef(false);

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

      if (response.status === 401) {
        onLogout();
        throw new Error("Your session expired. Please sign in again.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }

      return data;
    },
    [session.token, onLogout]
  );

  const loadWorkspace = useCallback(
    async (signal) => {
      const { user } = await request("/auth/me", { signal });

      if (user.role !== "teller") {
        throw new Error("This workspace requires a teller account.");
      }

      if (!user.counter_id || !user.counter_active) {
        throw new Error(
          "Ask your administrator to assign an active counter."
        );
      }

      const current = await request(
        `/teller/${user.counter_id}/current`,
        { signal }
      );

      if (signal?.aborted) return;

      setAccount(user);
      setTicket(current.ticket || null);

      return user;
    },
    [request]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function initialize() {
      setLoading(true);
      setError("");

      try {
        await loadWorkspace(controller.signal);
      } catch (err) {
        if (!controller.signal.aborted) {
          setAccount(null);
          setTicket(null);
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
  }, [loadWorkspace]);

  async function refreshWorkspace() {
    if (actionRunning.current || loading) return;

    actionRunning.current = true;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await loadWorkspace();
    } catch (err) {
      setAccount(null);
      setTicket(null);
      setError(err.message);
    } finally {
      actionRunning.current = false;
      setLoading(false);
    }
  }

  async function performAction(action) {
    if (actionRunning.current || loading || !account) return;

    if (!["next", "complete", "recall", "skip"].includes(action)) {
      return;
    }

    actionRunning.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const { user } = await request("/auth/me");

      if (
        user.role !== "teller" ||
        !user.counter_id ||
        !user.counter_active
      ) {
        setAccount(null);
        setTicket(null);

        throw new Error(
          "Your counter is unavailable. Contact the administrator."
        );
      }

      if (Number(user.counter_id) !== Number(account.counter_id)) {
        setAccount(null);
        setTicket(null);

        await loadWorkspace();

        setMessage(
          "Your counter assignment changed. The workspace has been refreshed."
        );
        return;
      }

      const isNext = action === "next";
      const isRecall = action === "recall";

      if (!isNext && !ticket) return;

      const endpoint = isNext
        ? "next"
        : isRecall
          ? "recall"
          : "finish";

      const body = isNext
        ? {}
        : isRecall
          ? { ticket_id: ticket.id }
          : { ticket_id: ticket.id, action };

      const data = await request(
        `/teller/${user.counter_id}/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );

      setAccount(user);

      if (isNext) {
        setTicket(data.ticket || null);
        setMessage(data.message || "");
      } else if (isRecall) {
        setMessage(data.message || "Announcement sent again.");
      } else {
        setTicket(null);
        setMessage(
          action === "complete"
            ? "Transaction completed. You can call the next client."
            : "Ticket skipped. You can call the next client."
        );
      }
    } catch (err) {
      setError(
        `${err.message} Click Refresh to check the current ticket.`
      );
    } finally {
      actionRunning.current = false;
      setBusy(false);
    }
  }

  const disabled = loading || busy || !account;

  const statusText = loading
    ? "Loading"
    : !account
      ? "Unavailable"
      : ticket
        ? "Serving a client"
        : "Ready to serve";

  return (
    <main className="teller-workspace">
      <header className="tw-header">
        <div>
          <p className="tw-eyebrow">CITY TREASURY OFFICE</p>
          <h1>{account?.counter_name || "Teller workspace"}</h1>
          <p className="tw-subtitle">
            Manage your current transaction and call the next client.
          </p>
        </div>

        <div className="tw-account">
          <div>
            <strong>{session.user.full_name}</strong>
            <span>Teller account</span>
          </div>

          <button
            type="button"
            className="tw-button tw-button-secondary"
            disabled={loading || busy}
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      {error && (
        <div className="tw-notice tw-notice-error" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="tw-notice tw-notice-success" role="status">
          {message}
        </div>
      )}

      <div className="tw-layout">
        <section className="tw-serving-card">
          <div className="tw-card-heading">
            <h2>Current transaction</h2>
            <span
              className={`tw-status ${
                account && !loading ? "tw-status-active" : ""
              }`}
            >
              {statusText}
            </span>
          </div>

          <div className="tw-ticket-area" aria-live="polite">
            {loading ? (
              <div className="tw-empty">
                <span className="tw-empty-symbol" aria-hidden="true">
                  …
                </span>
                <h3>Loading your workspace</h3>
                <p>Checking your counter and current ticket.</p>
              </div>
            ) : !account ? (
              <div className="tw-empty">
                <span className="tw-empty-symbol" aria-hidden="true">
                  !
                </span>
                <h3>Workspace unavailable</h3>
                <p>
                  Refresh this page or ask your administrator to check
                  your counter assignment.
                </p>
              </div>
            ) : ticket ? (
              <>
                <p className="tw-ticket-label">NOW SERVING</p>
                <strong className="tw-ticket-number">
                  {ticket.ticket_number}
                </strong>
                <p className="tw-service-name">{ticket.service_name}</p>
                <span className="tw-counter-label">
                  {account.counter_name}
                </span>
              </>
            ) : (
              <div className="tw-empty">
                <span className="tw-empty-symbol" aria-hidden="true">
                  ✓
                </span>
                <h3>Ready for the next client</h3>
                <p>
                  Select Call next client to receive the next eligible
                  ticket for your counter.
                </p>
              </div>
            )}
          </div>

          <div className="tw-card-footer">
            <span>
              {busy ? "Updating transaction…" : "Current counter assignment"}
            </span>
            <strong>{account?.counter_name || "Not available"}</strong>
          </div>
        </section>

        <aside className="tw-actions-card">
          <h2>Counter actions</h2>
          <p className="tw-actions-description">
            Handle one transaction at a time.
          </p>

          <button
            type="button"
            className="tw-button tw-button-primary tw-action-button"
            disabled={disabled || Boolean(ticket)}
            onClick={() => performAction("next")}
          >
            Call next client
          </button>

          <button
            type="button"
            className="tw-button tw-button-complete tw-action-button"
            disabled={disabled || !ticket}
            onClick={() => performAction("complete")}
          >
            Complete transaction
          </button>

          <div className="tw-action-pair">
            <button
              type="button"
              className="tw-button tw-button-secondary"
              disabled={disabled || !ticket}
              onClick={() => performAction("recall")}
            >
              Recall
            </button>

            <button
              type="button"
              className="tw-button tw-button-skip"
              disabled={disabled || !ticket}
              onClick={() => performAction("skip")}
            >
              Skip
            </button>
          </div>

          <p className="tw-help">
            Recall repeats the announcement. Skip releases the current
            ticket so you can serve another client.
          </p>

          <div className="tw-refresh">
            <button
              type="button"
              className="tw-button tw-button-secondary"
              disabled={loading || busy}
              onClick={refreshWorkspace}
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <small>Check your latest assignment and ticket.</small>
          </div>
        </aside>
      </div>
    </main>
  );
}