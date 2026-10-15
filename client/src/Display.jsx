import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER = "http://localhost:3000";

export default function Display() {
    const [queue, setQueue] = useState({
        serving: [],
        waiting: [],
    });

    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
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

                if (mounted && currentRequest === requestNumber) {
                    setQueue(data);
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
                    setError("Connection interrupted. Display may be out of date.");
                }
            }
        }

        const socket = io(SERVER, {
            autoConnect: false,
        });

        socket.on("connect", () => {
            setConnected(true);
            refresh();
        });

        socket.on("disconnect", () => {
            setConnected(false);
        });

        socket.on("connect_error", () => {
            setConnected(false);
        });

        socket.on("queue:changed", refresh);

        socket.on("ticket:called", (call) => {
            setLastCall(call);
            refresh();

            if (
                soundEnabled.current &&
                "speechSynthesis" in window
            ) {
                // Spell prefixes such as RPT clearly.
                const spokenTicket = call.ticket_number.replace(
                    /^[A-Za-z]+/,
                    (prefix) => prefix.split("").join(" ")
                );

                const announcement = new SpeechSynthesisUtterance(
                    `Number ${spokenTicket.replace("-", " ")}. ` +
                    `Please proceed to counter ${call.counter_number}.`
                );

                announcement.lang = "en-US";
                announcement.rate = 0.9;

                // Calls are queued rather than interrupting each other.
                window.speechSynthesis.speak(announcement);
            }
        });

        socket.connect();
        refresh();

        // Refresh periodically to recover from missed updates.
        const timer = setInterval(refresh, 5000);

        return () => {
            mounted = false;
            controller.abort();
            clearInterval(timer);
            socket.disconnect();

            if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    function toggleSound() {
        if (!("speechSynthesis" in window)) {
            setError("This browser does not support voice announcements.");
            return;
        }

        const enabled = !soundEnabled.current;

        soundEnabled.current = enabled;
        setSound(enabled);

        if (enabled) {
            const test = new SpeechSynthesisUtterance(
                "Voice announcements enabled."
            );

            test.lang = "en-US";
            window.speechSynthesis.speak(test);
        } else {
            window.speechSynthesis.cancel();
        }
    }

    return (
        <main className="public-display">
            <header className="display-header">
                <div>
                    <span className="office-label">CITY OF TACURONG</span>
                    <h1>City Treasury Office</h1>
                    <p>Please proceed to the counter when your number is called.</p>
                </div>

                <div className="display-controls">
                    <span>
                        {connected ? "● Live" : "○ Reconnecting"}
                    </span>

                    <button onClick={toggleSound}>
                        {sound ? "Mute announcements" : "Enable announcements"}
                    </button>
                </div>
            </header>

            {error && (
                <div className="error-message" role="alert">
                    {error}
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
                            <h3>{ticket.counter_name}</h3>
                            <strong>{ticket.ticket_number}</strong>
                            <p>{ticket.service_name}</p>
                        </section>
                    ))}

                    {queue.serving.length === 0 && (
                        <p>No tickets are currently being served.</p>
                    )}
                </div>
            )}

            <h2>Waiting tickets</h2>

            <div className="waiting-tickets">
                {queue.waiting.map((ticket) => (
                    <div key={ticket.id}>
                        <strong>{ticket.ticket_number}</strong>
                        <small>{ticket.service_name}</small>
                    </div>
                ))}

                {!loading && queue.waiting.length === 0 && (
                    <p>No clients are waiting.</p>
                )}
            </div>

            <p className="display-note">
                Calling order depends on each counter’s assigned services.
            </p>
        </main>
    );
}