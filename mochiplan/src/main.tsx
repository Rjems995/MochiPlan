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
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./style.css";
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
    <App />
  </ErrorBoundary>,
);
