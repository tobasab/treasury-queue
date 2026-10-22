import { useEffect, useRef, useState } from "react";
import PasswordForm from "./PasswordForm";

const API = "/api";

export default function Teller({ session, onLogout }) {
  const [account, setAccount] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const actionRunning = useRef(false);
  const passwordRunning = useRef(false);

  function handlePasswordBusy(value) {
    passwordRunning.current = value;
    setPasswordBusy(value);
  }

  async function request(path, options = {}) {
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
  }

  async function loadWorkspace() {
    const { user } = await request("/auth/me");

    if (user.role !== "teller") {
      throw new Error("This workspace requires a teller account.");
    }

    if (!user.counter_id || !user.counter_active) {
      throw new Error(
        "Ask your administrator to assign an active counter."
      );
    }

    const current = await request(
      `/teller/${user.counter_id}/current`
    );

    setAccount(user);
    setTicket(current.ticket || null);

    return user;
  }

  async function refreshWorkspace() {
    if (actionRunning.current || passwordRunning.current) return;

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

  useEffect(() => {
    refreshWorkspace();
  }, [session.token]);

  async function performAction(action) {
    if (
      actionRunning.current ||
      passwordRunning.current ||
      !account
    ) {
      return;
    }

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
        // Clear the old assignment before loading the new one.
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

  const disabled = loading || busy || passwordBusy || !account;

  return (
    <main className="kiosk">
      <header className="page-header">
        <span className="office-label">CITY TREASURY OFFICE</span>
        <h1>{account?.counter_name || "Teller workspace"}</h1>
        <p>Signed in as {session.user.full_name}</p>
      </header>

      <section className="ticket-panel">
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <p>Loading your assigned counter…</p>
        ) : !account ? (
          <p>
            Your workspace is unavailable. Refresh or contact the
            administrator.
          </p>
        ) : ticket ? (
          <>
            <p className="receipt-office">NOW SERVING</p>

            <strong className="ticket-number">
              {ticket.ticket_number}
            </strong>

            <h2>{ticket.service_name}</h2>
          </>
        ) : (
          <>
            <h2>Ready to serve</h2>
            <p>Click Call Next to receive a waiting client.</p>
          </>
        )}

        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}

        <div className="ticket-actions">
          <button
            type="button"
            disabled={disabled || Boolean(ticket)}
            onClick={() => performAction("next")}
          >
            Call Next
          </button>

          <button
            type="button"
            disabled={disabled || !ticket}
            onClick={() => performAction("complete")}
          >
            Complete
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={disabled || !ticket}
            onClick={() => performAction("recall")}
          >
            Recall
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={disabled || !ticket}
            onClick={() => performAction("skip")}
          >
            Skip
          </button>
        </div>

        <div className="ticket-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={loading || busy || passwordBusy}
            onClick={refreshWorkspace}
          >
            Refresh
          </button>

          <button
            type="button"
            className="secondary-button"
            disabled={loading || busy || passwordBusy}
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </section>

      <PasswordForm
        session={session}
        onLogout={onLogout}
        disabled={loading || busy}
        onBusyChange={handlePasswordBusy}
      />
    </main>
  );
}