import { useEffect, useLayoutEffect, useState } from "react";
import { type Schedule } from "../model";

export function useScheduleCollection(schedules: Schedule[], query: string) {
  const [galleryPage, setGalleryPage] = useState(0);
  const [galleryElement, setGalleryElement] = useState<HTMLDivElement | null>(
    null,
  );
  const [galleryGrid, setGalleryGrid] = useState({ columns: 3, rows: 1 });
  useLayoutEffect(() => {
    if (!galleryElement) return;
    const measure = () => {
      const columns =
        galleryElement.clientWidth < 520
          ? 1
          : galleryElement.clientWidth < 900
            ? 2
            : 3;
      const rows = Math.max(
        1,
        Math.min(
          3,
          Math.floor(galleryElement.clientHeight / (columns === 1 ? 145 : 215)),
        ),
      );
      setGalleryGrid((old) =>
        old.columns === columns && old.rows === rows ? old : { columns, rows },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(galleryElement);
    measure();
    return () => observer.disconnect();
  }, [galleryElement]);
  useEffect(() => setGalleryPage(0), [query]);
  const filteredSchedules = schedules.filter((s) =>
    (s.name + " " + s.title).toLowerCase().includes(query.toLowerCase()),
  );
  const galleryCapacity = galleryGrid.columns * galleryGrid.rows;
  const galleryPageCount = Math.max(
    1,
    Math.ceil(filteredSchedules.length / galleryCapacity),
  );
  const currentGalleryPage = Math.min(galleryPage, galleryPageCount - 1);
  const gallerySchedules = filteredSchedules.slice(
    currentGalleryPage * galleryCapacity,
    (currentGalleryPage + 1) * galleryCapacity,
  );
  return {
    galleryGrid,
    galleryCapacity,
    galleryPageCount,
    currentGalleryPage,
    gallerySchedules,
    filteredSchedules,
    setGalleryPage,
    setGalleryElement,
  };
}
export type ScheduleCollectionController = ReturnType<
  typeof useScheduleCollection
>;
