import { useEffect, useRef, useState } from "react";

const API = "http://localhost:3000/api";

export default function CounterServices({ session, onLogout }) {
    const [counters, setCounters] = useState([]);
    const [services, setServices] = useState([]);
    const [selected, setSelected] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

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
            throw new Error("Please sign in as an administrator.");
        }

        if (!response.ok) {
            throw new Error(data.message || "Request failed.");
        }

        return data;
    }

    useEffect(() => {
        let cancelled = false;

        async function loadAssignments() {
            try {
                const data = await request("/admin/counter-services");

                if (cancelled) return;

                setCounters(data.counters);
                setServices(data.services);

                const initial = {};

                for (const counter of data.counters) {
                    initial[counter.id] = counter.service_ids;
                }

                setSelected(initial);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadAssignments();

        return () => {
            cancelled = true;
        };
    }, [session.token]);

    function toggleService(counterId, serviceId) {
        setSelected((current) => {
            const currentIds = current[counterId] || [];

            return {
                ...current,
                [counterId]: currentIds.includes(serviceId)
                    ? currentIds.filter((id) => id !== serviceId)
                    : [...currentIds, serviceId],
            };
        });

        setMessage("");
    }

    async function saveCounter(counter) {
        if (saving.current) return;

        saving.current = true;
        setSavingId(counter.id);
        setError("");
        setMessage("");

        try {
            await request(`/admin/counter-services/${counter.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    service_ids: selected[counter.id] || [],
                }),
            });

            setMessage(`${counter.name} service assignments saved.`);
        } catch (err) {
            setError(err.message);
        } finally {
            saving.current = false;
            setSavingId(null);
        }
    }

    return (
        <section className="counter-services-section">
            <h2>Counter service assignments</h2>
            <p>
                Select the services each counter can handle, then save that counter.
            </p>

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
                <p>Loading service assignments…</p>
            ) : (
                <div className="counter-service-grid">
                    {counters.map((counter) => (
                        <section className="counter-service-card" key={counter.id}>
                            <h3>{counter.name}</h3>

                            {!counter.is_active && (
                                <p className="counter-service-note">Counter is inactive.</p>
                            )}

                            {services.map((service) => (
                                <label className="service-checkbox" key={service.id}>
                                    <input
                                        type="checkbox"
                                        checked={(selected[counter.id] || []).includes(
                                            service.id
                                        )}
                                        disabled={savingId !== null}
                                        onChange={() =>
                                            toggleService(counter.id, service.id)
                                        }
                                    />

                                    <span>{service.name}</span>
                                </label>
                            ))}

                            {(selected[counter.id] || []).length === 0 && (
                                <p className="counter-service-note">
                                    No new tickets will be called by this counter.
                                </p>
                            )}

                            <div className="ticket-actions">
                                <button
                                    disabled={savingId !== null}
                                    onClick={() => saveCounter(counter)}
                                >
                                    {savingId === counter.id ? "Saving…" : "Save services"}
                                </button>
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </section>
    );
}