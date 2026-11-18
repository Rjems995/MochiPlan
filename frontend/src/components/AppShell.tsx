import { Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { useAppContext } from "../context/AppContext";
import { getTheme } from "../model";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { MobileNavigation } from "./MobileNavigation";
export function AppShell({
  children,
  overlays,
}: {
  children: ReactNode;
  overlays: ReactNode;
}) {
  const {
    p,
    navigation: { page },
    studio: { focusMode },
  } = useAppContext();
  return (
    <div
      className={`app-shell ${p.dark ? "dark-mode" : ""} ${page === "studio" || page === "schedules" ? "bounded-workspace" : ""} ${page === "studio" ? "editing-schedule" : ""} ${focusMode && page === "studio" ? "focus-mode" : ""}`}
      style={
        {
          "--theme-accent": getTheme(p.theme).accent,
          "--workspace-accent":
            p.theme === "strawberry"
              ? "#9c516b"
              : p.theme === "midnight"
                ? "#725c8c"
                : getTheme(p.theme).color,
          "--workspace-soft": getTheme(p.theme).accent + "35",
        } as React.CSSProperties
      }
    >
      <AppSidebar />
      <main className="main-area">
        <AppHeader />
        <div className={`page-content page-${page}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              className="page-body"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="app-footer">
          <span>Made for your own little rhythm.</span>
          <span>
            no rush, just a little mochi magic <Sparkles size={11} />
          </span>
        </footer>
      </main>
      <MobileNavigation />
      {overlays}
    </div>
  );
}
