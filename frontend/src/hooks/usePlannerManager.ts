import { parseISO } from "date-fns";
import { useState } from "react";
import { dateKey, initialCalendarDate, weekdayForDate } from "../calendar";
import { scheduleTypes } from "../model";
import { makeSchedule } from "../seed";
import type { NavigationController } from "./useNavigation";
import type { ScheduleEditorController } from "./useScheduleEditor";
import type { WorkspaceController } from "./useWorkspace";
export function usePlannerManager(
  workspace: WorkspaceController,
  studio: ScheduleEditorController,
  navigation: NavigationController,
  notify: (text: string) => void,
) {
  const { data, setData, changeSchedules } = workspace;
  const { setWeek, setDay, setView } = studio;
  const { setPage } = navigation;
  const [newModal, setNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState(scheduleTypes[0]);
  const [newTheme, setNewTheme] = useState("strawberry");
  const [newTermStart, setNewTermStart] = useState("");
  const [newTermEnd, setNewTermEnd] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  function createPlanner() {
    const schedule = makeSchedule(
      newName.trim() || "My little planner",
      newType,
      newTheme,
    );
    schedule.termStart = newTermStart || undefined;
    schedule.termEnd = newTermEnd || undefined;
    changeSchedules((s) => [...s, schedule]);
    setData((old) => (old ? { ...old, activeId: schedule.id } : old));
    setNewModal(false);
    setPage("studio");
    const date = initialCalendarDate(schedule, dateKey(new Date()));
    setWeek(parseISO(date));
    setDay(weekdayForDate(date));
    setView(
      newType === "Daily schedule" || newType === "Personal routine"
        ? "daily"
        : "weekly",
    );
    notify("A fresh little beginning. Your planner is ready.");
  }
  function renamePlanner() {
    if (!renameValue.trim()) return;
    changeSchedules((list) =>
      list.map((s) =>
        s.id === renameId
          ? { ...s, name: renameValue.trim(), updatedAt: Date.now() }
          : s,
      ),
    );
    setRenameId(null);
  }
  function deletePlanner() {
    if (!data) return;

    if (data.schedules.length === 1) {
      const fresh = makeSchedule("My little planner");
      changeSchedules(() => [fresh]);
      setData((old) => (old ? { ...old, activeId: fresh.id } : old));
    } else {
      const remaining = data.schedules.filter((s) => s.id !== deleteId);
      changeSchedules(() => remaining);
      if (data.activeId === deleteId)
        setData((old) => (old ? { ...old, activeId: remaining[0].id } : old));
    }
    setDeleteId(null);
    notify("Planner removed. Undo is here if you change your mind.");
  }
  function openNewPlanner() {
    setNewName("");
    setNewTermStart("");
    setNewTermEnd("");
    setNewModal(true);
  }
  return {
    newModal,
    setNewModal,
    newName,
    setNewName,
    newType,
    setNewType,
    newTheme,
    setNewTheme,
    newTermStart,
    setNewTermStart,
    newTermEnd,
    setNewTermEnd,
    renameId,
    setRenameId,
    renameValue,
    setRenameValue,
    deleteId,
    setDeleteId,
    createPlanner,
    renamePlanner,
    deletePlanner,
    openNewPlanner,
  };
}
export type PlannerManagerController = ReturnType<typeof usePlannerManager>;
