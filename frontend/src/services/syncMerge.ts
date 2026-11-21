import type { AppData, Entry, Schedule, Task } from "../model";
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
type GroupItem = { id: string; seriesId?: string };
function taskGroupKey(items: GroupItem[]) {
  const parents = new Map<string, string>();
  const find = (id: string) => {
    let root = id;
    while (parents.has(root)) root = parents.get(root)!;
    while (id !== root) {
      const next = parents.get(id)!;
      parents.set(id, root);
      id = next;
    }
    return root;
  };
  // A task can acquire or change a series while another device still has its old identity.
  for (const item of items) {
    if (!item.seriesId) continue;
    const original = find(item.id),
      series = find(item.seriesId);
    if (original !== series) parents.set(original, series);
  }
  return (item: GroupItem) => find(item.seriesId || item.id);
}
function grouped<T extends GroupItem>(
  entries: T[],
  key: (item: T) => string = (item) => item.seriesId || item.id,
) {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const id = key(entry);
    const group = groups.get(id);
    if (group) group.push(entry);
    else groups.set(id, [entry]);
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
    if (
      path.endsWith(".entries") ||
      (path === "workspace.tasks" &&
        [...local, ...remote, ...(base || [])].some((task) => task.seriesId))
    ) {
      const groupKey =
        path === "workspace.tasks"
          ? taskGroupKey([...(base || []), ...local, ...remote])
          : undefined;
      const b = grouped(base || [], groupKey),
        l = grouped(local, groupKey),
        r = grouped(remote, groupKey),
        output: any[] = [];
      for (const id of new Set([...Object.keys(r), ...Object.keys(l)])) {
        if (
          path === "workspace.tasks" &&
          ![...(b[id] || []), ...(l[id] || []), ...(r[id] || [])].some(
            (task) => task.seriesId,
          )
        ) {
          const value = mergeValue(
            b[id]?.[0],
            l[id]?.[0],
            r[id]?.[0],
            `${path}.${id}`,
            conflicts,
          );
          if (value !== undefined) output.push(value);
          continue;
        }
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
  const groupKey = taskGroupKey([...local.tasks, ...remote.tasks]);
  const localTaskGroups = grouped(local.tasks, groupKey),
    remoteTaskGroups = grouped(remote.tasks, groupKey),
    copiedSeries = new Set<string>();
  for (const task of local.tasks) {
    const groupId = groupKey(task),
      group = localTaskGroups[groupId];
    if (group.some((item) => item.seriesId)) {
      if (copiedSeries.has(groupId)) continue;
      copiedSeries.add(groupId);
      const other = remoteTaskGroups[groupId];
      if (!other) tasks.push(...structuredClone(group));
      else if (!same(group, other)) {
        const seriesId = id();
        tasks.push(
          ...group.map((item) => ({
            ...structuredClone(item),
            id: id(),
            seriesId,
            title: `${item.title} (from this device)`,
          })),
        );
      }
      continue;
    }
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
