import {
  CheckCircle2,
  Cloud,
  History,
  LoaderCircle,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";

const statusText = {
  off: "Automatic backups are off. You can still save a copy manually.",
  pending: "Changes queued for the next automatic backup.",
  saving: "Saving a server backup…",
  saved: "Your latest changes are backed up.",
  offline: "You’re offline. Changes will back up when you reconnect.",
  error: "Backup delayed. We’ll retry automatically while MochiPlan is open.",
  conflict:
    "Automatic backups are paused. Review the server history before continuing.",
};
export function BackupSettings() {
  const {
    backups: {
      automatic,
      setAutomatic,
      serverBackupBusy,
      saveServerCopy,
      readServerCopy,
      openHistory,
      retryBackup,
    },
  } = useAppContext();
  const last = automatic.lastSuccessful;
  return (
    <section className="content-card backup-settings">
      <h2>A little server backup</h2>
      <p className="settings-description">
        Keep restorable versions of your planners, tasks, and preferences on
        your MochiPlan server. Backups belong to this browser; keep a downloaded
        copy before clearing site data.
      </p>
      <label className="toggle-row">
        Automatic server backups
        <input
          type="checkbox"
          checked={automatic.enabled}
          onChange={(ev) => setAutomatic(ev.target.checked)}
        />
      </label>
      <p className="backup-hint">
        Saves after edits settle, up to once a minute while MochiPlan is open.
        Recent versions stay in Backup history.
      </p>
      <div
        className={`backup-status backup-status-${automatic.status}`}
        role="status"
        aria-live="polite"
      >
        {automatic.status === "saving" ? (
          <LoaderCircle className="spin" size={18} />
        ) : automatic.status === "saved" ? (
          <CheckCircle2 size={18} />
        ) : (
          <Cloud size={18} />
        )}
        <div>
          <p>{statusText[automatic.status]}</p>
          <span className="backup-last-success">
            {last ? (
              <>
                Last successful backup:{" "}
                <time dateTime={last.updatedAt}>
                  {new Date(last.updatedAt).toLocaleString()}
                </time>
              </>
            ) : (
              "No successful server backup yet."
            )}
          </span>
        </div>
      </div>
      {automatic.error && <p className="backup-error">{automatic.error}</p>}
      {automatic.status === "error" && (
        <button
          className="text-button"
          disabled={serverBackupBusy}
          onClick={retryBackup}
        >
          <RefreshCw size={15} />
          Retry backup
        </button>
      )}
      <div className="backup-buttons">
        <button
          className="button secondary full-width"
          disabled={serverBackupBusy}
          onClick={saveServerCopy}
        >
          <Cloud size={16} />
          Save a server backup
        </button>
        <button
          className="button secondary full-width"
          disabled={serverBackupBusy}
          onClick={() => readServerCopy()}
        >
          <Share2 size={16} />
          Restore from server
        </button>
        <button
          className="button secondary full-width"
          disabled={serverBackupBusy}
          onClick={openHistory}
        >
          <History size={16} />
          Backup history
        </button>
      </div>
    </section>
  );
}
