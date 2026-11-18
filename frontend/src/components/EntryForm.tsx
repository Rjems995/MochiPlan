import { useState } from "react";
import { Copy, Trash2, AlertTriangle, Check, Plus } from "lucide-react";
import {
  type Entry,
  type Schedule,
  dayNames,
  timeValue,
  parseTime,
  uid,
  themes,
} from "../model";
import { Modal } from "./Modal";
import { format, parseISO } from "date-fns";
import {
  dateForWeekday,
  isCalendarDate,
  weekdayForDate,
  candidateConflicts,
  occurrenceStatus,
  shiftCancellationWeekday,
} from "../calendar";
export function EntryForm({
  schedule,
  entry,
  initialDay = 0,
  initialStart = 540,
  onSave,
  onDelete,
  onDuplicate,
  onClose,
  initialDate,
  weekStart = "monday",
  onToggleCancellation,
  initialOnce = false,
}: {
  schedule: Schedule;
  entry: Entry | null;
  initialDay?: number;
  initialStart?: number;
  onSave: (entries: Entry[]) => void;
  onDelete: (id: string) => void;
  onDuplicate: (e: Entry) => void;
  onClose: () => void;
  initialDate?: string;
  weekStart?: "monday" | "sunday";
  onToggleCancellation?: (id: string, date: string) => void;
  initialOnce?: boolean;
}) {
  const [title, setTitle] = useState(entry?.title || "");
  const [days, setDays] = useState([entry?.day ?? initialDay]);
  const [start, setStart] = useState(timeValue(entry?.start ?? initialStart));
  const [end, setEnd] = useState(
    timeValue(entry?.end ?? Math.min(1440 - 1, initialStart + 60)),
  );
  const [location, setLocation] = useState(entry?.location || "");
  const [instructor, setInstructor] = useState(entry?.instructor || "");
  const [notes, setNotes] = useState(entry?.notes || "");
  const [color, setColor] = useState(entry?.color || themes[0].palette[0]);
  const [error, setError] = useState("");
  const occurrenceDate =
    initialDate ||
    entry?.date ||
    dateForWeekday(new Date(), entry?.day ?? initialDay, weekStart);
  const [recurrence, setRecurrence] = useState<"weekly" | "once">(
    entry?.date ||
      (!entry && (initialOnce || schedule.type === "Exam schedule"))
      ? "once"
      : "weekly",
  );
  const [eventDate, setEventDate] = useState(entry?.date || occurrenceDate);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const candidates = (
    recurrence === "once"
      ? isCalendarDate(eventDate)
        ? [weekdayForDate(eventDate)]
        : []
      : days
  ).map((day) => ({
    id: entry?.id || "new",
    title,
    day,
    start: parseTime(start),
    end: parseTime(end),
    location,
    instructor,
    notes,
    color,
    date: recurrence === "once" ? eventDate : undefined,
    cancelledDates: entry
      ? recurrence === "once"
        ? entry.date === eventDate
          ? entry.cancelledDates
          : []
        : !entry.date
          ? shiftCancellationWeekday(entry, day, weekStart)
          : []
      : undefined,
  }));
  const conflict = candidates.some((a) =>
    candidateConflicts(
      schedule,
      a,
      a.date || dateForWeekday(occurrenceDate, a.day, weekStart),
    ),
  );
  const status = entry
    ? occurrenceStatus(schedule, entry, occurrenceDate)
    : "none";
  return (
    <Modal
      title={entry ? "A little edit" : "Add a little activity"}
      subtitle="Make space for a class, a coffee, or a little you time."
      onClose={onClose}
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!title.trim()) {
            setError("Give your activity a name.");
            return;
          }
          if (recurrence === "weekly" && !days.length) {
            setError("Choose at least one day.");
            return;
          }
          if (recurrence === "once" && !isCalendarDate(eventDate)) {
            setError("Choose a valid event date.");
            return;
          }
          if (
            !Number.isFinite(parseTime(start)) ||
            !Number.isFinite(parseTime(end)) ||
            parseTime(end) <= parseTime(start)
          ) {
            setError("The end time needs to be after the start time.");
            return;
          }
          onSave(
            candidates.map((c) => ({
              ...c,
              id: entry?.id || uid(),
              title: title.trim(),
            })),
          );
        }}
      >
        <label className="field-label">
          What’s the plan?
          <input
            required
            maxLength={100}
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder="e.g. Design principles"
          />
        </label>
        <label className="field-label">
          Repeats
          <select
            aria-label="Activity recurrence"
            value={recurrence}
            onChange={(ev) =>
              setRecurrence(ev.target.value as "weekly" | "once")
            }
          >
            <option value="weekly">Every week</option>
            <option value="once">On a specific date</option>
          </select>
        </label>
        {recurrence === "once" ? (
          <label className="field-label">
            Event date
            <input
              type="date"
              aria-label="Event date"
              required
              value={eventDate}
              onChange={(ev) => {
                setEventDate(ev.target.value);
                if (isCalendarDate(ev.target.value))
                  setDays([weekdayForDate(ev.target.value)]);
              }}
            />
          </label>
        ) : (
          <fieldset className="field-label">
            <legend>On these days</legend>
            <div className="day-picker">
              {dayNames.map((name, i) => (
                <button
                  type="button"
                  key={name}
                  className={days.includes(i) ? "selected" : ""}
                  onClick={() => {
                    setDays(
                      entry
                        ? [i]
                        : days.includes(i)
                          ? days.filter((d) => d !== i)
                          : [...days, i],
                    );
                  }}
                  aria-pressed={days.includes(i)}
                >
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {recurrence === "weekly" &&
          (schedule.termStart ||
            schedule.termEnd ||
            (schedule.holidays || []).length > 0) && (
            <p className="calendar-help">
              Weekly activities follow this planner’s semester dates and holiday
              breaks.
            </p>
          )}
        <div className="two-fields">
          <label className="field-label">
            Starts at
            <input
              type="time"
              required
              step="900"
              value={start}
              onChange={(ev) => setStart(ev.target.value)}
            />
          </label>
          <label className="field-label">
            Finishes at
            <input
              type="time"
              required
              step="900"
              value={end}
              onChange={(ev) => setEnd(ev.target.value)}
            />
          </label>
        </div>
        <div className="two-fields">
          <label className="field-label">
            Room or location
            <input
              value={location}
              onChange={(ev) => setLocation(ev.target.value)}
              placeholder="Studio 204"
            />
          </label>
          <label className="field-label">
            Instructor
            <input
              value={instructor}
              onChange={(ev) => setInstructor(ev.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <label className="field-label">
          Little notes
          <textarea
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
            placeholder="Anything you’d like to remember…"
            rows={2}
          />
        </label>
        <fieldset className="field-label">
          <legend>Pick a color</legend>
          <div className="color-palette">
            {[...themes[0].palette, ...themes[1].palette.slice(0, 3)].map(
              (c) => (
                <button
                  type="button"
                  key={c}
                  style={{ background: c }}
                  aria-label={`Choose ${c}`}
                  className={color === c ? "selected" : ""}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={15} />}
                </button>
              ),
            )}
            <input
              type="color"
              aria-label="Custom activity color"
              value={color}
              onChange={(ev) => setColor(ev.target.value)}
            />
          </div>
        </fieldset>
        {conflict && (
          <p className="notice warning">
            <AlertTriangle size={17} />
            This overlaps another activity. Both will be shown side by side.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {entry &&
          onToggleCancellation &&
          (status === "scheduled" || status === "cancelled") && (
            <div className="entry-exception">
              <p>
                {format(parseISO(occurrenceDate), "EEEE, MMMM d, yyyy")}
                {status === "cancelled" ? " · Cancelled" : ""}
              </p>
              {status === "cancelled" ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => onToggleCancellation(entry.id, occurrenceDate)}
                >
                  Restore this date
                </button>
              ) : confirmCancellation ? (
                <>
                  <p className="calendar-help">
                    Cancel only this occurrence? Other scheduled dates remain in
                    your planner.
                  </p>
                  <div className="exception-actions">
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setConfirmCancellation(false)}
                    >
                      Keep this class
                    </button>
                    <button
                      className="button danger-button"
                      type="button"
                      onClick={() =>
                        onToggleCancellation(entry.id, occurrenceDate)
                      }
                    >
                      Confirm cancellation
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setConfirmCancellation(true)}
                >
                  Cancel this date
                </button>
              )}
            </div>
          )}
        <div className="modal-actions">
          {entry && (
            <>
              <button
                type="button"
                className="icon-button danger"
                aria-label="Delete activity"
                onClick={() => onDelete(entry.id)}
              >
                <Trash2 size={17} />
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => onDuplicate(entry)}
              >
                <Copy size={15} />
                Duplicate
              </button>
            </>
          )}
          <button
            type="button"
            className="button secondary push-right"
            onClick={onClose}
          >
            Cancel
          </button>
          <button type="submit" className="button primary">
            {entry ? <Check size={16} /> : <Plus size={16} />}{" "}
            {entry ? "Save changes" : "Add activity"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
