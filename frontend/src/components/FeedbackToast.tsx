import { CheckCircle2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppContext } from "../context/AppContext";
export function FeedbackToast() {
  const {
    feedback: { toast, setToast },
  } = useAppContext();
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          className="toast"
          role="status"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
