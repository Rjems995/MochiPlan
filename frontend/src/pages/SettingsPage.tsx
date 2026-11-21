import {
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Download,
  MonitorDown,
  Share2,
} from "lucide-react";
import { Mochi } from "../components/Artwork";
import { BackupSettings } from "../components/BackupSettings";
import { AccountSettings } from "../components/AccountSettings";
import { ReminderSettings } from "../components/ReminderSettings";
import { useAppContext } from "../context/AppContext";
import { type Preferences, themes } from "../model";
import { downloadJSON } from "../storage";
export function SettingsPage() {
  const {
    p,
    data,
    workspace: { pref, saved },
    platform: { requestPersistence, installApp, setWelcome },
    backups: { backupInput, readBackupFile },
    sharing,
  } = useAppContext();

  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">YOUR CORNER, YOUR WAY</div>
          <h1>
            All the little preferences
            <span className="title-heart">✧</span>
          </h1>
          <p>Make yourself at home.</p>
        </div>
      </div>
      <div className="settings-grid">
        <AccountSettings />
        <section className="content-card sharing-settings">
          <h2>Shared planner links</h2>
          <p className="settings-description">
            Review and revoke read-only links, including copies of planners you
            no longer keep on this device.
          </p>
          <button
            className="button secondary"
            onClick={() => sharing.setManageAll(true)}
          >
            <Share2 size={16} />
            Manage shared links
          </button>
        </section>
        <section className="content-card">
          <h2>A little about you</h2>
          <label className="field-label">
            What should we call you?
            <input
              value={p.name}
              maxLength={40}
              onChange={(ev) => pref({ name: ev.target.value })}
            />
          </label>
          <fieldset className="field-label">
            <legend>Choose a little companion</legend>
            <div className="avatar-picker">
              {["🌷", "🍓", "🐰", "🐱", "🧸", "🍵", "🌙", "🌼", "🦋", "☁️"].map(
                (emoji) => (
                  <button
                    className={p.avatar === emoji ? "selected" : ""}
                    key={emoji}
                    onClick={() => pref({ avatar: emoji })}
                    aria-label={`Choose ${emoji} avatar`}
                  >
                    {emoji}
                  </button>
                ),
              )}
            </div>
          </fieldset>
          <label className="field-label">
            Your workspace palette
            <select
              value={p.theme}
              onChange={(ev) => pref({ theme: ev.target.value })}
            >
              {themes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji} {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row">
            A cozier dark mode
            <input
              type="checkbox"
              checked={p.dark}
              onChange={(ev) => pref({ dark: ev.target.checked })}
            />
          </label>
        </section>
        <section className="content-card">
          <h2>Plan at your pace</h2>
          <label className="field-label">
            My week begins on
            <select
              value={p.weekStart}
              onChange={(ev) =>
                pref({
                  weekStart: ev.target.value as Preferences["weekStart"],
                })
              }
            >
              <option value="monday">Monday</option>
              <option value="sunday">Sunday</option>
            </select>
          </label>
          <label className="toggle-row">
            Use 24-hour time
            <input
              type="checkbox"
              checked={p.time24}
              onChange={(ev) => pref({ time24: ev.target.checked })}
            />
          </label>
        </section>
        <section className="content-card">
          <h2>Your plans, safe & cozy</h2>
          <p className="settings-description">
            Your schedules live in this browser’s IndexedDB storage. Keep a
            backup before clearing browser data or moving to another device.
          </p>
          <button
            className="button secondary full-width"
            onClick={() => downloadJSON(data)}
          >
            <Download size={16} />
            Download a full backup
          </button>
          <button
            className="button secondary full-width"
            onClick={() => backupInput.current?.click()}
          >
            <Share2 size={16} />
            Restore a backup
          </button>
          <input
            ref={backupInput}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={readBackupFile}
          />
          <button className="text-button" onClick={requestPersistence}>
            Ask browser to keep my plans
            <ArrowUpRight size={14} />
          </button>
          <span className="storage-status">
            <Cloud size={14} />
            {saved}
          </span>
        </section>
        <BackupSettings />
        <ReminderSettings />
        <section className="content-card install-card">
          <Mochi flower />
          <h2>A little home on your homescreen</h2>
          <p className="settings-description">
            Install MochiPlan to keep your plans close. After your first online
            visit, your workspace, designs, and exports work offline.
          </p>
          <button className="button primary" onClick={installApp}>
            <MonitorDown size={16} />
            Install MochiPlan
          </button>
          <button className="text-button" onClick={() => setWelcome(true)}>
            Show me around
            <ArrowRight size={14} />
          </button>
          <small>MochiPlan 1.0 · Made for your own little rhythm</small>
        </section>
      </div>
    </>
  );
}
