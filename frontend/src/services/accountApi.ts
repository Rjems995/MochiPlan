import type { AppData } from "../model";
import { validateBackup } from "../storage.ts";
import { parseBackupMetadata } from "./serverBackup.ts";

export type AccountUser = { id: string; username: string };
export type AccountSession = {
  version: 1;
  user: AccountUser;
  csrfToken: string;
  expiresAt: string;
  recoveryCode?: string;
  sessionId: string;
};
export type AccountDeviceSession = {
  id: string;
  device: string;
  current: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};
export type SyncSnapshot = {
  revision: number;
  data: AppData | null;
  updatedAt?: string;
};
export class AccountError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export function createAccountApi() {
  let csrf = "";
  let accountId = "";
  async function request(path: string, method = "GET", body?: unknown) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(csrf && method !== "GET" ? { "X-Mochi-CSRF": csrf } : {}),
          ...(path.startsWith("/sync/") ||
          path.startsWith("/account/sessions") ||
          [
            "/account/reminder-device",
            "/account/device",
            "/account/password",
            "/account",
          ].includes(path)
            ? { "X-Mochi-Account": accountId }
            : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new AccountError(
          response.status,
          result?.error ||
            "Account sync is unavailable. Your offline plans are safe.",
        );
      if (!result || result.version !== 1)
        throw Error("The server returned an invalid account response.");
      return result;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw Error("Account sync is unavailable. Your offline plans are safe.");
    } finally {
      clearTimeout(timer);
    }
  }
  function session(result: AccountSession) {
    if (
      !result.user ||
      typeof result.user.id !== "string" ||
      typeof result.user.username !== "string" ||
      !/^[a-f0-9]{64}$/.test(result.csrfToken)
    )
      throw Error("The server returned an invalid sign-in.");
    csrf = result.csrfToken;
    accountId = result.user.id;
    return result;
  }
  return {
    async current() {
      return session(await request("/account/session"));
    },
    async authenticate(
      mode: "register" | "login" | "recover",
      username: string,
      password: string,
      recoveryCode?: string,
    ) {
      return session(
        await request(`/account/${mode}`, "POST", {
          username,
          password,
          recoveryCode,
        }),
      );
    },
    async logout() {
      await request("/account/session", "DELETE");
      csrf = "";
    },
    async sessions(): Promise<{
      version: 1;
      sessions: AccountDeviceSession[];
    }> {
      return request("/account/sessions");
    },
    async revokeSession(
      id: string | "others",
    ): Promise<{ version: 1; revoked: number; signedOut: boolean }> {
      return request(
        id === "others"
          ? "/account/sessions"
          : `/account/sessions/${encodeURIComponent(id)}`,
        "DELETE",
      );
    },
    async changePassword(currentPassword: string, newPassword: string) {
      return session(
        await request("/account/password", "PUT", {
          currentPassword,
          newPassword,
        }),
      );
    },
    async deleteAccount(currentPassword: string, confirmation: string) {
      const result = await request("/account", "DELETE", {
        currentPassword,
        confirmation,
      });
      csrf = "";
      accountId = "";
      return result;
    },
    async registerDevice(workspaceKey: string) {
      return request("/account/device", "PUT", { workspaceKey });
    },
    async linkReminders(deviceId: string, workspaceKey: string) {
      return request("/account/reminder-device", "PUT", {
        deviceId,
        workspaceKey,
      });
    },
    async read(): Promise<SyncSnapshot> {
      const result = await request("/sync/workspace");
      if (result.revision === 0 && result.data === null)
        return { revision: 0, data: null };
      const metadata = parseBackupMetadata(result);
      return { ...metadata, data: validateBackup(result) };
    },
    async write(data: AppData, revision: number) {
      return parseBackupMetadata(
        await request("/sync/workspace", "PUT", { version: 1, revision, data }),
      );
    },
  };
}
export type AccountApi = ReturnType<typeof createAccountApi>;
