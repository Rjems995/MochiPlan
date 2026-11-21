import { ListTodo, Plus } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { TaskCard } from "../components/TaskCard";
import { taskIsOverdue } from "../taskRules";
export function TasksPage() {
  const {
    data,
    tasks: { addTask, taskFilter, setTaskFilter },
    platform: { now },
  } = useAppContext();
  const visibleTasks = data.tasks
    .filter(
      (task) =>
        taskFilter === "all" ||
        (taskFilter === "pending" && !task.done) ||
        (taskFilter === "done" && task.done) ||
        (taskFilter === "overdue" && taskIsOverdue(task, now)) ||
        (taskFilter === "recurring" && !!task.recurrence),
    )
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        `${a.due || "9999"}T${a.dueTime || "23:59"}`.localeCompare(
          `${b.due || "9999"}T${b.dueTime || "23:59"}`,
        ),
    );

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
          { id: "recurring", label: "Repeating tasks" },
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
        {visibleTasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {!!data.tasks.length && !visibleTasks.length && (
          <div className="empty-state">
            <ListTodo size={30} />
            <h3>A little breathing room.</h3>
            <p>No tasks match this view. Try another filter or add a to-do.</p>
          </div>
        )}
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
