import { useEffect, useRef, useState } from "react";
import {
  type AppData,
  type Design,
  getTheme,
  type Preferences,
  type Schedule,
  themes,
  uid,
} from "../model";
import { seed } from "../seed";
import { loadData, saveData } from "../storage";
import { duplicateEntries } from "../series";

export function useWorkspace(notify: (text: string) => void) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState("Loading your little workspace…");
  const undo = useRef<Schedule[][]>([]);
  const redo = useRef<Schedule[][]>([]);
  const [, setHistoryVersion] = useState(0);
  const saveVersion = useRef(0);
  useEffect(() => {
    loadData()
      .then((saved) => {
        const initial = saved || seed();
        try {
          const prefs = localStorage.getItem("mochiplan-preferences");
          if (prefs)
            initial.preferences = {
              ...initial.preferences,
              ...JSON.parse(prefs),
            };
        } catch {}
        setData(initial);
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(() => {
    if (!data) return;
    const version = ++saveVersion.current;
    setSaved("Saving your little changes…");
    saveData(data)
      .then(() => {
        if (version === saveVersion.current) setSaved("All changes saved");
      })
      .catch(() => {
        setSaved("Could not save — download a backup");
        notify(
          "Device storage is unavailable or full. Download a backup in Settings to protect your plans.",
        );
      });
    try {
      localStorage.setItem(
        "mochiplan-preferences",
        JSON.stringify(data.preferences),
      );
    } catch {}
  }, [data, notify]);
  useEffect(() => {
    const before = (ev: BeforeUnloadEvent) => {
      if (saved.startsWith("Saving") || saved.startsWith("Could not")) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [saved]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (
        ev.target instanceof HTMLElement &&
        /INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)
      )
        return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        performHistory(ev.shiftKey ? "redo" : "undo");
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "y") {
        ev.preventDefault();
        performHistory("redo");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function changeSchedules(fn: (s: Schedule[]) => Schedule[]) {
    setData((old) => {
      if (!old) return old;
      undo.current.push(structuredClone(old.schedules));
      if (undo.current.length > 50) undo.current.shift();
      redo.current = [];
      setHistoryVersion((v) => v + 1);
      return { ...old, schedules: fn(old.schedules) };
    });
  }
  function updateSchedule(fn: (s: Schedule) => Schedule) {
    if (!data) return;
    changeSchedules((list) =>
      list.map((s) =>
        s.id === data.activeId ? { ...fn(s), updatedAt: Date.now() } : s,
      ),
    );
  }
  function design(patch: Partial<Design>) {
    updateSchedule((s) => {
      const old =
        s.design.customTheme && s.design.theme === s.design.customTheme.id
          ? s.design.customTheme
          : getTheme(s.design.theme);
      return {
        ...s,
        design: { ...s.design, ...patch },
        entries: patch.customTheme
          ? s.entries.map((e) => ({
              ...e,
              color:
                patch.customTheme!.palette[
                  Math.max(0, old.palette.indexOf(e.color)) % 5
                ],
            }))
          : s.entries,
      };
    });
  }
  function pref(patch: Partial<Preferences>) {
    setData((old) =>
      old ? { ...old, preferences: { ...old.preferences, ...patch } } : old,
    );
  }
  function performHistory(direction: "undo" | "redo") {
    const from = direction === "undo" ? undo : redo;
    const to = direction === "undo" ? redo : undo;
    const previous = from.current.pop();
    if (!previous) return;
    setData((old) => {
      if (!old) return old;
      to.current.push(structuredClone(old.schedules));
      return {
        ...old,
        schedules: previous,
        activeId: previous.some((s) => s.id === old.activeId)
          ? old.activeId
          : previous[0].id,
      };
    });
    setHistoryVersion((v) => v + 1);
  }
  const active =
    data?.schedules.find((s) => s.id === data.activeId) || data?.schedules[0]!;
  const p = data?.preferences;
  function applyTheme(id: string) {
    if (!active) return;
    const theme =
      themes.find((t) => t.id === id) ||
      p?.customThemes?.find((t) => t.id === id) ||
      themes[0];
    const oldTheme =
      active.design.customTheme &&
      active.design.theme === active.design.customTheme.id
        ? active.design.customTheme
        : getTheme(active.design.theme);
    updateSchedule((s) => ({
      ...s,
      design: {
        ...s.design,
        theme: id,
        background: theme.bg,
        customTheme: id.startsWith("custom-") ? theme : undefined,
      },
      entries: s.entries.map((e) => {
        const i = oldTheme.palette.indexOf(e.color);
        return { ...e, color: i >= 0 ? theme.palette[i] : e.color };
      }),
    }));
  }
  function duplicateSchedule(s: Schedule) {
    const copy = {
      ...structuredClone(s),
      id: uid(),
      name: `${s.name} (copy)`,
      updatedAt: Date.now(),
      entries: duplicateEntries(s.entries, uid),
      design: {
        ...s.design,
        stickers: s.design.stickers.map((st) => ({ ...st, id: uid() })),
      },
    };
    changeSchedules((list) => [...list, copy]);
    notify("A little copy, ready to make your own.");
  }
  function restoreData(restored: AppData) {
    undo.current = [];
    redo.current = [];
    setData(restored);
  }
  const canUndo = undo.current.length > 0;
  const canRedo = redo.current.length > 0;
  return {
    data,
    loadError,
    saved,
    setData,
    active,
    p,
    changeSchedules,
    updateSchedule,
    design,
    pref,
    performHistory,
    applyTheme,
    duplicateSchedule,
    restoreData,
    canUndo,
    canRedo,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
