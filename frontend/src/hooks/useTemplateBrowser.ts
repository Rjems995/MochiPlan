import { useState } from "react";
import { defaultDesign, getTheme, uid } from "../model";
import { templates, type Template } from "../seed";
import type { NavigationController } from "./useNavigation";
import type { WorkspaceController } from "./useWorkspace";
export function useTemplateBrowser(
  workspace: WorkspaceController,
  navigation: NavigationController,
  query: string,
  notify: (text: string) => void,
) {
  const { active, p, updateSchedule } = workspace;
  const { setPage } = navigation;
  const [templatePreview, setTemplatePreview] = useState<Template | null>(null);
  const [templateFilter, setTemplateFilter] = useState("All templates");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const visibleTemplates = templates.filter(
    (t) =>
      (templateFilter === "All templates" || t.category === templateFilter) &&
      (!favoritesOnly || p?.favorites.includes(t.id)) &&
      t.name.toLowerCase().includes(query.toLowerCase()),
  );
  function applyTemplate(t: Template) {
    if (!active) return;
    const theme = getTheme(t.theme);
    const oldTheme = getTheme(active.design.theme);
    updateSchedule((s) => ({
      ...s,
      title: t.name,
      design: {
        ...defaultDesign(theme),
        pattern: t.pattern,
        font: t.font,
        subtitle: t.subtitle,
        stickers: [
          { id: uid(), emoji: t.emoji, x: 85, y: 5, size: 38, rotation: 10 },
        ],
      },
      entries: s.entries.map((e) => ({
        ...e,
        color:
          theme.palette[Math.max(0, oldTheme.palette.indexOf(e.color)) % 5],
      })),
    }));
    setTemplatePreview(null);
    setPage("studio");
    notify(`${t.name} is all yours. Your activities are still here.`);
  }
  return {
    templatePreview,
    setTemplatePreview,
    templateFilter,
    setTemplateFilter,
    favoritesOnly,
    setFavoritesOnly,
    visibleTemplates,
    applyTemplate,
  };
}
export type TemplateBrowserController = ReturnType<typeof useTemplateBrowser>;
