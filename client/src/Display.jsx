import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER = window.location.origin;

const WAITING_SERVICES = [
  { prefix: "GEN", name: "General Collections" },
  { prefix: "RPT", name: "RPT Collections" },
  { prefix: "CERT", name: "Certificates" },
];

export default function Display() {
  const [queue, setQueue] = useState({
    serving: [],
    waiting: [],
  });

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [soundError, setSoundError] = useState("");
  const [sound, setSound] = useState(false);
  const [lastCall, setLastCall] = useState(null);

  const soundEnabled = useRef(false);

  useEffect(() => {
    let mounted = true;
    let requestNumber = 0;

    const controller = new AbortController();

    async function refresh() {
      const currentRequest = ++requestNumber;

      try {
        const response = await fetch(`${SERVER}/api/display`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Unable to load queue.");
        }

        const data = await response.json();

        if (
          !Array.isArray(data.serving) ||
          !Array.isArray(data.waiting)
        ) {
          throw new Error("Invalid queue response.");
        }

        if (mounted && currentRequest === requestNumber) {
          setQueue({
            serving: data.serving,
            waiting: data.waiting,
          });
          setLoading(false);
          setError("");
        }
      } catch (err) {
        if (
          mounted &&
          currentRequest === requestNumber &&
          err.name !== "AbortError"
        ) {
          setLoading(false);
          setError(
            "Connection interrupted. Display may be out of date."
          );
        }
      }
    }

    const socket = io(SERVER, {
      autoConnect: false,
    });

    socket.on("connect", () => {
      if (!mounted) return;

      setConnected(true);
      refresh();
    });

    socket.on("disconnect", () => {
      if (mounted) setConnected(false);
    });

    socket.on("connect_error", () => {
      if (mounted) setConnected(false);
    });

    socket.on("queue:changed", refresh);

    socket.on("ticket:called", (call) => {
      if (
        !mounted ||
        typeof call?.ticket_number !== "string" ||
        call.counter_number == null
      ) {
        return;
      }

      setLastCall(call);
      refresh();

      if (
        soundEnabled.current &&
        "speechSynthesis" in window &&
        "SpeechSynthesisUtterance" in window
      ) {
        // Spell the prefix clearly: RPT becomes R P T.
        const spokenTicket = call.ticket_number.replace(
          /^[A-Za-z]+/,
          (prefix) => prefix.split("").join(" ")
        );

        const announcement = new SpeechSynthesisUtterance(
          `Number ${spokenTicket.replace(/-/g, " ")}. ` +
            `Please proceed to counter ${call.counter_number}.`
        );

        announcement.lang = "en-US";
        announcement.rate = 0.9;

        // Keep successive announcements in order.
        window.speechSynthesis.speak(announcement);
      }
    });

    socket.connect();
    refresh();

    // Recover from missed live updates.
    const timer = setInterval(refresh, 5000);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(timer);

      socket.removeAllListeners();
      socket.disconnect();

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function toggleSound() {
    if (
      !("speechSynthesis" in window) ||
      !("SpeechSynthesisUtterance" in window)
    ) {
      setSoundError(
        "This browser does not support voice announcements."
      );
      return;
    }

    setSoundError("");

    const enabled = !soundEnabled.current;

    soundEnabled.current = enabled;
    setSound(enabled);

    if (enabled) {
      const test = new SpeechSynthesisUtterance(
        "Voice announcements enabled."
      );

      test.lang = "en-US";
      test.rate = 0.9;

      window.speechSynthesis.speak(test);
    } else {
      window.speechSynthesis.cancel();
    }
  }

  const connectionLabel = error
    ? "Updates interrupted"
    : connected
      ? "● Live"
      : "○ Reconnecting";

  return (
    <main className="public-display">
      <header className="display-header">
        <div>
          <span className="office-label">CITY OF TACURONG</span>
          <h1>City Treasury Office</h1>
          <p>
            Please proceed to the counter when your number is called.
          </p>
        </div>

        <div className="display-controls">
          <span role="status">{connectionLabel}</span>

          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={sound}
          >
            {sound ? "Mute announcements" : "Enable announcements"}
          </button>
        </div>
      </header>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {soundError && (
        <div className="error-message" role="alert">
          {soundError}
        </div>
      )}

      {lastCall && (
        <div className="latest-call">
          <span>LATEST CALL</span>
          <strong>{lastCall.ticket_number}</strong>
          <span>Counter {lastCall.counter_number}</span>
        </div>
      )}

      <h2>Now serving</h2>

      {loading ? (
        <p>Loading queue…</p>
      ) : (
        <div className="serving-grid">
          {queue.serving.map((ticket) => (
            <section className="serving-card" key={ticket.id}>
              <h3>
                {ticket.counter_name ||
                  `Counter ${ticket.counter_number}`}
              </h3>

              <strong>{ticket.ticket_number}</strong>
              <p>{ticket.service_name}</p>
            </section>
          ))}

          {queue.serving.length === 0 && (
            <p>
              {error
                ? "Current serving information is unavailable."
                : "No tickets are currently being served."}
            </p>
          )}
        </div>
      )}

      <h2>Waiting tickets</h2>

      <div className="service-waiting-columns">
        {WAITING_SERVICES.map((service) => {
          const tickets = queue.waiting.filter(
            (ticket) =>
              typeof ticket.ticket_number === "string" &&
              ticket.ticket_number.startsWith(`${service.prefix}-`)
          );

          return (
            <section
              className={`service-waiting-column service-waiting-${service.prefix.toLowerCase()}`}
              key={service.prefix}
              aria-label={`${service.name} waiting tickets`}
            >
              <header className="service-waiting-heading">
                <span className="service-waiting-prefix">
                  {service.prefix}
                </span>

                <h3>{service.name}</h3>
                <p>Waiting tickets</p>
              </header>

              {loading ? (
                <p className="service-waiting-empty">
                  Loading tickets…
                </p>
              ) : tickets.length === 0 ? (
                <p className="service-waiting-empty">
                  {error
                    ? "Queue unavailable or out of date."
                    : "No waiting tickets shown."}
                </p>
              ) : (
                <ol className="service-waiting-list">
                  {tickets.map((ticket) => (
                    <li
                      className="service-waiting-ticket"
                      key={ticket.id}
                    >
                      <strong>{ticket.ticket_number}</strong>
                      <span>Waiting</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>

      <p className="display-note">
        Calling order depends on each counter’s assigned services.
      </p>
    </main>
  );
}