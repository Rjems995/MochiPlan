import { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { originalOccurrence, type EditScope } from "../series";
import { EditScopeControl } from "./EditScopeControl";
import { Modal } from "./Modal";
export function ScopeChangeDialog() {
  const [scope, setScope] = useState<EditScope>("date");
  const {
    active,
    studio: { pendingEdit, setPendingEdit, applyPendingEdit },
  } = useAppContext();
  if (!pendingEdit) return null;
  return (
    <Modal title="Apply this change" onClose={() => setPendingEdit(null)}>
      <p className="scope-change-summary">
        Choose which dates to update for{" "}
        <strong>{pendingEdit.entry.title}</strong>.
      </p>
      <EditScopeControl
        value={scope}
        date={originalOccurrence(active, pendingEdit.entry, pendingEdit.date)}
        onChange={setScope}
      />
      <div className="modal-actions">
        <button
          className="button secondary"
          onClick={() => setPendingEdit(null)}
        >
          Cancel
        </button>
        <button
          className="button primary"
          onClick={() => applyPendingEdit(scope)}
        >
          Apply change
        </button>
      </div>
    </Modal>
  );
}
