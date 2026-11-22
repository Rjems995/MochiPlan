import { Copy, Download } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { download } from "../storage";
import { Modal } from "./Modal";
import { AccountManagementDialog } from "./AccountManagementDialog";
import { SyncConflictDialog } from "./SyncConflictDialog";

export function AccountDialogs() {
  const {
    accounts,
    feedback: { notify },
  } = useAppContext();
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
      <SyncConflictDialog />
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
    </>
  );
}
