import { motion } from "motion/react";
import { CheckCircle2, Map, Building2, ArrowLeft, Ruler } from "lucide-react";

interface CampusCreationSuccessProps {
  campusName: string;
  campusCode: string;
  onOpenMapBuilder: () => void;
  onAddBuildings: () => void;
  onReturnToManagement: () => void;
}

export function CampusCreationSuccess({
  campusName,
  campusCode,
  onOpenMapBuilder,
  onAddBuildings,
  onReturnToManagement,
}: CampusCreationSuccessProps) {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth p-6 lg:p-8 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-lg w-full text-center"
      >
        {/* Success checkmark */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
          className="w-20 h-20 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-6 ring-1 ring-green-200 dark:ring-green-700/30"
        >
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className="text-2xl font-extrabold text-foreground mb-2"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          Campus Created Successfully!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="text-muted-foreground mb-1 text-sm"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <span className="font-bold text-foreground">{campusName}</span>
          {campusCode && (
            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {campusCode}
            </span>
          )}
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="text-xs text-muted-foreground mb-8"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Your campus has been created. Next, set up your map canvas and start adding buildings.
        </motion.p>

        {/* Action cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="grid sm:grid-cols-3 gap-3 mb-6"
        >
          <button
            onClick={onOpenMapBuilder}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Ruler className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xs font-extrabold text-foreground">Set Up Canvas</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Configure map dimensions</p>
            </div>
          </button>

          <button
            onClick={onAddBuildings}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xs font-extrabold text-foreground">Add Buildings</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Place buildings on the map</p>
            </div>
          </button>

          <button
            onClick={onReturnToManagement}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/50 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <ArrowLeft className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-xs font-extrabold text-foreground">Back to List</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">Return to campus management</p>
            </div>
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-[10px] text-muted-foreground/50"
        >
          You can access this campus anytime from the campus management page.
        </motion.p>
      </motion.div>
    </div>
  );
}
