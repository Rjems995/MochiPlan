import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { type PlannerShare, shareUrl } from "../services/plannerShares";
import { Modal } from "./Modal";

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function PlannerSharingDialog() {
  const { sharing, data, feedback, accounts } = useAppContext();
  const schedule = data.schedules.find(
    (item) => item.id === sharing.scheduleId,
  );
  const [links, setLinks] = useState<PlannerShare[]>([]);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<PlannerShare | null>(null);
  const [expiry, setExpiry] = useState("week"),
    [customExpiry, setCustomExpiry] = useState("");
  const [access, setAccess] = useState("public"),
    [password, setPassword] = useState("");
  const [includeLocations, setIncludeLocations] = useState(false),
    [includeDetails, setIncludeDetails] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!sharing.scheduleId && !sharing.manageAll) return;
    let alive = true;
    setLoading(true);
    setLinks([]);
    setEditing(null);
    setError("");
    setMessage("");
    setExpiry("week");
    setCustomExpiry("");
    setAccess("public");
    setPassword("");
    setIncludeLocations(false);
    setIncludeDetails(false);
    setRevokeId(null);
    sharing.api
      .list(sharing.manageAll ? undefined : sharing.scheduleId!)
      .then((result) => {
        if (alive) setLinks(result);
      })
      .catch((failure) => {
        if (alive) setError(failure.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sharing.scheduleId, sharing.manageAll, sharing.api]);
  if (!schedule && !sharing.manageAll) return null;
  async function refresh() {
    setError("");
    setLoading(true);
    try {
      setLinks(
        await sharing.api.list(sharing.manageAll ? undefined : schedule!.id),
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function edit(link: PlannerShare | null) {
    setEditing(link);
    setError("");
    setMessage("");
    setPassword("");
    setExpiry(link ? (link.expiresAt ? "custom" : "never") : "week");
    setCustomExpiry(link?.expiresAt ? localDate(link.expiresAt) : "");
    setAccess(link?.passwordProtected ? "password" : "public");
    setIncludeLocations(link?.includeLocations || false);
    setIncludeDetails(link?.includeDetails || false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const expiresAt =
        expiry === "never"
          ? null
          : expiry === "custom"
            ? new Date(customExpiry).toISOString()
            : new Date(
                Date.now() +
                  ({ day: 1, week: 7, month: 30 }[expiry] || 7) * 86400000,
              ).toISOString();
      const link = await sharing.api.save(
        {
          schedule: schedule!,
          preferences: {
            weekStart: data.preferences.weekStart,
            time24: data.preferences.time24,
          },
          includeLocations,
          includeDetails,
          expiresAt,
          password:
            access === "public"
              ? null
              : password || (editing?.passwordProtected ? undefined : ""),
          revision: editing?.revision,
        },
        editing?.id,
      );
      setLinks((previous) => [
        link,
        ...previous.filter((item) => item.id !== link.id),
      ]);
      setEditing(null);
      setPassword("");
      setMessage(
        editing
          ? "Shared copy updated. The same link now opens this version."
          : "Your read-only link is ready. Copy it below.",
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await sharing.api.revoke(id);
      setRevokeId(null);
      setLinks((previous) =>
        previous.map((link) =>
          link.id === id ? { ...link, revoked: true, token: null } : link,
        ),
      );
      if (editing?.id === id) edit(null);
      setMessage(
        "Link revoked. New visits and refreshes can no longer open it.",
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(link: PlannerShare) {
    try {
      await navigator.clipboard.writeText(shareUrl(link.token!));
      setCopied(link.id);
      feedback.notify("Planner link copied.");
    } catch {
      setError("Copy the complete link from its link field below.");
    }
  }
  return (
    <Modal
      title={sharing.manageAll ? "Manage shared links" : "Share this planner"}
      subtitle={
        sharing.manageAll
          ? "Every planner link from this workspace, including saved copies of removed planners."
          : `${schedule?.name} · a read-only copy, made to pass along.`
      }
      wide
      onClose={() => {
        if (!busy) {
          sharing.setScheduleId(null);
          sharing.setManageAll(false);
        }
      }}
    >
      <div className="planner-sharing">
        <div className="share-intro">
          <ShieldCheck size={21} />
          <p>
            {sharing.manageAll
              ? "Review access, copy a link, or revoke a shared copy. Account links follow your account; device-only links belong to this browser."
              : "Share just this planner. Your tasks, profile and other planners stay private. Edits appear here only when you update the shared copy."}
          </p>
        </div>
        {!sharing.manageAll && (
          <form
            className="share-form"
            onSubmit={save}
            aria-label="Planner link settings"
          >
            <div className="share-form-heading">
              <h3>{editing ? "Update this link" : "Create a link"}</h3>
              {editing && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => edit(null)}
                  disabled={busy}
                >
                  <X size={15} />
                  Cancel editing
                </button>
              )}
            </div>
            <div className="share-form-grid">
              <label className="field-label">
                Who can view
                <select
                  value={access}
                  onChange={(event) => setAccess(event.target.value)}
                  disabled={busy}
                >
                  <option value="public">Anyone with the link</option>
                  <option value="password">
                    Anyone with the link and password
                  </option>
                </select>
              </label>
              <label className="field-label">
                Link expires
                <select
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  disabled={busy}
                >
                  <option value="day">In 1 day</option>
                  <option value="week">In 7 days</option>
                  <option value="month">In 30 days</option>
                  <option value="custom">Choose date and time</option>
                  <option value="never">No expiration</option>
                </select>
              </label>
              {access === "password" && (
                <label className="field-label">
                  Link password
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    disabled={busy}
                    required={!editing?.passwordProtected}
                    placeholder={
                      editing?.passwordProtected
                        ? "Leave blank to keep the current password"
                        : "At least 12 characters"
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
              )}
              {expiry === "custom" && (
                <label className="field-label">
                  Expiration date and time
                  <input
                    type="datetime-local"
                    required
                    min={localDate(new Date(Date.now() + 60000).toISOString())}
                    disabled={busy}
                    value={customExpiry}
                    onChange={(event) => setCustomExpiry(event.target.value)}
                  />
                </label>
              )}
            </div>
            <fieldset className="share-privacy">
              <legend>Include activity details</legend>
              <label>
                <input
                  type="checkbox"
                  checked={includeLocations}
                  onChange={(event) =>
                    setIncludeLocations(event.target.checked)
                  }
                  disabled={busy}
                />
                Locations
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(event) => setIncludeDetails(event.target.checked)}
                  disabled={busy}
                />
                Instructors and notes
              </label>
            </fieldset>
            <p className="share-hint">
              Titles, dates, artwork and uploaded backgrounds are included.
              Anyone who can view a planner can keep a copy. Sharing needs a
              server connection.
              {accounts.user
                ? " Account links can be managed on your other signed-in devices."
                : " Manage device-only links from this browser."}
            </p>
            <button className="button primary" disabled={busy || loading}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Link2 size={16} />
              )}
              {editing ? "Update shared copy" : "Create read-only link"}
            </button>
          </form>
        )}
        {error && (
          <p className="share-notice" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="share-notice share-success" role="status">
            {message}
          </p>
        )}
        <div className="share-form-heading">
          <h3>Shared links</h3>
          <button
            className="text-button"
            disabled={busy || loading}
            onClick={refresh}
          >
            <RefreshCw size={15} />
            Refresh links
          </button>
        </div>
        {loading && <p role="status">Loading shared links…</p>}
        {!loading && !links.length && (
          <p className="share-hint">
            {sharing.manageAll
              ? "No shared links yet. Open a planner and choose Share planner to create one."
              : "No links yet. Choose the access settings above to share a little plan."}
          </p>
        )}
        <ul className="share-link-list">
          {links.map((link) => (
            <li
              key={link.id}
              className="share-link-card"
              data-share-id={link.id}
            >
              {sharing.manageAll && (
                <h4 className="share-planner-name">{link.name}</h4>
              )}
              <div className="share-link-heading">
                <strong>
                  {link.passwordProtected ? (
                    <LockKeyhole size={16} />
                  ) : (
                    <Link2 size={16} />
                  )}
                  {link.revoked
                    ? "Revoked"
                    : link.expired
                      ? "Expired"
                      : link.passwordProtected
                        ? "Password protected"
                        : "Anyone with the link"}
                </strong>
                <span className="share-hint">
                  Updated {new Date(link.updatedAt).toLocaleString()}
                </span>
              </div>
              <p className="share-hint">
                {link.expiresAt
                  ? `Expires ${new Date(link.expiresAt).toLocaleString()}`
                  : "No expiration"}
              </p>
              {link.token && (
                <input
                  className="share-url"
                  aria-label="Read-only planner link"
                  readOnly
                  value={shareUrl(link.token)}
                  onFocus={(event) => event.target.select()}
                />
              )}
              {!link.revoked && (
                <div className="share-link-actions">
                  {!link.expired && (
                    <>
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => copy(link)}
                      >
                        {copied === link.id ? (
                          <Check size={15} />
                        ) : (
                          <Copy size={15} />
                        )}
                        {copied === link.id ? "Copied" : "Copy link"}
                      </button>
                      <a
                        className="button secondary"
                        href={shareUrl(link.token!)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink size={15} />
                        Open viewer
                      </a>
                    </>
                  )}
                  {(!sharing.manageAll ||
                    data.schedules.some(
                      (item) => item.id === link.scheduleId,
                    )) && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        if (sharing.manageAll) {
                          sharing.setManageAll(false);
                          sharing.setScheduleId(link.scheduleId);
                        } else edit(link);
                      }}
                    >
                      {sharing.manageAll ? "Manage planner" : "Edit link"}
                    </button>
                  )}
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => setRevokeId(link.id)}
                  >
                    Revoke link
                  </button>
                </div>
              )}
              {revokeId === link.id && (
                <div
                  className="share-revoke-confirm"
                  role="group"
                  aria-label="Confirm link revocation"
                >
                  <p>
                    Revoke this link? People will lose access on their next
                    access check. Copies they already saved will remain.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => revoke(link.id)}
                  >
                    Confirm revoke
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setRevokeId(null)}
                  >
                    Keep link
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
