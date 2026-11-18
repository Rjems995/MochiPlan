import { format } from "date-fns";
import { useState } from "react";
import { uid, type Task } from "../model";
import type { WorkspaceController } from "./useWorkspace";
export function useTaskManager(
  workspace: WorkspaceController,
  notify: (text: string) => void,
) {
  const { data, setData } = workspace;
  const [taskFilter, setTaskFilter] = useState("all");
  const [taskEdit, setTaskEdit] = useState<Task | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState(format(new Date(), "yyyy-MM-dd"));
  const [taskSubject, setTaskSubject] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("medium");
  function addTask() {
    setTaskEdit(null);
    setTaskTitle("");
    setTaskSubject("");
    setTaskDue(format(new Date(), "yyyy-MM-dd"));
    setTaskPriority("medium");
    setTaskModal(true);
  }
  function editTask(t: Task) {
    setTaskEdit(t);
    setTaskTitle(t.title);
    setTaskSubject(t.subject);
    setTaskDue(t.due);
    setTaskPriority(t.priority);
    setTaskModal(true);
  }
  function toggleTask(id: string) {
    setData((old) =>
      old
        ? {
            ...old,
            tasks: old.tasks.map((t) =>
              t.id === id ? { ...t, done: !t.done } : t,
            ),
          }
        : old,
    );
  }
  const dueTasks =
    data?.tasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")) || [];
  function saveTask() {
    const task: Task = {
      id: taskEdit?.id || uid(),
      title: taskTitle.trim(),
      subject: taskSubject,
      due: taskDue,
      priority: taskPriority,
      done: taskEdit?.done || false,
    };
    if (!task.title) return;
    setData((old) =>
      old
        ? {
            ...old,
            tasks: taskEdit
              ? old.tasks.map((t) => (t.id === taskEdit.id ? task : t))
              : [...old.tasks, task],
          }
        : old,
    );
    setTaskModal(false);
    notify("A little to-do, all tucked in.");
  }
  function deleteTask(id: string) {
    setData((old) =>
      old ? { ...old, tasks: old.tasks.filter((task) => task.id !== id) } : old,
    );
  }
  return {
    taskFilter,
    setTaskFilter,
    taskEdit,
    setTaskEdit,
    taskModal,
    setTaskModal,
    taskTitle,
    setTaskTitle,
    taskDue,
    setTaskDue,
    taskSubject,
    setTaskSubject,
    taskPriority,
    setTaskPriority,
    addTask,
    editTask,
    toggleTask,
    dueTasks,
    saveTask,
    deleteTask,
  };
}
export type TaskManagerController = ReturnType<typeof useTaskManager>;
