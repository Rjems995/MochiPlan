import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  Circle,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
export function TasksPage() {
  const {
    data,
    tasks: {
      addTask,
      taskFilter,
      setTaskFilter,
      toggleTask,
      editTask,
      deleteTask,
    },
    platform: { now },
  } = useAppContext();

  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">ONE LITTLE THING AT A TIME</div>
          <h1>
            Small steps, lovely progress
            <span className="title-heart">♡</span>
          </h1>
          <p>You don’t have to do it all. Just the next little thing.</p>
        </div>
        <button className="button primary" onClick={addTask}>
          <Plus size={16} />
          Add a to-do
        </button>
      </div>
      <div className="task-progress">
        <div>
          <span>
            {data.tasks.filter((t) => t.done).length} of {data.tasks.length}{" "}
            little wins
          </span>
          <strong>
            {data.tasks.length
              ? Math.round(
                  (data.tasks.filter((t) => t.done).length /
                    data.tasks.length) *
                    100,
                )
              : 0}
            %
          </strong>
        </div>
        <div className="progress-track">
          <i
            style={{
              width: `${data.tasks.length ? (data.tasks.filter((t) => t.done).length / data.tasks.length) * 100 : 0}%`,
            }}
          />
        </div>
        <small>Every checked box is a little celebration.</small>
      </div>
      <div className="filter-pills">
        {[
          { id: "all", label: "All my to-dos" },
          { id: "pending", label: "A little to do" },
          { id: "done", label: "Little wins" },
          { id: "overdue", label: "Needs a little love" },
        ].map((f) => (
          <button
            key={f.id}
            className={taskFilter === f.id ? "active" : ""}
            onClick={() => setTaskFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="task-list content-card">
        {data.tasks
          .filter(
            (t) =>
              taskFilter === "all" ||
              (taskFilter === "pending" && !t.done) ||
              (taskFilter === "done" && t.done) ||
              (taskFilter === "overdue" &&
                !t.done &&
                t.due &&
                t.due < format(now, "yyyy-MM-dd")),
          )
          .sort(
            (a, b) =>
              Number(a.done) - Number(b.done) ||
              (a.due || "9999").localeCompare(b.due || "9999"),
          )
          .map((t) => (
            <div className={`task-row ${t.done ? "completed" : ""}`} key={t.id}>
              <button
                className="task-check"
                aria-label={`${t.done ? "Uncomplete" : "Complete"} ${t.title}`}
                onClick={() => toggleTask(t.id)}
              >
                {t.done ? <CheckCircle2 size={22} /> : <Circle size={22} />}
              </button>
              <button className="task-details" onClick={() => editTask(t)}>
                <strong>{t.title}</strong>
                <small>
                  {t.subject || "A little personal task"}
                  {t.due && ` · ${format(parseISO(t.due), "MMM d, yyyy")}`}
                </small>
              </button>
              <span className={`priority-badge ${t.priority}`}>
                {t.priority}
              </span>
              <button
                className="icon-button"
                aria-label={`Edit ${t.title}`}
                onClick={() => editTask(t)}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-button danger"
                aria-label={`Delete ${t.title}`}
                onClick={() => deleteTask(t.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        {!data.tasks.length && (
          <div className="empty-state">
            <ListTodo size={34} />
            <h3>A fresh little list.</h3>
            <p>Add your first task and take it one step at a time.</p>
          </div>
        )}
      </div>
    </>
  );
}
