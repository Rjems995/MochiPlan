import { validateWorkspace } from "./validation.mjs";
import { HttpError } from "./errors.mjs";

const pick = (value, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  );
export function sharedSnapshot(body) {
  if (
    !body ||
    typeof body.includeLocations !== "boolean" ||
    typeof body.includeDetails !== "boolean"
  )
    throw new HttpError(400, "Choose which activity details to share.");
  const preferences = {
    name: "",
    avatar: "",
    theme: "strawberry",
    dark: false,
    weekStart: body.preferences?.weekStart,
    time24: body.preferences?.time24,
    favorites: [],
    favoriteThemes: [],
    reminders: false,
    reminderMinutes: 10,
    onboarded: true,
  };
  const source = validateWorkspace({
    version: 1,
    revision: 0,
    data: {
      schedules: [body.schedule],
      activeId: body.schedule?.id,
      tasks: [],
      preferences,
    },
  }).schedules[0];
  const schedule = pick(source, [
    "id",
    "name",
    "title",
    "type",
    "updatedAt",
    "termStart",
    "termEnd",
  ]);
  schedule.entries = source.entries.map((entry) => ({
    ...pick(entry, [
      "id",
      "title",
      "day",
      "start",
      "end",
      "color",
      "date",
      "cancelledDates",
      "seriesId",
      "startsOn",
      "endsOn",
      "sourceId",
      "originalDate",
    ]),
    location: body.includeLocations ? entry.location : "",
    instructor: body.includeDetails ? entry.instructor : "",
    notes: body.includeDetails ? entry.notes : "",
  }));
  schedule.holidays = (source.holidays || []).map((holiday) =>
    pick(holiday, ["id", "name", "startDate", "endDate"]),
  );
  schedule.design = pick(source.design, [
    "theme",
    "background",
    "pattern",
    "font",
    "fontSize",
    "radius",
    "grid",
    "border",
    "alignment",
    "image",
    "startHour",
    "endHour",
    "weekends",
    "gradient",
    "subtitle",
  ]);
  schedule.design.stickers = source.design.stickers.map((sticker) =>
    pick(sticker, ["id", "emoji", "x", "y", "size", "rotation"]),
  );
  if (source.design.textBoxes !== undefined)
    schedule.design.textBoxes = source.design.textBoxes.map((box) =>
      pick(box, [
        "id",
        "text",
        "font",
        "fontSize",
        "color",
        "bold",
        "italic",
        "alignment",
        "x",
        "y",
        "width",
        "rotation",
      ]),
    );
  if (source.design.customTheme)
    schedule.design.customTheme = pick(source.design.customTheme, [
      "id",
      "name",
      "color",
      "bg",
      "accent",
      "emoji",
      "palette",
    ]);
  return {
    schedule,
    preferences: pick(preferences, ["weekStart", "time24"]),
    includeLocations: body.includeLocations,
    includeDetails: body.includeDetails,
  };
}
