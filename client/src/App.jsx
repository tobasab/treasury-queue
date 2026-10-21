import { useEffect, useState } from "react";
import Kiosk from "./Kiosk";
import Auth from "./Auth";
import Admin from "./Admin";
import Display from "./Display";
import Teller from "./Teller";
import "./App.css";

const SESSION_KEY = "treasury-session";
const API = "/api";

function readSession() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY));

        return saved?.token && saved?.user ? saved : null;
    } catch {
        return null;
    }
}

export default function App() {
    const [page, setPage] = useState(window.location.hash);
    const [session, setSession] = useState(null);
    const [checking, setChecking] = useState(true);
    const [sessionError, setSessionError] = useState("");

    useEffect(() => {
        const updatePage = () => {
            setPage(window.location.hash);
        };

        window.addEventListener("hashchange", updatePage);

        return () => {
            window.removeEventListener("hashchange", updatePage);
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();

        async function restoreSession() {
            const saved = readSession();

            if (!saved) {
                setChecking(false);
                return;
            }

            try {
                const response = await fetch(`${API}/auth/me`, {
                    headers: {
                        Authorization: `Bearer ${saved.token}`,
                    },
                    signal: controller.signal,
                });

                if (controller.signal.aborted) return;

                if (response.status === 401 || response.status === 403) {
                    sessionStorage.removeItem(SESSION_KEY);
                    setSession(null);
                    return;
                }

                if (!response.ok) {
                    throw new Error("Unable to verify your session.");
                }

                const data = await response.json();

                if (controller.signal.aborted) return;

                const restored = {
                    token: saved.token,
                    user: data.user,
                };

                sessionStorage.setItem(
                    SESSION_KEY,
                    JSON.stringify(restored)
                );

                setSession(restored);
            } catch (err) {
                if (!controller.signal.aborted) {
                    setSessionError(
                        "Could not restore your session. Check Express and sign in again."
                    );
                }
            } finally {
                if (!controller.signal.aborted) {
                    setChecking(false);
                }
            }
        }

        restoreSession();

        return () => controller.abort();
    }, []);

    function handleLogin(data) {
        const nextSession = {
            token: data.token,
            user: data.user,
        };

        sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify(nextSession)
        );

        setSession(nextSession);
        setSessionError("");
        window.location.hash = "#staff";
    }

    function logout() {
        sessionStorage.removeItem(SESSION_KEY);
        setSession(null);
        setSessionError("");
        window.location.hash = "#login";
    }

    const staffPage = [
        "#login",
        "#staff",
        "#teller",
        "#admin",
    ].includes(page);

    return (
        <>
            <nav className="app-nav">
                <a href="#kiosk">Ticket kiosk</a>

                <a href={session ? "#staff" : "#login"}>
                    {session ? "Staff account" : "Staff sign in"}
                </a>

                <a href="#display">Public display</a>
            </nav>

            {page === "#display" ? (
                <Display />
            ) : !staffPage ? (
                <Kiosk />
            ) : checking ? (
                <p className="status-text">
                    Checking your session…
                </p>
            ) : session?.user?.role === "admin" ? (
                <Admin session={session} onLogout={logout} />
            ) : session?.user?.role === "teller" ? (
                <Teller session={session} onLogout={logout} />
            ) : (
                <>
                    {sessionError && (
                        <p className="error-message" role="alert">
                            {sessionError}
                        </p>
                    )}

                    <Auth onLogin={handleLogin} />
                </>
            )}
        </>
    );
}