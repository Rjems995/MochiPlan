import { ArrowRight } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Mochi } from "./Artwork";
import { Modal } from "./Modal";
export function HelpDialogs() {
  const {
    p,
    platform: { installHelp, setInstallHelp, welcome, setWelcome },
    workspace: { pref },
  } = useAppContext();
  return (
    <>
      {installHelp && (
        <Modal
          title="A little home for MochiPlan"
          onClose={() => setInstallHelp(false)}
        >
          <div className="install-instructions">
            <p>
              <strong>iPhone & iPad</strong>Open in Safari, tap Share, then “Add
              to Home Screen”.
            </p>
            <p>
              <strong>Android</strong>Open the browser menu and choose “Install
              app” or “Add to Home screen”.
            </p>
            <p>
              <strong>Desktop</strong>In Chrome or Edge, use the install icon in
              the address bar, or “Install MochiPlan” in the browser menu.
            </p>
            <p className="muted">
              Installation availability depends on your browser. Visit once
              online to cache the app before heading offline.
            </p>
          </div>
          <button
            className="button primary full-width"
            onClick={() => setInstallHelp(false)}
          >
            Sounds lovely
          </button>
        </Modal>
      )}
      {welcome && (
        <Modal
          title="Welcome to your little happy place"
          subtitle="A little plan, a lovely day."
          onClose={() => {
            setWelcome(false);
            pref({ onboarded: true });
          }}
        >
          <div className="welcome-modal">
            <Mochi flower />
            <label className="field-label">
              What should we call you?
              <input
                value={p.name === "friend" ? "" : p.name}
                onChange={(ev) => pref({ name: ev.target.value || "friend" })}
                placeholder="Your name"
              />
            </label>
            <div className="quick-start">
              <p>
                <span>01</span>
                <strong>Plan your little rhythm</strong>Add activities, drag
                them to a new day, and pull their bottom edge to adjust the
                time.
              </p>
              <p>
                <span>02</span>
                <strong>Sprinkle a little you</strong>Pick a palette, add a
                sticker, or explore the template garden.
              </p>
              <p>
                <span>03</span>
                <strong>Keep your lovely plans close</strong>Export a wallpaper
                or install the app for a little offline magic.
              </p>
            </div>
            <button
              className="button primary full-width"
              onClick={() => {
                setWelcome(false);
                pref({ onboarded: true });
              }}
            >
              Let’s make a little plan
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
