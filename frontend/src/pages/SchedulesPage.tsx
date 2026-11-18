import { format } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { TemplatePreview } from "../components/TemplatePreview";
import { useAppContext } from "../context/AppContext";
import { getTheme } from "../model";
export function SchedulesPage() {
  const {
    data,
    planners: { openNewPlanner, setRenameValue, setRenameId, setDeleteId },
    navigation: { query, setQuery },
    collection: {
      setGalleryElement,
      galleryGrid,
      gallerySchedules,
      filteredSchedules,
      currentGalleryPage,
      galleryCapacity,
      setGalleryPage,
      galleryPageCount,
    },
    studio: { chooseSchedule },
    workspace: { duplicateSchedule },
  } = useAppContext();

  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">A PLACE FOR ALL YOUR PLANS</div>
          <h1>
            My little collection
            <span className="title-heart">♡</span>
          </h1>
          <p>
            A fresh semester, a busy week, or a routine that feels like you.
          </p>
        </div>
        <button className="button primary" onClick={openNewPlanner}>
          <Plus size={16} />
          New schedule
        </button>
      </div>
      <div className="collection-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search schedules"
            placeholder="Find a little plan…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </label>
        <span className="muted">
          {data.schedules.length} saved on this device
        </span>
      </div>
      <div
        className="schedule-gallery"
        ref={setGalleryElement}
        style={
          {
            "--gallery-columns": galleryGrid.columns,
            "--gallery-rows": galleryGrid.rows,
          } as React.CSSProperties
        }
      >
        {gallerySchedules.map((s) => (
          <article className="schedule-card" key={s.id}>
            <button
              className="schedule-card-preview"
              onClick={() => chooseSchedule(s.id)}
            >
              <TemplatePreview
                template={{
                  id: s.id,
                  name: s.title,
                  theme: s.design.theme,
                  pattern: s.design.pattern,
                  font: s.design.font,
                  emoji: getTheme(s.design.theme).emoji,
                  category: s.type,
                  subtitle: s.design.subtitle,
                }}
              />
            </button>
            <div className="schedule-card-info">
              <button onClick={() => chooseSchedule(s.id)}>
                <h3>{s.name}</h3>
                <p>
                  {s.type} · {s.entries.length} activities
                </p>
                <small>Edited {format(s.updatedAt, "MMM d, h:mm a")}</small>
              </button>
              <div>
                <button
                  className="icon-button"
                  aria-label={`Rename ${s.name}`}
                  onClick={() => {
                    setRenameValue(s.name);
                    setRenameId(s.id);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Duplicate ${s.name}`}
                  onClick={() => duplicateSchedule(s)}
                >
                  <Copy size={15} />
                </button>
                <button
                  className="icon-button danger"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => setDeleteId(s.id)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {!filteredSchedules.length && (
          <button className="new-planner-card" onClick={openNewPlanner}>
            <span>
              <Plus size={25} />
            </span>
            <h3>{query ? "A fresh plan?" : "A little fresh start"}</h3>
            {query && <p>No schedules match “{query}”.</p>}
            <p>Create something lovely.</p>
          </button>
        )}
      </div>
      <nav className="collection-pager" aria-label="Schedule pages">
        <span>
          {filteredSchedules.length
            ? `${currentGalleryPage * galleryCapacity + 1}–${Math.min((currentGalleryPage + 1) * galleryCapacity, filteredSchedules.length)} of ${filteredSchedules.length} schedules`
            : "No matching schedules"}
        </span>
        <div>
          <button
            className="button secondary small"
            aria-label="Previous schedule page"
            disabled={currentGalleryPage === 0}
            onClick={() => setGalleryPage(currentGalleryPage - 1)}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <span aria-live="polite">
            Page {currentGalleryPage + 1} of {galleryPageCount}
          </span>
          <button
            className="button secondary small"
            aria-label="Next schedule page"
            disabled={currentGalleryPage + 1 === galleryPageCount}
            onClick={() => setGalleryPage(currentGalleryPage + 1)}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </nav>
    </>
  );
}
