import { dateForWeekday } from "../calendar";
import { useAppContext } from "../context/AppContext";
import { CalendarDialog } from "./CalendarDialog";
import { EntryForm } from "./EntryForm";
import { ExportModal } from "./ExportModal";
import { Modal } from "./Modal";
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
      canvasRef,
      canvasHourHeight,
      setExportOpen,
    },
    feedback: { notify },
  } = useAppContext();
  return (
    <>
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
          subtitle="You can bring it back with Undo."
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
          canvasWidth={canvasRef.current?.offsetWidth || 900}
          hourHeight={canvasHourHeight}
          onClose={() => setExportOpen(false)}
          notify={notify}
        />
      )}
    </>
  );
}
