import { ArrowUpRight, Flower2, Heart, Search } from "lucide-react";
import { TemplatePreview } from "../components/TemplatePreview";
import { useAppContext } from "../context/AppContext";
import { templates } from "../seed";
export function TemplatesPage() {
  const {
    p,
    navigation: { query, setQuery },
    templateBrowser: {
      favoritesOnly,
      setFavoritesOnly,
      templateFilter,
      setTemplateFilter,
      visibleTemplates,
      setTemplatePreview,
    },
    workspace: { pref },
  } = useAppContext();

  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">PICK A LITTLE INSPIRATION</div>
          <h1>
            The template garden
            <span className="title-heart">✿</span>
          </h1>
          <p>Thoughtfully made, ready to grow into something that’s yours.</p>
        </div>
        <span className="template-count">
          {templates.length} little ways to plan
        </span>
      </div>
      <div className="template-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search templates"
            placeholder="Find your kind of lovely…"
            value={query}
            onChange={(ev) => setQuery(ev.target.value)}
          />
        </label>
        <button
          className={`button secondary ${favoritesOnly ? "selected" : ""}`}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Heart size={15} fill={favoritesOnly ? "currentColor" : "none"} />
          My favorites
        </button>
      </div>
      <div className="filter-pills">
        {[
          "All templates",
          ...Array.from(new Set(templates.map((t) => t.category))),
        ].map((c) => (
          <button
            className={templateFilter === c ? "active" : ""}
            key={c}
            onClick={() => setTemplateFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="template-gallery">
        {visibleTemplates.map((t) => (
          <article className="template-card" key={t.id}>
            <button
              className="template-preview-button"
              onClick={() => setTemplatePreview(t)}
              aria-label={`Preview ${t.name}`}
            >
              <TemplatePreview template={t} />
              <span className="template-hover">
                Take a little look
                <ArrowUpRight size={15} />
              </span>
            </button>
            <div className="template-card-info">
              <button onClick={() => setTemplatePreview(t)}>
                <h3>{t.name}</h3>
                <p>{t.category}</p>
              </button>
              <button
                className={`icon-button ${p.favorites.includes(t.id) ? "favorited" : ""}`}
                aria-label={`${p.favorites.includes(t.id) ? "Unfavorite" : "Favorite"} ${t.name}`}
                onClick={() =>
                  pref({
                    favorites: p.favorites.includes(t.id)
                      ? p.favorites.filter((id) => id !== t.id)
                      : [...p.favorites, t.id],
                  })
                }
              >
                <Heart
                  size={17}
                  fill={p.favorites.includes(t.id) ? "currentColor" : "none"}
                />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!visibleTemplates.length && (
        <div className="empty-state">
          <Flower2 size={34} />
          <h3>Nothing growing here just yet.</h3>
          <p>Try a different search or favorite a little inspiration.</p>
        </div>
      )}
    </>
  );
}
