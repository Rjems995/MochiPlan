import { HttpError } from "./errors.mjs";

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v, max = 10000) => typeof v === "string" && v.length <= max;
const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const number = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
const color = (v) => typeof v === "string" && /^#[a-f0-9]{6}$/i.test(v);
const bool = (v) => typeof v === "boolean";
const oneOf = (v, values) => values.includes(v);
const strings = (v) =>
  Array.isArray(v) && v.length <= 10000 && v.every((x) => text(x, 200));
const theme = (v) =>
  object(v) &&
  text(v.id, 200) &&
  text(v.name, 200) &&
  text(v.emoji, 100) &&
  color(v.color) &&
  color(v.bg) &&
  color(v.accent) &&
  Array.isArray(v.palette) &&
  v.palette.length === 5 &&
  v.palette.every(color);
const ensure = (condition, message) => {
  if (!condition) throw new HttpError(400, message);
};

export function validateWorkspace(body) {
  ensure(
    object(body) &&
      body.version === 1 &&
      integer(body.revision, 0, Number.MAX_SAFE_INTEGER),
    "Choose a version 1 workspace with a valid revision.",
  );
  const d = body.data;
  ensure(
    object(d) &&
      Array.isArray(d.schedules) &&
      d.schedules.length > 0 &&
      d.schedules.length <= 1000 &&
      Array.isArray(d.tasks) &&
      d.tasks.length <= 10000 &&
      text(d.activeId, 200),
    "The workspace is incomplete.",
  );
  const ids = new Set();
  for (const s of d.schedules) {
    ensure(
      object(s) &&
        text(s.id, 200) &&
        s.id &&
        !ids.has(s.id) &&
        text(s.name) &&
        text(s.title) &&
        text(s.type, 200) &&
        number(s.updatedAt, 0, Number.MAX_SAFE_INTEGER) &&
        Array.isArray(s.entries) &&
        s.entries.length <= 10000,
      "A planner is invalid.",
    );
    ids.add(s.id);
    const entryIds = new Set();
    for (const e of s.entries) {
      ensure(
        object(e) &&
          text(e.id, 200) &&
          e.id &&
          !entryIds.has(e.id) &&
          text(e.title) &&
          integer(e.day, 0, 6) &&
          integer(e.start, 0, 1439) &&
          integer(e.end, 1, 1440) &&
          e.end > e.start &&
          text(e.location) &&
          text(e.instructor) &&
          text(e.notes) &&
          color(e.color),
        "An activity is invalid.",
      );
      entryIds.add(e.id);
    }
    const a = s.design;
    ensure(
      object(a) &&
        text(a.theme, 200) &&
        color(a.background) &&
        oneOf(a.pattern, ["none", "dots", "grid"]) &&
        oneOf(a.font, ["Nunito", "DM Sans", "Caveat", "Georgia"]) &&
        number(a.fontSize, 10, 18) &&
        number(a.radius, 0, 22) &&
        bool(a.grid) &&
        oneOf(a.border, ["solid", "dashed", "double", "none"]) &&
        oneOf(a.alignment, ["left", "center", "right"]) &&
        text(a.image, 8 * 1024 * 1024) &&
        (a.image === "" ||
          /^data:image\/(png|jpeg|webp);base64,/.test(a.image)) &&
        integer(a.startHour, 0, 23) &&
        integer(a.endHour, 1, 24) &&
        a.endHour > a.startHour &&
        bool(a.weekends) &&
        bool(a.gradient) &&
        text(a.subtitle) &&
        Array.isArray(a.stickers) &&
        a.stickers.length <= 1000,
      "A planner design is invalid.",
    );
    for (const sticker of a.stickers)
      ensure(
        object(sticker) &&
          text(sticker.id, 200) &&
          text(sticker.emoji, 100) &&
          number(sticker.x, 0, 100) &&
          number(sticker.y, 0, 100) &&
          number(sticker.size, 10, 150) &&
          number(sticker.rotation, -360, 360),
        "A sticker is invalid.",
      );
    ensure(
      a.customTheme === undefined || theme(a.customTheme),
      "A custom palette is invalid.",
    );
  }
  ensure(ids.has(d.activeId), "The active planner is missing.");
  const taskIds = new Set();
  for (const task of d.tasks) {
    ensure(
      object(task) &&
        text(task.id, 200) &&
        task.id &&
        !taskIds.has(task.id) &&
        text(task.title) &&
        text(task.subject) &&
        text(task.due, 10) &&
        (task.due === "" ||
          (/^\d{4}-\d{2}-\d{2}$/.test(task.due) &&
            !Number.isNaN(Date.parse(task.due)) &&
            new Date(task.due).toISOString().slice(0, 10) === task.due)) &&
        oneOf(task.priority, ["low", "medium", "high"]) &&
        bool(task.done),
      "A task is invalid.",
    );
    taskIds.add(task.id);
  }
  const p = d.preferences;
  ensure(
    object(p) &&
      text(p.name) &&
      text(p.avatar, 100) &&
      text(p.theme, 200) &&
      bool(p.dark) &&
      oneOf(p.weekStart, ["monday", "sunday"]) &&
      bool(p.time24) &&
      strings(p.favorites) &&
      strings(p.favoriteThemes) &&
      bool(p.reminders) &&
      oneOf(p.reminderMinutes, [0, 5, 10, 15, 30]) &&
      bool(p.onboarded) &&
      (p.customThemes === undefined ||
        (Array.isArray(p.customThemes) &&
          p.customThemes.length <= 1000 &&
          p.customThemes.every(theme))),
    "The profile is invalid.",
  );
  return d;
}
