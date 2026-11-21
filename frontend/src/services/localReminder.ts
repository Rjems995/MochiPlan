import type { Entry, Task } from "../model";
import { formatTime } from "../model";
import { reminderId, taskReminderId } from "./reminderPlan";
import { activeProfile } from "./deviceScope";
import { serviceWorkerReady } from "./pushReminders";

export async function showLocalReminder(
  scheduleId: string,
  entry: Entry,
  date: string,
  time24: boolean,
) {
  const id = await reminderId(scheduleId, entry, date);
  const payload = {
    type: "mochi-reminder",
    id,
    title: `Coming up: ${entry.title}`,
    body: `${formatTime(entry.start, time24)}${entry.location ? ` · ${entry.location}` : ""}`,
    url: `/?planner=${encodeURIComponent(scheduleId)}&date=${date}`,
    expiresAt: Date.now() + 120000,
  };
  return deliverLocalReminder(payload);
}
export async function showLocalTaskReminder(task: Task, time24: boolean) {
  const [hour, minute] = (task.dueTime || "09:00").split(":").map(Number);
  const day = new Date(`${task.due}T12:00:00`).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
  return deliverLocalReminder({
    type: "mochi-reminder",
    id: await taskReminderId(task),
    title: `Task deadline: ${task.title.slice(0, 100)}`,
    body: `Due ${day}, ${formatTime(hour * 60 + minute, time24)}`,
    url: `/?task=${encodeURIComponent(task.id)}&profile=${encodeURIComponent(activeProfile() || "device")}`,
    expiresAt: Date.now() + 120000,
  });
}
async function deliverLocalReminder(payload: {
  type: string;
  id: string;
  title: string;
  body: string;
  url: string;
  expiresAt: number;
}) {
  try {
    const registration = await serviceWorkerReady();
    if (registration.active) {
      const handled = await new Promise<boolean>((resolve) => {
        const channel = new MessageChannel(),
          timer = setTimeout(() => {
            channel.port1.close();
            resolve(false);
          }, 1500);
        channel.port1.onmessage = (event) => {
          clearTimeout(timer);
          channel.port1.close();
          resolve(!!event.data?.ok);
        };
        registration.active!.postMessage(
          { type: "MOCHI_LOCAL_REMINDER", payload },
          [channel.port2],
        );
      });
      if (handled) return;
    }
    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      tag: `mochi-${payload.id}`,
      data: { url: payload.url },
    });
  } catch {
    try {
      new Notification(payload.title, {
        body: payload.body,
        tag: `mochi-${payload.id}`,
      });
    } catch {}
  }
}
