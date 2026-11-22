import type { BackgroundImageAdjustment } from "../model";
import { legacyImageAdjustment } from "../backgroundImage";

export function PlannerBackgroundPhoto({
  image,
  adjustment = legacyImageAdjustment,
  onLoad,
  onError,
}: {
  image: string;
  adjustment?: BackgroundImageAdjustment;
  onLoad?: (size: { width: number; height: number }) => void;
  onError?: () => void;
}) {
  return (
    <div className="planner-background-photo" aria-hidden="true">
      <img
        alt=""
        src={image}
        draggable={false}
        style={{
          objectFit: adjustment.fit,
          objectPosition: `${adjustment.x}% ${adjustment.y}%`,
          transform: `scale(${adjustment.zoom / 100})`,
          transformOrigin: `${adjustment.x}% ${adjustment.y}%`,
        }}
        onLoad={(event) =>
          onLoad?.({
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })
        }
        onError={onError}
      />
      <div className="planner-background-photo-veil" />
    </div>
  );
}
