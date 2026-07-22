import { MapPin, Clock, Phone, ChevronRight, Building2 } from "lucide-react";
import { Link } from "react-router";
import { memo, useRef, useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Building } from "../../types";
import { BuildingCategoryBadge } from "./Badge";
import { cn } from "../../lib/utils";

interface BuildingCardProps {
  building: Building;
  className?: string;
}

const BuildingCardInner = memo(function BuildingCardInner({ building, className }: BuildingCardProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const shouldReduce = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = innerRef.current;
    if (!el || reducedMotion) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 6;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -6;
    el.style.setProperty("--tilt-x", `${x}deg`);
    el.style.setProperty("--tilt-y", `${y}deg`);
    el.style.transition = "none";
  }, []);

  const handleMouseLeave = useCallback(() => {
    const el = innerRef.current;
    if (!el || reducedMotion) return;
    el.style.transition = "transform 0.5s cubic-bezier(0.16,1,0.3,1)";
    el.style.setProperty("--tilt-x", `0deg`);
    el.style.setProperty("--tilt-y", `0deg`);
  }, []);

  return (
    <motion.div
      initial={shouldReduce ? false : { opacity: 0, y: 20, scale: 0.97 }}
      whileInView={shouldReduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
    <Link
      to={`/buildings/${building.id}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn("group block perspective-[800px]", className)}
    >
      <div
        ref={innerRef}
        className="flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden hover:shadow-xl transition-shadow duration-200"
        style={{
          transform: "perspective(800px) rotateX(var(--tilt-y, 0deg)) rotateY(var(--tilt-x, 0deg))",
          transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1), box-shadow 0.3s ease",
        }}
      >
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-muted shrink-0">
        {building.image_url ? (
          <>
            <img
              src={building.image_url}
              alt={building.name}
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const fb = img.parentElement?.querySelector('.img-fallback');
                if (fb) (fb as HTMLElement).style.display = 'flex';
              }}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="img-fallback absolute inset-0 items-center justify-center bg-gradient-to-br from-secondary to-muted" style={{ display: 'none' }}>
              <Building2 className="h-12 w-12 text-muted-foreground/40" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3">
          <BuildingCategoryBadge category={building.category} />
        </div>
        <div className="absolute top-3 right-3 bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-xl shadow-sm">
          {building.code}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4">
        <h3 className="font-bold text-foreground text-base leading-snug mb-1.5 group-hover:text-primary transition-colors line-clamp-1">
          {building.name}
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1">
          {building.description}
        </p>

        <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
          {building.operating_hours && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="truncate">{building.operating_hours}</span>
            </div>
          )}
          {building.contact && (
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 shrink-0 text-primary/60" />
              <span>{building.contact}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 shrink-0 text-primary/60" />
            <span>{building.floor_count}-story · PLV Campus</span>
          </div>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs font-bold text-primary">View Details</span>
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-all duration-200">
            <ChevronRight className="h-3.5 w-3.5 text-primary group-hover:text-white transition-colors" />
          </div>
        </div>
      </div>      </div>
    </Link>
    </motion.div>
  );
});

export { BuildingCardInner as BuildingCard };
