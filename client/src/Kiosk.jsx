import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = "/api";
const STORAGE_KEY = "treasury-pending-ticket";

function readPendingRequest() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (
      saved &&
      Number.isInteger(saved.service_id) &&
      typeof saved.service_name === "string" &&
      typeof saved.request_id === "string"
    ) {
      return saved;
    }

    return null;
  } catch {
    return null;
  }
}
function createRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export default function Kiosk() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const [pending, setPending] = useState(readPendingRequest);

  const requestRunning = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadServices() {
      try {
        const response = await fetch(`${API}/services`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to load services.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("The server returned an invalid service list.");
        }

        setServices(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(
            "Cannot load services. Check that Express is running on port 3000."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadServices();

    return () => controller.abort();
  }, []);

  async function issueTicket(service) {
    if (requestRunning.current) return;
    if (!pending && !service) return;

    requestRunning.current = true;
    setBusy(true);
    setError("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      // Reuse the same request after an interrupted attempt.
      const request = pending || {
        service_id: service.id,
        service_name: service.name,
        request_id: createRequestId(),
      };

      // Store the request before sending it.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(request));
      setPending(request);

      const response = await fetch(`${API}/tickets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          service_id: request.service_id,
          request_id: request.request_id,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to issue ticket.");
      }

      if (!data.ticket?.ticket_number) {
        throw new Error("The server did not return a valid ticket.");
      }

      localStorage.removeItem(STORAGE_KEY);
      setPending(null);

      setTicket({
        ...data.ticket,
        service_name: request.service_name,
      });
    } catch (err) {
      setError(
        err.name === "AbortError"
          ? "The request timed out. Click Retry ticket to check the same request."
          : err.message || "Unable to issue ticket. Please retry."
      );
    } finally {
      clearTimeout(timeout);
      requestRunning.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="kiosk">
      <header className="page-header">
        <span className="office-label">CITY OF TACURONG</span>
        <h1>City Treasury Office</h1>
        <p>Select your transaction to get a queue number.</p>
      </header>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {ticket ? (
        <section className="ticket-panel">
          <div className="ticket-receipt">
            <p className="receipt-office">CITY TREASURY OFFICE</p>
            <h2>{ticket.service_name}</h2>
            <p>Your queue number</p>

            <strong className="ticket-number">
              {ticket.ticket_number}
            </strong>

            <p>Please wait for your number to be called.</p>
            <small>
              Keep this ticket until your transaction is complete.
            </small>
          </div>

          <div className="ticket-actions">
            <button onClick={() => window.print()}>
              Print ticket
            </button>

            <button
              className="secondary-button"
              onClick={() => {
                setTicket(null);
                setError("");
              }}
            >
              Done · Next client
            </button>
          </div>
        </section>
      ) : pending ? (
        <section className="pending-panel">
          <h2>{pending.service_name}</h2>

          <p>
            A ticket request is pending. Retry it to retrieve your number.
          </p>

          <button
            disabled={busy}
            onClick={() => issueTicket(null)}
          >
            {busy ? "Checking your ticket…" : "Retry ticket"}
          </button>
        </section>
      ) : (
        <>
          {loading && (
            <p className="status-text">Loading services…</p>
          )}

          {!loading && !error && services.length === 0 && (
            <p className="status-text">
              No services are currently available.
            </p>
          )}

          <div className="service-grid">
            {services.map((service) => (
              <button
                className="service-card"
                key={service.id}
                disabled={busy}
                onClick={() => issueTicket(service)}
              >
                <span className="service-prefix">
                  {service.prefix}
                </span>

                <h2>{service.name}</h2>

                <span className="service-action">
                  Get ticket →
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <footer className="page-footer">
        Thank you for waiting. We’re here to assist you.
      </footer>
    </main>
  );
}