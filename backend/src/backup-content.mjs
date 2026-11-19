import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export function backupContent(data) {
  const { activeId: _activeId, ...content } = data;
  return JSON.stringify(
    canonical({
      ...content,
      schedules: data.schedules.map(
        ({ updatedAt: _updatedAt, ...schedule }) => schedule,
      ),
    }),
  );
}
export function backupHash(data) {
  return createHash("sha256").update(backupContent(data)).digest("hex");
}
export function backupSummary(data) {
  return {
    planners: data.schedules.length,
    activities: data.schedules.reduce(
      (total, s) =>
        total +
        new Set(
          s.entries
            .filter((e) => !e.sourceId)
            .map((e) => `${e.date ? "event" : "series"}:${e.seriesId || e.id}`),
        ).size,
      0,
    ),
    tasks: data.tasks.length,
  };
}
