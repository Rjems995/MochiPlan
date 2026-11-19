import { format, parseISO } from "date-fns";
import { editScopes, type EditScope } from "../series";

export function EditScopeControl({
  value,
  date,
  onChange,
}: {
  value: EditScope;
  date: string;
  onChange: (scope: EditScope) => void;
}) {
  return (
    <fieldset className="edit-scope">
      <legend>Apply changes to</legend>
      <div className="edit-scope-options">
        {editScopes.map((scope) => (
          <label key={scope.value}>
            <input
              type="radio"
              name="edit-scope"
              value={scope.value}
              checked={value === scope.value}
              onChange={() => onChange(scope.value)}
            />
            <span>{scope.label}</span>
          </label>
        ))}
      </div>
      <p className="edit-scope-help">
        {value === "date"
          ? `Only the occurrence on ${format(parseISO(date), "MMM d, yyyy")}. Choose a new event date to reschedule it.`
          : value === "future"
            ? `This occurrence and later dates, from ${format(parseISO(date), "MMM d, yyyy")}. Earlier classes stay unchanged.`
            : "Apply the fields you change across all dates in this repeating series."}
      </p>
    </fieldset>
  );
}
