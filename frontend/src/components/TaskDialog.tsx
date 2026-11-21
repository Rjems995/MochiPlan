import { Check } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { type Task } from "../model";
import { Modal } from "./Modal";
import { TaskOptionsFields } from "./TaskOptionsFields";
export function TaskDialog() {
  const {
    data,
    tasks: {
      taskModal,
      taskEdit,
      setTaskModal,
      saveTask,
      taskTitle,
      setTaskTitle,
      taskSubject,
      setTaskSubject,
      taskDue,
      setTaskDue,
      taskPriority,
      setTaskPriority,
      taskError,
    },
  } = useAppContext();
  return (
    <>
      {taskModal && (
        <Modal
          title={taskEdit ? "A little task edit" : "One little thing to do"}
          subtitle="Small steps count, too."
          onClose={() => setTaskModal(false)}
          wide
        >
          <form
            className="task-edit-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              saveTask();
            }}
          >
            <label className="field-label">
              What’s on your mind?
              <input
                required
                maxLength={160}
                value={taskTitle}
                onChange={(ev) => setTaskTitle(ev.target.value)}
                placeholder="Finish my moodboard"
              />
            </label>
            <label className="field-label">
              Subject or activity
              <input
                list="subjects"
                value={taskSubject}
                onChange={(ev) => setTaskSubject(ev.target.value)}
                placeholder="Optional"
              />
              <datalist id="subjects">
                {Array.from(
                  new Set(
                    data.schedules.flatMap((s) =>
                      s.entries.map((e) => e.title),
                    ),
                  ),
                ).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </label>
            <div className="two-fields">
              <label className="field-label">
                A little deadline
                <input
                  type="date"
                  value={taskDue}
                  onChange={(ev) => setTaskDue(ev.target.value)}
                />
              </label>
              <label className="field-label">
                Priority
                <select
                  value={taskPriority}
                  onChange={(ev) =>
                    setTaskPriority(ev.target.value as Task["priority"])
                  }
                >
                  <option value="low">Low · whenever you can</option>
                  <option value="medium">Medium · a gentle focus</option>
                  <option value="high">High · first things first</option>
                </select>
              </label>
            </div>
            <TaskOptionsFields />
            {taskError && (
              <p className="task-form-error" role="alert">
                {taskError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setTaskModal(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={16} />
                {taskEdit ? "Save changes" : "Add my to-do"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
