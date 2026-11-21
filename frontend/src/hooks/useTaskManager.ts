import { format } from "date-fns";
import { useEffect, useState } from "react";
import { uid, type Task, type Subtask, type TaskRecurrence } from "../model";
import { toggleTaskCompletion, validTaskExtensions } from "../taskRules";
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
  const [taskSubtasks, setTaskSubtasks] = useState<Subtask[]>([]);
  const [taskDueTime, setTaskDueTime] = useState("");
  const [taskRepeat, setTaskRepeat] = useState<
    TaskRecurrence["frequency"] | "none"
  >("none");
  const [taskInterval, setTaskInterval] = useState(1);
  const [taskUntil, setTaskUntil] = useState("");
  const [taskReminder, setTaskReminder] = useState("off");
  const [taskError, setTaskError] = useState("");
  useEffect(
    () => setTaskError(""),
    [
      taskTitle,
      taskDue,
      taskDueTime,
      taskRepeat,
      taskInterval,
      taskUntil,
      taskReminder,
      taskSubtasks,
    ],
  );
  function addTask() {
    setTaskEdit(null);
    setTaskTitle("");
    setTaskSubject("");
    setTaskDue(format(new Date(), "yyyy-MM-dd"));
    setTaskPriority("medium");
    setTaskSubtasks([]);
    setTaskDueTime("");
    setTaskRepeat("none");
    setTaskInterval(1);
    setTaskUntil("");
    setTaskReminder("off");
    setTaskError("");
    setTaskModal(true);
  }
  function editTask(t: Task) {
    setTaskEdit(t);
    setTaskTitle(t.title);
    setTaskSubject(t.subject);
    setTaskDue(t.due);
    setTaskPriority(t.priority);
    setTaskSubtasks(structuredClone(t.subtasks || []));
    setTaskDueTime(t.dueTime || "");
    setTaskRepeat(t.recurrence?.frequency || "none");
    setTaskInterval(t.recurrence?.interval || 1);
    setTaskUntil(t.recurrence?.until || "");
    setTaskReminder(
      t.reminderMinutes === undefined ? "off" : String(t.reminderMinutes),
    );
    setTaskError("");
    setTaskModal(true);
  }
  function toggleTask(id: string) {
    if (
      data &&
      data.tasks.length >= 10000 &&
      data.tasks.some((t) => t.id === id && !t.done && t.recurrence)
    ) {
      notify(
        "Remove some completed tasks before creating another repeat. This workspace has reached its task limit.",
      );
      return;
    }
    setData((old) =>
      old
        ? {
            ...old,
            tasks: toggleTaskCompletion(old.tasks, id),
          }
        : old,
    );
  }
  function toggleSubtask(id: string, stepId: string) {
    setData((old) =>
      old
        ? {
            ...old,
            tasks: old.tasks.map((task) =>
              task.id !== id
                ? task
                : {
                    ...task,
                    done: task.subtasks?.some(
                      (step) => step.id === stepId && step.done,
                    )
                      ? false
                      : task.done,
                    subtasks: task.subtasks?.map((step) =>
                      step.id === stepId ? { ...step, done: !step.done } : step,
                    ),
                  },
            ),
          }
        : old,
    );
  }
  const dueTasks =
    data?.tasks
      .filter((t) => !t.done)
      .sort((a, b) =>
        `${a.due || "9999"}T${a.dueTime || "23:59"}`.localeCompare(
          `${b.due || "9999"}T${b.dueTime || "23:59"}`,
        ),
      ) || [];
  function saveTask() {
    const task: Task = {
      ...taskEdit,
      id: taskEdit?.id || uid(),
      title: taskTitle.trim(),
      subject: taskSubject,
      due: taskDue,
      priority: taskPriority,
      done:
        !!taskEdit?.done &&
        taskSubtasks
          .filter((step) => step.title.trim())
          .every((step) => step.done),
      subtasks: taskSubtasks
        .filter((step) => step.title.trim())
        .map((step) => ({ ...step, title: step.title.trim() })),
      dueTime: taskDueTime || undefined,
      reminderMinutes:
        taskReminder === "off" ? undefined : Number(taskReminder),
      seriesId:
        taskRepeat === "none"
          ? taskEdit?.seriesId
          : taskEdit?.seriesId || uid(),
      recurrence:
        taskRepeat === "none"
          ? undefined
          : {
              frequency: taskRepeat,
              interval: taskInterval,
              anchorDate:
                taskEdit?.due === taskDue &&
                taskEdit.recurrence?.frequency === taskRepeat &&
                taskEdit.recurrence.interval === taskInterval
                  ? taskEdit.recurrence.anchorDate
                  : taskDue,
              ...(taskUntil ? { until: taskUntil } : {}),
            },
    };
    if (!task.title) return;
    if (!validTaskExtensions(task)) {
      setTaskError(
        "Choose a deadline for reminders and repeats, a valid time, and a repeat end date on or after the deadline.",
      );
      return;
    }
    if (!taskEdit && (data?.tasks.length || 0) >= 10000) {
      setTaskError(
        "This workspace has reached its limit of 10,000 tasks. Remove completed tasks before adding another.",
      );
      return;
    }
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
    taskSubtasks,
    setTaskSubtasks,
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
    taskError,
    toggleSubtask,
  };
}
export type TaskManagerController = ReturnType<typeof useTaskManager>;
