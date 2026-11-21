import { useEffect, useRef } from "react";
import { parseISO } from "date-fns";
import { isCalendarDate, weekdayForDate } from "../calendar";
import type { WorkspaceController } from "./useWorkspace";
import type { ScheduleEditorController } from "./useScheduleEditor";
import type { NavigationController } from "./useNavigation";
import type { TaskManagerController } from "./useTaskManager";

export function useReminderNavigation(
  workspace: WorkspaceController,
  studio: ScheduleEditorController,
  navigation: NavigationController,
  tasks: TaskManagerController,
  notify: (message: string) => void,
) {
  const latest = useRef({ workspace, studio, navigation, tasks, notify });
  latest.current = { workspace, studio, navigation, tasks, notify };
  const opened = useRef(false);
  useEffect(() => {
    function open(value: string) {
      let url;
      try {
        url = new URL(value, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const planner = url.searchParams.get("planner"),
        day = url.searchParams.get("date");
      const {
        workspace: current,
        studio: editor,
        navigation: nav,
      } = latest.current;
      const taskId = url.searchParams.get("task");
      if (taskId) {
        const profile = url.searchParams.get("profile");
        if (profile && profile !== (current.profileId || "device")) {
          latest.current.notify(
            "Switch to the workspace that owns this task to open its reminder.",
          );
          nav.navigate("settings");
          return;
        }
        const task = current.data?.tasks.find((item) => item.id === taskId);
        nav.navigate("tasks");
        latest.current.tasks.setTaskFilter("all");
        if (task) latest.current.tasks.editTask(task);
        return;
      }
      if (
        !planner ||
        !isCalendarDate(day) ||
        !current.data?.schedules.some((s) => s.id === planner)
      )
        return;
      editor.chooseSchedule(planner);
      editor.setWeek(parseISO(day));
      editor.setDay(weekdayForDate(day));
      nav.setPage("studio");
    }
    if (workspace.data && !opened.current) {
      opened.current = true;
      open(window.location.href);
      const url = new URL(window.location.href);
      if (url.searchParams.has("planner")) {
        url.searchParams.delete("planner");
        url.searchParams.delete("date");
        window.history.replaceState(null, "", url.href);
      }
      if (url.searchParams.has("task")) {
        url.searchParams.delete("task");
        url.searchParams.delete("profile");
        window.history.replaceState(null, "", url.href);
      }
    }
    const message = (event: MessageEvent) => {
      if (
        event.data?.type === "MOCHI_OPEN_REMINDER" &&
        typeof event.data.url === "string"
      )
        open(event.data.url);
    };
    navigator.serviceWorker?.addEventListener("message", message);
    return () =>
      navigator.serviceWorker?.removeEventListener("message", message);
  }, [!!workspace.data]);
}
