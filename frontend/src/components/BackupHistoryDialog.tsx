import { Cloud, History, LoaderCircle, RefreshCw } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import type { BackupSource } from "../services/backupTypes";
import { Modal } from "./Modal";

const sourceLabels: Record<BackupSource, string> = {
  automatic: "Automatic backup",
  manual: "Manual backup",
  "before-restore": "Before a restore",
  restore: "Restored workspace",
  legacy: "Earlier server backup",
};
export function BackupHistoryDialog() {
  const {
    backups: {
      historyOpen,
      setHistoryOpen,
      history,
      historyError,
      restorePoint,
      historyLoading,
      serverBackupBusy,
      refreshHistory,
      readServerCopy,
      readLocalRestorePoint,
    },
  } = useAppContext();
  if (!historyOpen) return null;
  return (
    <Modal
      title="Backup history"
      subtitle="Choose a version to review before restoring your workspace."
      onClose={() => setHistoryOpen(false)}
      wide
    >
      <div className="backup-history">
        {restorePoint && (
          <section className="backup-safety-point">
            <History size={20} />
            <div>
              <h3>Previous workspace on this device</h3>
              <p>
                A safety copy from before a restore or sync, available offline.
              </p>
              <time dateTime={restorePoint.savedAt}>
                {new Date(restorePoint.savedAt).toLocaleString()}
              </time>
            </div>
            <button
              className="button secondary"
              disabled={serverBackupBusy}
              onClick={readLocalRestorePoint}
            >
              Restore safety copy
            </button>
          </section>
        )}
        <div className="backup-history-heading">
          <h3>Server versions</h3>
          <button
            className="text-button"
            onClick={refreshHistory}
            disabled={serverBackupBusy}
          >
            <RefreshCw size={15} />
            Refresh history
          </button>
        </div>
        <p className="backup-hint">
          {history
            ? `Keeps the latest ${history.retentionLimit} versions. Restoring creates a new version and saves your current plans first.`
            : "Server versions are available when your MochiPlan server is online."}
        </p>
        {historyLoading && (
          <p className="backup-history-loading" role="status">
            <LoaderCircle className="spin" size={18} />
            Loading backup history…
          </p>
        )}
        {historyError && (
          <p className="backup-error" role="alert">
            {historyError}
          </p>
        )}
        {!historyLoading && history && !history.versions.length && (
          <p className="backup-empty">
            No server versions yet. Your first successful backup will appear
            here.
          </p>
        )}
        {history && history.versions.length > 0 && (
          <ol className="backup-version-list">
            {history.versions.map((version, index) => (
              <li key={version.revision}>
                <Cloud size={18} />
                <div className="backup-version-details">
                  <div className="backup-version-title">
                    <strong>{sourceLabels[version.source]}</strong>
                    {index === 0 && (
                      <span className="backup-latest">Latest</span>
                    )}
                  </div>
                  <time dateTime={version.updatedAt}>
                    {new Date(version.updatedAt).toLocaleString()}
                  </time>
                  <p>
                    Version {version.revision} · {version.summary.planners}{" "}
                    planners · {version.summary.activities} activities ·{" "}
                    {version.summary.tasks} tasks
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={serverBackupBusy}
                  aria-label={`Restore version ${version.revision}`}
                  onClick={() => readServerCopy(version.revision)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
}
