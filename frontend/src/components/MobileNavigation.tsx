import {
  CalendarDays,
  LayoutDashboard,
  LayoutTemplate,
  ListTodo,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { type Page } from "../model";
export function MobileNavigation() {
  const {
    navigation: { page, navigate },
  } = useAppContext();
  return (
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
  );
}
