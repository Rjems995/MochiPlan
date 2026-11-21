import { dateKey, isCalendarDate } from "./calendar.ts";
import type { Task } from "./model.ts";

export const taskReminderOptions = [0, 15, 30, 60, 1440];
export function validTaskExtensions(value: Record<string, any>): boolean {
  if (
    value.dueTime !== undefined &&
    (!value.due ||
      typeof value.dueTime !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.dueTime))
  )
    return false;
  if (
    value.reminderMinutes !== undefined &&
    (!value.due || !taskReminderOptions.includes(value.reminderMinutes))
  )
    return false;
  if (
    value.seriesId !== undefined &&
    (typeof value.seriesId !== "string" ||
      !value.seriesId.trim() ||
      value.seriesId.length > 160)
  )
    return false;
  if (value.subtasks !== undefined) {
    if (!Array.isArray(value.subtasks) || value.subtasks.length > 100)
      return false;
    const ids = new Set();
    for (const step of value.subtasks) {
      if (
        !step ||
        typeof step !== "object" ||
        typeof step.id !== "string" ||
        !step.id.trim() ||
        step.id.length > 200 ||
        ids.has(step.id) ||
        typeof step.title !== "string" ||
        !step.title.trim() ||
        step.title.length > 160 ||
        typeof step.done !== "boolean"
      )
        return false;
      ids.add(step.id);
    }
  }
  if (value.recurrence !== undefined) {
    const rule = value.recurrence;
    if (
      !rule ||
      typeof rule !== "object" ||
      Array.isArray(rule) ||
      !value.seriesId ||
      !isCalendarDate(value.due) ||
      !["daily", "weekly", "monthly"].includes(rule.frequency) ||
      !Number.isInteger(rule.interval) ||
      rule.interval < 1 ||
      rule.interval > 99 ||
      !isCalendarDate(rule.anchorDate) ||
      rule.anchorDate > value.due ||
      (rule.until !== undefined &&
        (!isCalendarDate(rule.until) || rule.until < value.due))
    )
      return false;
  }
  return true;
}
export function nextTaskDate(task: Task, today: string): string | null {
  if (!task.recurrence || !task.due) return null;
  const { frequency, interval, anchorDate, until } = task.recurrence;
  const anchor = new Date(`${anchorDate}T12:00:00Z`),
    threshold = task.due > today ? task.due : today;
  let result: Date;
  if (frequency === "monthly") {
    const latest = new Date(`${threshold}T12:00:00Z`);
    const month = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
    let periods = Math.max(
      1,
      Math.floor(
        (latest.getUTCFullYear() * 12 + latest.getUTCMonth() - month) /
          interval,
      ),
    );
    do {
      const target = month + periods * interval;
      const year = Math.floor(target / 12),
        nextMonth = target % 12;
      const day = Math.min(
        anchor.getUTCDate(),
        new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate(),
      );
      result = new Date(anchor);
      result.setUTCFullYear(year, nextMonth, day);
      periods++;
    } while (
      result.toISOString().slice(0, 10) <= threshold &&
      result.getUTCFullYear() <= 9999
    );
  } else {
    const days = interval * (frequency === "weekly" ? 7 : 1);
    const elapsed =
      (Date.parse(`${threshold}T12:00:00Z`) - anchor.getTime()) / 86400000;
    result = new Date(
      anchor.getTime() + (Math.floor(elapsed / days) + 1) * days * 86400000,
    );
  }
  if (result.getUTCFullYear() > 9999) return null;
  const key = result.toISOString().slice(0, 10);
  return until && key > until ? null : key;
}
export function toggleTaskCompletion(
  tasks: Task[],
  id: string,
  today = dateKey(new Date()),
): Task[] {
  const task = tasks.find((item) => item.id === id);
  if (!task) return tasks;
  const result = tasks.map((item) =>
    item.id !== id
      ? item
      : {
          ...item,
          done: !item.done,
          ...(item.subtasks
            ? {
                subtasks: item.subtasks.map((step) => ({
                  ...step,
                  done: item.done ? step.done : true,
                })),
              }
            : {}),
        },
  );
  if (task.done || !task.recurrence) return result;
  const next = nextTaskDate(task, today),
    seriesId = task.seriesId!;
  if (
    !next ||
    tasks.some(
      (item) =>
        item.seriesId === seriesId &&
        !item.done &&
        item.id !== task.id &&
        item.due > task.due,
    )
  )
    return result;
  const nextId = `${seriesId}:on:${next}`;
  if (result.some((item) => item.id === nextId)) return result;
  return [
    ...result,
    {
      ...structuredClone(task),
      id: nextId,
      due: next,
      done: false,
      ...(task.subtasks
        ? { subtasks: task.subtasks.map((step) => ({ ...step, done: false })) }
        : {}),
    },
  ];
}
export function taskDeadline(task: Task): number | null {
  if (!task.due) return null;
  return new Date(`${task.due}T${task.dueTime || "09:00"}:00`).getTime();
}
export function taskIsOverdue(task: Task, now: Date): boolean {
  return (
    !task.done &&
    !!task.due &&
    (task.dueTime
      ? taskDeadline(task)! < now.getTime()
      : task.due < dateKey(now))
  );
}
export function taskNotificationDue(task: Task, now: number): boolean {
  if (task.done || task.reminderMinutes === undefined) return false;
  const deadline = taskDeadline(task);
  if (deadline === null) return false;
  const reminder = deadline - task.reminderMinutes * 60000;
  return reminder <= now && now < Math.min(deadline + 60000, reminder + 300000);
}
export function taskRepeatLabel(task: Task): string {
  if (!task.recurrence) return "";
  const { frequency, interval } = task.recurrence;
  const unit = { daily: "day", weekly: "week", monthly: "month" }[frequency];
  return `Every ${interval === 1 ? "" : `${interval} `}${unit}${interval === 1 ? "" : "s"}`;
}
