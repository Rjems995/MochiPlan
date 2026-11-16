import { useState } from "react";
import { Copy, Trash2, AlertTriangle, Check, Plus } from "lucide-react";
import {
  type Entry,
  type Schedule,
  dayNames,
  timeValue,
  parseTime,
  uid,
  overlaps,
  themes,
} from "../model";
import { Modal } from "./Modal";
export function EntryForm({
  schedule,
  entry,
  initialDay = 0,
  initialStart = 540,
  onSave,
  onDelete,
  onDuplicate,
  onClose,
}: {
  schedule: Schedule;
  entry: Entry | null;
  initialDay?: number;
  initialStart?: number;
  onSave: (entries: Entry[]) => void;
  onDelete: (id: string) => void;
  onDuplicate: (e: Entry) => void;
  onClose: () => void;
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
  const candidates = days.map((day) => ({
    id: entry?.id || "new",
    title,
    day,
    start: parseTime(start),
    end: parseTime(end),
    location,
    instructor,
    notes,
    color,
  }));
  const conflict = candidates.some((a) =>
    schedule.entries.some((b) => overlaps(a, b)),
  );
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
          if (!days.length) {
            setError("Choose at least one day.");
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
