import { useCallback, useEffect, useRef, useState } from "react";
import { addDays, addMonths, format, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { ScheduleCanvas } from "../components/ScheduleCanvas";
import { FitContent } from "../components/FitContent";
import { plannerLayout } from "../plannerSize";
import { Mochi } from "../components/Artwork";
import { dateKey, initialCalendarDate, weekdayForDate } from "../calendar";
import type { Preferences, View } from "../model";
import {
  readSharedPlanner,
  type SharedPlanner,
} from "../services/plannerShares";

const noChange = () => {};
const viewerPreferences: Preferences = {
  name: "",
  avatar: "",
  theme: "strawberry",
  dark: false,
  weekStart: "monday",
  time24: false,
  favorites: [],
  favoriteThemes: [],
  reminders: false,
  reminderMinutes: 10,
  onboarded: true,
};
export default function SharedPlannerPage() {
  const [token, setToken] = useState(() => location.hash.slice(1));
  const [planner, setPlanner] = useState<SharedPlanner | null>(null);
  const [locked, setLocked] = useState(false),
    [busy, setBusy] = useState(true);
  const [error, setError] = useState(""),
    [password, setPassword] = useState("");
  const [view, setView] = useState<View>(() =>
    matchMedia("(max-width: 600px)").matches ? "daily" : "weekly",
  );
  const [focus, setFocus] = useState(new Date());
  const access = useRef<string | undefined>(undefined),
    mounted = useRef(true),
    initialized = useRef(false),
    serial = useRef(0);
  const load = useCallback(
    async (passwordValue?: string) => {
      const requestId = ++serial.current;
      setBusy(true);
      setError("");
      try {
        const result = await readSharedPlanner(
          token,
          access.current,
          passwordValue,
        );
        if (!mounted.current || requestId !== serial.current) return;
        if ("passwordRequired" in result) {
          setPlanner(null);
          setLocked(true);
          access.current = undefined;
        } else {
          if (result.accessToken) access.current = result.accessToken;
          if (!initialized.current) {
            setFocus(
              parseISO(
                initialCalendarDate(result.schedule, dateKey(new Date())),
              ),
            );
            initialized.current = true;
          }
          setPlanner(result);
          setLocked(false);
          setPassword("");
        }
      } catch (failure) {
        if (mounted.current && requestId === serial.current) {
          setPlanner(null);
          setError((failure as Error).message);
        }
      } finally {
        if (mounted.current && requestId === serial.current) setBusy(false);
      }
    },
    [token],
  );
  useEffect(() => {
    mounted.current = true;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    document.head.append(meta);
    const changed = () => setToken(location.hash.slice(1));
    window.addEventListener("hashchange", changed);
    return () => {
      mounted.current = false;
      serial.current++;
      meta.remove();
      window.removeEventListener("hashchange", changed);
    };
  }, []);
  useEffect(() => {
    access.current = undefined;
    initialized.current = false;
    setPlanner(null);
    setLocked(false);
    setPassword("");
    void load();
  }, [load]);
  useEffect(() => {
    if (!planner) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const check = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", check);
    const expiration = planner.expiresAt
      ? setTimeout(
          () => {
            void load();
          },
          Math.max(
            0,
            Math.min(
              2147483647,
              Date.parse(planner.expiresAt) - Date.parse(planner.checkedAt),
            ),
          ),
        )
      : undefined;
    return () => {
      clearInterval(timer);
      clearTimeout(expiration);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [planner, load]);
  useEffect(() => {
    document.title = planner
      ? `${planner.schedule.name} · MochiPlan`
      : "Shared planner · MochiPlan";
  }, [planner]);
  const preferences = planner
    ? { ...viewerPreferences, ...planner.preferences }
    : null;
  function move(direction: number) {
    setFocus((value) =>
      view === "monthly"
        ? addMonths(value, direction)
        : addDays(value, direction * (view === "daily" ? 1 : 7)),
    );
  }
  return (
    <main className="shared-page">
      <header className="shared-header">
        <a href="/" className="shared-brand">
          <Mochi />
          <span>
            Mochi<span>Plan</span>
          </span>
        </a>
        <span className="shared-readonly-badge">
          <ShieldCheck size={16} />
          Read-only planner
        </span>
        <a href="/" className="button secondary">
          Open MochiPlan
        </a>
      </header>
      {!planner || !preferences ? (
        <section className="shared-gate" aria-label="Shared planner access">
          <div className="shared-gate-art">
            {locked ? <LockKeyhole size={34} /> : <Heart size={34} />}
          </div>
          <h1>
            {locked
              ? "A little plan, just for you"
              : busy
                ? "Opening your little plan…"
                : "This planner is unavailable"}
          </h1>
          <p>
            {locked
              ? "This link is protected. Enter the password its owner shared with you."
              : busy
                ? "Checking access to this shared planner."
                : "Ask the owner for a current link, or reconnect and try again."}
          </p>
          {error && (
            <p className="share-notice" role="alert">
              {error}
            </p>
          )}
          {locked ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void load(password);
              }}
            >
              <label className="field-label">
                Link password
                <input
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={128}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="button primary" disabled={busy}>
                {busy ? "Checking password…" : "View planner"}
              </button>
            </form>
          ) : (
            !busy && (
              <button className="button primary" onClick={() => load()}>
                <RefreshCw size={16} />
                Try again
              </button>
            )
          )}
        </section>
      ) : (
        <>
          <section className="shared-heading">
            <div>
              <h1>{planner.schedule.name}</h1>
              <p>
                Shared copy · updated{" "}
                {new Date(planner.updatedAt).toLocaleString()}
                {planner.expiresAt
                  ? ` · expires ${new Date(planner.expiresAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => load()}
            >
              <RefreshCw size={15} />
              {busy ? "Checking…" : "Refresh planner"}
            </button>
          </section>
          <nav className="shared-toolbar" aria-label="Shared planner views">
            <div className="shared-date-controls">
              <button
                className="icon-button"
                aria-label="Previous period"
                onClick={() => move(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <strong>
                {format(
                  focus,
                  view === "monthly" ? "MMMM yyyy" : "MMM d, yyyy",
                )}
              </strong>
              <button
                className="icon-button"
                aria-label="Next period"
                onClick={() => move(1)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="text-button"
                onClick={() => setFocus(new Date())}
              >
                Today
              </button>
            </div>
            <div className="shared-view-controls">
              {(
                [
                  ["weekly", "Week"],
                  ["daily", "Day"],
                  ["monthly", "Month"],
                  ["list", "List"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>
          <div className="shared-canvas" aria-label="Read-only schedule">
            <FitContent
              minWidth={view === "weekly" || view === "monthly" ? 1000 : 340}
              maxWidth={1600}
              fixedWidth={
                plannerLayout(planner.schedule.design.canvasSize, view)?.width
              }
            >
              <ScheduleCanvas
                schedule={planner.schedule}
                preferences={preferences}
                week={focus}
                view={view}
                day={weekdayForDate(dateKey(focus))}
                interactive={false}
                hourHeight={52}
                selectedSticker={null}
                onDay={(day, date) => {
                  if (date) setFocus(parseISO(date));
                  else
                    setFocus((value) =>
                      addDays(value, day - weekdayForDate(dateKey(value))),
                    );
                }}
                onEdit={noChange}
                onAdd={noChange}
                onResize={noChange}
                onSticker={noChange}
                onSelectSticker={noChange}
              />
            </FitContent>
          </div>
          <footer className="shared-footer">
            <span>
              A little plan, a lovely day. <Heart size={13} />
            </span>
            <span>Saved copy from the owner · read only</span>
          </footer>
        </>
      )}
    </main>
  );
}
