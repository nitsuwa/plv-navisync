import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { genId } from "./constants";
import { SPRING, DURATION } from "../../config/animation";
import { createDefaultFloor } from "../../lib/floorPlanNormalization";
import type { FloorPlan } from "./types";

interface FloorWizardModalProps {
  nextNumber: number;
  onClose: () => void;
  onSave: (floor: FloorPlan) => void;
}

export function FloorWizardModal({ nextNumber, onClose, onSave }: FloorWizardModalProps) {
  const [label, setLabel] = useState(nextNumber === 1 ? "Ground Floor" : `Floor ${nextNumber}`);
  const [number, setNumber] = useState(nextNumber);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.fast }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
              Add Floor
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="floor-number" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Floor Number</label>
                <input id="floor-number"
                  type="number"
                  min={0}
                  value={number}
                  onChange={(e) => setNumber(parseInt(e.target.value) || 1)}
                  className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label htmlFor="floor-label" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Floor Label</label>
                <input id="floor-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ground Floor"
                  className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-6 pb-5">
            <button
              onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() =>
                onSave(createDefaultFloor({
                  id: genId("floor"),
                  number,
                  label: label || `Floor ${number}`,
                }))
              }
              disabled={!label.trim()}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Add Floor
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
