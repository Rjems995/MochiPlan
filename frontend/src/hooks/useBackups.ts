import { parseISO } from "date-fns";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { dateKey, initialCalendarDate, weekdayForDate } from "../calendar";
import { type AppData } from "../model";
import { loadServerBackup, saveServerBackup } from "../services/serverBackup";
import { validateBackup } from "../storage";
import type { NavigationController } from "./useNavigation";
import type { ScheduleEditorController } from "./useScheduleEditor";
import type { WorkspaceController } from "./useWorkspace";
export function useBackups(
  workspace: WorkspaceController,
  studio: ScheduleEditorController,
  navigation: NavigationController,
  notify: (text: string) => void,
) {
  const { data, restoreData } = workspace;
  const { setWeek, setDay } = studio;
  const { setPage } = navigation;
  const [backupConfirm, setBackupConfirm] = useState<AppData | null>(null);
  const [serverBackupBusy, setServerBackupBusy] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  async function saveServerCopy() {
    if (!data) return;
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
  }
  async function readServerCopy() {
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
  }
  async function readBackupFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a backup smaller than 20 MB.");
      const imported = validateBackup(JSON.parse(await file.text()));
      setBackupConfirm(imported);
    } catch (e) {
      notify(e instanceof Error ? e.message : "That backup could not be read.");
    }
    ev.target.value = "";
  }
  function confirmRestore() {
    if (!backupConfirm) return;
    restoreData(backupConfirm);
    const restored =
      backupConfirm.schedules.find((s) => s.id === backupConfirm.activeId) ||
      backupConfirm.schedules[0];
    const date = initialCalendarDate(restored, dateKey(new Date()));
    setWeek(parseISO(date));
    setDay(weekdayForDate(date));
    setBackupConfirm(null);
    setPage("studio");
    notify("Your little workspace is back home.");
  }
  return {
    backupConfirm,
    setBackupConfirm,
    backupInput,
    serverBackupBusy,
    saveServerCopy,
    readServerCopy,
    readBackupFile,
    confirmRestore,
  };
}
export type BackupsController = ReturnType<typeof useBackups>;
