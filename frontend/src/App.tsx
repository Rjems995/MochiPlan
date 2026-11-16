import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  format,
  addDays,
  addWeeks,
  addMonths,
  startOfWeek,
  isSameDay,
  parseISO,
  isPast,
} from "date-fns";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  CalendarDays,
  LayoutTemplate,
  ListTodo,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  Download,
  Undo2,
  Redo2,
  Check,
  Cloud,
  WifiOff,
  Heart,
  MoreHorizontal,
  Copy,
  Trash2,
  Search,
  X,
  Sun,
  Moon,
  Sparkles,
  CircleHelp,
  Bell,
  MonitorDown,
  CheckCircle2,
  Circle,
  Clock3,
  MapPin,
  ArrowRight,
  Flower2,
  BookOpen,
  Coffee,
  Menu,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar,
  GripVertical,
  Share2,
  Pencil,
  AlertTriangle,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  type AppData,
  type Page,
  type View,
  type Schedule,
  type Entry,
  type Design,
  type Preferences,
  type Sticker,
  type Task,
  themes,
  getTheme,
  uid,
  defaultDesign,
  dayNames,
  formatTime,
  scheduleTypes,
  conflicts,
  moveEntry,
} from "./model";
import { seed, makeSchedule, templates, type Template } from "./seed";
import { loadData, saveData, downloadJSON, validateBackup } from "./storage";
import { Logo, Mochi, Flower } from "./components/Artwork";
import { Modal } from "./components/Modal";
import { ScheduleCanvas, HOUR_HEIGHT } from "./components/ScheduleCanvas";
import { DesignPanel } from "./components/DesignPanel";
import { EntryForm } from "./components/EntryForm";
import { ExportModal } from "./components/ExportModal";
import { FitContent } from "./components/FitContent";
import { saveServerBackup, loadServerBackup } from "./services/serverBackup";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const nav = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "schedules", label: "My schedules", icon: CalendarDays },
  { id: "templates", label: "Template garden", icon: LayoutTemplate },
  { id: "tasks", label: "Little to-dos", icon: ListTodo },
] as const;
function TemplatePreview({
  template,
  large = false,
}: {
  template: Template;
  large?: boolean;
}) {
  const theme = getTheme(template.theme);
  return (
    <div
      className={`template-art ${large ? "large" : ""} ${template.pattern === "grid" ? "template-grid-bg" : ""}`}
      style={{
        background: theme.bg,
        color: theme.color,
        fontFamily: template.font,
        backgroundImage:
          template.pattern === "dots"
            ? `radial-gradient(${theme.accent}70 1px,transparent 1px)`
            : undefined,
      }}
    >
      <span className="template-emoji">{template.emoji}</span>
      <h4>{template.name}</h4>
      <p>{template.subtitle}</p>
      <div className="mini-calendar">
        <div className="mini-days">
          {["m", "t", "w", "t", "f"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mini-columns">
          {[0, 1, 2, 3, 4].map((c) => (
            <div key={c}>
              {[0, 1, 2].map((r) => (
                <i
                  key={r}
                  style={{
                    background: theme.palette[(c + r) % 5],
                    height: `${18 + ((c + r) % 3) * 9}px`,
                    marginTop: `${5 + ((c * r) % 3) * 9}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <small>made with a little love ♡</small>
    </div>
  );
}
export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState("Loading your little workspace…");
  const [page, setPage] = useState<Page>("studio");
  const [view, setView] = useState<View>(() =>
    window.innerWidth <= 640 ? "daily" : "weekly",
  );
  const [week, setWeek] = useState(() => new Date());
  const [day, setDay] = useState((new Date().getDay() + 6) % 7);
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [editor, setEditor] = useState<{
    entry: Entry | null;
    day: number;
    start: number;
  } | null>(null);
  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState(scheduleTypes[0]);
  const [newTheme, setNewTheme] = useState("strawberry");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [tools, setTools] = useState(() => window.innerWidth > 850);
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasFrame, setCanvasFrame] = useState({ width: 0, height: 0 });
  const [canvasChrome, setCanvasChrome] = useState(128);
  const handleCanvasChrome = useCallback(
    (height: number) =>
      setCanvasChrome((old) => (Math.abs(old - height) < 0.5 ? old : height)),
    [],
  );
  const handleCanvasSize = useCallback(
    (size: { width: number; height: number }) =>
      setCanvasFrame((old) =>
        old.width === size.width && old.height === size.height ? old : size,
      ),
    [],
  );
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryElement, setGalleryElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [galleryGrid, setGalleryGrid] = useState({ columns: 3, rows: 1 });
  const [focusMode, setFocusMode] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<Template | null>(null);
  const [templateFilter, setTemplateFilter] = useState("All templates");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");
  const [taskEdit, setTaskEdit] = useState<Task | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState(format(new Date(), "yyyy-MM-dd"));
  const [taskSubject, setTaskSubject] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("medium");
  const [welcome, setWelcome] = useState(false);
  const [backupConfirm, setBackupConfirm] = useState<AppData | null>(null);
  const [serverBackupBusy, setServerBackupBusy] = useState(false);
  const undo = useRef<Schedule[][]>([]);
  const redo = useRef<Schedule[][]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const saveVersion = useRef(0);
  const ignoreClick = useRef(0);
  const backupInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(data);
  latest.current = data;
  useLayoutEffect(() => {
    if (!galleryElement) return;
    const measure = () => {
      const columns =
        galleryElement.clientWidth < 520
          ? 1
          : galleryElement.clientWidth < 900
            ? 2
            : 3;
      const rows = Math.max(
        1,
        Math.min(
          3,
          Math.floor(galleryElement.clientHeight / (columns === 1 ? 145 : 215)),
        ),
      );
      setGalleryGrid((old) =>
        old.columns === columns && old.rows === rows ? old : { columns, rows },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(galleryElement);
    measure();
    return () => observer.disconnect();
  }, [galleryElement]);
  useEffect(() => setGalleryPage(0), [query]);
  const notify = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  useEffect(() => {
    loadData()
      .then((saved) => {
        const initial = saved || seed();
        try {
          const prefs = localStorage.getItem("mochiplan-preferences");
          if (prefs)
            initial.preferences = {
              ...initial.preferences,
              ...JSON.parse(prefs),
            };
        } catch {}
        setData(initial);
      })
      .catch(() => setLoadError(true));
    const timer = setInterval(() => setNow(new Date()), 30000);
    const connected = () => setOnline(navigator.onLine);
    const prompt = (ev: Event) => {
      ev.preventDefault();
      setInstall(ev as InstallPrompt);
    };
    const offlineReady = () =>
      notify("Your cozy workspace is ready to use offline.");
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    window.addEventListener("beforeinstallprompt", prompt);
    window.addEventListener("mochi-offline-ready", offlineReady);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
      window.removeEventListener("beforeinstallprompt", prompt);
      window.removeEventListener("mochi-offline-ready", offlineReady);
    };
  }, [notify]);
  useEffect(() => {
    if (!data) return;
    const version = ++saveVersion.current;
    setSaved("Saving your little changes…");
    saveData(data)
      .then(() => {
        if (version === saveVersion.current) setSaved("All changes saved");
      })
      .catch(() => {
        setSaved("Could not save — download a backup");
        notify(
          "Device storage is unavailable or full. Download a backup in Settings to protect your plans.",
        );
      });
    try {
      localStorage.setItem(
        "mochiplan-preferences",
        JSON.stringify(data.preferences),
      );
    } catch {}
  }, [data, notify]);
  useEffect(() => {
    const before = (ev: BeforeUnloadEvent) => {
      if (saved.startsWith("Saving") || saved.startsWith("Could not")) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [saved]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (
        ev.target instanceof HTMLElement &&
        /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)
      )
        return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        performHistory(ev.shiftKey ? "redo" : "undo");
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "y") {
        ev.preventDefault();
        performHistory("redo");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (
      !data?.preferences.reminders ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const today = (now.getDay() + 6) % 7;
    const current = now.getHours() * 60 + now.getMinutes();
    for (const schedule of data.schedules)
      for (const entry of schedule.entries) {
        const key = `${format(now, "yyyy-MM-dd")}-${entry.id}`;
        const delta = entry.start - current;
        if (
          entry.day === today &&
          delta >= 0 &&
          delta <= data.preferences.reminderMinutes &&
          !notified.current.has(key)
        ) {
          notified.current.add(key);
          navigator.serviceWorker?.ready
            .then((r) =>
              r.showNotification(`Coming up: ${entry.title}`, {
                body: `${formatTime(entry.start, data.preferences.time24)}${entry.location ? " · " + entry.location : ""}`,
                icon: "/icon-192.png",
                tag: key,
              }),
            )
            .catch(
              () =>
                new Notification(entry.title, {
                  body: `Starts at ${formatTime(entry.start)}`,
                }),
            );
        }
      }
  }, [now, data]);
  function changeSchedules(fn: (s: Schedule[]) => Schedule[]) {
    setData((old) => {
      if (!old) return old;
      undo.current.push(structuredClone(old.schedules));
      if (undo.current.length > 50) undo.current.shift();
      redo.current = [];
      setHistoryVersion((v) => v + 1);
      return { ...old, schedules: fn(old.schedules) };
    });
  }
  function updateSchedule(fn: (s: Schedule) => Schedule) {
    if (!data) return;
    changeSchedules((list) =>
      list.map((s) =>
        s.id === data.activeId ? { ...fn(s), updatedAt: Date.now() } : s,
      ),
    );
  }
  function design(patch: Partial<Design>) {
    updateSchedule((s) => {
      const old =
        s.design.customTheme && s.design.theme === s.design.customTheme.id
          ? s.design.customTheme
          : getTheme(s.design.theme);
      return {
        ...s,
        design: { ...s.design, ...patch },
        entries: patch.customTheme
          ? s.entries.map((e) => ({
              ...e,
              color:
                patch.customTheme!.palette[
                  Math.max(0, old.palette.indexOf(e.color)) % 5
                ],
            }))
          : s.entries,
      };
    });
  }
  function pref(patch: Partial<Preferences>) {
    setData((old) =>
      old ? { ...old, preferences: { ...old.preferences, ...patch } } : old,
    );
  }
  function performHistory(direction: "undo" | "redo") {
    const from = direction === "undo" ? undo : redo;
    const to = direction === "undo" ? redo : undo;
    const previous = from.current.pop();
    if (!previous) return;
    setData((old) => {
      if (!old) return old;
      to.current.push(structuredClone(old.schedules));
      return {
        ...old,
        schedules: previous,
        activeId: previous.some((s) => s.id === old.activeId)
          ? old.activeId
          : previous[0].id,
      };
    });
    setHistoryVersion((v) => v + 1);
  }
  function navigate(next: Page) {
    setPage(next);
    setQuery("");
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function chooseSchedule(id: string) {
    setData((old) => (old ? { ...old, activeId: id } : old));
    setPage("studio");
    setSelectedSticker(null);
  }
  function applyTheme(id: string) {
    const theme =
      themes.find((t) => t.id === id) ||
      p?.customThemes?.find((t) => t.id === id) ||
      themes[0];
    const oldTheme =
      active.design.customTheme &&
      active.design.theme === active.design.customTheme.id
        ? active.design.customTheme
        : getTheme(active.design.theme);
    updateSchedule((s) => ({
      ...s,
      design: {
        ...s.design,
        theme: id,
        background: theme.bg,
        customTheme: id.startsWith("custom-") ? theme : undefined,
      },
      entries: s.entries.map((e) => {
        const i = oldTheme.palette.indexOf(e.color);
        return { ...e, color: i >= 0 ? theme.palette[i] : e.color };
      }),
    }));
  }
  function createPlanner() {
    const schedule = makeSchedule(
      newName.trim() || "My little planner",
      newType,
      newTheme,
    );
    changeSchedules((s) => [...s, schedule]);
    setData((old) => (old ? { ...old, activeId: schedule.id } : old));
    setNewModal(false);
    setPage("studio");
    setView(
      newType === "Daily schedule" || newType === "Personal routine"
        ? "daily"
        : "weekly",
    );
    notify("A fresh little beginning. Your planner is ready.");
  }
  function duplicateSchedule(s: Schedule) {
    const copy = {
      ...structuredClone(s),
      id: uid(),
      name: `${s.name} (copy)`,
      updatedAt: Date.now(),
      entries: s.entries.map((e) => ({ ...e, id: uid() })),
      design: {
        ...s.design,
        stickers: s.design.stickers.map((st) => ({ ...st, id: uid() })),
      },
    };
    changeSchedules((list) => [...list, copy]);
    notify("A little copy, ready to make your own.");
  }
  function applyTemplate(t: Template) {
    const theme = getTheme(t.theme);
    const oldTheme = getTheme(active.design.theme);
    updateSchedule((s) => ({
      ...s,
      title: t.name,
      design: {
        ...defaultDesign(theme),
        pattern: t.pattern,
        font: t.font,
        subtitle: t.subtitle,
        stickers: [
          { id: uid(), emoji: t.emoji, x: 85, y: 5, size: 38, rotation: 10 },
        ],
      },
      entries: s.entries.map((e) => ({
        ...e,
        color:
          theme.palette[Math.max(0, oldTheme.palette.indexOf(e.color)) % 5],
      })),
    }));
    setTemplatePreview(null);
    setPage("studio");
    notify(`${t.name} is all yours. Your activities are still here.`);
  }
  function addTask() {
    setTaskEdit(null);
    setTaskTitle("");
    setTaskSubject("");
    setTaskDue(format(new Date(), "yyyy-MM-dd"));
    setTaskPriority("medium");
    setTaskModal(true);
  }
  function editTask(t: Task) {
    setTaskEdit(t);
    setTaskTitle(t.title);
    setTaskSubject(t.subject);
    setTaskDue(t.due);
    setTaskPriority(t.priority);
    setTaskModal(true);
  }
  function toggleTask(id: string) {
    setData((old) =>
      old
        ? {
            ...old,
            tasks: old.tasks.map((t) =>
              t.id === id ? { ...t, done: !t.done } : t,
            ),
          }
        : old,
    );
  }
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );
  function dragEnd(event: DragEndEvent) {
    ignoreClick.current = Date.now() + 300;
    const entry = event.active.data.current?.entry as Entry | undefined;
    const target = event.over?.data.current?.day as number | undefined;
    if (!entry || target === undefined) return;
    updateSchedule((s) => ({
      ...s,
      entries: s.entries.map((e) =>
        e.id === entry.id
          ? moveEntry(
              e,
              target,
              (event.delta.y / canvasScale / canvasHourHeight) * 60,
              0,
              1440,
            )
          : e,
      ),
    }));
  }
  const active =
    data?.schedules.find((s) => s.id === data.activeId) || data?.schedules[0]!;
  const p = data?.preferences;
  const filteredSchedules = (data?.schedules || []).filter((s) =>
    (s.name + " " + s.title).toLowerCase().includes(query.toLowerCase()),
  );
  const galleryCapacity = galleryGrid.columns * galleryGrid.rows;
  const galleryPageCount = Math.max(
    1,
    Math.ceil(filteredSchedules.length / galleryCapacity),
  );
  const currentGalleryPage = Math.min(galleryPage, galleryPageCount - 1);
  const gallerySchedules = filteredSchedules.slice(
    currentGalleryPage * galleryCapacity,
    (currentGalleryPage + 1) * galleryCapacity,
  );
  const visibleTemplates = templates.filter(
    (t) =>
      (templateFilter === "All templates" || t.category === templateFilter) &&
      (!favoritesOnly || p?.favorites.includes(t.id)) &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  const dueTasks =
    data?.tasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999")) || [];
  const todayDay = (now.getDay() + 6) % 7;
  const todayEntries =
    active?.entries
      .filter((e) => e.day === todayDay)
      .sort((a, b) => a.start - b.start) || [];
  async function installApp() {
    if (install) {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } else setInstallHelp(true);
  }
  if (!data || !p || !active)
    return (
      <div className="app-loading">
        <Logo />
        {loadError ? (
          <>
            <h2>Your workspace couldn’t open.</h2>
            <p>Allow this site to use device storage, then try again.</p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <>
            <Mochi flower />
            <p>Making a little room for your plans…</p>
            <LoaderCircle className="spin" size={20} />
          </>
        )}
      </div>
    );
  const weekStart = startOfWeek(week, {
    weekStartsOn: p.weekStart === "monday" ? 1 : 0,
  });
  const totalHours = active.entries.reduce(
    (a, e) => a + (e.end - e.start) / 60,
    0,
  );
  const timetableHours =
    Math.max(
      active.design.endHour,
      ...active.entries.map((e) => Math.ceil(e.end / 60)),
    ) -
    Math.min(
      active.design.startHour,
      ...active.entries.map((e) => Math.floor(e.start / 60)),
    );
  const canvasHourHeight =
    (view === "weekly" || view === "daily") && canvasFrame.height > 0
      ? Math.max(
          36,
          Math.min(
            88,
            (canvasFrame.height - canvasChrome - 2) / timetableHours,
          ),
        )
      : HOUR_HEIGHT;
  const upcoming = Array.from({ length: 7 }, (_, i) => ({
    day: (todayDay + i) % 7,
    offset: i,
  }))
    .flatMap(({ day, offset }) =>
      active.entries
        .filter(
          (e) =>
            e.day === day &&
            (offset > 0 || e.end > now.getHours() * 60 + now.getMinutes()),
        )
        .sort((a, b) => a.start - b.start)
        .map((e) => ({ ...e, offset })),
    )
    .slice(0, 3);
  const canvasProps = {
    hourHeight: canvasHourHeight,
    schedule: active,
    preferences: p,
    week,
    view,
    day,
    onDay: setDay,
    onEdit: (e: Entry) => {
      if (Date.now() > ignoreClick.current)
        setEditor({ entry: e, day: e.day, start: e.start });
    },
    onAdd: (day: number, start = 540) => setEditor({ entry: null, day, start }),
    onResize: (id: string, end: number) => {
      ignoreClick.current = Date.now() + 300;
      updateSchedule((s) => ({
        ...s,
        entries: s.entries.map((e) => (e.id === id ? { ...e, end } : e)),
      }));
    },
    onSticker: (id: string, patch: Partial<Sticker>) =>
      design({
        stickers: active.design.stickers.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        ),
      }),
    selectedSticker,
    onSelectSticker: setSelectedSticker,
  };
  return (
    <div
      className={`app-shell ${p.dark ? "dark-mode" : ""} ${page === "studio" || page === "schedules" ? "bounded-workspace" : ""} ${page === "studio" ? "editing-schedule" : ""} ${focusMode && page === "studio" ? "focus-mode" : ""}`}
      style={
        {
          "--theme-accent": getTheme(p.theme).accent,
          "--workspace-accent":
            p.theme === "strawberry"
              ? "#b96d86"
              : p.theme === "midnight"
                ? "#8b74a4"
                : getTheme(p.theme).color,
          "--workspace-soft": getTheme(p.theme).accent + "35",
        } as React.CSSProperties
      }
    >
      {page !== "studio" && (
        <aside className={`sidebar ${mobileMenu ? "mobile-open" : ""}`}>
          <a
            href="#studio"
            onClick={(ev) => {
              ev.preventDefault();
              navigate("studio");
            }}
            className="brand-link"
            aria-label="MochiPlan home"
          >
            <Logo />
          </a>
          <button
            className="button primary create-planner"
            onClick={() => {
              setNewName("");
              setNewModal(true);
            }}
          >
            <Plus size={17} />
            Create a schedule
          </button>
          <div className="nav-label">YOUR LITTLE SPACE</div>
          <nav>
            {nav.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === "schedules" && (
                  <small>{data.schedules.length}</small>
                )}
                {item.id === "tasks" && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-planners">
            <div className="nav-label">
              PINNED PLANNERS<span>✧</span>
            </div>
            {data.schedules.slice(0, 4).map((s, i) => (
              <button
                className={s.id === active.id ? "current" : ""}
                key={s.id}
                onClick={() => chooseSchedule(s.id)}
              >
                <span style={{ background: getTheme(s.design.theme).accent }} />
                {s.name}
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <div className="gentle-note">
              <Flower />
              <span>
                A little progress
                <br />
                is still progress.
              </span>
              <small>you’ve got this ♡</small>
            </div>
            <button className="nav-item" onClick={installApp}>
              <MonitorDown size={17} />
              <span>Get the app</span>
              <ArrowUpRight size={14} />
            </button>
            <button
              className={`nav-item ${page === "settings" ? "active" : ""}`}
              onClick={() => navigate("settings")}
            >
              <Settings size={17} />
              <span>Settings</span>
            </button>
            <div className="profile-row">
              <button
                className="profile-avatar"
                onClick={() => navigate("settings")}
                aria-label="Edit profile"
              >
                {p.avatar}
              </button>
              <button
                className="profile-name"
                onClick={() => navigate("settings")}
              >
                <strong>
                  {p.name === "friend" ? "Your cozy corner" : p.name}
                </strong>
                <span>Just for you. Always.</span>
              </button>
              <button
                className="icon-button"
                aria-label={
                  p.dark ? "Switch to light mode" : "Switch to dark mode"
                }
                onClick={() => pref({ dark: !p.dark })}
              >
                {p.dark ? <Sun size={17} /> : <Moon size={17} />}
              </button>
            </div>
          </div>
        </aside>
      )}
      {mobileMenu && page !== "studio" && (
        <button
          className="mobile-shade"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            {page === "studio" ? (
              <button
                className="editor-back"
                aria-label="Back to my schedules"
                onClick={() => navigate("schedules")}
              >
                <ChevronLeft size={16} />
                <span>My schedules</span>
              </button>
            ) : (
              <>
                <button
                  className="icon-button mobile-menu-button"
                  aria-label="Open navigation"
                  onClick={() => setMobileMenu(!mobileMenu)}
                >
                  <Menu size={20} />
                </button>
                <span>Your workspace</span>
              </>
            )}
            <ChevronRight size={13} />
            <strong>
              {page === "studio"
                ? "Design studio"
                : page === "dashboard"
                  ? "Overview"
                  : page === "schedules"
                    ? "My schedules"
                    : page === "templates"
                      ? "Template garden"
                      : page === "tasks"
                        ? "Little to-dos"
                        : "Settings"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="connection-status">
              {online ? <Cloud size={15} /> : <WifiOff size={15} />}
              <span aria-live="polite">
                {!online ? "Offline & feeling cozy" : saved}
              </span>
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Welcome and quick start"
              onClick={() => setWelcome(true)}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="top-avatar"
              onClick={() => navigate("settings")}
              aria-label="Profile settings"
            >
              {p.avatar}
            </button>
          </div>
        </header>
        <div className={`page-content page-${page}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="page-body"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {page === "studio" && (
                <>
                  <div className="page-title studio-title">
                    <div>
                      <div className="eyebrow">
                        <Sparkles size={13} /> A LITTLE STRUCTURE. A LOT OF YOU.
                      </div>
                      <h1>
                        Good weeks start with a little plan
                        <span className="title-heart">♡</span>
                      </h1>
                      <p>
                        Make room for your classes, your coffee, and everything
                        in between.
                      </p>
                    </div>
                    <button
                      className="button primary export-button"
                      onClick={() => setExportOpen(true)}
                    >
                      <Download size={16} />
                      Export planner
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="studio-toolbar">
                    <div className="planner-select">
                      <CalendarDays size={16} />
                      <select
                        aria-label="Active planner"
                        value={active.id}
                        onChange={(ev) => chooseSchedule(ev.target.value)}
                      >
                        {data.schedules.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <span className="planner-type">{active.type}</span>
                    </div>
                    <div className="toolbar-actions">
                      <button
                        className="icon-button fullscreen-button"
                        aria-label={
                          focusMode
                            ? "Exit full screen editor"
                            : "Full screen editor"
                        }
                        onClick={() => {
                          setFocusMode(!focusMode);
                          if (!focusMode) setTools(false);
                        }}
                      >
                        {focusMode ? (
                          <Minimize2 size={16} />
                        ) : (
                          <Maximize2 size={16} />
                        )}
                      </button>
                      <div className="undo-controls">
                        <button
                          className="icon-button"
                          aria-label="Undo"
                          title="Undo (Ctrl+Z)"
                          disabled={!undo.current.length}
                          onClick={() => performHistory("undo")}
                        >
                          <Undo2 size={17} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Redo"
                          title="Redo (Ctrl+Shift+Z)"
                          disabled={!redo.current.length}
                          onClick={() => performHistory("redo")}
                        >
                          <Redo2 size={17} />
                        </button>
                      </div>
                      <button
                        className="button secondary small"
                        onClick={() =>
                          setEditor({
                            entry: null,
                            day: todayDay < 5 ? todayDay : 0,
                            start: 540,
                          })
                        }
                      >
                        <Plus size={15} />
                        Add activity
                      </button>
                    </div>
                  </div>
                  <div
                    className={`studio-layout ${tools ? "" : "tools-hidden"}`}
                  >
                    {tools && (
                      <div className="design-inspector">
                        <button
                          className="inspector-close icon-button"
                          aria-label="Close design tools"
                          onClick={() => setTools(false)}
                        >
                          <X size={17} />
                        </button>
                        <FitContent minWidth={264} maxWidth={264} align="start">
                          <DesignPanel
                            schedule={active}
                            onDesign={design}
                            onTheme={applyTheme}
                            selectedSticker={selectedSticker}
                            onSelectSticker={setSelectedSticker}
                            preferences={p}
                            onPreferences={pref}
                            notify={notify}
                          />
                        </FitContent>
                      </div>
                    )}
                    <section className="canvas-workspace">
                      <div className="canvas-toolbar">
                        <div className="week-navigation">
                          <button
                            className="icon-button"
                            aria-label={
                              view === "monthly"
                                ? "Previous month"
                                : "Previous week"
                            }
                            onClick={() =>
                              setWeek(
                                view === "monthly"
                                  ? addMonths(week, -1)
                                  : addWeeks(week, -1),
                              )
                            }
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span>
                            {view === "monthly"
                              ? format(week, "MMMM yyyy")
                              : `${format(weekStart, "MMM d")} – ${format(addDays(weekStart, 6), "d, yyyy")}`}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={
                              view === "monthly" ? "Next month" : "Next week"
                            }
                            onClick={() =>
                              setWeek(
                                view === "monthly"
                                  ? addMonths(week, 1)
                                  : addWeeks(week, 1),
                              )
                            }
                          >
                            <ChevronRight size={16} />
                          </button>
                          <button
                            className="today-button"
                            onClick={() => {
                              setWeek(new Date());
                              setDay(todayDay);
                            }}
                          >
                            Today
                          </button>
                        </div>

                        <label className="canvas-title-field">
                          <Pencil size={11} />
                          <input
                            aria-label="Planner title"
                            value={active.title}
                            onChange={(ev) =>
                              updateSchedule((s) => ({
                                ...s,
                                title: ev.target.value,
                              }))
                            }
                          />
                        </label>
                        <div className="view-controls">
                          {(
                            ["weekly", "daily", "monthly", "list"] as View[]
                          ).map((v) => (
                            <button
                              key={v}
                              className={view === v ? "active" : ""}
                              onClick={() => setView(v)}
                            >
                              {v === "weekly"
                                ? "Week"
                                : v === "daily"
                                  ? "Day"
                                  : v === "monthly"
                                    ? "Month"
                                    : "List"}
                            </button>
                          ))}
                        </div>
                        <button
                          className="icon-button tools-toggle"
                          aria-label={
                            tools ? "Hide design tools" : "Show design tools"
                          }
                          onClick={() => setTools(!tools)}
                        >
                          {tools ? (
                            <PanelLeftClose size={17} />
                          ) : (
                            <PanelLeftOpen size={17} />
                          )}
                        </button>
                      </div>
                      <div className="canvas-scroller">
                        <FitContent
                          minWidth={
                            view === "daily" ? 320 : view === "list" ? 640 : 720
                          }
                          maxWidth={view === "daily" ? 760 : 1600}
                          onScaleChange={setCanvasScale}
                          onSizeChange={handleCanvasSize}
                        >
                          <div className="canvas-inner" ref={canvasRef}>
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragStart={() => {
                                ignoreClick.current = Date.now() + 60000;
                              }}
                              onDragCancel={() => {
                                ignoreClick.current = Date.now() + 100;
                              }}
                              onDragEnd={dragEnd}
                            >
                              <ScheduleCanvas
                                {...canvasProps}
                                displayScale={canvasScale}
                                onChromeChange={handleCanvasChrome}
                              />
                            </DndContext>
                          </div>
                        </FitContent>
                      </div>
                      <div className="canvas-status">
                        <span>
                          <GripVertical size={12} />
                          Drag to move · pull the bottom edge to resize
                        </span>
                        <span>
                          {active.entries.length} activities <i />{" "}
                          {Number(totalHours.toFixed(1))} hours of possibility
                        </span>
                      </div>
                    </section>
                  </div>
                  <div className="studio-bottom">
                    <span>
                      <Heart size={13} /> A well-planned week leaves a little
                      room for magic.
                    </span>
                    <button onClick={() => navigate("templates")}>
                      Find a fresh look <ArrowRight size={14} />
                    </button>
                  </div>
                  {conflicts(active.entries).length > 0 && (
                    <div className="notice warning overlap-notice">
                      <AlertTriangle size={15} />
                      {conflicts(active.entries).length} activities overlap.
                      They appear side by side; click an activity to adjust its
                      time.
                    </div>
                  )}
                </>
              )}
              {page === "dashboard" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">
                        {format(now, "EEEE, MMMM d, yyyy")} ·{" "}
                        {format(now, p.time24 ? "HH:mm" : "h:mm a")}
                      </div>
                      <h1>
                        A lovely day to begin, {p.name}
                        <span className="title-heart">♡</span>
                      </h1>
                      <p>Take a breath. Your little world is right here.</p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        setNewName("");
                        setNewModal(true);
                      }}
                    >
                      <Plus size={16} />
                      Create a schedule
                    </button>
                  </div>
                  <div className="welcome-banner">
                    <div>
                      <span className="eyebrow">YOUR PACE IS A GOOD PACE</span>
                      <h2>
                        Little plans.
                        <br />
                        Lovely possibilities.
                      </h2>
                      <p>A little organization makes room for a lot of life.</p>
                      <button
                        className="button primary"
                        onClick={() => chooseSchedule(active.id)}
                      >
                        Open my planner
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <Mochi flower />
                    <Flower className="banner-flower" />
                    <span className="banner-theme-emoji" aria-hidden="true">
                      {getTheme(p.theme).emoji}
                    </span>
                  </div>
                  <div className="stat-row">
                    <div>
                      <CalendarDays />
                      <span>
                        <strong>{data.schedules.length}</strong>little planners
                      </span>
                    </div>
                    <div>
                      <BookOpen />
                      <span>
                        <strong>{todayEntries.length}</strong>activities today
                      </span>
                    </div>
                    <div>
                      <ListTodo />
                      <span>
                        <strong>{dueTasks.length}</strong>things to do
                      </span>
                    </div>
                    <div>
                      <Heart />
                      <span>
                        <strong>
                          {data.tasks.filter((t) => t.done).length}
                        </strong>
                        little wins
                      </span>
                    </div>
                  </div>
                  <div className="dashboard-columns">
                    <section className="content-card">
                      <div className="card-heading">
                        <h2>
                          Today’s little rhythm<span>☀️</span>
                        </h2>
                        <button
                          className="text-button"
                          onClick={() => {
                            setDay(todayDay);
                            setView("daily");
                            setPage("studio");
                          }}
                        >
                          View day
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                      <p className="muted">
                        {format(now, "EEEE, MMMM d")} · {active.name}
                      </p>
                      {todayEntries.length ? (
                        todayEntries.map((e) => (
                          <button
                            className="agenda-item"
                            key={e.id}
                            onClick={() => {
                              setEditor({
                                entry: e,
                                day: e.day,
                                start: e.start,
                              });
                            }}
                          >
                            <span className="agenda-time">
                              {formatTime(e.start, p.time24)}
                            </span>
                            <i style={{ background: e.color }} />
                            <span>
                              <strong>{e.title}</strong>
                              <small>
                                {e.location || "A little time for you"}
                              </small>
                            </span>
                            <ArrowUpRight size={15} />
                          </button>
                        ))
                      ) : (
                        <div className="empty-state compact">
                          <Coffee size={34} />
                          <h3>A little breathing room.</h3>
                          <p>No activities today. Enjoy a softer pace.</p>
                          <button
                            className="button secondary"
                            onClick={() =>
                              setEditor({
                                entry: null,
                                day: todayDay,
                                start: 540,
                              })
                            }
                          >
                            <Plus size={15} />
                            Add a little plan
                          </button>
                        </div>
                      )}
                    </section>
                    <section className="content-card">
                      <div className="card-heading">
                        <h2>A few little to-dos</h2>
                        <button
                          className="icon-button"
                          onClick={addTask}
                          aria-label="Add task"
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                      {dueTasks.slice(0, 4).map((t) => (
                        <div className="compact-task" key={t.id}>
                          <button
                            className="task-check"
                            onClick={() => toggleTask(t.id)}
                            aria-label={`Complete ${t.title}`}
                          >
                            <Circle size={19} />
                          </button>
                          <button onClick={() => editTask(t)}>
                            <strong>{t.title}</strong>
                            <small>
                              {t.subject}{" "}
                              {t.due && `· ${format(parseISO(t.due), "MMM d")}`}
                            </small>
                          </button>
                          <span className={`priority-dot ${t.priority}`} />
                        </div>
                      ))}
                      {!dueTasks.length && (
                        <div className="empty-state compact">
                          <CheckCircle2 size={32} />
                          <p>All caught up. That deserves a little treat.</p>
                        </div>
                      )}
                      <button
                        className="text-button"
                        onClick={() => navigate("tasks")}
                      >
                        See all my to-dos
                        <ArrowRight size={14} />
                      </button>
                    </section>
                  </div>
                  <div className="section-heading">
                    <h2>Coming up in your little world</h2>
                    <span>from {active.name}</span>
                  </div>
                  <div className="upcoming-grid">
                    {upcoming.map((e) => (
                      <button
                        className="upcoming-card"
                        key={e.id}
                        style={{ background: e.color }}
                        onClick={() => {
                          setPage("studio");
                          setEditor({ entry: e, day: e.day, start: e.start });
                        }}
                      >
                        <span>
                          {e.offset === 0
                            ? "Today"
                            : e.offset === 1
                              ? "Tomorrow"
                              : dayNames[e.day]}{" "}
                          · {formatTime(e.start, p.time24)}
                        </span>
                        <h3>{e.title}</h3>
                        <p>
                          <MapPin size={13} />
                          {e.location || "Your happy place"}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {page === "schedules" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">A PLACE FOR ALL YOUR PLANS</div>
                      <h1>
                        My little collection
                        <span className="title-heart">♡</span>
                      </h1>
                      <p>
                        A fresh semester, a busy week, or a routine that feels
                        like you.
                      </p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        setNewName("");
                        setNewModal(true);
                      }}
                    >
                      <Plus size={16} />
                      New schedule
                    </button>
                  </div>
                  <div className="collection-toolbar">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search schedules"
                        placeholder="Find a little plan…"
                        value={query}
                        onChange={(ev) => setQuery(ev.target.value)}
                      />
                    </label>
                    <span className="muted">
                      {data.schedules.length} saved on this device
                    </span>
                  </div>
                  <div
                    className="schedule-gallery"
                    ref={setGalleryElement}
                    style={
                      {
                        "--gallery-columns": galleryGrid.columns,
                        "--gallery-rows": galleryGrid.rows,
                      } as React.CSSProperties
                    }
                  >
                    {gallerySchedules.map((s) => (
                      <article className="schedule-card" key={s.id}>
                        <button
                          className="schedule-card-preview"
                          onClick={() => chooseSchedule(s.id)}
                        >
                          <TemplatePreview
                            template={{
                              id: s.id,
                              name: s.title,
                              theme: s.design.theme,
                              pattern: s.design.pattern,
                              font: s.design.font,
                              emoji: getTheme(s.design.theme).emoji,
                              category: s.type,
                              subtitle: s.design.subtitle,
                            }}
                          />
                        </button>
                        <div className="schedule-card-info">
                          <button onClick={() => chooseSchedule(s.id)}>
                            <h3>{s.name}</h3>
                            <p>
                              {s.type} · {s.entries.length} activities
                            </p>
                            <small>
                              Edited {format(s.updatedAt, "MMM d, h:mm a")}
                            </small>
                          </button>
                          <div>
                            <button
                              className="icon-button"
                              aria-label={`Rename ${s.name}`}
                              onClick={() => {
                                setRenameValue(s.name);
                                setRenameId(s.id);
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Duplicate ${s.name}`}
                              onClick={() => duplicateSchedule(s)}
                            >
                              <Copy size={15} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={`Delete ${s.name}`}
                              onClick={() => setDeleteId(s.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!filteredSchedules.length && (
                      <button
                        className="new-planner-card"
                        onClick={() => {
                          setNewName("");
                          setNewModal(true);
                        }}
                      >
                        <span>
                          <Plus size={25} />
                        </span>
                        <h3>
                          {query ? "A fresh plan?" : "A little fresh start"}
                        </h3>
                        {query && <p>No schedules match “{query}”.</p>}
                        <p>Create something lovely.</p>
                      </button>
                    )}
                  </div>
                  <nav className="collection-pager" aria-label="Schedule pages">
                    <span>
                      {filteredSchedules.length
                        ? `${currentGalleryPage * galleryCapacity + 1}–${Math.min((currentGalleryPage + 1) * galleryCapacity, filteredSchedules.length)} of ${filteredSchedules.length} schedules`
                        : "No matching schedules"}
                    </span>
                    <div>
                      <button
                        className="button secondary small"
                        aria-label="Previous schedule page"
                        disabled={currentGalleryPage === 0}
                        onClick={() => setGalleryPage(currentGalleryPage - 1)}
                      >
                        <ChevronLeft size={14} />
                        Previous
                      </button>
                      <span aria-live="polite">
                        Page {currentGalleryPage + 1} of {galleryPageCount}
                      </span>
                      <button
                        className="button secondary small"
                        aria-label="Next schedule page"
                        disabled={currentGalleryPage + 1 === galleryPageCount}
                        onClick={() => setGalleryPage(currentGalleryPage + 1)}
                      >
                        Next
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </nav>
                </>
              )}
              {page === "templates" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">PICK A LITTLE INSPIRATION</div>
                      <h1>
                        The template garden
                        <span className="title-heart">✿</span>
                      </h1>
                      <p>
                        Thoughtfully made, ready to grow into something that’s
                        yours.
                      </p>
                    </div>
                    <span className="template-count">
                      {templates.length} little ways to plan
                    </span>
                  </div>
                  <div className="template-toolbar">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search templates"
                        placeholder="Find your kind of lovely…"
                        value={query}
                        onChange={(ev) => setQuery(ev.target.value)}
                      />
                    </label>
                    <button
                      className={`button secondary ${favoritesOnly ? "selected" : ""}`}
                      onClick={() => setFavoritesOnly(!favoritesOnly)}
                    >
                      <Heart
                        size={15}
                        fill={favoritesOnly ? "currentColor" : "none"}
                      />
                      My favorites
                    </button>
                  </div>
                  <div className="filter-pills">
                    {[
                      "All templates",
                      ...Array.from(new Set(templates.map((t) => t.category))),
                    ].map((c) => (
                      <button
                        className={templateFilter === c ? "active" : ""}
                        key={c}
                        onClick={() => setTemplateFilter(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="template-gallery">
                    {visibleTemplates.map((t) => (
                      <article className="template-card" key={t.id}>
                        <button
                          className="template-preview-button"
                          onClick={() => setTemplatePreview(t)}
                          aria-label={`Preview ${t.name}`}
                        >
                          <TemplatePreview template={t} />
                          <span className="template-hover">
                            Take a little look
                            <ArrowUpRight size={15} />
                          </span>
                        </button>
                        <div className="template-card-info">
                          <button onClick={() => setTemplatePreview(t)}>
                            <h3>{t.name}</h3>
                            <p>{t.category}</p>
                          </button>
                          <button
                            className={`icon-button ${p.favorites.includes(t.id) ? "favorited" : ""}`}
                            aria-label={`${p.favorites.includes(t.id) ? "Unfavorite" : "Favorite"} ${t.name}`}
                            onClick={() =>
                              pref({
                                favorites: p.favorites.includes(t.id)
                                  ? p.favorites.filter((id) => id !== t.id)
                                  : [...p.favorites, t.id],
                              })
                            }
                          >
                            <Heart
                              size={17}
                              fill={
                                p.favorites.includes(t.id)
                                  ? "currentColor"
                                  : "none"
                              }
                            />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                  {!visibleTemplates.length && (
                    <div className="empty-state">
                      <Flower2 size={34} />
                      <h3>Nothing growing here just yet.</h3>
                      <p>
                        Try a different search or favorite a little inspiration.
                      </p>
                    </div>
                  )}
                </>
              )}
              {page === "tasks" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">ONE LITTLE THING AT A TIME</div>
                      <h1>
                        Small steps, lovely progress
                        <span className="title-heart">♡</span>
                      </h1>
                      <p>
                        You don’t have to do it all. Just the next little thing.
                      </p>
                    </div>
                    <button className="button primary" onClick={addTask}>
                      <Plus size={16} />
                      Add a to-do
                    </button>
                  </div>
                  <div className="task-progress">
                    <div>
                      <span>
                        {data.tasks.filter((t) => t.done).length} of{" "}
                        {data.tasks.length} little wins
                      </span>
                      <strong>
                        {data.tasks.length
                          ? Math.round(
                              (data.tasks.filter((t) => t.done).length /
                                data.tasks.length) *
                                100,
                            )
                          : 0}
                        %
                      </strong>
                    </div>
                    <div className="progress-track">
                      <i
                        style={{
                          width: `${data.tasks.length ? (data.tasks.filter((t) => t.done).length / data.tasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <small>Every checked box is a little celebration.</small>
                  </div>
                  <div className="filter-pills">
                    {[
                      { id: "all", label: "All my to-dos" },
                      { id: "pending", label: "A little to do" },
                      { id: "done", label: "Little wins" },
                      { id: "overdue", label: "Needs a little love" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        className={taskFilter === f.id ? "active" : ""}
                        onClick={() => setTaskFilter(f.id)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="task-list content-card">
                    {data.tasks
                      .filter(
                        (t) =>
                          taskFilter === "all" ||
                          (taskFilter === "pending" && !t.done) ||
                          (taskFilter === "done" && t.done) ||
                          (taskFilter === "overdue" &&
                            !t.done &&
                            t.due &&
                            t.due < format(now, "yyyy-MM-dd")),
                      )
                      .sort(
                        (a, b) =>
                          Number(a.done) - Number(b.done) ||
                          (a.due || "9999").localeCompare(b.due || "9999"),
                      )
                      .map((t) => (
                        <div
                          className={`task-row ${t.done ? "completed" : ""}`}
                          key={t.id}
                        >
                          <button
                            className="task-check"
                            aria-label={`${t.done ? "Uncomplete" : "Complete"} ${t.title}`}
                            onClick={() => toggleTask(t.id)}
                          >
                            {t.done ? (
                              <CheckCircle2 size={22} />
                            ) : (
                              <Circle size={22} />
                            )}
                          </button>
                          <button
                            className="task-details"
                            onClick={() => editTask(t)}
                          >
                            <strong>{t.title}</strong>
                            <small>
                              {t.subject || "A little personal task"}
                              {t.due &&
                                ` · ${format(parseISO(t.due), "MMM d, yyyy")}`}
                            </small>
                          </button>
                          <span className={`priority-badge ${t.priority}`}>
                            {t.priority}
                          </span>
                          <button
                            className="icon-button"
                            aria-label={`Edit ${t.title}`}
                            onClick={() => editTask(t)}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label={`Delete ${t.title}`}
                            onClick={() =>
                              setData((old) =>
                                old
                                  ? {
                                      ...old,
                                      tasks: old.tasks.filter(
                                        (v) => v.id !== t.id,
                                      ),
                                    }
                                  : old,
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    {!data.tasks.length && (
                      <div className="empty-state">
                        <ListTodo size={34} />
                        <h3>A fresh little list.</h3>
                        <p>
                          Add your first task and take it one step at a time.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
              {page === "settings" && (
                <>
                  <div className="page-title">
                    <div>
                      <div className="eyebrow">YOUR CORNER, YOUR WAY</div>
                      <h1>
                        All the little preferences
                        <span className="title-heart">✧</span>
                      </h1>
                      <p>Make yourself at home.</p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="content-card">
                      <h2>A little about you</h2>
                      <label className="field-label">
                        What should we call you?
                        <input
                          value={p.name}
                          maxLength={40}
                          onChange={(ev) => pref({ name: ev.target.value })}
                        />
                      </label>
                      <fieldset className="field-label">
                        <legend>Choose a little companion</legend>
                        <div className="avatar-picker">
                          {[
                            "🌷",
                            "🍓",
                            "🐰",
                            "🐱",
                            "🧸",
                            "🍵",
                            "🌙",
                            "🌼",
                            "🦋",
                            "☁️",
                          ].map((emoji) => (
                            <button
                              className={p.avatar === emoji ? "selected" : ""}
                              key={emoji}
                              onClick={() => pref({ avatar: emoji })}
                              aria-label={`Choose ${emoji} avatar`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <label className="field-label">
                        Your workspace palette
                        <select
                          value={p.theme}
                          onChange={(ev) => pref({ theme: ev.target.value })}
                        >
                          {themes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.emoji} {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="toggle-row">
                        A cozier dark mode
                        <input
                          type="checkbox"
                          checked={p.dark}
                          onChange={(ev) => pref({ dark: ev.target.checked })}
                        />
                      </label>
                    </section>
                    <section className="content-card">
                      <h2>Plan at your pace</h2>
                      <label className="field-label">
                        My week begins on
                        <select
                          value={p.weekStart}
                          onChange={(ev) =>
                            pref({
                              weekStart: ev.target
                                .value as Preferences["weekStart"],
                            })
                          }
                        >
                          <option value="monday">Monday</option>
                          <option value="sunday">Sunday</option>
                        </select>
                      </label>
                      <label className="toggle-row">
                        Use 24-hour time
                        <input
                          type="checkbox"
                          checked={p.time24}
                          onChange={(ev) => pref({ time24: ev.target.checked })}
                        />
                      </label>
                      <div className="panel-divider" />
                      <h2>A gentle nudge</h2>
                      <p className="settings-description">
                        Optional reminders for upcoming activities. Reminders
                        work while MochiPlan is open. Browsers may pause them in
                        the background; iOS requires an installed web app for
                        notifications.
                      </p>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          if (p.reminders) {
                            pref({ reminders: false });
                            return;
                          }
                          if (!("Notification" in window)) {
                            notify(
                              "This browser doesn’t support notifications. You can still see everything in Overview.",
                            );
                            return;
                          }
                          try {
                            const result =
                              await Notification.requestPermission();
                            pref({ reminders: result === "granted" });
                            notify(
                              result === "granted"
                                ? "Gentle reminders are on. Keep MochiPlan open for your nudges."
                                : "Notifications are off. You can change this in your browser’s site settings.",
                            );
                          } catch {
                            notify(
                              "Notifications aren’t available in this browser.",
                            );
                          }
                        }}
                      >
                        <Bell size={15} />
                        {p.reminders
                          ? "Turn off reminders"
                          : "Enable gentle reminders"}
                      </button>
                      <label className="field-label">
                        Remind me before
                        <select
                          value={p.reminderMinutes}
                          onChange={(ev) =>
                            pref({ reminderMinutes: Number(ev.target.value) })
                          }
                        >
                          {[0, 5, 10, 15, 30].map((n) => (
                            <option key={n} value={n}>
                              {n === 0 ? "At the start" : `${n} minutes before`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="text-button"
                        onClick={async () => {
                          if (
                            !("Notification" in window) ||
                            Notification.permission !== "granted"
                          ) {
                            notify("Enable gentle reminders first.");
                            return;
                          }
                          const count = active.entries.filter(
                            (e) => e.day === todayDay,
                          ).length;
                          const reg = await navigator.serviceWorker.ready;
                          await reg.showNotification(
                            "Your little day at a glance",
                            {
                              body: `${count} ${count === 1 ? "activity" : "activities"} in ${active.name}. One little thing at a time.`,
                              icon: "/icon-192.png",
                            },
                          );
                        }}
                      >
                        Send today’s little overview
                        <ArrowUpRight size={14} />
                      </button>
                    </section>
                    <section className="content-card">
                      <h2>Your plans, safe & cozy</h2>
                      <p className="settings-description">
                        Your schedules live in this browser’s IndexedDB storage.
                        Keep a backup before clearing browser data or moving to
                        another device.
                      </p>
                      <button
                        className="button secondary full-width"
                        onClick={() => downloadJSON(data)}
                      >
                        <Download size={16} />
                        Download a full backup
                      </button>
                      <button
                        className="button secondary full-width"
                        onClick={() => backupInput.current?.click()}
                      >
                        <Share2 size={16} />
                        Restore a backup
                      </button>
                      <input
                        ref={backupInput}
                        hidden
                        type="file"
                        accept="application/json,.json"
                        onChange={async (ev) => {
                          const file = ev.target.files?.[0];
                          if (!file) return;
                          try {
                            if (file.size > 20 * 1024 * 1024)
                              throw Error(
                                "Choose a backup smaller than 20 MB.",
                              );
                            const imported = validateBackup(
                              JSON.parse(await file.text()),
                            );
                            setBackupConfirm(imported);
                          } catch (e) {
                            notify(
                              e instanceof Error
                                ? e.message
                                : "That backup could not be read.",
                            );
                          }
                          ev.target.value = "";
                        }}
                      />
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            const persistent =
                              await navigator.storage?.persist();
                            notify(
                              persistent
                                ? "Your browser has granted persistent storage."
                                : "Your browser manages storage automatically. Keep a backup for peace of mind.",
                            );
                          } catch {
                            notify(
                              "Persistent storage is managed by your browser.",
                            );
                          }
                        }}
                      >
                        Ask browser to keep my plans
                        <ArrowUpRight size={14} />
                      </button>
                      <span className="storage-status">
                        <Cloud size={14} />
                        {saved}
                      </span>
                    </section>
                    <section className="content-card">
                      <h2>A little server backup</h2>
                      <p className="settings-description">
                        Save an extra copy of your planners, tasks, and
                        preferences to your MochiPlan server. Your offline
                        workspace stays on this device. Server backups are
                        available to this browser while its site data is kept.
                      </p>
                      <button
                        className="button secondary full-width"
                        disabled={serverBackupBusy}
                        onClick={async () => {
                          setServerBackupBusy(true);
                          try {
                            await saveServerBackup(data);
                            notify("Server backup saved.");
                          } catch (error) {
                            notify(
                              error instanceof Error
                                ? error.message
                                : "The server backup could not be saved.",
                            );
                          } finally {
                            setServerBackupBusy(false);
                          }
                        }}
                      >
                        {serverBackupBusy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Cloud size={16} />
                        )}
                        Save a server backup
                      </button>
                      <button
                        className="button secondary full-width"
                        disabled={serverBackupBusy}
                        onClick={async () => {
                          setServerBackupBusy(true);
                          try {
                            setBackupConfirm(await loadServerBackup());
                          } catch (error) {
                            notify(
                              error instanceof Error
                                ? error.message
                                : "The server backup could not be read.",
                            );
                          } finally {
                            setServerBackupBusy(false);
                          }
                        }}
                      >
                        <Share2 size={16} />
                        Restore from server
                      </button>
                    </section>
                    <section className="content-card install-card">
                      <Mochi flower />
                      <h2>A little home on your homescreen</h2>
                      <p className="settings-description">
                        Install MochiPlan to keep your plans close. After your
                        first online visit, your workspace, designs, and exports
                        work offline.
                      </p>
                      <button className="button primary" onClick={installApp}>
                        <MonitorDown size={16} />
                        Install MochiPlan
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setWelcome(true)}
                      >
                        Show me around
                        <ArrowRight size={14} />
                      </button>
                      <small>
                        MochiPlan 1.0 · Made for your own little rhythm
                      </small>
                    </section>
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="app-footer">
          <span>Made for your own little rhythm.</span>
          <span>
            no rush, just a little mochi magic <Sparkles size={11} />
          </span>
        </footer>
      </main>
      <nav className="bottom-nav">
        {[
          { id: "dashboard", label: "Home", icon: LayoutDashboard },
          { id: "studio", label: "Planner", icon: CalendarDays },
          { id: "templates", label: "Templates", icon: LayoutTemplate },
          { id: "tasks", label: "To-dos", icon: ListTodo },
        ].map((n) => (
          <button
            key={n.id}
            className={page === n.id ? "active" : ""}
            onClick={() => navigate(n.id as Page)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
      {newModal && (
        <Modal
          title="A fresh little beginning"
          subtitle="Every lovely plan starts with a blank page."
          onClose={() => setNewModal(false)}
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              createPlanner();
            }}
          >
            <label className="field-label">
              Give your planner a name
              <input
                required
                maxLength={80}
                placeholder="e.g. My fall semester"
                value={newName}
                onChange={(ev) => setNewName(ev.target.value)}
              />
            </label>
            <label className="field-label">
              What are we planning?
              <select
                value={newType}
                onChange={(ev) => setNewType(ev.target.value)}
              >
                {scheduleTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <fieldset className="field-label">
              <legend>A starting palette</legend>
              <div className="new-theme-grid">
                {themes.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={newTheme === t.id ? "selected" : ""}
                    onClick={() => setNewTheme(t.id)}
                    style={{ background: t.bg, color: t.color }}
                  >
                    <span>{t.emoji}</span>
                    {t.name}
                    {newTheme === t.id && <Check size={13} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setNewModal(false)}
              >
                Maybe later
              </button>
              <button type="submit" className="button primary">
                <Plus size={16} />
                Create my planner
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editor && (
        <EntryForm
          schedule={active}
          entry={editor.entry}
          initialDay={editor.day}
          initialStart={editor.start}
          onSave={(entries) => {
            updateSchedule((s) => ({
              ...s,
              entries: editor.entry
                ? s.entries.map((e) =>
                    e.id === editor.entry!.id ? entries[0] : e,
                  )
                : [...s.entries, ...entries],
            }));
            setEditor(null);
            notify(
              editor.entry
                ? "Your little changes are saved."
                : "A little plan added to your week.",
            );
          }}
          onDelete={(id) => setDeleteEntry(id)}
          onDuplicate={(e) => {
            updateSchedule((s) => ({
              ...s,
              entries: [
                ...s.entries,
                { ...e, id: uid(), title: `${e.title} (copy)` },
              ],
            }));
            setEditor(null);
            notify(
              "Activity duplicated. Adjust its day or time to make it yours.",
            );
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {renameId && (
        <Modal title="A new little name" onClose={() => setRenameId(null)}>
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!renameValue.trim()) return;
              changeSchedules((list) =>
                list.map((s) =>
                  s.id === renameId
                    ? { ...s, name: renameValue.trim(), updatedAt: Date.now() }
                    : s,
                ),
              );
              setRenameId(null);
            }}
          >
            <label className="field-label">
              Planner name
              <input
                required
                maxLength={80}
                value={renameValue}
                onChange={(ev) => setRenameValue(ev.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRenameId(null)}
              >
                Cancel
              </button>
              <button type="submit" className="button primary">
                <Check size={15} />
                Save name
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleteEntry && (
        <Modal
          title="Let this little activity go?"
          subtitle="You can bring it back with Undo."
          onClose={() => setDeleteEntry(null)}
        >
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteEntry(null)}
            >
              Keep it
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                updateSchedule((s) => ({
                  ...s,
                  entries: s.entries.filter((e) => e.id !== deleteEntry),
                }));
                setDeleteEntry(null);
                setEditor(null);
              }}
            >
              Delete activity
            </button>
          </div>
        </Modal>
      )}
      {deleteId && (
        <Modal
          title="Let this little planner go?"
          subtitle="Its activities and design will be removed. You can bring it back with Undo."
          onClose={() => setDeleteId(null)}
        >
          <p className="delete-name">
            {data.schedules.find((s) => s.id === deleteId)?.name}
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setDeleteId(null)}
            >
              Keep my planner
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                if (data.schedules.length === 1) {
                  const fresh = makeSchedule("My little planner");
                  changeSchedules(() => [fresh]);
                  setData((old) =>
                    old ? { ...old, activeId: fresh.id } : old,
                  );
                } else {
                  const remaining = data.schedules.filter(
                    (s) => s.id !== deleteId,
                  );
                  changeSchedules(() => remaining);
                  if (data.activeId === deleteId)
                    setData((old) =>
                      old ? { ...old, activeId: remaining[0].id } : old,
                    );
                }
                setDeleteId(null);
                notify(
                  "Planner removed. Undo is here if you change your mind.",
                );
              }}
            >
              Delete planner
            </button>
          </div>
        </Modal>
      )}
      {exportOpen && (
        <ExportModal
          schedule={active}
          preferences={p}
          week={week}
          view={view}
          day={day}
          canvasWidth={canvasRef.current?.offsetWidth || 900}
          hourHeight={canvasHourHeight}
          onClose={() => setExportOpen(false)}
          notify={notify}
        />
      )}
      {templatePreview && (
        <Modal
          title={templatePreview.name}
          subtitle="A little inspiration for your current planner."
          onClose={() => setTemplatePreview(null)}
          wide
        >
          <div className="template-modal-preview">
            <TemplatePreview template={templatePreview} large />
          </div>
          <p className="muted">
            The design will be applied to “{active.name}”. Your activities stay
            in place, with colors matched to the new palette. You can customize
            every detail in the studio.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setTemplatePreview(null)}
            >
              Keep browsing
            </button>
            <button
              className="button primary"
              onClick={() => applyTemplate(templatePreview)}
            >
              <Sparkles size={16} />
              Make it mine
            </button>
          </div>
        </Modal>
      )}
      {taskModal && (
        <Modal
          title={taskEdit ? "A little task edit" : "One little thing to do"}
          subtitle="Small steps count, too."
          onClose={() => setTaskModal(false)}
        >
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const task: Task = {
                id: taskEdit?.id || uid(),
                title: taskTitle.trim(),
                subject: taskSubject,
                due: taskDue,
                priority: taskPriority,
                done: taskEdit?.done || false,
              };
              if (!task.title) return;
              setData((old) =>
                old
                  ? {
                      ...old,
                      tasks: taskEdit
                        ? old.tasks.map((t) =>
                            t.id === taskEdit.id ? task : t,
                          )
                        : [...old.tasks, task],
                    }
                  : old,
              );
              setTaskModal(false);
              notify("A little to-do, all tucked in.");
            }}
          >
            <label className="field-label">
              What’s on your mind?
              <input
                required
                maxLength={160}
                value={taskTitle}
                onChange={(ev) => setTaskTitle(ev.target.value)}
                placeholder="Finish my moodboard"
              />
            </label>
            <label className="field-label">
              Subject or activity
              <input
                list="subjects"
                value={taskSubject}
                onChange={(ev) => setTaskSubject(ev.target.value)}
                placeholder="Optional"
              />
              <datalist id="subjects">
                {Array.from(
                  new Set(
                    data.schedules.flatMap((s) =>
                      s.entries.map((e) => e.title),
                    ),
                  ),
                ).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </label>
            <div className="two-fields">
              <label className="field-label">
                A little deadline
                <input
                  type="date"
                  value={taskDue}
                  onChange={(ev) => setTaskDue(ev.target.value)}
                />
              </label>
              <label className="field-label">
                Priority
                <select
                  value={taskPriority}
                  onChange={(ev) =>
                    setTaskPriority(ev.target.value as Task["priority"])
                  }
                >
                  <option value="low">Low · whenever you can</option>
                  <option value="medium">Medium · a gentle focus</option>
                  <option value="high">High · first things first</option>
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setTaskModal(false)}
              >
                Cancel
              </button>
              <button className="button primary" type="submit">
                <Check size={16} />
                {taskEdit ? "Save changes" : "Add my to-do"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {installHelp && (
        <Modal
          title="A little home for MochiPlan"
          onClose={() => setInstallHelp(false)}
        >
          <div className="install-instructions">
            <p>
              <strong>iPhone & iPad</strong>Open in Safari, tap Share, then “Add
              to Home Screen”.
            </p>
            <p>
              <strong>Android</strong>Open the browser menu and choose “Install
              app” or “Add to Home screen”.
            </p>
            <p>
              <strong>Desktop</strong>In Chrome or Edge, use the install icon in
              the address bar, or “Install MochiPlan” in the browser menu.
            </p>
            <p className="muted">
              Installation availability depends on your browser. Visit once
              online to cache the app before heading offline.
            </p>
          </div>
          <button
            className="button primary full-width"
            onClick={() => setInstallHelp(false)}
          >
            Sounds lovely
          </button>
        </Modal>
      )}
      {welcome && (
        <Modal
          title="Welcome to your little happy place"
          subtitle="A little plan, a lovely day."
          onClose={() => {
            setWelcome(false);
            pref({ onboarded: true });
          }}
        >
          <div className="welcome-modal">
            <Mochi flower />
            <label className="field-label">
              What should we call you?
              <input
                value={p.name === "friend" ? "" : p.name}
                onChange={(ev) => pref({ name: ev.target.value || "friend" })}
                placeholder="Your name"
              />
            </label>
            <div className="quick-start">
              <p>
                <span>01</span>
                <strong>Plan your little rhythm</strong>Add activities, drag
                them to a new day, and pull their bottom edge to adjust the
                time.
              </p>
              <p>
                <span>02</span>
                <strong>Sprinkle a little you</strong>Pick a palette, add a
                sticker, or explore the template garden.
              </p>
              <p>
                <span>03</span>
                <strong>Keep your lovely plans close</strong>Export a wallpaper
                or install the app for a little offline magic.
              </p>
            </div>
            <button
              className="button primary full-width"
              onClick={() => {
                setWelcome(false);
                pref({ onboarded: true });
              }}
            >
              Let’s make a little plan
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
      {backupConfirm && (
        <Modal
          title="Bring back your little workspace?"
          subtitle="This replaces the plans and tasks currently on this device."
          onClose={() => setBackupConfirm(null)}
        >
          <p>
            {backupConfirm.schedules.length} planners and{" "}
            {backupConfirm.tasks.length} tasks are ready to come home.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => downloadJSON(data)}
            >
              <Download size={15} />
              Back up current plans
            </button>
            <button
              className="button primary"
              onClick={() => {
                undo.current = [];
                redo.current = [];
                setData(backupConfirm);
                setBackupConfirm(null);
                setPage("studio");
                notify("Your little workspace is back home.");
              }}
            >
              Restore my workspace
            </button>
          </div>
        </Modal>
      )}
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <CheckCircle2 size={18} />
            <span>{toast}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="print-only">
        <ScheduleCanvas {...canvasProps} interactive={false} />
      </div>
    </div>
  );
}
