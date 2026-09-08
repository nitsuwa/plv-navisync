import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Building2 } from "lucide-react";
import { BUILDING_CATEGORIES } from "./constants";
import { genId } from "./constants";
import { Combobox } from "../ui/Combobox";
import { SPRING, DURATION } from "../../config/animation";
import { createDefaultFloor } from "../../lib/floorPlanNormalization";
import type { BuildingWizardData, FloorPlan } from "./types";

interface BuildingWizardModalProps {
  onClose: () => void;
  onSave: (data: BuildingWizardData) => void;
}

const inputCls =
  "w-full h-10 px-3.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

export function BuildingWizardModal({ onClose, onSave }: BuildingWizardModalProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("Academic");
  const [desc, setDesc] = useState("");
  const [floors, setFloors] = useState(3);

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
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
              Add Building
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wizard-bldg-name" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Building Name *
                </label>
                <input id="wizard-bldg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Main Academic Building"
                  className={inputCls}
                  style={{ fontFamily: "var(--font-body)" }}
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="wizard-bldg-code" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                  Code *
                </label>
                <input id="wizard-bldg-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 30))}
                  placeholder="BLDG-01"
                  className={inputCls}
                  style={{ fontFamily: "var(--font-body)" }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Category</label>
                <Combobox
                  value={category}
                  onChange={setCategory}
                  options={BUILDING_CATEGORIES.map((c) => ({
                    value: c,
                    label: c,
                    icon: Building2,
                  }))}
                  placeholder="Select category"
                  searchPlaceholder="Search categories..."
                />
              </div>
              <div>
                <label htmlFor="wizard-bldg-floors" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Number of Floors</label>
                <input id="wizard-bldg-floors"
                  type="number"
                  min={1}
                  max={20}
                  value={floors}
                  onChange={(e) => setFloors(parseInt(e.target.value) || 1)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label htmlFor="wizard-bldg-desc" className="block text-xs font-bold uppercase tracking-wide mb-1.5 text-foreground">Description</label>
              <textarea id="wizard-bldg-desc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder="Brief description..."
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground text-sm resize-y min-h-[44px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-200"
                style={{ fontFamily: "var(--font-body)" }}
              />
            </div>
            <div
              className="text-xs text-muted-foreground px-3 py-2.5 rounded-xl border border-border bg-muted/30"
              style={{ fontFamily: "var(--font-body)" }}
            >
              {floors} empty floor plan{floors !== 1 ? "s" : ""} will be created automatically.
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
              onClick={() => {
                if (!name.trim() || !code.trim()) return;
                const floorArr: FloorPlan[] = Array.from({ length: floors }, (_, i) =>
                  createDefaultFloor({ id: genId("floor"), number: i + 1 })
                );
                onSave({ name: name.trim(), code: code.trim(), category, description: desc, floors: floorArr });
              }}
              disabled={!name.trim() || !code.trim()}
              className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add Building
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
