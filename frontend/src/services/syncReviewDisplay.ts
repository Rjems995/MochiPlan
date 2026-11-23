import { format, parseISO } from "date-fns";
import { dayNames, formatTime, themes } from "../model.ts";
import { isCalendarDate } from "../calendar.ts";
import { same } from "./syncMerge.ts";
import type { MergeConflictItem, WorkspaceReview } from "./syncTypes";

const names: Record<string, string> = {
  title: "Title",
  name: "Name",
  day: "Weekday",
  time: "Time",
  location: "Location",
  instructor: "Instructor",
  notes: "Notes",
  color: "Activity color",
  date: "Specific date",
  startsOn: "Repeats from",
  endsOn: "Repeats through",
  cancelledDates: "Cancelled dates",
  originalDate: "Original occurrence",
  sourceId: "Rescheduled from",
  seriesId: "Series link",
  termStart: "Semester starts",
  termEnd: "Semester ends",
  holidays: "Holidays",
  due: "Deadline date",
  dueTime: "Deadline time",
  reminderMinutes: "Notification lead time",
  recurrence: "Repeat rule",
  subtasks: "Subtasks",
  done: "Completed",
  priority: "Priority",
  subject: "Subject",
  theme: "Palette",
  background: "Background color",
  pattern: "Paper texture",
  font: "Font",
  fontSize: "Text size",
  textBoxes: "Text decorations",
  text: "Text",
  bold: "Bold",
  italic: "Italic",
  x: "Horizontal position",
  y: "Vertical position",
  width: "Width",
  rotation: "Rotation",
  radius: "Corner roundness",
  border: "Border",
  grid: "Grid lines",
  image: "Background image",
  imageAdjustment: "Background photo framing",
  canvasSize: "Planner size",
  height: "Height",
  fit: "Photo fit",
  zoom: "Photo zoom",
  weekends: "Weekends",
  gradient: "Gradient",
  subtitle: "Subtitle",
  alignment: "Alignment",
  startHour: "Day starts at",
  endHour: "Day ends at",
  customTheme: "Custom palette",
  weekStart: "Week starts on",
  time24: "Clock format",
  dark: "Dark mode",
  avatar: "Companion",
  favorites: "Pinned planners",
  favoriteThemes: "Favorite palettes",
  customThemes: "Custom palettes",
  anchorDate: "Original repeat date",
  until: "Repeat until",
  frequency: "Frequency",
  interval: "Repeat interval",
  presence: "Item status",
};
export const fieldName = (key: string) =>
  names[key] ||
  key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
