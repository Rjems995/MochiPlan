import { useEffect, useRef, useState } from "react";
import { ImagePlus, SlidersHorizontal, X } from "lucide-react";
import type { Design } from "../model";
import {
  defaultImageAdjustment,
  legacyImageAdjustment,
} from "../backgroundImage";
import { BackgroundImageDialog } from "./BackgroundImageDialog";

export function BackgroundImageControls({
  design,
  onDesign,
  aspect,
  notify,
}: {
  design: Design;
  onDesign: (patch: Partial<Design>) => void;
  aspect: number;
  notify: (text: string) => void;
}) {
  const upload = useRef<HTMLInputElement>(null),
    reader = useRef<FileReader | null>(null);
  const [editing, setEditing] = useState<{
    image: string;
    baseImage: string;
    initial: NonNullable<Design["imageAdjustment"]>;
    baseAdjustment: string | undefined;
  } | null>(null);
  useEffect(() => () => reader.current?.abort(), []);
  function open(image: string, fresh = false) {
    setEditing({
      image,
      baseImage: design.image,
      baseAdjustment: JSON.stringify(design.imageAdjustment),
      initial: {
        ...(fresh
          ? defaultImageAdjustment
          : design.imageAdjustment || legacyImageAdjustment),
      },
    });
  }
  return (
    <>
      <button
        className="upload-background"
        onClick={() => upload.current?.click()}
      >
        <ImagePlus size={15} />
        {design.image ? "Replace background" : "Upload a background"}
      </button>
      {design.image && (
        <div className="background-photo-actions">
          <button
            className="button secondary"
            onClick={() => open(design.image)}
          >
            <SlidersHorizontal size={15} /> Adjust background
          </button>
          <button
            className="text-button"
            onClick={() => onDesign({ image: "", imageAdjustment: undefined })}
          >
            Remove image <X size={13} />
          </button>
        </div>
      )}
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
            notify("Choose a PNG, JPG, or WebP photo.");
            return;
          }
          if (file.size > 5 * 1024 * 1024) {
            notify("Choose an image smaller than 5 MB.");
            return;
          }
          reader.current?.abort();
          const next = new FileReader();
          reader.current = next;
          next.onload = () => open(String(next.result), true);
          next.onerror = () =>
            notify("That image could not be opened. Please try another.");
          next.readAsDataURL(file);
        }}
      />
      {editing && (
        <BackgroundImageDialog
          image={editing.image}
          initial={editing.initial}
          background={design.background}
          aspect={aspect}
          onClose={() => setEditing(null)}
          onSave={(adjustment) => {
            if (
              design.image !== editing.baseImage ||
              JSON.stringify(design.imageAdjustment) !== editing.baseAdjustment
            ) {
              notify(
                "Your background changed while you were adjusting it. Open it again to review the latest photo.",
              );
              setEditing(null);
              return;
            }
            onDesign({ image: editing.image, imageAdjustment: adjustment });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
