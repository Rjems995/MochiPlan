import Dexie, { type Table } from "dexie";
import type { AppData, Entry } from "./model";
import { validSeriesMetadata } from "./series.ts";
import { isCalendarDate, weekdayForDate } from "./calendar.ts";
import { activeProfile, workspaceRecord } from "./services/deviceScope.ts";
export type SyncCheckpoint = {
  id: string;
  revision: number;
  data: AppData | null;
  syncedAt: string;
};
class MochiDatabase extends Dexie {
  state!: Table<{ id: string; data: AppData; savedAt?: string }>;
  sync!: Table<SyncCheckpoint>;
  constructor() {
    super("mochiplan");
    this.version(1).stores({ state: "id" });
    this.version(2).stores({ state: "id", sync: "id" });
  }
}
export const db = new MochiDatabase();
export async function loadData(
  profile = activeProfile(),
): Promise<AppData | undefined> {
  const record = await db.state.get(workspaceRecord(profile));
  return record?.data;
}
let queue = Promise.resolve();
export function saveData(data: AppData, profile = activeProfile()) {
  const write = queue
    .catch(() => {})
    .then(() => db.state.put({ id: workspaceRecord(profile), data }))
    .then(() => {});
  queue = write;
  return write;
}
export type RestorePoint = { data: AppData; savedAt: string };
export async function saveRestorePoint(
  data: AppData,
  profile = activeProfile(),
): Promise<RestorePoint> {
  const savedAt = new Date().toISOString();
  await queue.catch(() => {});
  await db.state.put({
    id: profile ? `restore-point:${profile}` : "restore-point",
    data,
    savedAt,
  });
  return { data, savedAt };
}
export async function loadRestorePoint(
  profile = activeProfile(),
): Promise<RestorePoint | null> {
  const record = await db.state.get(
    profile ? `restore-point:${profile}` : "restore-point",
  );
  if (!record?.savedAt || !Number.isFinite(Date.parse(record.savedAt)))
    return null;
  return {
    data: validateBackup({ version: 1, data: record.data }),
    savedAt: record.savedAt,
  };
}
export function saveSyncCheckpoint(checkpoint: SyncCheckpoint, data?: AppData) {
  const write = queue
    .catch(() => {})
    .then(() =>
      db.transaction("rw", db.state, db.sync, async () => {
        if (data)
          await db.state.put({ id: workspaceRecord(checkpoint.id), data });
        await db.sync.put(checkpoint);
      }),
    );
  queue = write;
  return write;
}
export function download(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
export function downloadJSON(data: AppData) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify({ version: 1, data }, null, 2)], {
      type: "application/json",
    }),
  );
  download(url, "mochiplan-backup.json");
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function validateBackup(value: unknown): AppData {
  const isRecord = (x: unknown): x is Record<string, unknown> =>
    typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.data))
    throw Error("Please choose a MochiPlan backup file.");
  const d = value.data;
  if (
    !Array.isArray(d.schedules) ||
    !d.schedules.length ||
    !Array.isArray(d.tasks) ||
    !isRecord(d.preferences) ||
    typeof d.activeId !== "string"
  )
    throw Error("The backup is incomplete.");
  for (const s of d.schedules) {
    if (
      !isRecord(s) ||
      typeof s.id !== "string" ||
      typeof s.name !== "string" ||
      typeof s.title !== "string" ||
      !Array.isArray(s.entries) ||
      !isRecord(s.design) ||
      !Array.isArray(s.design.stickers) ||
      typeof s.design.background !== "string" ||
      typeof s.design.startHour !== "number" ||
      typeof s.design.endHour !== "number" ||
      s.design.startHour < 0 ||
      s.design.endHour > 24 ||
      s.design.endHour <= s.design.startHour
    )
      throw Error("A schedule in the backup is invalid.");
    if (
      (s.termStart !== undefined && !isCalendarDate(s.termStart)) ||
      (s.termEnd !== undefined && !isCalendarDate(s.termEnd)) ||
      (s.termStart && s.termEnd && String(s.termStart) > String(s.termEnd))
    )
      throw Error("The semester dates in the backup are invalid.");
    if (s.holidays !== undefined) {
      if (!Array.isArray(s.holidays) || s.holidays.length > 1000)
        throw Error("The holidays in the backup are invalid.");
      const holidayIds = new Set();
      for (const h of s.holidays) {
        if (
          !isRecord(h) ||
          typeof h.id !== "string" ||
          holidayIds.has(h.id) ||
          typeof h.name !== "string" ||
          !h.name.trim() ||
          h.name.length > 100 ||
          !isCalendarDate(h.startDate) ||
          !isCalendarDate(h.endDate) ||
          h.startDate > h.endDate
        )
          throw Error("A holiday in the backup is invalid.");
        holidayIds.add(h.id);
      }
    }
    for (const e of s.entries) {
      if (
        !isRecord(e) ||
        typeof e.id !== "string" ||
        typeof e.title !== "string" ||
        typeof e.day !== "number" ||
        e.day < 0 ||
        e.day > 6 ||
        typeof e.start !== "number" ||
        typeof e.end !== "number" ||
        e.start < 0 ||
        e.end > 1440 ||
        e.end <= e.start
      )
        throw Error("An activity in the backup is invalid.");
      if (
        e.date !== undefined &&
        (!isCalendarDate(e.date) || weekdayForDate(e.date) !== e.day)
      )
        throw Error("An activity date in the backup is invalid.");
      if (
        e.cancelledDates !== undefined &&
        (!Array.isArray(e.cancelledDates) ||
          e.cancelledDates.length > 10000 ||
          new Set(e.cancelledDates).size !== e.cancelledDates.length ||
          !e.cancelledDates.every(
            (date) =>
              isCalendarDate(date) &&
              (e.date ? date === e.date : weekdayForDate(date) === e.day),
          ))
      )
        throw Error("A cancelled class date in the backup is invalid.");
    }
  }
  for (const schedule of d.schedules as Record<string, unknown>[])
    if (!validSeriesMetadata(schedule.entries as Entry[]))
      throw Error("The recurring activity data in the backup is invalid.");
  const text = (v: unknown): v is string => typeof v === "string";
  const number = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  const color = (v: unknown) => text(v) && /^#[0-9a-f]{6}$/i.test(v);
  const ids = new Set<string>();
  for (const s of d.schedules as Record<string, unknown>[]) {
    if (ids.has(s.id as string) || !text(s.type) || !number(s.updatedAt))
      throw Error("A planner in the backup is invalid.");
    ids.add(s.id as string);
    const design = s.design as Record<string, unknown>;
    if (
      !text(design.theme) ||
      !color(design.background) ||
      !["none", "dots", "grid"].includes(design.pattern as string) ||
      !["Nunito", "DM Sans", "Caveat", "Georgia"].includes(
        design.font as string,
      ) ||
      !number(design.fontSize) ||
      design.fontSize < 10 ||
      design.fontSize > 18 ||
      !number(design.radius) ||
      design.radius < 0 ||
      design.radius > 22 ||
      typeof design.grid !== "boolean" ||
      !["solid", "dashed", "double", "none"].includes(
        design.border as string,
      ) ||
      !["left", "center", "right"].includes(design.alignment as string) ||
      typeof design.weekends !== "boolean" ||
      typeof design.gradient !== "boolean" ||
      !text(design.subtitle) ||
      !text(design.image) ||
      (design.image !== "" &&
        !/^data:image\/(png|jpeg|webp);base64,/.test(design.image))
    )
      throw Error("A planner design in the backup is invalid.");
    for (const sticker of design.stickers as unknown[]) {
      if (
        !isRecord(sticker) ||
        !text(sticker.id) ||
        !text(sticker.emoji) ||
        !number(sticker.x) ||
        !number(sticker.y) ||
        sticker.x < 0 ||
        sticker.x > 100 ||
        sticker.y < 0 ||
        sticker.y > 100 ||
        !number(sticker.size) ||
        sticker.size < 10 ||
        sticker.size > 150 ||
        !number(sticker.rotation)
      )
        throw Error("A sticker in the backup is invalid.");
    }
    const entryIds = new Set();
    for (const e of s.entries as Record<string, unknown>[]) {
      if (
        entryIds.has(e.id) ||
        !Number.isInteger(e.day) ||
        !number(e.start) ||
        !number(e.end) ||
        !text(e.location) ||
        !text(e.instructor) ||
        !text(e.notes) ||
        !color(e.color)
      )
        throw Error("An activity in the backup is invalid.");
      entryIds.add(e.id);
    }
  }
  if (!ids.has(d.activeId))
    throw Error("The active planner is missing from the backup.");
  for (const t of d.tasks) {
    if (
      !isRecord(t) ||
      !text(t.id) ||
      !text(t.title) ||
      typeof t.done !== "boolean" ||
      !text(t.due) ||
      !text(t.subject) ||
      !["low", "medium", "high"].includes(t.priority as string) ||
      (t.due !== "" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(t.due) || Number.isNaN(Date.parse(t.due))))
    )
      throw Error("A task in the backup is invalid.");
  }
  const p = d.preferences;
  if (
    !text(p.name) ||
    !text(p.avatar) ||
    !text(p.theme) ||
    typeof p.dark !== "boolean" ||
    !["monday", "sunday"].includes(p.weekStart as string) ||
    typeof p.time24 !== "boolean" ||
    !Array.isArray(p.favorites) ||
    !p.favorites.every(text) ||
    !Array.isArray(p.favoriteThemes) ||
    !p.favoriteThemes.every(text) ||
    typeof p.reminders !== "boolean" ||
    !number(p.reminderMinutes) ||
    ![0, 5, 10, 15, 30].includes(p.reminderMinutes) ||
    typeof p.onboarded !== "boolean"
  )
    throw Error("The profile in the backup is invalid.");
  const validTheme = (t: unknown) =>
    isRecord(t) &&
    text(t.id) &&
    text(t.name) &&
    color(t.bg) &&
    color(t.color) &&
    color(t.accent) &&
    text(t.emoji) &&
    Array.isArray(t.palette) &&
    t.palette.length === 5 &&
    t.palette.every(color);
  if (
    p.customThemes !== undefined &&
    (!Array.isArray(p.customThemes) || !p.customThemes.every(validTheme))
  )
    throw Error("A custom palette in the backup is invalid.");
  for (const s of d.schedules as Record<string, unknown>[]) {
    const design = s.design as Record<string, unknown>;
    if (design.customTheme !== undefined && !validTheme(design.customTheme))
      throw Error("A custom palette in the backup is invalid.");
  }
  return structuredClone(d) as AppData;
}