export function readableValue(value: any, key = ""): string {
  if (value === undefined || value === null) return "Not present";
  if (typeof value === "boolean")
    return key === "time24"
      ? value
        ? "24-hour clock"
        : "12-hour clock"
      : value
        ? "Yes"
        : "No";
  if (typeof value === "number")
    return key === "day"
      ? dayNames[value] || String(value)
      : key === "reminderMinutes"
        ? value === 0
          ? "At the deadline"
          : `${value} minutes before`
        : String(value);
  if (typeof value === "string") {
    if (!value) return "Not set";
    if (isCalendarDate(value)) return format(parseISO(value), "MMM d, yyyy");
    if (/^data:image\//.test(value)) return "Uploaded background";
    if (key === "theme")
      return (
        themes.find((theme) => theme.id === value)?.name || "Custom palette"
      );
    return value;
  }
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) =>
            typeof item === "object"
              ? readableValue(item)
              : readableValue(item, key),
          )
          .join("\n")
      : "None";
  return (
    Object.entries(value)
      .filter(([name]) => name !== "id" && !name.endsWith("Id"))
      .map(
        ([name, child]) => `${fieldName(name)}: ${readableValue(child, name)}`,
      )
      .join("\n") || "No details"
  );
}
export function itemDescription(
  item: MergeConflictItem,
  review: WorkspaceReview,
) {
  const workspaces = [review.base, review.local, review.account];
  const schedule =
    item.path[0] === "schedules"
      ? workspaces
          .map((value) =>
            value?.schedules.find((candidate) => candidate.id === item.path[1]),
          )
          .find(Boolean)
      : undefined;
  const task =
    item.path[0] === "tasks"
      ? workspaces
          .map((value) =>
            value?.tasks.find((candidate) => candidate.id === item.path[1]),
          )
          .find(Boolean)
      : undefined;
  const first = [item.base, item.local, item.account]
    .map((value) =>
      Array.isArray(value)
        ? value.find((record) => !record.sourceId && !record.date) || value[0]
        : value,
    )
    .find((value) => value && typeof value === "object");
  if (item.kind === "activity")
    return {
      label: first?.title || "Activity",
      context: `${schedule?.name || "Planner"}${first ? ` · ${first.date ? readableValue(first.date) : dayNames[first.day]} · ${formatTime(first.start, review.local.preferences.time24)} – ${formatTime(first.end, review.local.preferences.time24)}` : ""}`,
      category:
        (item.memberIds?.length || 0) > 1
          ? "Linked activity series"
          : "Activity",
    };
  if (item.kind === "task-series")
    return {
      label: first?.title || "Task series",
      context: `Little to-dos${first?.due ? ` · Due ${readableValue(first.due)}` : ""}`,
      category: "Task series",
    };
  if (item.kind === "planner")
    return {
      label: first?.name || schedule?.name || "Planner",
      context: "Planner and calendar",
      category: "Planner",
    };
  if (item.kind === "task")
    return {
      label: first?.title || task?.title || "Task",
      context: "Little to-dos",
      category: "Task",
    };
  if (item.kind === "planners")
    return {
      label: "Planner collection",
      context: "At least one planner must remain",
      category: "Planners",
    };
  const property = fieldName(item.path.at(-1) || "Value");
  let label = property;
  let decorationText = "";
  if (item.path.includes("textBoxes") && schedule) {
    const position = item.path.indexOf("textBoxes");
    decorationText =
      workspaces
        .flatMap(
          (value) =>
            value?.schedules.find((candidate) => candidate.id === schedule.id)
              ?.design.textBoxes || [],
        )
        .find((box) => box.id === item.path[position + 1])?.text ||
      "Text decoration";
  }
  if (item.path.includes("subtasks") && task) {
    const position = item.path.indexOf("subtasks"),
      stepId = item.path[position + 1];
    const step = workspaces
      .flatMap(
        (value) =>
          value?.tasks.find((candidate) => candidate.id === task.id)
            ?.subtasks || [],
      )
      .find((candidate) => candidate.id === stepId);
    label = `${step?.title || "Subtask"} — ${property}`;
  }
  return {
    label,
    context:
      (decorationText ? `${schedule?.name} · ${decorationText}` : "") ||
      task?.title ||
      schedule?.name ||
      (item.path[0] === "preferences" ? "Your settings" : "Workspace"),
    category: "Setting",
  };
}
export type ComparisonRow = {
  key: string;
  label: string;
  base: any;
  local: any;
  account: any;
  conflict: boolean;
};
export function comparisonRows(
  base: any,
  local: any,
  account: any,
  baseKnown: boolean,
  keys: string[],
  time24: boolean,
): ComparisonRow[] {
  const get = (record: any, key: string) => {
    if (!record) return undefined;
    if (key === "time") return [record.start, record.end];
    if (key === "presence") return true;
    if (key === "seriesId")
      return record.seriesId
        ? "Linked to a repeating series"
        : "Original activity pattern";
    if (key === "sourceId")
      return record.sourceId
        ? "Linked to its original activity"
        : "No reschedule link";
    return Object.hasOwn(record, key) ? record[key] : undefined;
  };
  return keys.flatMap((key) => {
    const original = get(base, key),
      device = get(local, key),
      server = get(account, key);
    const raw = (record: any) =>
      key === "sourceId" || key === "seriesId"
        ? record?.[key]
        : get(record, key);
    if (
      baseKnown
        ? same(raw(base), raw(local)) && same(raw(base), raw(account))
        : same(raw(local), raw(account))
    )
      return [];
    const display = (value: any, record: any) => {
      if (key === "time" && value)
        return `${formatTime(value[0], time24)} – ${formatTime(value[1], time24)}`;
      if (key === "presence")
        return record
          ? base
            ? "Present"
            : "Added"
          : base
            ? "Deleted"
            : "Not present";
      return readableValue(value, key);
    };
    return [
      {
        key,
        label: fieldName(key),
        base: display(original, base),
        local: display(device, local),
        account: display(server, account),
        conflict:
          !same(raw(local), raw(account)) &&
          (!baseKnown ||
            (!same(raw(base), raw(local)) && !same(raw(base), raw(account)))),
      },
    ];
  });
}
