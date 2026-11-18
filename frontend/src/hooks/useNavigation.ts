import { useState } from "react";
import { type Page } from "../model";

export function useNavigation() {
  const [page, setPage] = useState<Page>("studio");
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  function navigate(next: Page) {
    setPage(next);
    setQuery("");
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return {
    page,
    setPage,
    query,
    setQuery,
    mobileMenu,
    setMobileMenu,
    navigate,
  };
}
export type NavigationController = ReturnType<typeof useNavigation>;
