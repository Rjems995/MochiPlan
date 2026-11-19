import { useState } from "react";
import {
  Cloud,
  Download,
  LoaderCircle,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { downloadJSON } from "../storage";

const messages = {
  off: "Sync is paused on this device.",
  pending: "Changes are waiting to sync.",
  syncing: "Syncing your plans…",
  synced: "Your account plans are up to date.",
  offline:
    "You’re offline. Keep editing; changes will sync when you reconnect.",
  error: "Sync is delayed. Your offline plans are safe.",
  conflict: "Changes from your devices need a quick review.",
  auth: "Sign in again to sync. Your offline plans are safe.",
};
export function AccountSettings() {
  const { accounts, workspace, reminders, backups, data } = useAppContext();
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [username, setUsername] = useState(accounts.user?.username || "");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const disabled = accounts.busy || accounts.sync.busy || signingOut;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (await accounts.authenticate(mode, username, password, recovery)) {
      setPassword("");
      setRecovery("");
    }
  }
  async function signOut() {
    setSigningOut(true);
    try {
      if (reminders.enabled) await reminders.disable();
      await accounts.signOut();
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <section className="content-card account-settings">
      <div className="account-heading">
        <UserRound size={22} />
        <h2>Your plans, wherever you are</h2>
      </div>
      <p className="account-description">
        An optional account keeps your planners and to-dos together on your
        phone and computer. Editing always works offline.
      </p>
      {workspace.profileId && (
        <div className="account-identity">
          <strong>@{accounts.user?.username || "Your saved account"}</strong>
          <span>Account workspace saved on this device</span>
        </div>
      )}
      {accounts.signedIn ? (
        <>
          <label className="toggle-row">
            Sync this device
            <input
              type="checkbox"
              checked={accounts.enabled}
              disabled={disabled}
              onChange={(event) => accounts.toggleSync(event.target.checked)}
            />
          </label>
          <div className="account-sync-status" role="status" aria-live="polite">
            {accounts.sync.busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Cloud size={18} />
            )}
            <div>
              <p>{messages[accounts.sync.status]}</p>
              {accounts.sync.lastSyncedAt && (
                <span>
                  Last synced:{" "}
                  <time dateTime={accounts.sync.lastSyncedAt}>
                    {new Date(accounts.sync.lastSyncedAt).toLocaleString()}
                  </time>
                </span>
              )}
            </div>
          </div>
          {accounts.sync.error && (
            <p className="account-notice">{accounts.sync.error}</p>
          )}
          <div className="account-actions">
            {accounts.sync.conflict ? (
              <button
                className="button primary"
                onClick={() => accounts.setConflictOpen(true)}
              >
                Review sync conflict
              </button>
            ) : (
              <button
                className="button secondary"
                disabled={disabled || !accounts.online || !accounts.enabled}
                onClick={accounts.syncNow}
              >
                <RefreshCw size={16} />
                Sync now
              </button>
            )}
            <button
              className="button secondary"
              onClick={() => downloadJSON(data)}
            >
              <Download size={16} />
              Download account backup
            </button>
          </div>
        </>
      ) : (
        <>
          {workspace.profileId && (
            <p className="account-notice">
              Sign in again to resume synchronization. Your saved account plans
              remain available offline.
            </p>
          )}
          <div
            className="account-modes"
            role="group"
            aria-label="Account action"
          >
            {(
              [
                ["login", "Sign in"],
                ["register", "Create account"],
                ["recover", "Recover account"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={mode === value ? "selected" : ""}
                disabled={disabled}
                onClick={() => {
                  setMode(value);
                  setPassword("");
                  setRecovery("");
                }}
                aria-pressed={mode === value}
              >
                {label}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="account-form">
            <label className="field-label">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                required
                disabled={disabled}
              />
            </label>
            {mode === "recover" && (
              <label className="field-label">
                Recovery code
                <input
                  value={recovery}
                  onChange={(event) => setRecovery(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={disabled}
                />
              </label>
            )}
            <label className="field-label">
              {mode === "recover" ? "New password" : "Password"}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                maxLength={128}
                required
                disabled={disabled}
              />
            </label>
            <p className="account-hint">
              {mode === "register"
                ? "Use at least 12 characters. Your current plans will be copied into the new account; device-only plans stay saved separately. Keep the recovery code shown after sign-up."
                : mode === "recover"
                  ? "Your recovery code resets your password and signs out other sessions. A fresh recovery code will replace the old one."
                  : "Use the same account and MochiPlan server on each device. Your device-only plans stay separate."}
            </p>
            <button
              className="button primary"
              disabled={disabled || !accounts.online}
            >
              {accounts.busy && <LoaderCircle size={16} className="spin" />}
              {mode === "register"
                ? "Create my account"
                : mode === "recover"
                  ? "Reset password"
                  : "Sign in and sync"}
            </button>
          </form>
          {!accounts.online && (
            <p className="account-notice">
              Sign-in needs a connection. Your saved plans are still available
              offline.
            </p>
          )}
        </>
      )}
      {accounts.error && (
        <p className="account-notice" role="alert">
          {accounts.error}
        </p>
      )}
      {workspace.profileId && (
        <button
          className="text-button account-signout"
          disabled={disabled || backups.serverBackupBusy || reminders.busy}
          onClick={signOut}
        >
          <LogOut size={16} />
          {signingOut ? "Signing out…" : "Sign out and open device-only plans"}
        </button>
      )}
      <p className="account-hint">
        Plans sync after edits settle and when you reconnect. Navigation and
        notification choices stay on each device. Conflicting changes pause for
        your review.
      </p>
    </section>
  );
}
