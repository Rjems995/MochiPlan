import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
} from "react";
import { viewportLayout, type ViewportPoint } from "../viewportLayout";

export function useViewportPan(
  frame: RefObject<HTMLDivElement | null>,
  content: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  panMode: boolean,
  zoom: number,
) {
  const [pan, setPan] = useState<ViewportPoint>({ x: 0, y: 0 });
  const [space, setSpace] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    pan: ViewportPoint;
  } | null>(null);
  const ignoreClick = useRef(0);
  const current = useRef(pan);
  current.current = pan;
  const constrain = useCallback(
    (point: ViewportPoint) => {
      if (!frame.current || !content.current) return { x: 0, y: 0 };
      return viewportLayout({
        width: content.current.offsetWidth,
        height: content.current.offsetHeight,
        frameWidth: frame.current.clientWidth,
        frameHeight: frame.current.clientHeight,
        zoom,
        pan: point,
      }).pan;
    },
    [frame, content, zoom],
  );
  const move = useCallback(
    (update: (point: ViewportPoint) => ViewportPoint) => {
      setPan((previous) => {
        const next = constrain(update(constrain(previous)));
        return next.x === previous.x && next.y === previous.y ? previous : next;
      });
    },
    [constrain],
  );
  useEffect(() => {
    if (!enabled) {
      setPan({ x: 0, y: 0 });
      setSpace(false);
      return;
    }
    const element = frame.current;
    const down = (event: globalThis.KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        !(event.target instanceof HTMLElement)
      )
        return;
      if (
        event.target.closest(
          "input,textarea,select,button,[role=slider],.schedule-block",
        )
      )
        return;
      if (event.target !== document.body && !element?.contains(event.target))
        return;
      event.preventDefault();
      setSpace(true);
    };
    const up = (event: globalThis.KeyboardEvent) => {
      if (event.code === "Space") setSpace(false);
    };
    const blur = () => {
      setSpace(false);
      setDragging(false);
      if (drag.current && element?.hasPointerCapture(drag.current.id))
        element.releasePointerCapture(drag.current.id);
      drag.current = null;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element!.clientHeight
            : 1;
      move((point) => ({
        x: point.x - event.deltaX * unit,
        y: point.y - event.deltaY * unit,
      }));
    };
    document.addEventListener("keydown", down);
    document.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    element?.addEventListener("wheel", wheel, { passive: false });
    return () => {
      document.removeEventListener("keydown", down);
      document.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      element?.removeEventListener("wheel", wheel);
      blur();
    };
  }, [enabled, frame, move]);
  const active = enabled && (panMode || space);
  const stopClick = (event: MouseEvent<HTMLDivElement>) => {
    if (active || Date.now() < ignoreClick.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const touch = (event: TouchEvent<HTMLDivElement>) => {
    if (enabled) event.stopPropagation();
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    setDragging(false);
    ignoreClick.current = Date.now() + 250;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    pan,
    active,
    dragging,
    handlers: {
      onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (!active || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (drag.current) return;
        event.currentTarget.focus({ preventScroll: true });
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          pan: constrain(current.current),
        };
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMoveCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.id !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const start = drag.current;
        move(() => ({
          x: start.pan.x + event.clientX - start.x,
          y: start.pan.y + event.clientY - start.y,
        }));
      },
      onPointerUpCapture: end,
      onPointerCancelCapture: end,
      onLostPointerCapture: () => {
        drag.current = null;
        setDragging(false);
      },
      onClickCapture: stopClick,
      onDoubleClickCapture: stopClick,
      onTouchStartCapture: touch,
      onTouchMoveCapture: touch,
      onTouchEndCapture: touch,
      onKeyDownCapture: (event: KeyboardEvent<HTMLDivElement>) => {
        if (!enabled || (!active && event.target !== event.currentTarget))
          return;
        const delta: Record<string, number[]> = {
          ArrowLeft: [1, 0],
          ArrowRight: [-1, 0],
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
        };
        if (!delta[event.key]) return;
        event.preventDefault();
        event.stopPropagation();
        const [x, y] = delta[event.key],
          step = event.shiftKey ? 120 : 40;
        move((point) => ({ x: point.x + x * step, y: point.y + y * step }));
      },
    },
  };
}
