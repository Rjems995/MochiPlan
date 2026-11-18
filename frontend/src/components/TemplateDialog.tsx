import { Sparkles } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { Modal } from "./Modal";
import { TemplatePreview } from "./TemplatePreview";
export function TemplateDialog() {
  const {
    active,
    templateBrowser: { templatePreview, setTemplatePreview, applyTemplate },
  } = useAppContext();
  return (
    <>
      {templatePreview && (
        <Modal
          title={templatePreview.name}
          subtitle="A little inspiration for your current planner."
          onClose={() => setTemplatePreview(null)}
          wide
        >
          <div className="template-modal-preview">
            <TemplatePreview template={templatePreview} large />
          </div>
          <p className="muted">
            The design will be applied to “{active.name}”. Your activities stay
            in place, with colors matched to the new palette. You can customize
            every detail in the studio.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setTemplatePreview(null)}
            >
              Keep browsing
            </button>
            <button
              className="button primary"
              onClick={() => applyTemplate(templatePreview)}
            >
              <Sparkles size={16} />
              Make it mine
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
