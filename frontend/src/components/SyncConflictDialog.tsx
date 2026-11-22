import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  GitCompareArrows,
  RefreshCw,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { downloadJSON } from "../storage";
import {
  canKeepBoth,
  otherChangedItems,
  resolveWorkspaceReview,
} from "../services/syncReview";
import { itemDescription } from "../services/syncReviewDisplay";
import type { ConflictChoice } from "../services/syncTypes";
import { SyncConflictComparison } from "./SyncConflictComparison";
import { Modal } from "./Modal";

const perPage = 4;
const noChoices: Record<string, ConflictChoice> = {};
export function SyncConflictDialog() {
  const { accounts, workspace } = useAppContext(),
    conflict = accounts.sync.conflict;
  const [storedChoices, setChoices] = useState<Record<string, ConflictChoice>>(
      {},
    ),
    [choiceVersion, setChoiceVersion] = useState<string | null>(null),
    [page, setPage] = useState(0),
    [otherLimit, setOtherLimit] = useState(12);
  const review = conflict?.review;
  const choices = choiceVersion === review?.id ? storedChoices : noChoices;
  const open = accounts.conflictOpen && !!review;
  const savedReady = workspace.saved === "All changes saved";
  const available = accounts.online && accounts.enabled && accounts.signedIn;
  const refresh = useRef(accounts.refreshConflict);
  refresh.current = accounts.refreshConflict;
  useEffect(() => {
    if (open && savedReady && available) void refresh.current();
  }, [open, savedReady, available]);
  useEffect(() => {
    setChoices({});
    setChoiceVersion(review?.id || null);
    setPage(0);
    setOtherLimit(12);
  }, [review?.id]);
  const otherChanges = useMemo(
    () => (review ? otherChangedItems(review) : []),
    [review],
  );
  const chosen =
    review?.items.filter((item) => Object.hasOwn(choices, item.id)).length || 0;
  const preview = useMemo(() => {
    if (!review || chosen !== review.items.length)
      return { error: "", data: null };
    try {
      return { error: "", data: resolveWorkspaceReview(review, choices) };
    } catch (failure) {
      return { error: (failure as Error).message, data: null };
    }
  }, [review, choices, chosen]);
  if (!accounts.conflictOpen || !conflict || !review) return null;
  const busy = accounts.sync.busy || workspace.saved !== "All changes saved",
    count = review.items.length,
    pages = Math.max(1, Math.ceil(count / perPage));
  function chooseUnresolved(choice: ConflictChoice) {
    setChoiceVersion(review!.id);
    setChoices((previous) =>
      Object.fromEntries(
        review!.items.flatMap((item) => {
          const selected =
            (choiceVersion === review!.id ? previous[item.id] : undefined) ||
            (choice !== "both" || canKeepBoth(item) ? choice : undefined);
          return selected ? [[item.id, selected]] : [];
        }),
      ),
    );
  }
  return (
    <Modal
      title="Bring your changes together"
      subtitle="Compare what changed, then choose a version for each conflict. Other changes merge automatically."
      wide
      onClose={() => {
        if (!busy) accounts.setConflictOpen(false);
      }}
    >
      <div className="sync-review">
        {!accounts.online && (
          <p className="sync-review-notice">
            You can compare saved versions offline. Reconnect before applying
            your choices.
          </p>
        )}
        {!accounts.enabled && (
          <p className="sync-review-notice">
            Sync is paused on this device. Enable sync in Settings before
            applying your choices.
          </p>
        )}
        {!accounts.signedIn && (
          <p className="sync-review-notice">
            Sign in again before applying your choices. Your offline plans
            remain saved.
          </p>
        )}
        <div className="sync-review-summary">
          <GitCompareArrows size={21} />
          <div>
            <strong>
              {chosen} of {count} conflicts resolved
            </strong>
            <p>
              Choices apply only to the item shown. A local safety copy is saved
              before your plans change.
            </p>
          </div>
        </div>
        {!review.base && (
          <p className="sync-review-notice">
            No common saved version is available. Items found on only one side
            are treated as additions; review these copies before combining them.
          </p>
        )}
        {accounts.sync.error && (
          <p className="sync-review-notice" role="alert">
            {accounts.sync.error}
          </p>
        )}
        {count > 0 && (
          <div
            className="sync-review-bulk"
            role="group"
            aria-label="Choose unresolved conflicts"
          >
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => chooseUnresolved("local")}
            >
              Use device for unresolved
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => chooseUnresolved("account")}
            >
              Use account for unresolved
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => chooseUnresolved("both")}
            >
              Keep both where available
            </button>
          </div>
        )}
        {count === 0 && (
          <p className="sync-review-description">
            There are no remaining overlaps. Your separate changes can be
            combined after this review.
          </p>
        )}
        {pages > 1 && (
          <nav className="sync-review-pagination" aria-label="Conflict pages">
            <button
              className="button secondary"
              disabled={busy || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={15} />
              Previous conflicts
            </button>
            <span>
              Page {page + 1} of {pages}
            </span>
            <button
              className="button secondary"
              disabled={busy || page >= pages - 1}
              onClick={() => setPage((value) => value + 1)}
            >
              Next conflicts
              <ChevronRight size={15} />
            </button>
          </nav>
        )}
        <div className="sync-conflict-list">
          {review.items
            .slice(page * perPage, (page + 1) * perPage)
            .map((item) => {
              const description = itemDescription(item, review);
              return (
                <article
                  className="sync-conflict-card"
                  key={item.id}
                  data-conflict-id={item.id}
                >
                  <div className="sync-conflict-heading">
                    <div>
                      <span>
                        {description.category} · {description.context}
                      </span>
                      <h3>{description.label}</h3>
                    </div>
                    {choices[item.id] && (
                      <span className="sync-choice-saved">
                        <Check size={14} />
                        Chosen
                      </span>
                    )}
                  </div>
                  {item.reason && (
                    <p className="sync-review-notice">{item.reason}</p>
                  )}
                  {item.kind === "activity" &&
                    (item.memberIds?.length || 0) > 1 && (
                      <p className="sync-review-description">
                        This series includes linked occurrences and reschedules.
                        They stay together so their calendar rules remain valid.
                      </p>
                    )}
                  {item.kind === "task-series" && (
                    <p className="sync-review-description">
                      Repeating task copies and their history stay together.
                      Keeping both gives each version its own series.
                    </p>
                  )}
                  <SyncConflictComparison item={item} review={review} />
                  <fieldset className="sync-resolution-options" disabled={busy}>
                    <legend>Resolution for {description.label}</legend>
                    {(
                      [
                        [
                          "local",
                          "Use this device",
                          "Keep the version shown in the device column.",
                        ],
                        [
                          "account",
                          "Use account",
                          "Keep the version shown in the account column.",
                        ],
                        ...(canKeepBoth(item)
                          ? [
                              [
                                "both",
                                "Keep both",
                                "Keep both surviving versions as separate copies of this item.",
                              ],
                            ]
                          : []),
                      ] as [ConflictChoice, string, string][]
                    ).map(([value, label, help]) => (
                      <label
                        key={value}
                        className={choices[item.id] === value ? "selected" : ""}
                      >
                        <input
                          type="radio"
                          aria-label={label}
                          name={`resolve-${item.id}`}
                          value={value}
                          checked={choices[item.id] === value}
                          onChange={() => {
                            setChoiceVersion(review.id);
                            setChoices((previous) => ({
                              ...(choiceVersion === review.id ? previous : {}),
                              [item.id]: value,
                            }));
                          }}
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{help}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </article>
              );
            })}
        </div>
        {otherChanges.length > 0 && (
          <details className="sync-other-changes">
            <summary>
              Other activity and task changes merge automatically (
              {otherChanges.length})
            </summary>
            <p className="sync-review-description">
              These changes do not overlap the choices above.
            </p>
            {otherChanges.slice(0, otherLimit).map((item) => {
              const description = itemDescription(item, review);
              return (
                <details className="sync-automatic-item" key={item.id}>
                  <summary>
                    {description.label}
                    <span>{description.context}</span>
                  </summary>
                  <SyncConflictComparison item={item} review={review} />
                </details>
              );
            })}
            {otherChanges.length > otherLimit && (
              <button
                className="text-button"
                onClick={() => setOtherLimit((value) => value + 12)}
              >
                Show more automatic changes ({otherChanges.length - otherLimit}{" "}
                remaining)
              </button>
            )}
          </details>
        )}
        {preview.error && (
          <p className="sync-review-notice" role="alert">
            {preview.error}
          </p>
        )}
        {preview.data && (
          <p className="sync-review-preview" role="status">
            Reviewed result: {preview.data.schedules.length} planners ·{" "}
            {preview.data.schedules.reduce(
              (sum, schedule) => sum + schedule.entries.length,
              0,
            )}{" "}
            activity records · {preview.data.tasks.length} tasks
          </p>
        )}
        <div className="sync-review-tools">
          <button
            className="text-button"
            disabled={busy || !available}
            onClick={() => accounts.refreshConflict()}
          >
            <RefreshCw size={15} />
            Refresh comparison
          </button>
          <button
            className="text-button"
            onClick={() => downloadJSON(review.local)}
          >
            <Download size={15} />
            Download this device’s backup
          </button>
        </div>
        <div className="sync-review-footer">
          <span>
            {chosen < count
              ? `${count - chosen} conflicts still need a choice`
              : "Ready to apply your reviewed choices"}
          </span>
          <button
            className="button primary"
            disabled={busy || !available || chosen !== count || !preview.data}
            onClick={() =>
              accounts.resolveConflict({ reviewId: review.id, choices })
            }
          >
            <Check size={16} />
            {accounts.sync.busy ? "Syncing…" : "Apply reviewed changes"}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => accounts.setConflictOpen(false)}
          >
            Review later
          </button>
        </div>
      </div>
    </Modal>
  );
}
