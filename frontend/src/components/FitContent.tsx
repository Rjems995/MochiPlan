import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { viewportLayout } from "../viewportLayout";
import { useViewportPan } from "../hooks/useViewportPan";

/** Fit the whole design in its allotted space without changing its export layout. */
export function FitContent({
  children,
  minWidth,
  maxWidth = 1600,
  align = "center",
  onScaleChange,
  onSizeChange,
  fixedWidth,
  zoom = 1,
  panMode = false,
  interactiveViewport = false,
}: {
  children: ReactNode;
  minWidth: number;
  maxWidth?: number;
  align?: "start" | "center";
  onScaleChange?: (scale: number) => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  fixedWidth?: number;
  zoom?: number;
  panMode?: boolean;
  interactiveViewport?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const camera = useViewportPan(
    viewport,
    content,
    interactiveViewport && zoom > 1,
    panMode,
    zoom,
  );
  const current = useRef({ zoom, pan: camera.pan });
  current.current = { zoom, pan: camera.pan };
  const measureRef = useRef(() => {});
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
      const position = viewportLayout({
        width,
        height,
        frameWidth: frame.clientWidth,
        frameHeight: frame.clientHeight,
        align,
        ...current.current,
      });
      const next = {
        width,
        scale: position.scale,
        x: position.x,
        y: position.y,
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
      onScaleChange?.(position.scale);
      onSizeChange?.({ width: frame.clientWidth, height: frame.clientHeight });
    };
    measureRef.current = measure;
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
  useLayoutEffect(
    () => measureRef.current(),
    [zoom, camera.pan.x, camera.pan.y],
  );
  return (
    <div
      className={`fit-viewport ${interactiveViewport ? "planner-viewport" : ""} ${camera.active ? "pan-active" : ""} ${camera.dragging ? "pan-dragging" : ""}`}
      ref={viewport}
      data-scale={layout.scale}
      data-zoom={zoom}
      data-pan-x={camera.pan.x}
      data-pan-y={camera.pan.y}
      role={interactiveViewport ? "region" : undefined}
      aria-label={interactiveViewport ? "Planner canvas" : undefined}
      tabIndex={interactiveViewport ? 0 : undefined}
      style={{ touchAction: camera.active ? "none" : undefined }}
      {...camera.handlers}
    >
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
