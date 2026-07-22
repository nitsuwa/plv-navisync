import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles, X, ChevronRight, ChevronLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "../../lib/utils";

interface CreateCampusGuideProps {
  open: boolean;
  onClose: () => void;
  onStartCreating: () => void;
}

const STEPS = [
  {
    title: "Campus Identity",
    description: "Give your campus a name (e.g. \"Main Campus\") and an optional short code (e.g. \"MAIN\"). The code appears on building labels. You can also add a description to help identify the campus.",
    Illustration: () => (
      <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Card / form panel */}
        <rect x={20} y={12} width={120} height={76} rx={8} fill="white" stroke="#d4cfc4" strokeWidth={1.5} />
        {/* Form fields */}
        <text x={34} y={30} fontSize={6} fontWeight="800" fill="#64748b" fontFamily="var(--font-sans)">
          CAMPUS NAME
        </text>
        <rect x={34} y={32} width={92} height={16} rx={4} fill="#f8f7f4" stroke="#e2ded6" strokeWidth={1} />
        <text x={40} y={44} fontSize={8} fontWeight="700" fill="#0e2a6e" fontFamily="var(--font-sans)">
          Main Campus
        </text>
        <text x={34} y={60} fontSize={6} fontWeight="800" fill="#64748b" fontFamily="var(--font-sans)">
          CAMPUS CODE
        </text>
        <rect x={34} y={62} width={50} height={16} rx={4} fill="#f8f7f4" stroke="#e2ded6" strokeWidth={1} />
        <text x={40} y={74} fontSize={8} fontWeight="700" fill="#0e2a6e" fontFamily="var(--font-sans)">
          MAIN
        </text>
        {/* Pencil icon */}
        <g transform="translate(130, 58)">
          <rect x={-6} y={-6} width={12} height={12} rx={3} fill="#0e2a6e" opacity={0.1} />
          <path d="M-2,-3 L3,-3 L-2,2 L-3,2Z" fill="#0e2a6e" opacity={0.4} />
        </g>
      </svg>
    ),
  },
  {
    title: "Campus Location",
    description: "Set your campus on the map by searching for an address or clicking anywhere to drop a pin. The address, city, province, and postal code will auto-fill from the map selection. You can also manually edit the address details below the map.",
    Illustration: () => (
      <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Map outline */}
        <rect x={20} y={18} width={120} height={64} rx={8} fill="#f0eeea" stroke="#d4cfc4" strokeWidth={1.5} />
        {/* Grid roads */}
        <rect x={20} y={42} width={120} height={4} fill="#e8e4dc" stroke="#d4cfc4" strokeWidth={0.5} />
        <rect x={72} y={18} width={4} height={64} fill="#e8e4dc" stroke="#d4cfc4" strokeWidth={0.5} />
        {/* Pin */}
        <g transform="translate(80, 40)">
          <path
            d="M0,-18 C-8,-18 -14,-10 -14,-3 C-14,6 0,18 0,18 C0,18 14,6 14,-3 C14,-10 8,-18 0,-18Z"
            fill="#0e2a6e"
            stroke="white"
            strokeWidth={1.5}
          />
          <circle cx={0} cy={-4} r={5} fill="white" />
        </g>
        {/* Coordinates label */}
        <text x={80} y={90} textAnchor="middle" fontSize={6} fontWeight="600" fill="#64748b" fontFamily="var(--font-mono)">
          14.7062°N · 120.9813°E
        </text>
      </svg>
    ),
  },
  {
    title: "Customize Appearance",
    description: "Upload a campus thumbnail — a photo or illustration that appears on the campus selector — and optionally add a logo. Pick a theme color that matches your campus identity. You'll see a live preview of how it looks.",
    Illustration: () => (
      <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Color palette */}
        <rect x={15} y={15} width={130} height={70} rx={8} fill="#f8f7f4" stroke="#d4cfc4" strokeWidth={1.5} />
        {/* Color swatches */}
        {[
          { x: 30, color: "#1e3a5f" },
          { x: 52, color: "#0d9488" },
          { x: 74, color: "#7c3aed" },
          { x: 96, color: "#dc2626" },
          { x: 118, color: "#d97706" },
        ].map((sw, i) => (
          <g key={i}>
            <rect x={sw.x} y={30} width={16} height={16} rx={4} fill={sw.color} />
            {i === 0 && (
              <>
                <rect x={sw.x} y={30} width={16} height={16} rx={4} fill="none" stroke="white" strokeWidth={2} />
                <circle cx={sw.x + 8} cy={sw.x === 30 ? 66 : 46} r={3} fill={sw.color} />
              </>
            )}
          </g>
        ))}
        {/* Selected color preview */}
        <rect x={25} y={60} width={110} height={2} rx={1} fill="#e8e4dc" />
        <text x={80} y={80} textAnchor="middle" fontSize={6} fontWeight="600" fill="#64748b" fontFamily="var(--font-sans)">
          Choose a theme color
        </text>
        {/* Image icon */}
        <g transform="translate(30, 18)">
          <rect x={0} y={0} width={8} height={6} rx={1} fill="#d4cfc4" />
          <circle cx={8} cy={0} r={2} fill="#0e2a6e" opacity={0.3} />
        </g>
      </svg>
    ),
  },
  {
    title: "Review & Publish",
    description: "Review everything on a clean summary page before creating. Click Edit on any section to jump back and make changes. Choose to save as a Draft (hidden from students) or Publish immediately so students can see the campus on the map.",
    Illustration: () => (
      <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Checklist / summary */}
        <rect x={15} y={10} width={130} height={80} rx={8} fill="white" stroke="#d4cfc4" strokeWidth={1.5} />
        {/* Checkmark */}
        <circle cx={32} cy={26} r={8} fill="#16a34a" opacity={0.15} />
        <path d="M28,26 L31,29 L36,23" fill="none" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Summary item */}
        <text x={45} y={24} fontSize={7} fontWeight="700" fill="#0e2a6e" fontFamily="var(--font-sans)">
          Main Campus
        </text>
        <text x={45} y={32} fontSize={5} fontWeight="600" fill="#64748b" fontFamily="var(--font-sans)">
          MAIN · Metro Manila
        </text>
        {/* Edit link */}
        <text x={122} y={24} fontSize={5} fontWeight="700" fill="#0e2a6e" fontFamily="var(--font-sans)">
          Edit
        </text>
        {/* Divider */}
        <rect x={24} y={40} width={112} height={1} fill="#e2ded6" />
        {/* Draft / Published toggle */}
        <rect x={24} y={50} width={54} height={18} rx={9} fill="#0e2a6e" />
        <text x={34} y={62} fontSize={6} fontWeight="800" fill="white" fontFamily="var(--font-sans)">
          Published
        </text>
        <rect x={82} y={50} width={54} height={18} rx={9} fill="#e2ded6" />
        <text x={92} y={62} fontSize={6} fontWeight="600" fill="#94a3b8" fontFamily="var(--font-sans)">
          Draft
        </text>
        {/* Status indicator */}
        <rect x={24} y={76} width={80} height={3} rx={1.5} fill="#16a34a" opacity={0.2} />
        <rect x={24} y={76} width={40} height={3} rx={1.5} fill="#16a34a" />
      </svg>
    ),
  },
  {
    title: "Start Building!",
    description: "After creating the campus, open the Map Builder to start designing. Drag buildings onto the canvas, create floor plans, draw walking paths, place markers for landmarks, and publish when your campus map is ready for students.",
    Illustration: () => (
      <svg viewBox="0 0 160 100" fill="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Canvas */}
        <rect x={15} y={10} width={130} height={80} rx={6} fill="#f8f7f4" stroke="#d4cfc4" strokeWidth={1.5} />
        {/* Grid dots */}
        {[0,1,2,3,4,5].map(row =>
          [0,1,2,3,4,5,6,7,8].map(col => (
            <circle key={`${row}-${col}`} cx={25 + col*14} cy={18 + row*12} r={0.8} fill="#d4cfc4" opacity={0.5} />
          ))
        )}
        {/* Buildings on canvas */}
        <rect x={30} y={30} width={25} height={20} rx={2} fill="#dbeafe" stroke="#93c5fd" strokeWidth={1.2} />
        <text x={42} y={43} textAnchor="middle" fontSize={5} fontWeight="800" fill="#1e40af">BLDG</text>
        <rect x={65} y={25} width={30} height={22} rx={2} fill="#dcfce7" stroke="#86efac" strokeWidth={1.2} />
        <text x={80} y={39} textAnchor="middle" fontSize={5} fontWeight="800" fill="#16a34a">BLDG</text>
        <rect x={105} y={35} width={22} height={18} rx={2} fill="#fef9c3" stroke="#fde047" strokeWidth={1.2} />
        <text x={116} y={46} textAnchor="middle" fontSize={5} fontWeight="800" fill="#ca8a04">BLDG</text>
        {/* Paths */}
        <path d="M 42 50 Q 55 65 80 55" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
        <path d="M 80 55 Q 95 65 116 53" fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinecap="round" />
        {/* Marker pin */}
        <g transform="translate(90, 70)">
          <path d="M0,-6 C-3,-6 -5,-3 -5,-1 C-5,2 0,8 0,8 C0,8 5,2 5,-1 C5,-3 3,-6 0,-6Z" fill="#f97316" stroke="white" strokeWidth={1} />
          <circle cx={0} cy={-2} r={2} fill="white" />
        </g>
        {/* Checkered flag */}
        <g transform="translate(130, 12)">
          <rect x={0} y={0} width={8} height={8} rx={1} fill="white" stroke="#333" strokeWidth={0.5} />
          <rect x={0} y={0} width={4} height={4} fill="#333" />
          <rect x={4} y={4} width={4} height={4} fill="#333" />
          <line x1={4} y1={8} x2={4} y2={14} stroke="#333" strokeWidth={1} />
        </g>
      </svg>
    ),
  },
];

