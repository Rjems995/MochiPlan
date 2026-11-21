import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { dateKey, entriesOnDate } from "../calendar";
import type { Preferences } from "../model";
import { type AppData, formatTime } from "../model";
import {
  showLocalReminder,
  showLocalTaskReminder,
} from "../services/localReminder";
import { taskNotificationDue } from "../taskRules";
import { serviceWorkerReady } from "../services/pushReminders";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function useAppPlatform(
  data: AppData | null,
  notify: (text: string) => void,
  pref: (patch: Partial<Preferences>) => void,
  backgroundRemindersActive = false,
) {
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const notified = useRef(new Set<string>());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    const connected = () => setOnline(navigator.onLine);
    const prompt = (ev: Event) => {
      ev.preventDefault();
      setInstall(ev as InstallPrompt);
    };
    const offlineReady = () =>
      notify("Your cozy workspace is ready to use offline.");
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("mochi-offline-ready", offlineReady);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("mochi-offline-ready", offlineReady);
    };
  }, [notify]);
  useEffect(() => {
    if (
      !data?.preferences.reminders ||
      backgroundRemindersActive ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const current = now.getHours() * 60 + now.getMinutes();
    for (const schedule of data.schedules)
      for (const entry of entriesOnDate(schedule, dateKey(now))) {
        const key = `${schedule.id}-${format(now, "yyyy-MM-dd")}-${entry.seriesId || entry.id}`;
        const delta = entry.start - current;
        if (
          delta >= 0 &&
          delta <= data.preferences.reminderMinutes &&
          !notified.current.has(key)
        ) {
          notified.current.add(key);
          void showLocalReminder(
            schedule.id,
            entry,
            dateKey(now),
            data.preferences.time24,
          );
        }
      }
    for (const task of data.tasks) {
      const key = `task:${task.id}:${task.due}:${task.dueTime || "09:00"}:${task.reminderMinutes}`;
      if (
        taskNotificationDue(task, now.getTime()) &&
        !notified.current.has(key)
      ) {
        notified.current.add(key);
        void showLocalTaskReminder(task, data.preferences.time24);
      }
    }
  }, [now, data, backgroundRemindersActive]);
  async function installApp() {
    if (install) {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } else setInstallHelp(true);
  }
  async function toggleReminders() {
    if (!data) return;
    const p = data.preferences;

    if (p.reminders) {
      pref({ reminders: false });
      return;
    }
    if (!("Notification" in window)) {
      notify(
        "This browser doesn’t support notifications. You can still see everything in Overview.",
      );
      return;
    }
    try {
      const result = await Notification.requestPermission();
      pref({ reminders: result === "granted" });
      notify(
        result === "granted"
          ? "Gentle reminders are on. Keep MochiPlan open for your nudges."
          : "Notifications are off. You can change this in your browser’s site settings.",
      );
    } catch {
      notify("Notifications aren’t available in this browser.");
    }
  }
  async function sendOverview() {
    if (!data) return;
    const active =
      data.schedules.find((s) => s.id === data.activeId) || data.schedules[0];

    if (!("Notification" in window) || Notification.permission !== "granted") {
      notify("Enable gentle reminders first.");
      return;
    }
    const count = entriesOnDate(active, dateKey(now)).length;
    try {
      const reg = await serviceWorkerReady();
      await reg.showNotification("Your little day at a glance", {
        body: `${count} ${count === 1 ? "activity" : "activities"} in ${active.name}. One little thing at a time.`,
        icon: "/icon-192.png",
      });
    } catch {
      notify(
        "Open the installed app or production preview to send notifications.",
      );
    }
  }
  async function requestPersistence() {
    try {
      const persistent = await navigator.storage?.persist();
      notify(
        persistent
          ? "Your browser has granted persistent storage."
          : "Your browser manages storage automatically. Keep a backup for peace of mind.",
      );
    } catch {
      notify("Persistent storage is managed by your browser.");
    }
  }
  return {
    now,
    online,
    installApp,
    installHelp,
    setInstallHelp,
    welcome,
    setWelcome,
    toggleReminders,
    sendOverview,
    requestPersistence,
  };
}
export type AppPlatformController = ReturnType<typeof useAppPlatform>;
