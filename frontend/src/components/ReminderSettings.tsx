import { Bell, BellRing, Cloud, LoaderCircle, RefreshCw } from "lucide-react";
import { useAppContext } from "../context/AppContext";

export function ReminderSettings() {
  const {
    p,
    workspace: { pref },
    platform: { toggleReminders, sendOverview },
    reminders,
    accounts,
  } = useAppContext();
  const { enabled, supported, config, busy, phase, online } = reminders;
  let status = "Background reminders are off on this device.";
  if (enabled)
    status = !online
      ? "You’re offline. Background reminders use your last synced schedule."
      : phase === "expired"
        ? "This device needs to reconnect for background reminders."
        : phase === "active"
          ? "Background reminders are on for this device."
          : phase === "error"
            ? "Schedule sync is delayed. We’ll retry automatically."
            : "Syncing your latest reminder schedule…";
  return (
    <section className="content-card reminder-settings">
      <h2>A nudge, even when you’re away</h2>
      <p className="reminder-description">
        Receive activity reminders and selected task deadline alerts after
        closing MochiPlan. Your server keeps the schedule running and sends
        notifications to this device.
      </p>
      {!supported && (
        <p className="reminder-notice">
          Background push isn’t available here. Use a supported browser over
          HTTPS or localhost. On iPhone or iPad, add MochiPlan to your Home
          Screen and open it there.
        </p>
      )}
      {supported && config && !config.configured && (
        <p className="reminder-notice">
          Your MochiPlan server needs background reminder setup. Reminders while
          open are still available.
        </p>
      )}
      <div className="reminder-device-status" role="status" aria-live="polite">
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Cloud size={18} />
        )}
        <p>{status}</p>
      </div>
      {reminders.error && (
        <p className="reminder-notice" role="alert">
          {reminders.error}
        </p>
      )}
      <div className="reminder-actions">
        {(!enabled || phase === "expired") && (
          <button
            className="button primary"
            disabled={!supported || busy || !config?.configured || !online}
            onClick={reminders.enable}
          >
            <BellRing size={16} />
            {phase === "expired"
              ? "Reconnect background reminders"
              : "Enable background reminders"}
          </button>
        )}
        {enabled && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={reminders.disable}
          >
            Turn off background reminders
          </button>
        )}
        {enabled && (
          <button
            className="button secondary"
            disabled={busy || phase !== "active" || !online}
            onClick={reminders.sendTest}
          >
            <Bell size={16} />
            Send a test reminder
          </button>
        )}
        {supported && (!config?.configured || phase === "error") && (
          <button
            className="text-button"
            disabled={busy || !online}
            onClick={reminders.retry}
          >
            <RefreshCw size={15} />
            {config?.configured ? "Retry reminder sync" : "Check server setup"}
          </button>
        )}
      </div>
      <dl className="reminder-sync-details">
        <div>
          <dt>Device time zone</dt>
          <dd>{reminders.timezone.replaceAll("_", " ")}</dd>
        </div>
        {reminders.lastSyncedAt && (
          <div>
            <dt>Last schedule sync</dt>
            <dd>
              <time dateTime={reminders.lastSyncedAt}>
                {new Date(reminders.lastSyncedAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
        {reminders.lastSentAt && (
          <div>
            <dt>Last reminder sent</dt>
            <dd>
              <time dateTime={reminders.lastSentAt}>
                {new Date(reminders.lastSentAt).toLocaleString()}
              </time>
            </dd>
          </div>
        )}
      </dl>
      <p className="reminder-hint">
        {accounts.user && (
          <>
            Account reminders follow the last schedule synced to your account,
            including edits from your other devices.{" "}
          </>
        )}
        The server must stay running. Sync edits before closing the app.
        Delivery depends on your connection and device notification settings;
        iPhone and iPad require the installed Home Screen app.
      </p>
      <label className="field-label reminder-time-label">
        Remind me before
        <select
          value={p.reminderMinutes}
          onChange={(event) =>
            pref({ reminderMinutes: Number(event.target.value) })
          }
        >
          {[0, 5, 10, 15, 30].map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "At the start" : `${n} minutes before`}
            </option>
          ))}
        </select>
      </label>
      <p className="reminder-hint">
        Task deadline alerts use the notification time chosen on each task.
        Tasks without a deadline time use 9:00 am in this device’s time zone.
      </p>
      <div className="panel-divider" />
      <h3>Reminders while open</h3>
      <p className="reminder-description">
        Optional local reminders while MochiPlan is open, including an offline
        fallback. Synced background reminders take priority to avoid duplicate
        nudges.
      </p>
      <div className="reminder-actions">
        <button className="button secondary" onClick={toggleReminders}>
          <Bell size={16} />
          {p.reminders ? "Turn off reminders" : "Enable gentle reminders"}
        </button>
        <button className="text-button" onClick={sendOverview}>
          Send today’s little overview
        </button>
      </div>
    </section>
  );
}
