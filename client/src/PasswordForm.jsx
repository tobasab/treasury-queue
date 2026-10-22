import { useRef, useState } from "react";

export default function PasswordForm({
  session,
  onLogout,
  teller = null,
  disabled = false,
  onBusyChange,
  onCancel,
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const running = useRef(false);
  const isReset = teller !== null;
  const locked = disabled || busy;

  async function handleSubmit(event) {
    event.preventDefault();

    if (running.current || disabled) return;

    setError("");
    setMessage("");

    if (
      newPassword.length < 6 ||
      new TextEncoder().encode(newPassword).length > 72
    ) {
      setError(
        "New password must contain at least 6 characters and at most 72 bytes."
      );
      return;
    }

    if (newPassword !== confirmation) {
      setError("The new passwords do not match.");
      return;
    }

    if (!isReset && currentPassword === newPassword) {
      setError("Choose a different new password.");
      return;
    }

    running.current = true;
    setBusy(true);
    onBusyChange?.(true);

    try {
      const path = isReset
        ? `/api/passwords/tellers/${teller.id}`
        : "/api/passwords/me";

      const body = isReset
        ? { new_password: newPassword }
        : {
            current_password: currentPassword,
            new_password: newPassword,
          };

      const response = await fetch(path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        onLogout();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to update the password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");

      if (isReset) {
        setMessage(data.message);
      } else {
        window.alert(
          "Password changed successfully. Sign in with your new password."
        );
        onLogout();
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Connection interrupted. The change may have succeeded. Check the connection and try signing in with the new password."
          : err.message
      );
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="ticket-panel password-panel">
      <h2>
        {isReset
          ? `Reset password: ${teller.full_name}`
          : "Change my password"}
      </h2>

      <p>
        {isReset
          ? `Set a new password for ${teller.username}. Their existing sessions will become invalid.`
          : "After changing your password, sign in again on all your devices."}
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

      <form className="password-form" onSubmit={handleSubmit}>
        {!isReset && (
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) =>
                setCurrentPassword(event.target.value)
              }
              disabled={locked}
              required
            />
          </label>
        )}

        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={6}
            disabled={locked}
            required
          />
        </label>

        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={6}
            disabled={locked}
            required
          />
        </label>

        <div className="ticket-actions">
          <button type="submit" disabled={locked}>
            {busy
              ? "Saving…"
              : isReset
                ? "Reset teller password"
                : "Change password"}
          </button>

          {onCancel && (
            <button
              type="button"
              className="secondary-button"
              disabled={locked}
              onClick={onCancel}
            >
              Close
            </button>
          )}
        </div>
      </form>
    </section>
  );
}