export function CreateCampusGuide({ open, onClose, onStartCreating }: CreateCampusGuideProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            key={step}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.93, y: -8 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
                    Creating a Campus
                  </h2>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                    A quick guide to get you started
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Progress dots — centered */}
            <div className="flex items-center justify-center gap-1.5 px-6 py-2 shrink-0">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === step
                      ? "w-5 bg-primary"
                      : i < step
                        ? "w-1.5 bg-primary/40"
                        : "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                  )}
                />
              ))}
            </div>

            {/* Step indicator — centered */}
            <div className="px-6 pb-2 shrink-0 text-center">
              <span className="text-[10px] font-semibold text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </span>
            </div>

            {/* Illustration area */}
            <div className="px-6 py-4 flex items-center justify-center shrink-0">
              <div className="w-full max-w-[200px] h-[120px] flex items-center justify-center">
                <current.Illustration />
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              <h3
                className="text-lg font-extrabold text-foreground mb-2 text-center"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                {current.title}
              </h3>
              <p
                className="text-sm text-muted-foreground text-center leading-relaxed max-w-sm mx-auto"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {current.description}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
              <button
                onClick={step === 0 ? handleClose : () => setStep((s) => s - 1)}
                className="flex items-center gap-1 h-10 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                {step > 0 && <ChevronLeft className="h-3.5 w-3.5" />}
                {step === 0 ? "Close" : "Back"}
              </button>

              {isLast ? (
                <button
                  onClick={() => {
                    handleClose();
                    onStartCreating();
                  }}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  <ArrowRight className="h-4 w-4" />
                  Create Your Campus
                </button>
              ) : (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
