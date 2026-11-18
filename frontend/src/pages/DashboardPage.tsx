import { format, parseISO } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Circle,
  Coffee,
  Heart,
  ListTodo,
  MapPin,
  Plus,
} from "lucide-react";
import { dateKey, entriesOnDate, nextOccurrence, shiftDate } from "../calendar";
import { Flower, Mochi } from "../components/Artwork";
import { StickerArt } from "../components/StickerArt";
import { useAppContext } from "../context/AppContext";
import { readableColor } from "../contrast";
import { type Entry, formatTime, getTheme } from "../model";
export function DashboardPage() {
  const {
    active,
    p,
    data,
    platform: { now },
    planners: { openNewPlanner },
    studio: { chooseSchedule, setDay, todayDay, setView, setEditor, setWeek },
    tasks: { dueTasks, addTask, toggleTask, editTask },
    navigation: { setPage, navigate },
  } = useAppContext();
  const todayEntries = active ? entriesOnDate(active, dateKey(now)) : [];
  const upcoming = active.entries
    .map((entry) =>
      nextOccurrence(
        active,
        entry,
        dateKey(now),
        now.getHours() * 60 + now.getMinutes(),
      ),
    )
    .filter((o): o is { entry: Entry; date: string } => o !== null)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.entry.start - b.entry.start,
    )
    .slice(0, 3)
    .map(({ entry, date }) => ({
      ...entry,
      occurrenceDate: date,
      offset:
        date === dateKey(now) ? 0 : date === shiftDate(dateKey(now), 1) ? 1 : 2,
    }));
  return (
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
        <button className="button primary" onClick={openNewPlanner}>
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
          <StickerArt token={getTheme(p.theme).emoji} />
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
            <strong>{data.tasks.filter((t) => t.done).length}</strong>
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
                    date: dateKey(now),
                  });
                }}
              >
                <span className="agenda-time">
                  {formatTime(e.start, p.time24)}
                </span>
                <i style={{ background: e.color }} />
                <span>
                  <strong>{e.title}</strong>
                  <small>{e.location || "A little time for you"}</small>
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
                    date: dateKey(now),
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
                  {t.subject} {t.due && `· ${format(parseISO(t.due), "MMM d")}`}
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
          <button className="text-button" onClick={() => navigate("tasks")}>
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
            style={{
              background: e.color,
              color: readableColor(e.color),
            }}
            onClick={() => {
              setPage("studio");
              setWeek(parseISO(e.occurrenceDate));
              setDay(e.day);
              setEditor({
                entry: active.entries.find((entry) => entry.id === e.id)!,
                day: e.day,
                start: e.start,
                date: e.occurrenceDate,
              });
            }}
          >
            <span>
              {e.offset === 0
                ? "Today"
                : e.offset === 1
                  ? "Tomorrow"
                  : format(parseISO(e.occurrenceDate), "EEE, MMM d")}{" "}
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
  );
}
