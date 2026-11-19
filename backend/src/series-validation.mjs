export function validSeriesMetadata(entries, date, weekday) {
  const ids = new Map(entries.map((e) => [e.id, e]));
  const origins = new Set(),
    groups = new Map();
  const identifier = (v) =>
    typeof v === "string" && !!v.trim() && v.length <= 200;
  const family = (e) => e.seriesId || e.id;
  for (const e of entries) {
    if (
      (e.seriesId !== undefined && !identifier(e.seriesId)) ||
      (e.startsOn !== undefined && !date(e.startsOn)) ||
      (e.endsOn !== undefined && !date(e.endsOn)) ||
      (e.startsOn && e.endsOn && e.startsOn > e.endsOn) ||
      (e.date && (e.startsOn !== undefined || e.endsOn !== undefined))
    )
      return false;
    if (e.sourceId !== undefined || e.originalDate !== undefined) {
      if (
        !e.date ||
        !identifier(e.sourceId) ||
        !identifier(e.seriesId) ||
        !date(e.originalDate)
      )
        return false;
      const source = ids.get(e.sourceId),
        key = JSON.stringify([e.sourceId, e.originalDate]);
      if (
        !source ||
        source.date ||
        family(source) !== e.seriesId ||
        weekday(e.originalDate) !== source.day ||
        !source.cancelledDates?.includes(e.originalDate) ||
        origins.has(key)
      )
        return false;
      origins.add(key);
    } else if (e.date && e.seriesId !== undefined) return false;
    if (!e.date) {
      const group = groups.get(family(e)) || [];
      group.push(e);
      groups.set(family(e), group);
    }
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) =>
      (a.startsOn || "0001-01-01").localeCompare(b.startsOn || "0001-01-01"),
    );
    for (let i = 1; i < sorted.length; i++)
      if (
        (sorted[i - 1].endsOn || "9999-12-31") >=
        (sorted[i].startsOn || "0001-01-01")
      )
        return false;
  }
  return true;
}
