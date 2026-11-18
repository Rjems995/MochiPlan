import { Download } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { downloadJSON } from "../storage";
import { Modal } from "./Modal";
export function RestoreWorkspaceDialog() {
  const {
    data,
    backups: { backupConfirm, setBackupConfirm, confirmRestore },
  } = useAppContext();
  return (
    <>
      {backupConfirm && (
        <Modal
          title="Bring back your little workspace?"
          subtitle="This replaces the plans and tasks currently on this device."
          onClose={() => setBackupConfirm(null)}
        >
          <p>
            {backupConfirm.schedules.length} planners and{" "}
            {backupConfirm.tasks.length} tasks are ready to come home.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => downloadJSON(data)}
            >
              <Download size={15} />
              Back up current plans
            </button>
            <button className="button primary" onClick={confirmRestore}>
              Restore my workspace
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
