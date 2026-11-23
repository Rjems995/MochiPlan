import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Fit the whole design in its allotted space without changing its export layout. */
export function FitContent({
  children,
  minWidth,
  maxWidth = 1600,
  align = "center",
  onScaleChange,
  onSizeChange,
  fixedWidth,
}: {
  children: ReactNode;
  minWidth: number;
  maxWidth?: number;
  align?: "start" | "center";
  onScaleChange?: (scale: number) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  fixedWidth?: number;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({
    width: minWidth,
    scale: 1,
    x: 0,
    y: 0,
  });
  useLayoutEffect(() => {
    const frame = viewport.current;
    const design = content.current;
    if (!frame || !design) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !frame.clientWidth || !frame.clientHeight) return;
      const width =
        fixedWidth ?? Math.max(minWidth, Math.min(maxWidth, frame.clientWidth));
      design.style.width = `${width}px`;
      const height = Math.max(1, design.offsetHeight);
      const scale = Math.min(
        1,
        frame.clientWidth / width,
        frame.clientHeight / height,
      );
      const next = {
        width,
        scale,
        x: Math.max(0, (frame.clientWidth - width * scale) / 2),
        y:
          align === "start"
            ? 0
            : Math.max(0, (frame.clientHeight - height * scale) / 2),
      };
      setLayout((old) =>
        Object.keys(next).every(
          (key) =>
            Math.abs(
              old[key as keyof typeof old] - next[key as keyof typeof next],
            ) < 0.001,
        )
          ? old
          : next,
      );
      onScaleChange?.(scale);
      onSizeChange?.({ width: frame.clientWidth, height: frame.clientHeight });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(design);
    measure();
    document.fonts.ready.then(measure);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [minWidth, maxWidth, align, onScaleChange, onSizeChange, fixedWidth]);
  return (
    <div className="fit-viewport" ref={viewport} data-scale={layout.scale}>
      <div
        className="fit-content"
        ref={content}
        style={{
          width: layout.width,
          left: layout.x,
          top: layout.y,
          transform: `scale(${layout.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
