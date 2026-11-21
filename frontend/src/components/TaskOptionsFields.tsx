import { Bell, Plus, Repeat2, Trash2 } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { uid, type TaskRecurrence } from "../model";

export function TaskOptionsFields() {
  const { tasks, p, reminders, platform } = useAppContext();
  const {
    taskDue,
    taskDueTime,
    setTaskDueTime,
    taskRepeat,
    setTaskRepeat,
    taskInterval,
    setTaskInterval,
    taskUntil,
    setTaskUntil,
    taskReminder,
    setTaskReminder,
    taskSubtasks,
    setTaskSubtasks,
  } = tasks;
  return (
    <div className="task-options-fields">
      <div className="two-fields">
        <label className="field-label">
          Deadline time
          <input
            type="time"
            value={taskDueTime}
            onChange={(event) => setTaskDueTime(event.target.value)}
          />
        </label>
        <label className="field-label">
          Deadline notification
          <select
            value={taskReminder}
            onChange={(event) => setTaskReminder(event.target.value)}
          >
            <option value="off">Off</option>
            <option value="0">At the deadline</option>
            <option value="15">15 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="1440">1 day before</option>
          </select>
        </label>
      </div>
      {taskReminder !== "off" && (
        <div className="task-reminder-help">
          <p>
            Without a deadline time, alerts use 9:00 am in this device’s time
            zone. Background reminders can deliver alerts with the app closed;
            offline edits must sync first.
          </p>
          {!p.reminders && !reminders.enabled && (
            <button
              type="button"
              className="text-button"
              onClick={platform.toggleReminders}
            >
              <Bell size={15} />
              Enable gentle reminders
            </button>
          )}
        </div>
      )}
      <div className="two-fields">
        <label className="field-label">
          Repeat
          <select
            value={taskRepeat}
            onChange={(event) =>
              setTaskRepeat(
                event.target.value as TaskRecurrence["frequency"] | "none",
              )
            }
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        {taskRepeat !== "none" && (
          <label className="field-label">
            Repeat every
            <input
              type="number"
              aria-label="Repeat every"
              min={1}
              max={99}
              required
              value={taskInterval}
              onChange={(event) => setTaskInterval(Number(event.target.value))}
            />
            <span className="task-field-hint">
              {
                { daily: "days", weekly: "weeks", monthly: "months" }[
                  taskRepeat
                ]
              }
            </span>
          </label>
        )}
      </div>
      {taskRepeat !== "none" && (
        <>
          <label className="field-label">
            Repeat until
            <input
              type="date"
              aria-label="Repeat until"
              min={taskDue || undefined}
              value={taskUntil}
              onChange={(event) => setTaskUntil(event.target.value)}
            />
            <span className="task-field-hint">
              Optional. This date is included.
            </span>
          </label>
          <p className="task-field-hint task-repeat-help">
            <Repeat2 size={14} />
            Completing this task creates the next copy and resets its steps.
            Overdue repeats skip to the next future date; monthly repeats keep
            their original day when possible.
          </p>
        </>
      )}
      <fieldset className="task-subtask-editor">
        <legend>Subtasks</legend>
        {taskSubtasks.map((step, index) => (
          <div className="task-subtask-draft" key={step.id}>
            <input
              type="checkbox"
              aria-label={`Complete draft subtask ${index + 1}`}
              checked={step.done}
              onChange={(event) =>
                setTaskSubtasks((items) =>
                  items.map((item) =>
                    item.id === step.id
                      ? { ...item, done: event.target.checked }
                      : item,
                  ),
                )
              }
            />
            <input
              aria-label={`Subtask ${index + 1}`}
              maxLength={160}
              placeholder="One small step"
              value={step.title}
              onChange={(event) =>
                setTaskSubtasks((items) =>
                  items.map((item) =>
                    item.id === step.id
                      ? { ...item, title: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <button
              type="button"
              className="icon-button danger"
              aria-label={`Remove subtask ${index + 1}`}
              onClick={() =>
                setTaskSubtasks((items) =>
                  items.filter((item) => item.id !== step.id),
                )
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button secondary small"
          disabled={taskSubtasks.length >= 100}
          onClick={() =>
            setTaskSubtasks((items) => [
              ...items,
              { id: uid(), title: "", done: false },
            ])
          }
        >
          <Plus size={15} />
          Add a subtask
        </button>
        <p className="task-field-hint">
          Check off steps individually, or complete the task to finish all its
          steps.
        </p>
      </fieldset>
    </div>
  );
}
