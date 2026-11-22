import type { AppData, Schedule, Task } from "../model";
import { duplicateEntries } from "../series.ts";
import { validateBackup } from "../storage.ts";
import {
  grouped,
  mergeWorkspace,
  onThisDevice,
  same,
  sharedWorkspace,
  taskGroupKey,
} from "./syncMerge.ts";
import type {
  ConflictChoice,
  MergeConflictItem,
  WorkspaceReview,
} from "./syncTypes";

const prefix = (parent: string[], child: string[]) =>
  parent.length <= child.length &&
  parent.every((value, index) => child[index] === value);
function at(value: any, path: string[]): any {
  for (const key of path)
    value = Array.isArray(value)
      ? value.find((item) => item?.id === key)
      : value && Object.hasOwn(value, key)
        ? value[key]
        : undefined;
  return value;
}
function replace(value: any, path: string[], next: any): any {
  if (!path.length) return structuredClone(next);
  const [key, ...rest] = path;
  if (Array.isArray(value)) {
    const index = value.findIndex((item) => item?.id === key);
    if (index < 0) {
      if (rest.length)
        throw Error(
          "The compared item is no longer available. Refresh the comparison.",
        );
      return next === undefined ? value : [...value, structuredClone(next)];
    }
    return value.flatMap((item, position) => {
      if (position !== index) return [item];
      const result = replace(item, rest, next);
      return result === undefined ? [] : [result];
    });
  }
  return Object.fromEntries(
    [...new Set([...Object.keys(value || {}), key])].flatMap((field) => {
      const result =
        field === key
          ? replace(
              value && Object.hasOwn(value, field) ? value[field] : undefined,
              rest,
              next,
            )
          : value[field];
      return result === undefined ? [] : [[field, result]];
    }),
  );
}
function checkPlannerLimits(schedule: Schedule) {
  if (
    schedule.entries.length > 10000 ||
    (schedule.holidays?.length || 0) > 1000 ||
    schedule.design.stickers.length > 1000 ||
    schedule.design.endHour <= schedule.design.startHour
  )
    throw Error(
      "The combined planner exceeds its supported limits or has an invalid time range.",
    );
}
function checkPlanner(schedule: Schedule, preferences: AppData["preferences"]) {
  checkPlannerLimits(schedule);
  validateBackup({
    version: 1,
    data: {
      schedules: [schedule],
      activeId: schedule.id,
      tasks: [],
      preferences,
    },
  });
}
export function validateReviewedWorkspace(data: AppData) {
  if (data.schedules.length > 1000 || data.tasks.length > 10000)
    throw Error(
      "This combination exceeds the planner or task limit. Choose fewer copies before applying.",
    );
  for (const schedule of data.schedules) checkPlannerLimits(schedule);
  if (
    (data.preferences.customThemes?.length || 0) > 1000 ||
    data.preferences.favorites.length > 10000 ||
    data.preferences.favoriteThemes.length > 10000
  )
    throw Error("The combined settings exceed their supported limits.");
  return validateBackup({ version: 1, data });
}
export function createWorkspaceReview(
  base: AppData | null,
  local: AppData,
  account: AppData,
  id = crypto.randomUUID(),
): WorkspaceReview {
  const ancestor =
    base ||
    ({
      schedules: [],
      activeId: "",
      tasks: [],
      preferences: {},
    } as unknown as AppData);
  const result = mergeWorkspace(ancestor, local, account);
  let items = result.items,
    merged = result.data;
  const finish = (): WorkspaceReview => ({
    id,
    base: base ? sharedWorkspace(base) : null,
    local,
    account,
    merged,
    items,
  });
  // Isolate invalid sections only when the combined validation fails.
  try {
    validateReviewedWorkspace(merged);
    return finish();
  } catch {}
  const aggregate = (
    path: string[],
    kind: MergeConflictItem["kind"],
    reason: string,
  ) => {
    const previous = base ? at(base, path) : undefined,
      device = at(local, path),
      server = at(account, path);
    items = items.filter((item) => !prefix(path, item.path));
    items.push({
      id: JSON.stringify(path),
      path,
      kind,
      base: structuredClone(previous),
      local: structuredClone(device),
      account: structuredClone(server),
      reason,
    });
    merged = replace(merged, path, server ?? device);
  };
  if (merged.schedules.length > 1000)
    aggregate(
      ["schedules"],
      "planners",
      "Combining these planners would exceed the workspace limit. Choose which planner collection to retain.",
    );
  else
    for (const schedule of merged.schedules) {
      try {
        checkPlanner(schedule, local.preferences);
      } catch {
        aggregate(
          ["schedules", schedule.id],
          "planner",
          "The combined changes would break this planner’s calendar rules or limits. Resolve this planner together; other planners still merge separately.",
        );
      }
    }
  if (merged.tasks.length > 10000)
    aggregate(
      ["tasks"],
      "field",
      "The combined task list exceeds the supported limit. Choose a task list or reduce it before retrying.",
    );
  else
    for (const task of merged.tasks) {
      try {
        validateBackup({
          version: 1,
          data: {
            schedules: [
              {
                ...local.schedules[0],
                entries: [],
                holidays: [],
                design: {
                  ...local.schedules[0].design,
                  image: "",
                  stickers: [],
                },
              },
            ],
            activeId: local.schedules[0].id,
            tasks: [task],
            preferences: {
              ...local.preferences,
              favorites: [],
              favoriteThemes: [],
              customThemes: [],
            },
          },
        });
      } catch {
        aggregate(
          ["tasks", task.id],
          "task",
          "The combined task changes would be invalid. Choose this task’s complete version.",
        );
      }
    }
  try {
    const p = merged.preferences;
    if (
      (p.customThemes?.length || 0) > 1000 ||
      p.favorites.length > 10000 ||
      p.favoriteThemes.length > 10000
    )
      throw Error("Settings limit");
    validateBackup({
      version: 1,
      data: {
        schedules: [local.schedules[0]],
        activeId: local.schedules[0].id,
        tasks: [],
        preferences: p,
      },
    });
  } catch {
    aggregate(
      ["preferences"],
      "field",
      "The combined settings are invalid. Choose settings for this item; planner and task choices remain separate.",
    );
  }
  return finish();
}
export function canKeepBoth(item: MergeConflictItem) {
  return ["activity", "task-series", "planner", "task", "planners"].includes(
    item.kind,
  );
}
function copiedPlanner(schedule: Schedule, makeId: () => string): Schedule {
  return {
    ...structuredClone(schedule),
    id: makeId(),
    name: `${schedule.name} (from this device)`,
    entries: duplicateEntries(schedule.entries, makeId),
    design: {
      ...structuredClone(schedule.design),
      stickers: schedule.design.stickers.map((sticker) => ({
        ...sticker,
        id: makeId(),
      })),
    },
  };
}
export function resolveWorkspaceReview(
  review: WorkspaceReview,
  choices: Record<string, ConflictChoice>,
): AppData {
  const valid = new Set(review.items.map((item) => item.id));
  if (Object.keys(choices).some((id) => !valid.has(id)))
    throw Error(
      "These choices belong to an older comparison. Refresh and review the latest changes.",
    );
  let next = structuredClone(review.merged),
    sequence = 0;
  const makeId = () => `${review.id}:copy:${++sequence}`;
  for (const item of review.items) {
    const choice = Object.hasOwn(choices, item.id)
      ? choices[item.id]
      : undefined;
    if (!choice || !["local", "account", "both"].includes(choice))
      throw Error("Choose a version for every conflict before applying.");
    if (choice === "both" && !canKeepBoth(item))
      throw Error(
        "Choose one value for this setting; it cannot hold two versions.",
      );
    const selected = choice === "local" ? item.local : item.account;
    if (item.kind === "activity" || item.kind === "task-series") {
      let records = structuredClone(selected || []);
      if (choice === "both") {
        if (!item.account?.length) records = structuredClone(item.local || []);
        else if (item.local?.length) {
          if (item.kind === "activity")
            records.push(...duplicateEntries(item.local, makeId));
          else {
            const seriesId = makeId();
            records.push(
              ...item.local.map((task: Task) => ({
                ...structuredClone(task),
                id: makeId(),
                ...(task.seriesId ? { seriesId } : {}),
                title: `${task.title} (from this device)`,
              })),
            );
          }
        }
      }
      const location = item.path.slice(0, -1),
        members = new Set(item.memberIds);
      next = replace(next, location, [
        ...(at(next, location) || []).filter(
          (record: { id: string }) => !members.has(record.id),
        ),
        ...records,
      ]);
    } else if (choice === "both" && item.kind === "planners") {
      const collection: Schedule[] = structuredClone(item.account || []);
      for (const planner of item.local || []) {
        const other = collection.find(
          (candidate) => candidate.id === planner.id,
        );
        if (!other) collection.push(structuredClone(planner));
        else if (
          !same({ ...other, updatedAt: 0 }, { ...planner, updatedAt: 0 })
        )
          collection.push(copiedPlanner(planner, makeId));
      }
      next = replace(next, item.path, collection);
    } else if (choice === "both") {
      next = replace(next, item.path, item.account ?? item.local);
      if (item.account && item.local) {
        const parent = item.path.slice(0, -1),
          copy =
            item.kind === "planner"
              ? copiedPlanner(item.local, makeId)
              : {
                  ...structuredClone(item.local),
                  id: makeId(),
                  title: `${item.local.title} (from this device)`,
                };
        next = replace(next, parent, [...at(next, parent), copy]);
      }
    } else next = replace(next, item.path, selected);
  }
  if (!next.schedules.length)
    throw Error("Keep at least one planner before applying these choices.");
  next.activeId = next.schedules.some(
    (schedule) => schedule.id === review.local.activeId,
  )
    ? review.local.activeId
    : next.schedules[0].id;
  next.preferences.favorites = next.preferences.favorites.filter((id) =>
    next.schedules.some((schedule) => schedule.id === id),
  );
  return validateReviewedWorkspace(onThisDevice(next, review.local));
}

