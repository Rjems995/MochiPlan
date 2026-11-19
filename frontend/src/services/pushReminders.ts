import { workspaceKey } from "./serverBackup";
import type { ReminderPlan } from "./reminderPlan";

export type PushConfig = {
  version: 1;
  configured: boolean;
  publicKey: string | null;
};
export type PushDeviceStatus = {
  version: 1;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastSentAt: string | null;
  error: string;
  timezone: string | null;
  planHash: string | null;
};
export class PushError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function request(path: string, method = "GET", body?: unknown) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/push${path}`, {
      method,
      headers: {
        ...(path !== "/config"
          ? { Authorization: `Bearer ${workspaceKey()}` }
          : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new PushError(
        response.status,
        result?.error ||
          "The reminder server is unavailable. Your plans are still saved on this device.",
      );
    if (!result || result.version !== 1)
      throw Error("The reminder server returned an invalid response.");
    return result;
  } catch (error) {
    if (error instanceof PushError) throw error;
    throw Error(
      "The reminder server is unavailable. Your plans are still saved on this device.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const pushReminders = {
  async config(): Promise<PushConfig> {
    return request("/config");
  },
  async status(id: string): Promise<PushDeviceStatus> {
    return request(`/devices/${id}`);
  },
  async sync(
    id: string,
    subscription: PushSubscription,
    plan: ReminderPlan,
  ): Promise<PushDeviceStatus> {
    return request(`/devices/${id}`, "PUT", {
      subscription: subscription.toJSON(),
      plan,
    });
  },
  async remove(id: string) {
    return request(`/devices/${id}`, "DELETE");
  },
  async test(id: string) {
    return request(`/devices/${id}/test`, "POST");
  },
};
export function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
export function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          Error(
            "Install or reload the production app before enabling background reminders.",
          ),
        ),
      8000,
    );
    navigator.serviceWorker.ready.then(
      (registration) => {
        clearTimeout(timer);
        resolve(registration);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
