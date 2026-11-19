import type { AppData } from "../model";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
export async function backupFingerprint(data: AppData): Promise<string> {
  const { activeId: _activeId, schedules, ...rest } = data;
  const content = canonical({
    ...rest,
    schedules: schedules.map(
      ({ updatedAt: _updatedAt, ...schedule }) => schedule,
    ),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(content)),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
