import type { Entry } from "../model";
import { formatTime } from "../model";
import { reminderId } from "./reminderPlan";
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
      tag: `mochi-${id}`,
      data: { url: payload.url },
    });
  } catch {
    try {
      new Notification(payload.title, {
        body: payload.body,
        tag: `mochi-${id}`,
      });
    } catch {}
  }
}
