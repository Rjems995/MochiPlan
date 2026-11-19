import type { AppData } from "../model";
import { validateBackup } from "../storage.ts";
import {
  BackupError,
  type BackupMetadata,
  type BackupHistory,
  type BackupTransport,
} from "./backupTypes.ts";

export function workspaceKey() {
  const stored = localStorage.getItem("mochiplan-server-key");
  if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  localStorage.setItem("mochiplan-server-key", key);
  return key;
}
export function parseBackupMetadata(value: unknown): BackupMetadata {
  const v = value as BackupMetadata;
  if (
    !v ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 1 ||
    typeof v.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(v.updatedAt)) ||
    !/^[a-f0-9]{64}$/.test(v.contentHash) ||
    !["automatic", "manual", "before-restore", "restore", "legacy"].includes(
      v.source,
    ) ||
    !v.summary ||
    ![v.summary.planners, v.summary.activities, v.summary.tasks].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    )
  )
    throw Error("The server returned an invalid backup.");
  return {
    revision: v.revision,
    updatedAt: v.updatedAt,
    contentHash: v.contentHash,
    source: v.source,
    summary: { ...v.summary },
  };
}
async function request(
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/workspace${path}`, {
      method: body ? "PUT" : "GET",
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
      throw new BackupError(
        response.status,
        result?.error ||
          "The server backup service is unavailable. Your local plans are safe.",
      );
    if (!result || typeof result !== "object" || result.version !== 1)
      throw Error("The server returned an invalid backup.");
    return result;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw Error(
      "The server backup service is unavailable. Your local plans are safe.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const serverBackups: BackupTransport = {
  async history(): Promise<BackupHistory> {
    const result = await request("/history");
    if (
      !Array.isArray(result.versions) ||
      !Number.isSafeInteger(result.revision) ||
      Number(result.revision) < 0 ||
      !Number.isInteger(result.retentionLimit) ||
      Number(result.retentionLimit) < 1 ||
      Number(result.retentionLimit) > 100
    )
      throw Error("The server returned invalid backup history.");
    const versions = result.versions.map(parseBackupMetadata);
    const latest =
      result.latest === null ? null : parseBackupMetadata(result.latest);
    if (
      versions.length > Number(result.retentionLimit) ||
      (latest?.revision || 0) !== result.revision ||
      (versions[0]?.revision || 0) !== result.revision ||
      versions.some((v, i) => i > 0 && v.revision >= versions[i - 1].revision)
    )
      throw Error("The server returned invalid backup history.");
    return {
      version: 1,
      revision: Number(result.revision),
      latest,
      versions,
      retentionLimit: Number(result.retentionLimit),
    };
  },
  async snapshot(revision?: number) {
    const result = await request(
      revision === undefined ? "" : `/history/${revision}`,
    );
    return {
      version: 1,
      ...parseBackupMetadata(result),
      data: validateBackup(result),
    };
  },
  async save(data: AppData, revision: number, source) {
    return parseBackupMetadata(
      await request("", { version: 1, revision, source, data }),
    );
  },
};
