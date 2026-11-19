import { parseISO } from "date-fns";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { dateKey, initialCalendarDate, weekdayForDate } from "../calendar";
import { type AppData } from "../model";
import { serverBackups } from "../services/serverBackup";
import type { BackupHistory, BackupSnapshot } from "../services/backupTypes";
import {
  loadRestorePoint,
  saveRestorePoint,
  validateBackup,
  type RestorePoint,
} from "../storage";
import { useAutomaticBackups } from "./useAutomaticBackups";
import type { NavigationController } from "./useNavigation";
import type { ScheduleEditorController } from "./useScheduleEditor";
import type { WorkspaceController } from "./useWorkspace";

type ServerRestore = { snapshot: BackupSnapshot; expectedHead: number };
export function useBackups(
  workspace: WorkspaceController,
  studio: ScheduleEditorController,
  navigation: NavigationController,
  notify: (text: string) => void,
) {
  const { data, restoreData } = workspace;
  const [backupConfirm, setBackupConfirm] = useState<AppData | null>(null);
  const [restoreSource, setRestoreSource] = useState<string>("");
  const [serverRestore, setServerRestore] = useState<ServerRestore | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<BackupHistory | null>(null);
  const [restorePoint, setRestorePoint] = useState<RestorePoint | null>(null);
  const [historyError, setHistoryError] = useState("");
  const backupInput = useRef<HTMLInputElement>(null);
  const currentData = useRef(data);
  currentData.current = data;
  const automatic = useAutomaticBackups(
    data,
    workspace.saved,
    historyOpen || !!backupConfirm || reading || restoring,
  );
  const serverBackupBusy = automatic.state.busy || reading || restoring;
  function report(error: unknown) {
    notify(
      error instanceof Error
        ? error.message
        : "That backup could not be read. Your local plans are safe.",
    );
  }
  async function saveServerCopy() {
    if (!data) return;
    try {
      await automatic.engine.backupNow(data);
      notify("Server backup saved.");
    } catch (error) {
      report(error);
    }
  }
  async function refreshHistory() {
    automatic.engine.setPaused(true);
    setReading(true);
    setHistoryError("");
    try {
      setRestorePoint(await loadRestorePoint());
    } catch {
      setHistoryError("The local restore point could not be read.");
    }
    try {
      setHistory(await serverBackups.history());
    } catch (error) {
      setHistory(null);
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Backup history is unavailable.",
      );
    } finally {
      setReading(false);
    }
  }
  function openHistory() {
    setHistoryOpen(true);
    void refreshHistory();
  }
  async function readServerCopy(revision?: number) {
    automatic.engine.setPaused(true);
    setReading(true);
    try {
      const latest = await serverBackups.history();
      const snapshot = await serverBackups.snapshot(
        revision ?? (latest.revision || undefined),
      );
      setServerRestore({ snapshot, expectedHead: latest.revision });
      setRestoreSource(
        `Server version ${snapshot.revision} · ${new Date(snapshot.updatedAt).toLocaleString()}`,
      );
      setBackupConfirm(snapshot.data);
      setHistoryOpen(false);
    } catch (error) {
      report(error);
    } finally {
      setReading(false);
    }
  }
  async function readBackupFile(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw Error("Choose a backup smaller than 20 MB.");
      const imported = validateBackup(JSON.parse(await file.text()));
      setServerRestore(null);
      setRestoreSource("Backup file");
      setBackupConfirm(imported);
    } catch (error) {
      report(error);
    }
    ev.target.value = "";
  }
  function readLocalRestorePoint() {
    if (!restorePoint) return;
    setServerRestore(null);
    setRestoreSource(
      `Before your last restore · ${new Date(restorePoint.savedAt).toLocaleString()}`,
    );
    setBackupConfirm(restorePoint.data);
    setHistoryOpen(false);
  }
  async function confirmRestore() {
    if (!backupConfirm || !data || restoring) return;
    const current = data;
    setRestoring(true);
    automatic.engine.setPaused(true);
    try {
      try {
        setRestorePoint(await saveRestorePoint(current));
      } catch {
        throw Error(
          "Could not create a safety restore point. Download your current plans and free device storage before restoring.",
        );
      }
      if (serverRestore)
        await automatic.engine.restore(
          serverRestore.snapshot,
          current,
          serverRestore.expectedHead,
        );
      if (currentData.current !== current)
        throw Error(
          "Your workspace changed while restoring. Your latest edits are safe; reopen the backup and try again.",
        );
      restoreData(backupConfirm);
      const restored =
        backupConfirm.schedules.find((s) => s.id === backupConfirm.activeId) ||
        backupConfirm.schedules[0];
      const date = initialCalendarDate(restored, dateKey(new Date()));
      studio.setWeek(parseISO(date));
      studio.setDay(weekdayForDate(date));
      setBackupConfirm(null);
      setServerRestore(null);
      navigation.setPage("studio");
      notify(
        "Your little workspace is back home. Previous plans are in Backup history.",
      );
    } catch (error) {
      report(error);
    } finally {
      setRestoring(false);
    }
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
    restoring,
    restoreSource,
    automatic: automatic.state,
    setAutomatic: automatic.setAutomatic,
    retryBackup: () => automatic.engine.retry(),
    historyOpen,
    setHistoryOpen,
    history,
    historyError,
    restorePoint,
    historyLoading: reading,
    openHistory,
    refreshHistory,
    readLocalRestorePoint,
  };
}
export type BackupsController = ReturnType<typeof useBackups>;
