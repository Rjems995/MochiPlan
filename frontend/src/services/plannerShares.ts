import type { Preferences, Schedule } from "../model";
import { activeProfile } from "./deviceScope";
import { workspaceKey } from "./serverBackup";

export type SharedSnapshot = {
  schedule: Schedule;
  preferences: Pick<Preferences, "weekStart" | "time24">;
  includeLocations: boolean;
  includeDetails: boolean;
};
export type SharedPlanner = SharedSnapshot & {
  checkedAt: string;
  revision: number;
  updatedAt: string;
  expiresAt: string | null;
  accessToken?: string;
};
export type PlannerShare = {
  id: string;
  scheduleId: string;
  name: string;
  token: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revoked: boolean;
  expired: boolean;
  passwordProtected: boolean;
  revision: number;
  includeLocations?: boolean;
  includeDetails?: boolean;
};
export type ShareInput = SharedSnapshot & {
  expiresAt: string | null;
  password?: string | null;
  revision?: number;
};
export class ShareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request(path: string, init: RequestInit) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {
      cache: "no-store",
      redirect: "error",
      ...init,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new ShareError(
        response.status,
        result?.error || "Shared planners are unavailable right now.",
      );
    if (!result || result.version !== 1)
      throw Error("The server returned an invalid shared planner.");
    return result;
  } catch (failure) {
    if (failure instanceof ShareError) throw failure;
    throw Error(
      "Connect to the MochiPlan server to use sharing. Your own plans are saved locally.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export function shareUrl(token: string) {
  return `${location.origin}/share/#${token}`;
}
export function createPlannerShares(profile = activeProfile()) {
  const owned = (path = "", method = "GET", body?: unknown) =>
    request(`/api/planner-shares${path}`, {
      method,
      credentials: profile ? "same-origin" : "omit",
      headers: {
        Authorization: `Bearer ${workspaceKey(profile)}`,
        ...(profile ? { "X-Mochi-Account": profile } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  return {
    async list(scheduleId?: string): Promise<PlannerShare[]> {
      return (
        await owned(
          scheduleId ? `?scheduleId=${encodeURIComponent(scheduleId)}` : "",
        )
      ).shares;
    },
    async save(body: ShareInput, id?: string): Promise<PlannerShare> {
      return (await owned(id ? `/${id}` : "", id ? "PUT" : "POST", body)).share;
    },
    async revoke(id: string) {
      await owned(`/${id}`, "DELETE");
    },
  };
}
export async function readSharedPlanner(
  token: string,
  access?: string,
  password?: string,
): Promise<SharedPlanner | { passwordRequired: true }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ShareError(
      404,
      "This planner link was not found. Check that you copied the complete link.",
    );
  return request("/api/shared-planner", {
    method: password === undefined ? "GET" : "POST",
    credentials: "omit",
    headers: {
      "X-Mochi-Share": token,
      ...(access ? { "X-Mochi-Share-Access": access } : {}),
      ...(password !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: password === undefined ? undefined : JSON.stringify({ password }),
  });
}
