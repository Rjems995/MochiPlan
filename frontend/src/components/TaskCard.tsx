import {
  Bell,
  CheckCircle2,
  Circle,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAppContext } from "../context/AppContext";
import { formatTime, type Task } from "../model";
import { taskIsOverdue, taskRepeatLabel } from "../taskRules";

export function TaskCard({ task }: { task: Task }) {
  const {
    tasks,
    p,
    platform: { now },
  } = useAppContext();
  const steps = task.subtasks || [],
    completed = steps.filter((step) => step.done).length;
  const time = task.dueTime
    ? Number(task.dueTime.slice(0, 2)) * 60 + Number(task.dueTime.slice(3))
    : null;
  return (
    <article
      className={`task-item ${taskIsOverdue(task, now) ? "task-overdue" : ""}`}
    >
      <div className={`task-row ${task.done ? "completed" : ""}`}>
        <button
          className="task-check"
          aria-label={`${task.done ? "Uncomplete" : "Complete"} ${task.title}`}
          onClick={() => tasks.toggleTask(task.id)}
        >
          {task.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>
        <button className="task-details" onClick={() => tasks.editTask(task)}>
          <strong>{task.title}</strong>
          <small>
            {task.subject || "A little personal task"}
            {task.due && ` · ${format(parseISO(task.due), "MMM d, yyyy")}`}
            {time !== null && ` · ${formatTime(time, p.time24)}`}
            {taskIsOverdue(task, now) && " · Overdue"}
          </small>
          <span className="task-flags">
            {task.recurrence && (
              <span>
                <Repeat2 size={13} />
                {taskRepeatLabel(task)}
              </span>
            )}
            {task.reminderMinutes !== undefined && (
              <span>
                <Bell size={13} />
                {task.reminderMinutes === 0
                  ? "At deadline"
                  : task.reminderMinutes === 1440
                    ? "1 day before"
                    : task.reminderMinutes === 60
                      ? "1 hour before"
                      : `${task.reminderMinutes} min before`}
              </span>
            )}
            {steps.length > 0 && (
              <span>
                {completed}/{steps.length} steps
              </span>
            )}
          </span>
        </button>
        <span className={`priority-badge ${task.priority}`}>
          {task.priority}
        </span>
        <button
          className="icon-button"
          aria-label={`Edit ${task.title}`}
          onClick={() => tasks.editTask(task)}
        >
          <Pencil size={15} />
        </button>
        <button
          className="icon-button danger"
          aria-label={`Delete ${task.title}`}
          onClick={() => tasks.deleteTask(task.id)}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {steps.length > 0 && (
        <div className="task-subtasks">
          <progress
            aria-label={`Subtask progress for ${task.title}`}
            max={steps.length}
            value={completed}
          />
          <ul>
            {steps.map((step) => (
              <li key={step.id}>
                <label className={step.done ? "subtask-done" : ""}>
                  <input
                    type="checkbox"
                    aria-label={`${step.done ? "Uncomplete" : "Complete"} ${step.title} in ${task.title}`}
                    checked={step.done}
                    onChange={() => tasks.toggleSubtask(task.id, step.id)}
                  />
                  <span>{step.title}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
