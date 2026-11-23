import { dateForWeekday } from "../calendar";
import { useAppContext } from "../context/AppContext";
import { CalendarDialog } from "./CalendarDialog";
import { EntryForm } from "./EntryForm";
import { ExportModal } from "./ExportModal";
import { Modal } from "./Modal";
import { ScopeChangeDialog } from "./ScopeChangeDialog";
import { PlannerSizeDialog } from "./PlannerSizeDialog";
export function ActivityDialogs() {
  const {
    active,
    p,
    studio: {
      calendarOpen,
      setCalendarOpen,
      saveCalendar,
      editor,
      week,
      view,
      toggleCancellation,
      saveEntries,
      setDeleteEntry,
      duplicateEntry,
      setEditor,
      deleteEntry,
      deleteActivity,
      exportOpen,
      day,
      setExportOpen,
      sizeOpen,
      setSizeOpen,
      pendingEdit,
    },
    feedback: { notify },
  } = useAppContext();
  return (
    <>
      {sizeOpen && <PlannerSizeDialog onClose={() => setSizeOpen(false)} />}
      {pendingEdit && <ScopeChangeDialog />}
      {calendarOpen && (
        <CalendarDialog
          key={active.id}
          schedule={active}
          onClose={() => setCalendarOpen(false)}
          onSave={saveCalendar}
        />
      )}
      {editor && (
        <EntryForm
          schedule={active}
          entry={editor.entry}
          initialDay={editor.day}
          initialStart={editor.start}
          initialDate={
            editor.date ||
            editor.entry?.date ||
            dateForWeekday(week, editor.day, p.weekStart)
          }
          initialOnce={view === "monthly"}
          weekStart={p.weekStart}
          onToggleCancellation={toggleCancellation}
          onSave={saveEntries}
          onDelete={(id) => setDeleteEntry(id)}
          onDuplicate={duplicateEntry}
          onClose={() => setEditor(null)}
        />
      )}
      {deleteEntry && (
        <Modal
          title="Let this little activity go?"
          subtitle={
            active.entries.find((e) => e.id === deleteEntry)?.date
              ? "You can bring it back with Undo."
              : "This removes the entire repeating series. To skip one date, cancel that occurrence instead. You can bring it back with Undo."
          }
          onClose={() => setDeleteEntry(null)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteEntry(null)}
            >
              Keep it
            </button>
            <button className="button danger-button" onClick={deleteActivity}>
              Delete activity
            </button>
          </div>
        </Modal>
      )}
      {exportOpen && (
        <ExportModal
          schedule={active}
          preferences={p}
          week={week}
          view={view}
          day={day}
          onClose={() => setExportOpen(false)}
          notify={notify}
        />
      )}
    </>
  );
}
