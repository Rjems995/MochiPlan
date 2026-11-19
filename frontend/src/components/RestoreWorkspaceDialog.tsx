import { Download } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { downloadJSON } from "../storage";
import { Modal } from "./Modal";
export function RestoreWorkspaceDialog() {
  const {
    data,
    backups: {
      backupConfirm,
      setBackupConfirm,
      confirmRestore,
      restoring,
      restoreSource,
    },
  } = useAppContext();
  return (
    <>
      {backupConfirm && (
        <Modal
          title="Bring back your little workspace?"
          subtitle="This replaces the plans and tasks currently on this device."
          onClose={() => {
            if (!restoring) setBackupConfirm(null);
          }}
        >
          <p className="backup-restore-source">{restoreSource}</p>
          <p>
            {backupConfirm.schedules.length} planners and{" "}
            {backupConfirm.tasks.length} tasks are ready to come home.
          </p>
          <p className="backup-hint">
            Your current workspace will be kept as a safety copy in Backup
            history.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => downloadJSON(data)}
            >
              <Download size={15} />
              Back up current plans
            </button>
            <button
              className="button primary"
              onClick={confirmRestore}
              disabled={restoring}
            >
              {restoring ? "Restoring workspace…" : "Restore my workspace"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
