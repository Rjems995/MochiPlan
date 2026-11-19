import {
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Menu,
  WifiOff,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
export function AppHeader() {
  const {
    p,
    navigation: { page, navigate, setMobileMenu, mobileMenu },
    platform: { online, setWelcome },
    workspace: { saved },
    accounts,
  } = useAppContext();
  return (
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
            {!online
              ? "Offline & feeling cozy"
              : saved !== "All changes saved" || !accounts.user
                ? saved
                : accounts.sync.status === "synced"
                  ? "Synced"
                  : "Saved locally"}
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
  );
}
