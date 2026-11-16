import type { AppData } from "../model";
import { validateBackup } from "../storage";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function workspaceKey() {
  const stored = localStorage.getItem("mochiplan-server-key");
  if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  localStorage.setItem("mochiplan-server-key", key);
  return key;
}
async function request(
  method: "GET" | "PUT",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("/api/workspace", {
      method,
      headers: {
        Authorization: `Bearer ${workspaceKey()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        result?.error ||
          "The server backup service is unavailable. Your local plans are safe.",
      );
    if (
      !result ||
      typeof result !== "object" ||
      !Number.isSafeInteger(result.revision) ||
      result.revision < 1
    )
      throw Error("The server returned an invalid backup.");
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw Error(
      "The server backup service is unavailable. Your local plans are safe.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export async function saveServerBackup(data: AppData) {
  let revision = 0;
  try {
    revision = (await request("GET")).revision as number;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  return request("PUT", { version: 1, revision, data });
}
export async function loadServerBackup(): Promise<AppData> {
  return validateBackup(await request("GET"));
}
