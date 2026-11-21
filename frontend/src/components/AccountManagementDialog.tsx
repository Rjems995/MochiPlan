import { useEffect, useState } from "react";
import {
  Download,
  KeyRound,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import type { AccountDeviceSession } from "../services/accountApi";
import { downloadJSON } from "../storage";
import { Modal } from "./Modal";

export function AccountManagementDialog() {
  const { accounts, data } = useAppContext();
  const [tab, setTab] = useState<"devices" | "password" | "delete">("devices");
  const [sessions, setSessions] = useState<AccountDeviceSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<
    AccountDeviceSession | "others" | null
  >(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [username, setUsername] = useState("");
  const open = accounts.managementOpen && accounts.signedIn;
  const busy = working || accounts.busy;
  useEffect(() => {
    setTab("devices");
    setSessions([]);
    setError("");
    setConfirmation(null);
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
    setUsername("");
  }, [open]);
  useEffect(() => {
    if (!open || tab !== "devices") return;
    let active = true;
    setLoading(true);
    accounts
      .listSessions()
      .then((result) => {
        if (active) setSessions(result.sessions);
      })
      .catch((failure) => {
        if (active)
          setError(
            failure instanceof Error
              ? failure.message
              : "The device list could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, tab, accounts.sessionId]);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setSessions((await accounts.listSessions()).sessions);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not refresh devices.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function revoke() {
    if (!confirmation) return;
    setWorking(true);
    setError("");
    try {
      const result = await accounts.revokeSession(
        confirmation === "others" ? "others" : confirmation.id,
      );
      setConfirmation(null);
      if (!result.signedOut) await refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not sign out that session.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== repeatPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setWorking(true);
    try {
      await accounts.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The password could not be changed.",
      );
    } finally {
      setWorking(false);
    }
  }
  async function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await accounts.deleteAccount(currentPassword, username);
      setCurrentPassword("");
      setUsername("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Account deletion could not be confirmed.",
      );
    } finally {
      setWorking(false);
    }
  }
  if (!open) return null;
  return (
    <Modal
      title="Manage your account"
      subtitle={`Security and signed-in devices for @${accounts.user?.username}.`}
      onClose={() => {
        if (!busy) accounts.setManagementOpen(false);
      }}
      wide
    >
      <div className="account-management">
        <div
          className="account-management-tabs"
          role="group"
          aria-label="Account management sections"
        >
          {(
            [
              ["devices", "Devices", MonitorSmartphone],
              ["password", "Password", KeyRound],
              ["delete", "Delete account", Trash2],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              className={tab === value ? "selected" : ""}
              aria-pressed={tab === value}
              disabled={busy}
              onClick={() => {
                setTab(value);
                setError("");
                setConfirmation(null);
                setCurrentPassword("");
                setNewPassword("");
                setRepeatPassword("");
                setUsername("");
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        {!accounts.online && (
          <p className="account-notice">
            Connect to manage your account. Offline editing is still available.
          </p>
        )}
        {error && (
          <p className="account-notice" role="alert">
            {error}
          </p>
        )}
        {tab === "devices" && (
          <section aria-label="Signed-in devices">
            <div className="account-session-heading">
              <h3>Signed-in devices</h3>
              <button
                className="text-button"
                disabled={busy || loading || !accounts.online}
                onClick={refresh}
              >
                <RefreshCw size={15} />
                Refresh devices
              </button>
            </div>
            <p className="account-hint">
              Device names are estimated from browser details. Activity times
              may be rounded to the last minute.
            </p>
            {loading && (
              <p className="account-device-loading" role="status">
                <LoaderCircle size={18} className="spin" />
                Loading signed-in devices…
              </p>
            )}
            {!loading && !sessions.length && !error && (
              <p className="account-description">
                No active sessions to display.
              </p>
            )}
            {confirmation && (
              <div
                className="account-revoke-confirm"
                role="group"
                aria-label="Confirm session sign-out"
              >
                <h4>
                  {confirmation === "others"
                    ? "Sign out all other sessions?"
                    : confirmation.current
                      ? "Sign out this device?"
                      : `Sign out ${confirmation.device}?`}
                </h4>
                <p>
                  The affected sessions will lose account access and their
                  linked background reminders will stop. Offline copies already
                  saved on those devices will remain.
                </p>
                <div className="account-actions">
                  <button
                    className="button primary"
                    disabled={busy || !accounts.online}
                    onClick={revoke}
                  >
                    {working ? "Signing out…" : "Confirm sign out"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setConfirmation(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <ul className="account-session-list">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="account-session-row"
                  data-session-id={session.id}
                >
                  <MonitorSmartphone size={20} />
                  <div className="account-session-details">
                    <div className="account-session-title">
                      <strong>{session.device}</strong>
                      {session.current && (
                        <span className="account-current-device">
                          This device
                        </span>
                      )}
                    </div>
                    <p>
                      Signed in{" "}
                      <time dateTime={session.createdAt}>
                        {new Date(session.createdAt).toLocaleString()}
                      </time>
                    </p>
                    <p>
                      Last active{" "}
                      <time dateTime={session.lastActiveAt}>
                        {new Date(session.lastActiveAt).toLocaleString()}
                      </time>
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    disabled={busy || !accounts.online || !!confirmation}
                    onClick={() => setConfirmation(session)}
                  >
                    {session.current ? "Sign out this device" : "Sign out"}
                  </button>
                </li>
              ))}
            </ul>
            {sessions.some((session) => !session.current) && (
              <button
                className="button secondary"
                disabled={busy || !accounts.online || !!confirmation}
                onClick={() => setConfirmation("others")}
              >
                Sign out all other devices
              </button>
            )}
          </section>
        )}
        {tab === "password" && (
          <form
            onSubmit={changePassword}
            className="account-security-form"
            aria-label="Change password"
          >
            <h3>Change your password</h3>
            <p className="account-description">
              Your current password is required. Other sessions will be signed
              out, and you’ll receive a fresh recovery code.
            </p>
            <label className="field-label">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className="field-label">
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label className="field-label">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                disabled={busy}
                value={repeatPassword}
                onChange={(event) => setRepeatPassword(event.target.value)}
              />
            </label>
            <p className="account-hint">
              Use 12–128 characters and choose a password you haven’t used for
              this account.
            </p>
            <button
              className="button primary"
              disabled={busy || !accounts.online}
            >
              {working ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <KeyRound size={16} />
              )}
              {working ? "Changing password…" : "Change password"}
            </button>
          </form>
        )}
        {tab === "delete" && (
          <section className="account-delete-section">
            <h3>Delete your account</h3>
            <p className="account-description">
              This permanently deletes your account, synced plans, version
              history, linked server backups, and reminders. Its saved account
              workspace on this device will also be removed.
            </p>
            <p className="account-description">
              Your separate device-only plans stay here. Downloaded backups and
              offline copies on other devices cannot be erased remotely.
            </p>
            <button
              className="button secondary"
              onClick={() => downloadJSON(data)}
            >
              <Download size={16} />
              Download my account backup first
            </button>
            <form
              onSubmit={deleteAccount}
              className="account-security-form"
              aria-label="Delete account"
            >
              <label className="field-label">
                Current password
                <input
                  type="password"
                  autoComplete="current-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={busy}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </label>
              <label className="field-label">
                Type your username to confirm
                <input
                  autoComplete="off"
                  spellCheck={false}
                  required
                  maxLength={32}
                  disabled={busy}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <p className="account-hint">
                Enter <strong>{accounts.user?.username}</strong> exactly.
                Account deletion cannot be undone.
              </p>
              <button
                className="button account-delete-button"
                disabled={
                  busy ||
                  !accounts.online ||
                  username !== accounts.user?.username
                }
              >
                {working ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {working ? "Deleting account…" : "Delete my account"}
              </button>
            </form>
          </section>
        )}
      </div>
    </Modal>
  );
}
