import { Copy, Download } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { download, downloadJSON } from "../storage";
import { Modal } from "./Modal";
import { AccountManagementDialog } from "./AccountManagementDialog";

export function AccountDialogs() {
  const {
    accounts,
    data,
    feedback: { notify },
  } = useAppContext();
  const conflict = accounts.sync.conflict;
  function saveCode() {
    const url = URL.createObjectURL(
      new Blob(
        [
          `MochiPlan account: ${accounts.user?.username}\nRecovery code: ${accounts.recoveryCode}\nKeep this private. Each password reset replaces this code.\n`,
        ],
        { type: "text/plain" },
      ),
    );
    download(url, "mochiplan-recovery-code.txt");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <AccountManagementDialog />
      {accounts.recoveryCode && (
        <Modal
          title="Keep your recovery code safe"
          subtitle="This is the only way to reset your password without an email account. Store it somewhere private."
          onClose={() => accounts.setRecoveryCode("")}
        >
          <div className="account-recovery-code">
            <code>{accounts.recoveryCode}</code>
          </div>
          <p className="account-hint">
            This code is shown once. A password reset replaces it and signs out
            your other devices.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(accounts.recoveryCode);
                  notify("Recovery code copied.");
                } catch {
                  notify("Download your recovery code to save a private copy.");
                }
              }}
            >
              <Copy size={16} />
              Copy code
            </button>
            <button className="button secondary" onClick={saveCode}>
              <Download size={16} />
              Download code
            </button>
            <button
              className="button primary"
              onClick={() => accounts.setRecoveryCode("")}
            >
              I’ve saved my code
            </button>
          </div>
        </Modal>
      )}
      {accounts.conflictOpen && conflict && (
        <Modal
          title="Bring your changes together"
          subtitle="Both devices changed the same plans. Choose which version to use, or keep both as separate planners and tasks."
          onClose={() => {
            if (!accounts.sync.busy) accounts.setConflictOpen(false);
          }}
        >
          <div className="account-conflict-counts">
            <div>
              <strong>This device</strong>
              <span>
                {data.schedules.length} planners · {data.tasks.length} tasks
              </span>
            </div>
            <div>
              <strong>Your account</strong>
              <span>
                {conflict.remote.data?.schedules.length || 0} planners ·{" "}
                {conflict.remote.data?.tasks.length || 0} tasks
              </span>
            </div>
          </div>
          <p className="account-hint">
            A safety copy is saved on this device before changes are applied.
            Keeping both retains differing planners and tasks separately and
            uses this device’s preferences.
          </p>
          {accounts.sync.error && (
            <p className="account-notice" role="alert">
              {accounts.sync.error}
            </p>
          )}
          <div className="account-conflict-actions">
            <button
              className="button primary"
              disabled={accounts.sync.busy}
              onClick={() => accounts.resolveConflict("both")}
            >
              Keep both sets of plans
            </button>
            <button
              className="button secondary"
              disabled={accounts.sync.busy}
              onClick={() => accounts.resolveConflict("local")}
            >
              Use this device’s version
            </button>
            <button
              className="button secondary"
              disabled={accounts.sync.busy}
              onClick={() => accounts.resolveConflict("account")}
            >
              Use account version
            </button>
            <button className="text-button" onClick={() => downloadJSON(data)}>
              <Download size={16} />
              Download this device’s backup
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
