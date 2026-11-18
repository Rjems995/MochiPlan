import {
  ArrowUpRight,
  MonitorDown,
  Moon,
  Plus,
  Settings,
  Sun,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { getTheme } from "../model";
import { nav } from "./appNavigation";
import { Flower, Logo } from "./Artwork";
export function AppSidebar() {
  const {
    data,
    active,
    p,
    navigation: { page, mobileMenu, navigate, setMobileMenu },
    planners: { openNewPlanner },
    studio: { chooseSchedule },
    platform: { installApp },
    workspace: { pref },
  } = useAppContext();
  return (
    <>
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
            onClick={openNewPlanner}
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
    </>
  );
}
