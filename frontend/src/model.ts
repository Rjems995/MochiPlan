export type Page =
  "studio" | "dashboard" | "schedules" | "templates" | "tasks" | "settings";
export type View = "weekly" | "daily" | "monthly" | "list";
export type Entry = {
  id: string;
  title: string;
  day: number;
  start: number;
  end: number;
  location: string;
  instructor: string;
  notes: string;
  color: string;
  date?: string;
  cancelledDates?: string[];
};
export type Holiday = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};
export type Sticker = {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
};
export type Design = {
  theme: string;
  background: string;
  pattern: string;
  font: string;
  fontSize: number;
  radius: number;
  grid: boolean;
  border: string;
  alignment: "left" | "center" | "right";
  stickers: Sticker[];
  image: string;
  startHour: number;
  endHour: number;
  weekends: boolean;
  gradient: boolean;
  subtitle: string;
  customTheme?: Theme;
};
export type Schedule = {
  id: string;
  name: string;
  title: string;
  type: string;
  entries: Entry[];
  design: Design;
  updatedAt: number;
  termStart?: string;
  termEnd?: string;
  holidays?: Holiday[];
};
export type Task = {
  id: string;
  title: string;
  subject: string;
  due: string;
  priority: "low" | "medium" | "high";
  done: boolean;
};
export type Preferences = {
  name: string;
  avatar: string;
  theme: string;
  dark: boolean;
  weekStart: "monday" | "sunday";
  time24: boolean;
  favorites: string[];
  favoriteThemes: string[];
  reminders: boolean;
  reminderMinutes: number;
  onboarded: boolean;
  customThemes?: Theme[];
};
export type AppData = {
  schedules: Schedule[];
  activeId: string;
  tasks: Task[];
  preferences: Preferences;
};
export type Theme = {
  id: string;
  name: string;
  color: string;
  bg: string;
  accent: string;
  emoji: string;
  palette: string[];
};
export const uid = () => crypto.randomUUID();
export const themes: Theme[] = [
  {
    id: "strawberry",
    name: "Strawberry Milk",
    color: "#b75776",
    bg: "#fff9f7",
    accent: "#f2b8cb",
    emoji: "🍓",
    palette: ["#f6d9e1", "#dfebd9", "#dddff2", "#f9e8cd", "#eadcf0"],
  },
  {
    id: "matcha",
    name: "Matcha Latte",
    color: "#55705b",
    bg: "#f5f7ed",
    accent: "#a7bf9e",
    emoji: "🍵",
    palette: ["#dce8d0", "#f3e4c7", "#cee2df", "#e5d9cc", "#e3e9bb"],
  },
  {
    id: "blueberry",
    name: "Blueberry Dream",
    color: "#5b6c9b",
    bg: "#f4f7ff",
    accent: "#a9bce0",
    emoji: "🫐",
    palette: ["#d8e5fa", "#e4ddf3", "#cfe9e6", "#f2def0", "#dce2ee"],
  },
  {
    id: "lavender",
    name: "Lavender Cloud",
    color: "#806394",
    bg: "#faf6ff",
    accent: "#c4afdc",
    emoji: "☁️",
    palette: ["#e6daf3", "#f1dce9", "#dce5f3", "#e3e9de", "#f5e8db"],
  },
  {
    id: "peach",
    name: "Peach Blossom",
    color: "#a4634c",
    bg: "#fff7ef",
    accent: "#efb49a",
    emoji: "🍑",
    palette: ["#f8dcc8", "#f4d8df", "#e6e7cc", "#f9e8c4", "#e3dcef"],
  },
  {
    id: "academia",
    name: "Dark Academia",
    color: "#715645",
    bg: "#f4ecdf",
    accent: "#ba9c77",
    emoji: "📜",
    palette: ["#dbc8b1", "#cbd0b7", "#e5d5bf", "#cfbdac", "#d6cbd2"],
  },
  {
    id: "minimal",
    name: "Minimalist",
    color: "#525252",
    bg: "#fcfcfc",
    accent: "#b8b8b8",
    emoji: "✎",
    palette: ["#e2e2e2", "#ededeb", "#d9dce0", "#e6e3e0", "#dcdfda"],
  },
  {
    id: "midnight",
    name: "Midnight Cozy",
    color: "#eee2f5",
    bg: "#292638",
    accent: "#bca7d9",
    emoji: "🌙",
    palette: ["#51445e", "#3e5350", "#404b67", "#5b4b45", "#4c455d"],
  },
];
export const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export const scheduleTypes = [
  "Class schedule",
  "Weekly planner",
  "Daily schedule",
  "Study planner",
  "Work schedule",
  "Personal routine",
  "Exam schedule",
  "Custom schedule",
];
export const defaultDesign = (theme = themes[0]): Design => ({
  theme: theme.id,
  background: theme.bg,
  pattern: "dots",
  font: "Nunito",
  fontSize: 12,
  radius: 9,
  grid: true,
  border: "solid",
  alignment: "left",
  stickers: [],
  image: "",
  startHour: 8,
  endHour: 18,
  weekends: false,
  gradient: false,
  subtitle: "a little plan, a lovely week ♡",
});
export const getTheme = (id: string) =>
  themes.find((t) => t.id === id) || themes[0];
export const formatTime = (minutes: number, time24 = false) =>
  time24
    ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    : `${Math.floor(minutes / 60) % 12 || 12}${minutes % 60 ? ":" + String(minutes % 60).padStart(2, "0") : ""} ${minutes < 720 ? "am" : "pm"}`;
export const timeValue = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
export const parseTime = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export function overlaps(a: Entry, b: Entry) {
  if (a.date && b.date && a.date !== b.date) return false;
  const date = a.date || b.date;
  if (
    date &&
    (a.cancelledDates?.includes(date) || b.cancelledDates?.includes(date))
  )
    return false;
  return a.id !== b.id && a.day === b.day && a.start < b.end && a.end > b.start;
}
export function conflicts(entries: Entry[]) {
  return entries.filter((a) => entries.some((b) => overlaps(a, b)));
}
export function moveEntry(
  entry: Entry,
  day: number,
  deltaMinutes: number,
  min: number,
  max: number,
): Entry {
  const duration = entry.end - entry.start;
  const start = Math.max(
    min,
    Math.min(
      max - duration,
      Math.round((entry.start + deltaMinutes) / 15) * 15,
    ),
  );
  return { ...entry, day, start, end: start + duration };
}
export function entryLanes(
  entries: Entry[],
): Map<string, { lane: number; count: number }> {
  const result = new Map<string, { lane: number; count: number }>();
  const sorted = [...entries].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  let group: Entry[] = [];
  let end = -1;
  function flush() {
    const lanes: number[] = [];
    const assigned = new Map<string, number>();
    for (const e of group) {
      let lane = lanes.findIndex((v) => v <= e.start);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = e.end;
      assigned.set(e.id, lane);
    }
    for (const e of group)
      result.set(e.id, { lane: assigned.get(e.id)!, count: lanes.length });
  }
  for (const e of sorted) {
    if (e.start >= end) {
      flush();
      group = [];
      end = -1;
    }
    group.push(e);
    end = Math.max(end, e.end);
  }
  flush();
  return result;
}
