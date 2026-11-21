import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { WorkspaceController } from "./useWorkspace";
import {
  AccountError,
  createAccountApi,
  type AccountUser,
} from "../services/accountApi";
import {
  WorkspaceSync,
  type SyncState,
  type SyncChoice,
} from "../services/workspaceSync";
import {
  db,
  loadData,
  saveData,
  saveRestorePoint,
  saveSyncCheckpoint,
  forgetAccountProfile,
} from "../storage";
import { deviceKey } from "../services/deviceScope";
import { workspaceKey } from "../services/serverBackup";

const idle: SyncState = {
  status: "off",
  busy: false,
  error: "",
  lastSyncedAt: null,
  conflict: null,
};
const subscribeNothing = () => () => {};
const userKey = (id: string) => `mochiplan-account:${id}`;
function cachedUser(id: string | null): AccountUser | null {
  try {
    return id ? JSON.parse(localStorage.getItem(userKey(id)) || "null") : null;
  } catch {
    return null;
  }
}
export function useAccounts(
  workspace: WorkspaceController,
  notify: (message: string) => void,
) {
  const [api] = useState(createAccountApi);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [enabled, setEnabled] = useState(true);
  const [engine, setEngine] = useState<WorkspaceSync | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [conflictOpen, setConflictOpen] = useState(false);
  const engineRef = useRef(engine);
  const editing = useRef(false);
  const setEditing = useCallback((paused: boolean) => {
    editing.current = paused;
    engineRef.current?.setPaused(paused);
  }, []);
  engineRef.current = engine;
  const currentWorkspace = useRef(workspace);
  currentWorkspace.current = workspace;
  const sync = useSyncExternalStore(
    engine?.subscribe || subscribeNothing,
    engine?.getSnapshot || (() => idle),
  );
  useEffect(() => {
    let alive = true;
    async function session() {
      try {
        const current = await api.current();
        const pending = localStorage.getItem("mochiplan-pending-signout");
        if (pending) {
          if (pending === current.user.id) await api.logout();
          localStorage.removeItem("mochiplan-pending-signout");
          if (pending === current.user.id) return;
        }
        if (alive) {
          setUser(current.user);
          setSessionId(current.sessionId);
          localStorage.setItem(
            userKey(current.user.id),
            JSON.stringify(current.user),
          );
        }
      } catch (failure) {
        if (failure instanceof AccountError && failure.status === 401)
          localStorage.removeItem("mochiplan-pending-signout");
        else if (alive && currentWorkspace.current.profileId)
          setError(
            failure instanceof Error
              ? failure.message
              : "Account sync is unavailable.",
          );
      } finally {
        if (alive) setBusy(false);
      }
    }
    void session();
    const connected = () => {
      setOnline(navigator.onLine);
      if (
        navigator.onLine &&
        !engineRef.current &&
        currentWorkspace.current.profileId
      )
        void session();
    };
    window.addEventListener("online", connected);
    window.addEventListener("offline", connected);
    return () => {
      alive = false;
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", connected);
    };
  }, [api]);
  useEffect(() => {
    let cancelled = false,
      active: WorkspaceSync | null = null;
    setEngine(null);
    const id = workspace.profileId;
    setReminderError("");
    if (!id || user?.id !== id) return;
    const syncEnabled =
      localStorage.getItem(deviceKey("mochiplan-sync-enabled", id)) !== "off";
    setEnabled(syncEnabled);
    void api.registerDevice(workspaceKey(id)).catch((failure) => {
      if (!cancelled)
        setError(
          failure instanceof Error
            ? failure.message
            : "This account device could not be registered.",
        );
    });
    db.sync
      .get(id)
      .then((checkpoint) => {
        if (cancelled) return;
        active = new WorkspaceSync({
          accountId: id,
          api,
          checkpoint: checkpoint || null,
          commit: saveSyncCheckpoint,
          saveLocal: (data) => saveData(data, id),
          safety: (data) => saveRestorePoint(data, id),
          apply: (expected, next) =>
            currentWorkspace.current.profileId === id &&
            currentWorkspace.current.applySyncedData(expected, next),
        });
        active.setEnabled(syncEnabled);
        active.setPaused(editing.current);
        setEngine(active);
        active.start();
      })
      .catch((failure) => {
        if (!cancelled)
          setError(
            failure instanceof Error
              ? failure.message
              : "Sync history could not be read.",
          );
      });
    return () => {
      cancelled = true;
      active?.stop();
    };
  }, [user?.id, workspace.profileId, epoch, api]);
  useEffect(() => {
    engine?.observe(workspace.data, workspace.saved === "All changes saved");
  }, [engine, workspace.data, workspace.saved]);
  useEffect(() => {
    engine?.setOnline(online);
  }, [engine, online]);
  useEffect(() => {
    const focus = () => engine?.retry();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [engine]);
  async function authenticate(
    mode: "register" | "login" | "recover",
    username: string,
    password: string,
    recovery?: string,
  ) {
    if (busy || !workspace.data) return false;
    setBusy(true);
    setError("");
    engineRef.current?.stop();
    try {
      const previous = workspace.data;
      const session = await api.authenticate(
        mode,
        username,
        password,
        recovery,
      );
      const remote = await api.read(),
        cached = await loadData(session.user.id);
      if (!cached && remote.data)
        await saveSyncCheckpoint({
          id: session.user.id,
          revision: remote.revision,
          data: remote.data,
          syncedAt: new Date().toISOString(),
        });
      localStorage.removeItem("mochiplan-pending-signout");
      localStorage.setItem(
        userKey(session.user.id),
        JSON.stringify(session.user),
      );
      await currentWorkspace.current.switchProfile(
        session.user.id,
        remote.data || previous,
      );
      setUser(session.user);
      setSessionId(session.sessionId);
      setManagementOpen(false);
      setEpoch((value) => value + 1);
      setRecoveryCode(session.recoveryCode || "");
      notify(
        mode === "register"
          ? "Your account is ready. Keep your recovery code somewhere safe."
          : "Signed in. Your plans are ready to sync.",
      );
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Sign-in could not be completed.",
      );
      if (engineRef.current) engineRef.current.start();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    engineRef.current?.stop();
    try {
      const id = workspace.profileId;
      if (id) localStorage.setItem("mochiplan-pending-signout", id);
      try {
        await api.logout();
        localStorage.removeItem("mochiplan-pending-signout");
      } catch (failure) {
        if (failure instanceof AccountError && failure.status === 401)
          localStorage.removeItem("mochiplan-pending-signout");
      }
      await workspace.switchProfile(null);
      setUser(null);
      setSessionId(null);
      setManagementOpen(false);
      setRecoveryCode("");
      setConflictOpen(false);
      notify(
        "Signed out. Your device-only plans are back; account plans stay saved offline on this device.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not switch workspaces.",
      );
    } finally {
      setBusy(false);
    }
  }
  function toggleSync(value: boolean) {
    if (!workspace.profileId) return;
    localStorage.setItem(
      deviceKey("mochiplan-sync-enabled", workspace.profileId),
      value ? "on" : "off",
    );
    setEnabled(value);
    engine?.setEnabled(value);
  }
  async function changePassword(currentPassword: string, nextPassword: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    engineRef.current?.stop();
    try {
      const session = await api.changePassword(currentPassword, nextPassword);
      setUser(session.user);
      setSessionId(session.sessionId);
      setManagementOpen(false);
      setEpoch((value) => value + 1);
      setRecoveryCode(session.recoveryCode || "");
      notify(
        "Password changed. Other sessions are signed out. Save your new recovery code.",
      );
      return true;
    } catch (failure) {
      engineRef.current?.start();
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function revokeSession(id: string | "others") {
    const result = await api.revokeSession(id);
    if (result.signedOut) await signOut();
    else
      notify(
        id === "others"
          ? "Other sessions have been signed out."
          : "That session has been signed out.",
      );
    return result;
  }
  async function deleteAccount(currentPassword: string, confirmation: string) {
    if (busy || !workspace.profileId) return false;
    const id = workspace.profileId;
    setBusy(true);
    setError("");
    engineRef.current?.stop();
    let deleted = false;
    try {
      await api.deleteAccount(currentPassword, confirmation);
      deleted = true;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        const subscription = await registration?.pushManager?.getSubscription();
        await subscription?.unsubscribe();
      } catch {}
      await workspace.switchProfile(null, undefined, { discardCurrent: true });
      await forgetAccountProfile(id);
      setUser(null);
      setSessionId(null);
      setManagementOpen(false);
      setRecoveryCode("");
      setConflictOpen(false);
      notify("Account deleted. Device-only plans are unchanged.");
      return true;
    } catch (failure) {
      if (!deleted) engineRef.current?.start();
      else
        setError(
          "The server account was deleted, but local cleanup needs attention. Clear this site’s saved account data after downloading any plans you want to keep.",
        );
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function resolveConflict(choice: SyncChoice) {
    await engine?.syncNow(choice);
    if (!engine?.getSnapshot().conflict) setConflictOpen(false);
  }
  return {
    user: workspace.profileId
      ? user?.id === workspace.profileId
        ? user
        : cachedUser(workspace.profileId)
      : null,
    signedIn:
      !!workspace.profileId &&
      user?.id === workspace.profileId &&
      sync.status !== "auth",
    busy: busy || workspace.switchingProfile,
    error: error || reminderError,
    online,
    enabled,
    sync,
    recoveryCode,
    sessionId,
    managementOpen,
    setManagementOpen,
    changePassword,
    revokeSession,
    deleteAccount,
    listSessions: () => api.sessions(),
    setRecoveryCode,
    conflictOpen,
    setConflictOpen,
    authenticate,
    signOut,
    toggleSync,
    resolveConflict,
    syncNow: () => engine?.retry(),
    setEditing,
    linkReminders: useCallback(
      async (deviceId: string, profile: string) => {
        try {
          await api.linkReminders(deviceId, workspaceKey(profile));
          if (currentWorkspace.current.profileId === profile)
            setReminderError("");
        } catch (failure) {
          if (currentWorkspace.current.profileId === profile)
            setReminderError(
              failure instanceof Error
                ? failure.message
                : "Could not link account reminders.",
            );
        }
      },
      [api],
    ),
  };
}
export type AccountsController = ReturnType<typeof useAccounts>;
