import { useState } from "react";
import { Calendar, Check, Plus, Trash2, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";
import { type Schedule, type Holiday, uid } from "../model";
import { isCalendarDate } from "../calendar";
import { Modal } from "./Modal";

export function CalendarDialog({
  schedule,
  onSave,
  onClose,
}: {
  schedule: Schedule;
  onSave: (value: {
    termStart?: string;
    termEnd?: string;
    holidays: Holiday[];
    entries: Schedule["entries"];
  }) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(schedule.termStart || "");
  const [end, setEnd] = useState(schedule.termEnd || "");
  const [holidays, setHolidays] = useState(schedule.holidays || []);
  const [entries, setEntries] = useState(schedule.entries);
  const [name, setName] = useState("");
  const [holidayStart, setHolidayStart] = useState("");
  const [holidayEnd, setHolidayEnd] = useState("");
  const [error, setError] = useState("");
  const cancellations = entries
    .flatMap((entry) =>
      (entry.cancelledDates || []).map((date) => ({ entry, date })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Modal
      title="Calendar dates"
      subtitle={`Semester, holidays, and cancelled classes for ${schedule.name}.`}
      onClose={onClose}
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (
            (start && !isCalendarDate(start)) ||
            (end && !isCalendarDate(end)) ||
            (start && end && start > end)
          ) {
            setError("Choose a semester end date on or after its start.");
            return;
          }
          if (name.trim() || holidayStart || holidayEnd) {
            setError(
              "Add the holiday to the list, or clear its fields before saving.",
            );
            return;
          }
          onSave({
            termStart: start || undefined,
            termEnd: end || undefined,
            holidays,
            entries,
          });
        }}
      >
        <div className="two-fields">
          <label className="field-label">
            Semester starts
            <input
              type="date"
              aria-label="Semester starts"
              value={start}
              max={end || undefined}
              onChange={(ev) => setStart(ev.target.value)}
            />
          </label>
          <label className="field-label">
            Semester ends
            <input
              type="date"
              aria-label="Semester ends"
              value={end}
              min={start || undefined}
              onChange={(ev) => setEnd(ev.target.value)}
            />
          </label>
        </div>
        <p className="calendar-help">
          Weekly activities run within these dates, including both endpoints.
          Leave either date empty for an open-ended semester. One-off events
          keep their own dates.
        </p>
        <div className="calendar-section-title">
          <Calendar size={15} />
          <h3>Holidays & breaks</h3>
        </div>
        <p className="calendar-help">
          Weekly classes pause during holidays. Events you schedule for a
          specific date still appear.
        </p>
        <label className="field-label">
          Holiday name
          <input
            aria-label="Holiday name"
            maxLength={100}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder="e.g. Semester break"
          />
        </label>
        <div className="two-fields">
          <label className="field-label">
            Holiday starts
            <input
              type="date"
              aria-label="Holiday starts"
              value={holidayStart}
              max={holidayEnd || undefined}
              onChange={(ev) => {
                setHolidayStart(ev.target.value);
                if (!holidayEnd) setHolidayEnd(ev.target.value);
              }}
            />
          </label>
          <label className="field-label">
            Holiday ends
            <input
              type="date"
              aria-label="Holiday ends"
              value={holidayEnd}
              min={holidayStart || undefined}
              onChange={(ev) => setHolidayEnd(ev.target.value)}
            />
          </label>
        </div>
        <button
          className="button secondary full-width"
          type="button"
          onClick={() => {
            if (
              !name.trim() ||
              !isCalendarDate(holidayStart) ||
              !isCalendarDate(holidayEnd) ||
              holidayStart > holidayEnd
            ) {
              setError("Give the holiday a name and a valid date range.");
              return;
            }
            setHolidays([
              ...holidays,
              {
                id: uid(),
                name: name.trim(),
                startDate: holidayStart,
                endDate: holidayEnd,
              },
            ]);
            setName("");
            setHolidayStart("");
            setHolidayEnd("");
            setError("");
          }}
        >
          <Plus size={15} />
          Add holiday
        </button>
        <div className="calendar-rule-list">
          {holidays.map((h) => (
            <div className="calendar-rule" key={h.id}>
              <span>
                <strong>{h.name}</strong>
                <small>
                  {format(parseISO(h.startDate), "MMM d, yyyy")}
                  {h.endDate !== h.startDate &&
                    ` – ${format(parseISO(h.endDate), "MMM d, yyyy")}`}
                </small>
              </span>
              <button
                type="button"
                className="icon-button danger"
                aria-label={`Remove holiday ${h.name}`}
                onClick={() =>
                  setHolidays(holidays.filter((v) => v.id !== h.id))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        <div className="calendar-section-title">
          <RotateCcw size={15} />
          <h3>Cancelled occurrences</h3>
        </div>
        {!cancellations.length ? (
          <p className="calendar-help">
            Open an activity and choose “Cancel this date” to skip a single
            occurrence.
          </p>
        ) : (
          <div className="calendar-rule-list">
            {cancellations.map(({ entry, date }) => (
              <div className="calendar-rule" key={entry.id + date}>
                <span>
                  <strong>{entry.title}</strong>
                  <small>{format(parseISO(date), "EEE, MMM d, yyyy")}</small>
                </span>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Restore ${entry.title} on ${date}`}
                  onClick={() =>
                    setEntries(
                      entries.map((e) =>
                        e.id === entry.id
                          ? {
                              ...e,
                              cancelledDates: e.cancelledDates?.filter(
                                (d) => d !== date,
                              ),
                            }
                          : e,
                      ),
                    )
                  }
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary">
            <Check size={15} />
            Save calendar dates
          </button>
        </div>
      </form>
    </Modal>
  );
}
