import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "../model";
import { reminderPlan } from "../services/reminderPlan";
import {
  applicationKey,
  PushError,
  pushReminders,
  serviceWorkerReady,
  type PushConfig,
  type PushDeviceStatus,
} from "../services/pushReminders";

const storageKey = "mochiplan-background-reminders";
type DeviceSettings = {
  deviceId: string;
  enabled: boolean;
  pendingDelete: boolean;
  lastSyncedAt: string | null;
  lastSentAt: string | null;
};
type Phase = "off" | "pending" | "active" | "error" | "expired";
export function useBackgroundReminders(
  data: AppData | null,
  saved: string,
  notify: (message: string) => void,
) {
  const supported =
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const [settings, setSettings] = useState<DeviceSettings>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored?.deviceId && typeof stored.enabled === "boolean")
        return stored;
    } catch {}
    return {
      deviceId: crypto.randomUUID(),
      enabled: false,
      pendingDelete: false,
      lastSyncedAt: null,
      lastSentAt: null,
    };
  });
  const settingsRef = useRef(settings);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [phase, setPhase] = useState<Phase>(
    settings.enabled ? "pending" : "off",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [attempt, setAttempt] = useState(0);
  const [syncedText, setSyncedText] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const planText = useMemo(
    () => (data ? JSON.stringify(reminderPlan(data, timezone)) : ""),
    [data, timezone],
  );
  const planRef = useRef(planText);
  planRef.current = planText;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const jobs = useRef(0),
    failures = useRef(0),
    retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  function update(patch: Partial<DeviceSettings>) {
    settingsRef.current = { ...settingsRef.current, ...patch };
    try {
      localStorage.setItem(storageKey, JSON.stringify(settingsRef.current));
    } catch {}
    if (mounted.current) setSettings(settingsRef.current);
  }
  function serialized<T>(action: () => Promise<T>) {
    jobs.current++;
    setBusy(true);
    const result = queue.current.catch(() => {}).then(action);
    queue.current = result.catch(() => {});
    return result.finally(() => {
      jobs.current--;
      if (mounted.current) setBusy(jobs.current > 0);
    });
  }
  function remember(status: PushDeviceStatus, text: string) {
    failures.current = 0;
    clearTimeout(retryTimer.current);
    update({
      lastSyncedAt: status.lastSyncedAt,
      lastSentAt: status.lastSentAt,
    });
    if (!mounted.current) return;
    setSyncedText(text);
    setError(status.error || "");
    if (!status.enabled) {
      setExpired(true);
      setPhase("expired");
    } else setPhase(planRef.current === text ? "active" : "pending");
  }
  function failed(failure: unknown, retry = true) {
    if (!mounted.current) return;
    setError(
      failure instanceof Error
        ? failure.message
        : "Background reminders could not be synced.",
    );
    if (failure instanceof PushError && [409, 410].includes(failure.status)) {
      setExpired(true);
      setPhase("expired");
      return;
    }
    setPhase(settingsRef.current.enabled ? "error" : "off");
    if (retry) {
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(
        () => {
          if (mounted.current) setAttempt((value) => value + 1);
        },
        Math.min(300000, 10000 * 2 ** Math.min(5, failures.current++)),
      );
    }
  }
  async function loadConfig() {
    try {
      const result = await pushReminders.config();
      if (mounted.current) {
        setConfig(result);
        setError("");
      }
      return result;
    } catch (failure) {
      failed(failure, settingsRef.current.enabled);
      return null;
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (supported) void loadConfig();
    const connected = () => {
      setOnline(navigator.onLine);
      setAttempt((value) => value + 1);
    };
    const focus = () => {
      setAttempt((value) => value + 1);
    };
    const changed = (event: MessageEvent) => {
      if (event.data?.type === "MOCHI_PUSH_CHANGED") focus();
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("focus", focus);
    navigator.serviceWorker?.addEventListener("message", changed);
    const timer = setInterval(() => {
      if (settingsRef.current.enabled) focus();
    }, 60000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      clearTimeout(retryTimer.current);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("focus", focus);
      navigator.serviceWorker?.removeEventListener("message", changed);
    };
  }, []);
  async function sync(text: string) {
    if (!settingsRef.current.enabled) return;
    if (Notification.permission !== "granted") {
      update({ enabled: false, pendingDelete: true });
      await pushReminders.remove(settingsRef.current.deviceId);
      update({ pendingDelete: false });
      setPhase("off");
      setError("Notifications are blocked in your browser settings.");
      return;
    }
    const registration = await serviceWorkerReady();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription)
      throw new PushError(
        410,
        "This device’s subscription expired. Reconnect background reminders.",
      );
    const registeredKey = subscription.options?.applicationServerKey;
    if (registeredKey && config?.publicKey) {
      const actual = new Uint8Array(registeredKey),
        expected = applicationKey(config.publicKey);
      if (
        actual.length !== expected.length ||
        actual.some((byte, i) => byte !== expected[i])
      )
        throw new PushError(
          410,
          "The server’s push keys changed. Reconnect background reminders on this device.",
        );
    }
    if (!settingsRef.current.enabled) return;
    const status = await pushReminders.sync(
      settingsRef.current.deviceId,
      subscription,
      JSON.parse(text),
    );
    remember(status, text);
  }
  useEffect(() => {
    if (
      !supported ||
      !online ||
      !planText ||
      saved !== "All changes saved" ||
      expired
    )
      return;
    if (!settings.enabled && !settings.pendingDelete) return;
    if (settings.enabled && !config?.configured) {
      if (!config) void loadConfig();
      return;
    }
    if (settings.enabled) setPhase("pending");
    const timer = setTimeout(() => {
      void serialized(async () => {
        if (settingsRef.current.pendingDelete && !settingsRef.current.enabled) {
          await pushReminders.remove(settingsRef.current.deviceId);
          update({ pendingDelete: false });
          return;
        }
        await sync(planRef.current);
      }).catch((failure) => failed(failure));
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    settings.enabled,
    settings.pendingDelete,
    planText,
    saved,
    config?.configured,
    online,
    attempt,
    expired,
  ]);
  async function enable() {
    if (!supported || !data) return;
    setBusy(true);
    setError("");
    // Ask directly from the click so browsers retain the user activation.
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission().catch(() => "denied");
    if (permission !== "granted") {
      setError(
        "Notifications are blocked. Allow them in your browser’s site settings.",
      );
      setBusy(false);
      return;
    }
    try {
      await serialized(async () => {
        const currentConfig = config?.configured ? config : await loadConfig();
        if (!currentConfig?.configured || !currentConfig.publicKey)
          throw Error(
            "Background reminders are not configured on this server yet.",
          );
        const registration = await serviceWorkerReady();
        const previous = await registration.pushManager.getSubscription();
        if (previous) await previous.unsubscribe();
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(currentConfig.publicKey),
        });
        update({ enabled: true, pendingDelete: false });
        setExpired(false);
        setPhase("pending");
        const text = planRef.current;
        remember(
          await pushReminders.sync(
            settingsRef.current.deviceId,
            subscription,
            JSON.parse(text),
          ),
          text,
        );
        notify("Background reminders are on for this device.");
      });
    } catch (failure) {
      failed(failure);
    } finally {
      setBusy(jobs.current > 0);
    }
  }
  async function disable() {
    const wasEnabled = settingsRef.current.enabled;
    update({ enabled: false, pendingDelete: true });
    setPhase("off");
    setError("");
    setExpired(false);
    await serialized(async () => {
      let unsubscribed = false,
        removed = false;
      try {
        const registration = await serviceWorkerReady();
        const subscription = await registration.pushManager.getSubscription();
        unsubscribed = !subscription || (await subscription.unsubscribe());
      } catch {}
      try {
        await pushReminders.remove(settingsRef.current.deviceId);
        removed = true;
        update({ pendingDelete: false });
      } catch {}
      if (!unsubscribed && !removed) {
        update({ enabled: wasEnabled });
        throw Error(
          "Could not turn off background reminders. Reconnect and try again, or block notifications in browser settings.",
        );
      }
      notify(
        removed
          ? "Background reminders are off on this device."
          : "Reminders are off on this device. Server cleanup will retry when you reconnect.",
      );
    }).catch((failure) => failed(failure));
  }
  async function sendTest() {
    await serialized(async () => {
      await pushReminders.test(settingsRef.current.deviceId);
      notify(
        "Test reminder accepted by the push service. Check this device’s notifications.",
      );
    }).catch((failure) => failed(failure, false));
  }
  const current = syncedText === planText && phase === "active";
  return {
    supported,
    config,
    enabled: settings.enabled,
    phase,
    error,
    busy,
    online,
    timezone,
    lastSyncedAt: settings.lastSyncedAt,
    lastSentAt: settings.lastSentAt,
    pendingDelete: settings.pendingDelete,
    suppressForeground: settings.enabled && current && !error,
    enable,
    disable,
    sendTest,
    retry: () => {
      if (!config?.configured) void loadConfig();
      setAttempt((value) => value + 1);
    },
  };
}
export type BackgroundRemindersController = ReturnType<
  typeof useBackgroundReminders
>;
