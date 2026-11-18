import {
  CalendarDays,
  LayoutDashboard,
  LayoutTemplate,
  ListTodo,
} from "lucide-react";

export const nav = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "schedules", label: "My schedules", icon: CalendarDays },
  { id: "templates", label: "Template garden", icon: LayoutTemplate },
  { id: "tasks", label: "Little to-dos", icon: ListTodo },
] as const;
