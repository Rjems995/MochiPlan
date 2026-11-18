import { Check, Plus } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { readableColor } from "../contrast";
import { scheduleTypes, themes } from "../model";
import { Modal } from "./Modal";
import { StickerArt } from "./StickerArt";
export function PlannerDialogs() {
  const {
    data,
    planners: {
      newModal,
      setNewModal,
      createPlanner,
      newName,
      setNewName,
      newType,
      setNewType,
      newTheme,
      setNewTheme,
      newTermStart,
      newTermEnd,
      setNewTermStart,
      setNewTermEnd,
      renameId,
      setRenameId,
      renamePlanner,
      renameValue,
      setRenameValue,
      deleteId,
      setDeleteId,
      deletePlanner,
    },
  } = useAppContext();
  return (
    <>
      {newModal && (
        <Modal
          title="A fresh little beginning"
          subtitle="Every lovely plan starts with a blank page."
          onClose={() => setNewModal(false)}
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              createPlanner();
            }}
          >
            <label className="field-label">
              Give your planner a name
              <input
                required
                maxLength={80}
                placeholder="e.g. My fall semester"
                value={newName}
                onChange={(ev) => setNewName(ev.target.value)}
              />
            </label>
            <label className="field-label">
              What are we planning?
              <select
                value={newType}
                onChange={(ev) => setNewType(ev.target.value)}
              >
                {scheduleTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <fieldset className="field-label">
              <legend>A starting palette</legend>
              <div className="new-theme-grid">
                {themes.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={newTheme === t.id ? "selected" : ""}
                    onClick={() => setNewTheme(t.id)}
                    style={{
                      background: t.bg,
                      color: readableColor(t.bg, t.color),
                    }}
                  >
                    <span>
                      <StickerArt token={t.emoji} />
                    </span>
                    {t.name}
                    {newTheme === t.id && <Check size={13} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="two-fields">
              <label className="field-label">
                Semester starts
                <input
                  type="date"
                  aria-label="Semester starts"
                  value={newTermStart}
                  max={newTermEnd || undefined}
                  onChange={(ev) => setNewTermStart(ev.target.value)}
                />
              </label>
              <label className="field-label">
                Semester ends
                <input
                  type="date"
                  aria-label="Semester ends"
                  value={newTermEnd}
                  min={newTermStart || undefined}
                  onChange={(ev) => setNewTermEnd(ev.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNewModal(false)}
              >
                Maybe later
              </button>
              <button type="submit" className="button primary">
                <Plus size={16} />
                Create my planner
              </button>
            </div>
          </form>
        </Modal>
      )}
      {renameId && (
        <Modal title="A new little name" onClose={() => setRenameId(null)}>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              renamePlanner();
            }}
          >
            <label className="field-label">
              Planner name
              <input
                required
                maxLength={80}
                value={renameValue}
                onChange={(ev) => setRenameValue(ev.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRenameId(null)}
              >
                Cancel
              </button>
              <button type="submit" className="button primary">
                <Check size={15} />
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleteId && (
        <Modal
          title="Let this little planner go?"
          subtitle="Its activities and design will be removed. You can bring it back with Undo."
          onClose={() => setDeleteId(null)}
        >
          <p className="delete-name">
            {data.schedules.find((s) => s.id === deleteId)?.name}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteId(null)}
            >
              Keep my planner
            </button>
            <button className="button danger-button" onClick={deletePlanner}>
              Delete planner
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
