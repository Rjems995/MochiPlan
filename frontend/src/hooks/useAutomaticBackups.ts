import { useEffect, useState, useSyncExternalStore } from "react";
import type { AppData } from "../model";
import { AutomaticBackups } from "../services/automaticBackups";
import {
  parseBackupMetadata,
  createServerBackups,
  workspaceKey,
} from "../services/serverBackup";
import { activeProfile, deviceKey } from "../services/deviceScope";

const settingKey = "mochiplan-automatic-backups";
const checkpointKey = "mochiplan-backup-checkpoint";
export function useAutomaticBackups(
  data: AppData | null,
  saved: string,
  paused: boolean,
) {
  const [settingName] = useState(() => deviceKey(settingKey));
  const [engine] = useState(() => {
    const profile = activeProfile();
    const setting = deviceKey(settingKey, profile),
      checkpointName = deviceKey(checkpointKey, profile);
    let enabled = true,
      checkpoint = null;
    try {
      enabled = localStorage.getItem(setting) !== "off";
      const stored = JSON.parse(localStorage.getItem(checkpointName) || "null");
      if (
        stored?.workspaceKey ===
        localStorage.getItem(deviceKey("mochiplan-server-key", profile))
      )
        checkpoint = parseBackupMetadata(stored.metadata);
    } catch {}
    return new AutomaticBackups({
      transport: createServerBackups(profile),
      enabled,
      checkpoint,
      onCheckpoint: (metadata) => {
        localStorage.setItem(
          checkpointName,
          JSON.stringify({ workspaceKey: workspaceKey(profile), metadata }),
        );
      },
    });
  });
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  useEffect(() => {
    engine.setOnline(navigator.onLine);
    engine.start();
    const online = () => engine.setOnline(true);
    const offline = () => engine.setOnline(false);
    const focus = () => engine.retry();
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", focus);
    return () => {
      engine.stop();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", focus);
    };
  }, [engine]);
  useEffect(
    () => engine.observe(data, saved === "All changes saved"),
    [engine, data, saved],
  );
  useEffect(() => engine.setPaused(paused), [engine, paused]);
  function setAutomatic(enabled: boolean) {
    try {
      localStorage.setItem(settingName, enabled ? "on" : "off");
    } catch {}
    engine.setEnabled(enabled);
  }
  return { engine, state, setAutomatic };
}
