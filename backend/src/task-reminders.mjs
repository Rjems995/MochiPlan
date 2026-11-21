import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { HttpError } from "./errors.mjs";

export function reminderTasks(tasks) {
  return (tasks || []).filter(
    (task) => !task.done && task.due && task.reminderMinutes !== undefined,
  );
}
export function validateReminderTasks(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length > 10000)
    throw new HttpError(400, "The task reminder list is invalid.");
  const ids = new Set();
  return tasks.map((task) => {
    if (
      !task ||
      typeof task.id !== "string" ||
      !task.id.trim() ||
      task.id.length > 200 ||
      ids.has(task.id) ||
      typeof task.title !== "string" ||
      task.title.length > 10000 ||
      typeof task.due !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(task.due) ||
      task.due.startsWith("0000") ||
      !DateTime.fromISO(task.due).isValid ||
      (task.dueTime !== undefined &&
        (typeof task.dueTime !== "string" ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime))) ||
      ![0, 15, 30, 60, 1440].includes(task.reminderMinutes)
    )
      throw new HttpError(400, "A task reminder is invalid.");
    ids.add(task.id);
    return {
      id: task.id,
      title: task.title,
      due: task.due,
      dueTime: task.dueTime || "09:00",
      reminderMinutes: task.reminderMinutes,
    };
  });
}
export function dueTaskReminders(plan, now, since) {
  const jobs = [];
  for (const task of plan.tasks || []) {
    const deadline = DateTime.fromISO(
      `${task.due}T${task.dueTime || "09:00"}`,
      { zone: plan.timezone },
    );
    const endsAt = Math.min(
      ...deadline.getPossibleOffsets().map((date) => date.toMillis()),
    );
    const dueAt = endsAt - task.reminderMinutes * 60000;
    if (dueAt < since || dueAt > now || now >= endsAt + 60000) continue;
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          "task",
          task.id,
          task.due,
          task.dueTime || "09:00",
          task.reminderMinutes,
        ]),
      )
      .digest("hex");
    const expiresAt = Math.min(endsAt + 60000, dueAt + 300000);
    jobs.push({
      id,
      dueAt,
      expiresAt,
      payload: {
        type: "mochi-reminder",
        id,
        title: `Task deadline: ${task.title.slice(0, 100)}`,
        body: `Due ${deadline.setLocale("en").toFormat(plan.time24 ? "MMM d, HH:mm" : "MMM d, h:mm a")}`,
        url: `/?task=${encodeURIComponent(task.id)}${plan.profileId ? `&profile=${encodeURIComponent(plan.profileId)}` : ""}`,
        expiresAt,
      },
    });
  }
  return jobs;
}