export function otherChangedItems(
  review: WorkspaceReview,
): MergeConflictItem[] {
  const result: MergeConflictItem[] = [],
    versions = [review.base, review.local, review.account];
  const plannerIds = [
    ...new Set(
      versions.flatMap(
        (value) => value?.schedules.map((schedule) => schedule.id) || [],
      ),
    ),
  ];
  for (const plannerId of plannerIds) {
    const lists = versions.map(
      (value) =>
        value?.schedules.find((schedule) => schedule.id === plannerId)
          ?.entries || [],
    );
    const groups = lists.map((list) => grouped(list));
    for (const id of new Set(groups.flatMap((group) => Object.keys(group)))) {
      const path = ["schedules", plannerId, "entries", id];
      if (
        review.items.some(
          (item) => prefix(item.path, path) || prefix(path, item.path),
        )
      )
        continue;
      const [base, local, account] = groups.map((group) => group[id] || []);
      if (
        review.base
          ? same(base, local) && same(base, account)
          : same(local, account)
      )
        continue;
      result.push({
        id: JSON.stringify(path),
        path,
        kind: "activity",
        base,
        local,
        account,
      });
    }
  }
  const lists = versions.map((value) => value?.tasks || []),
    key = taskGroupKey(lists.flat()),
    groups = lists.map((list) => grouped(list, key));
  for (const id of new Set(groups.flatMap((group) => Object.keys(group)))) {
    const path = ["tasks", id],
      [base, local, account] = groups.map((group) => group[id] || []);
    const members = [
      ...new Set([...base, ...local, ...account].map((task) => task.id)),
    ];
    if (
      review.items.some(
        (item) =>
          item.path[0] === "tasks" &&
          (item.path.length === 1 ||
            item.path[1] === id ||
            members.includes(item.path[1])),
      )
    )
      continue;
    if (
      review.base
        ? same(base, local) && same(base, account)
        : same(local, account)
    )
      continue;
    result.push({
      id: JSON.stringify(path),
      path,
      kind: "task-series",
      base,
      local,
      account,
    });
  }
  return result;
}
