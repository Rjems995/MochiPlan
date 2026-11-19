import type { AppData, Entry, Schedule } from "../model";
import { duplicateEntries } from "../series.ts";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function sharedWorkspace(data: AppData): AppData {
  const result = structuredClone(data);
  result.activeId = result.schedules[0]?.id || "";
  result.schedules.forEach((s) => (s.updatedAt = 0));
  Object.assign(result.preferences, {
    reminders: false,
    reminderMinutes: 10,
    onboarded: true,
  });
  return result;
}
export function onThisDevice(shared: AppData, current: AppData): AppData {
  return {
    ...structuredClone(shared),
    schedules: shared.schedules.map((schedule) => {
      const local = current.schedules.find((s) => s.id === schedule.id);
      const unchanged =
        local &&
        same({ ...local, updatedAt: 0 }, { ...schedule, updatedAt: 0 });
      return {
        ...structuredClone(schedule),
        updatedAt: unchanged ? local.updatedAt : Date.now(),
      };
    }),
    activeId: shared.schedules.some((s) => s.id === current.activeId)
      ? current.activeId
      : shared.schedules[0].id,
    preferences: {
      ...shared.preferences,
      reminders: current.preferences.reminders,
      reminderMinutes: current.preferences.reminderMinutes,
      onboarded: current.preferences.onboarded,
    },
  };
}
function grouped(entries: Entry[]) {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const id = entry.seriesId || entry.id;
    groups.set(id, [...(groups.get(id) || []), entry]);
  }
  return Object.fromEntries(
    [...groups].map(([id, list]) => [
      id,
      list.sort((a, b) => a.id.localeCompare(b.id)),
    ]),
  );
}
function mergeValue(
  base: any,
  local: any,
  remote: any,
  path: string,
  conflicts: string[],
): any {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (local === undefined || remote === undefined) {
    conflicts.push(path);
    return remote;
  }
  if (Array.isArray(local) && Array.isArray(remote)) {
    if (path.endsWith(".entries")) {
      const b = grouped(base || []),
        l = grouped(local),
        r = grouped(remote),
        output: Entry[] = [];
      for (const id of new Set([...Object.keys(r), ...Object.keys(l)])) {
        if (same(l[id], r[id]) || same(r[id], b[id]))
          output.push(...(l[id] || []));
        else if (same(l[id], b[id])) output.push(...(r[id] || []));
        else {
          conflicts.push(`${path}.${id}`);
          output.push(...(r[id] || []));
        }
      }
      return output;
    }
    if (
      [...local, ...remote, ...(base || [])].every(
        (v) => v && typeof v === "object" && typeof v.id === "string",
      )
    ) {
      const map = (items: any[]) =>
        Object.fromEntries(items.map((item) => [item.id, item]));
      const b = map(base || []),
        l = map(local),
        r = map(remote);
      return [
        ...new Set([...remote.map((v) => v.id), ...local.map((v) => v.id)]),
      ]
        .map((id) =>
          mergeValue(b[id], l[id], r[id], `${path}.${id}`, conflicts),
        )
        .filter((v) => v !== undefined);
    }
    if (
      [...local, ...remote, ...(base || [])].every((v) => typeof v === "string")
    ) {
      const b = new Set(base || []),
        l = new Set(local),
        r = new Set(remote);
      return [...new Set([...remote, ...local])].filter(
        (id) =>
          (l.has(id) && r.has(id)) ||
          (l.has(id) && !b.has(id)) ||
          (r.has(id) && !b.has(id)),
      );
    }
    conflicts.push(path);
    return remote;
  }
  if (
    local &&
    remote &&
    typeof local === "object" &&
    typeof remote === "object" &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const output: Record<string, unknown> = {};
    for (const key of new Set([
      ...Object.keys(base || {}),
      ...Object.keys(remote),
      ...Object.keys(local),
    ])) {
      const merged = mergeValue(
        base?.[key],
        local[key],
        remote[key],
        `${path}.${key}`,
        conflicts,
      );
      if (merged !== undefined) output[key] = merged;
    }
    return output;
  }
  conflicts.push(path);
  return remote;
}
export function mergeWorkspace(base: AppData, local: AppData, remote: AppData) {
  const conflicts: string[] = [];
  const merged = mergeValue(
    sharedWorkspace(base),
    sharedWorkspace(local),
    sharedWorkspace(remote),
    "workspace",
    conflicts,
  ) as AppData;
  if (!merged.schedules.length) {
    conflicts.push("workspace.schedules");
    merged.schedules = remote.schedules.length
      ? remote.schedules
      : local.schedules;
  }
  merged.activeId = merged.schedules[0].id;
  merged.preferences.favorites = merged.preferences.favorites.filter((id) =>
    merged.schedules.some((s) => s.id === id),
  );
  return { data: onThisDevice(merged, local), conflicts };
}
/** Explicit conflict choice: retain differing planners/tasks as separate copies. */
export function keepBothWorkspaces(local: AppData, remote: AppData): AppData {
  const schedules = structuredClone(remote.schedules),
    tasks = structuredClone(remote.tasks);
  const id = () => crypto.randomUUID();
  const comparable = (schedule: Schedule) => ({ ...schedule, updatedAt: 0 });
  for (const schedule of local.schedules) {
    const existing = schedules.find((s) => s.id === schedule.id);
    if (!existing) schedules.push(structuredClone(schedule));
    else if (!same(comparable(existing), comparable(schedule)))
      schedules.push({
        ...structuredClone(schedule),
        id: id(),
        name: `${schedule.name} (from this device)`,
        entries: duplicateEntries(schedule.entries, id),
        design: {
          ...structuredClone(schedule.design),
          stickers: schedule.design.stickers.map((s) => ({ ...s, id: id() })),
        },
      });
  }
  for (const task of local.tasks) {
    const existing = tasks.find((t) => t.id === task.id);
    if (!existing) tasks.push(structuredClone(task));
    else if (!same(existing, task))
      tasks.push({
        ...task,
        id: id(),
        title: `${task.title} (from this device)`,
      });
  }
  return { ...structuredClone(local), schedules, tasks };
}
