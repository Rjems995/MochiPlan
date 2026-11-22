import { useState } from "react";
import type { MergeConflictItem, WorkspaceReview } from "../services/syncTypes";
import {
  comparisonRows,
  fieldName,
  readableValue,
  type ComparisonRow,
} from "../services/syncReviewDisplay";
import { same } from "../services/syncMerge";

function ReviewValue({ value }: { value: any }) {
  if (
    typeof value === "string" &&
    /^data:image\/(png|jpeg|webp);base64,/.test(value)
  )
    return (
      <img
        className="sync-review-image"
        src={value}
        alt="Uploaded background preview"
        loading="lazy"
      />
    );
  const text = typeof value === "string" ? value : readableValue(value);
  return (
    <div
      className="sync-review-value"
      tabIndex={text.length > 300 ? 0 : undefined}
    >
      {/^#[a-f\d]{6}$/i.test(text) && (
        <span className="sync-review-swatch" style={{ background: text }} />
      )}
      {text}
    </div>
  );
}
function Rows({
  rows,
  baseKnown,
}: {
  rows: ComparisonRow[];
  baseKnown: boolean;
}) {
  return (
    <div className="sync-review-fields">
      {rows.map((row) => (
        <section
          className="sync-review-field"
          key={row.key}
          aria-label={`${row.label} comparison`}
        >
          <h5>
            {row.label}
            {row.conflict && (
              <span className="sync-conflict-marker">Both changed</span>
            )}
          </h5>
          <div className="sync-compare-columns">
            <div>
              <span className="sync-column-label">Before</span>
              <ReviewValue
                value={baseKnown ? row.base : "No common saved version"}
              />
            </div>
            <div
              className={
                row.conflict || !same(row.base, row.local) ? "has-change" : ""
              }
            >
              <span className="sync-column-label">This device</span>
              <ReviewValue value={row.local} />
            </div>
            <div
              className={
                row.conflict || !same(row.base, row.account) ? "has-change" : ""
              }
            >
              <span className="sync-column-label">Your account</span>
              <ReviewValue value={row.account} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
function RecordComparisons({
  base = [],
  local = [],
  account = [],
  review,
  task = false,
}: {
  base?: any[];
  local?: any[];
  account?: any[];
  review: WorkspaceReview;
  task?: boolean;
}) {
  const [limit, setLimit] = useState(8);
  const maps = [base, local, account].map(
    (records) => new Map(records.map((record) => [record.id, record])),
  );
  const ids = [
    ...new Set([...base, ...local, ...account].map((record) => record.id)),
  ].filter((id) =>
    review.base
      ? !same(maps[0].get(id), maps[1].get(id)) ||
        !same(maps[0].get(id), maps[2].get(id))
      : !same(maps[1].get(id), maps[2].get(id)),
  );
  return (
    <div className="sync-record-comparisons">
      {ids.slice(0, limit).map((id) => {
        const [before, device, server] = maps.map((map) => map.get(id)),
          record = before || device || server;
        const rows = comparisonRows(
          before,
          device,
          server,
          !!review.base,
          task
            ? [
                "presence",
                "title",
                "subject",
                "due",
                "dueTime",
                "priority",
                "done",
                "reminderMinutes",
                "recurrence",
                "subtasks",
              ]
            : [
                "presence",
                "title",
                "day",
                "time",
                "location",
                "instructor",
                "notes",
                "color",
                "date",
                "startsOn",
                "endsOn",
                "cancelledDates",
                "originalDate",
                "sourceId",
                "seriesId",
              ],
          review.local.preferences.time24,
        );
        return (
          <section className="sync-record" key={id}>
            {ids.length > 1 && (
              <h4>
                {record.title}
                {record.date && <span>{readableValue(record.date)}</span>}
                {task && record.due && (
                  <span>Due {readableValue(record.due)}</span>
                )}
              </h4>
            )}
            <Rows rows={rows} baseKnown={!!review.base} />
          </section>
        );
      })}
      {ids.length > limit && (
        <button
          className="text-button"
          onClick={() => setLimit((value) => value + 8)}
        >
          Show more changes ({ids.length - limit} remaining)
        </button>
      )}
    </div>
  );
}
export function SyncConflictComparison({
  item,
  review,
}: {
  item: MergeConflictItem;
  review: WorkspaceReview;
}) {
  if (item.kind === "activity" || item.kind === "task-series")
    return (
      <RecordComparisons
        base={item.base || []}
        local={item.local || []}
        account={item.account || []}
        review={review}
        task={item.kind === "task-series"}
      />
    );
  if (item.kind === "planner") {
    const rows = comparisonRows(
      item.base,
      item.local,
      item.account,
      !!review.base,
      [
        "presence",
        "name",
        "title",
        "type",
        "termStart",
        "termEnd",
        "holidays",
        "design",
      ],
      review.local.preferences.time24,
    );
    return (
      <>
        <Rows rows={rows} baseKnown={!!review.base} />
        <RecordComparisons
          base={item.base?.entries}
          local={item.local?.entries}
          account={item.account?.entries}
          review={review}
        />
      </>
    );
  }
  if (item.kind === "task")
    return (
      <RecordComparisons
        base={item.base ? [item.base] : []}
        local={item.local ? [item.local] : []}
        account={item.account ? [item.account] : []}
        review={review}
        task
      />
    );
  const property = item.path.at(-1) || "Value";
  return (
    <Rows
      baseKnown={!!review.base}
      rows={[
        {
          key: item.id,
          label: fieldName(property),
          base: item.base,
          local: item.local,
          account: item.account,
          conflict: true,
        },
      ]}
    />
  );
}
