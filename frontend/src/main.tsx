import ReactDOM from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/latin-600.css";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import SharedPlannerPage from "./pages/SharedPlannerPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./style.css";
import "./workspace.css";
import "./calendar.css";
import "./polish.css";
import "./scoped-edits.css";
import "./backups.css";
import "./reminders.css";
import "./accounts.css";
import "./sharing.css";
import "./tasks.css";
import "./sync-review.css";
import "./export.css";
import "./text-decorations.css";
import "./background-image.css";
import "./planner-size.css";
import "./studio-toolbar.css";
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) {
      setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
      window.addEventListener("online", () =>
        registration.update().catch(() => {}),
      );
    }
  },
  onOfflineReady() {
    window.dispatchEvent(new Event("mochi-offline-ready"));
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {/^\/share\/?$/.test(location.pathname) ? <SharedPlannerPage /> : <App />}
  </ErrorBoundary>,
);
