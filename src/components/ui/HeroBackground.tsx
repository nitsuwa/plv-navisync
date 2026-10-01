import { CampusAuthIllustration } from "./CampusAuthIllustration";
import { useReducedMotion } from "motion/react";

/**
 * LavaLampBackground
 * Pure CSS floating blobs — no mouse interaction, no RAF, no refs.
 * A radial-gradient mask softens edges so blobs never hard-clip.
 */
export function LavaLampBackground({ subtle = false, animated = true }: { subtle?: boolean; animated?: boolean } = {}) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animated && !reducedMotion;
  const blobSizes = subtle
    ? [{ width: 300, height: 250 }, { width: 250, height: 220 }, { width: 220, height: 190 }]
    : [{ width: 480, height: 400 }, { width: 400, height: 340 }, { width: 340, height: 300 }];
  const base: React.CSSProperties = {
    position: "absolute",
    borderRadius: "50%",
    pointerEvents: "none",
  };

  // No mask needed — blur creates soft edges; parent overflow:hidden does containment
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Blob 1 — indigo/blue (top-right area) */}
      <div style={{
        ...base,
        ...blobSizes[0],
        background: `radial-gradient(ellipse, rgba(59,110,240,${subtle ? "0.30" : "0.50"}) 0%, transparent 65%)`,
        filter: `blur(${subtle ? 42 : 72}px)`,
        animation: shouldAnimate ? `mesh-shift-1 ${subtle ? 44 : 28}s ease-in-out infinite` : "none",
        left: "52%", top: "20%",
      }}/>

      {/* Blob 2 — gold (bottom-centre, moved away from left edge) */}
      <div style={{
        ...base,
        ...blobSizes[1],
        background: `radial-gradient(ellipse, rgba(200,150,12,${subtle ? "0.24" : "0.42"}) 0%, transparent 62%)`,
        filter: `blur(${subtle ? 38 : 66}px)`,
        animation: shouldAnimate ? `mesh-shift-2 ${subtle ? 52 : 34}s ease-in-out infinite` : "none",
        left: "38%", top: "60%",  // was 18% — now safely centred
      }}/>

      {/* Blob 3 — teal (right-centre) */}
      <div style={{
        ...base,
        ...blobSizes[2],
        background: `radial-gradient(ellipse, rgba(56,189,248,${subtle ? "0.20" : "0.34"}) 0%, transparent 64%)`,
        filter: `blur(${subtle ? 34 : 60}px)`,
        animation: shouldAnimate ? `mesh-shift-3 ${subtle ? 38 : 22}s ease-in-out infinite` : "none",
        left: "68%", top: "45%",
      }}/>
    </div>
  );
}

/**
 * StarField — sparse twinkling stars for login/register dark panels.
 * Reduced count, slower animation.
 */
const PHI = 137.508;
const STARS = Array.from({ length: 30 }, (_, i) => {
  const angle  = (i * PHI * Math.PI) / 180;
  const radius = Math.sqrt((i + 1) / 30);
  return {
    x:     50 + 47 * radius * Math.cos(angle),
    y:     50 + 47 * radius * Math.sin(angle),
    size:  0.6 + (i % 5) * 0.25,
    kf:    (["a","b","c"] as const)[i % 3],
    dur:   (4.5 + (i % 8) * 0.7).toFixed(1),
    delay: ((i * 0.35) % 7).toFixed(2),
  };
});

const KF = { a:"star-twinkle-a", b:"star-twinkle-b", c:"star-twinkle-c" } as const;

export function StarField({ opacity = 0.45, subtle = false, animated = true }: { opacity?: number; subtle?: boolean; animated?: boolean }) {
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animated && !reducedMotion;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none select-none"
      aria-hidden="true" style={{ opacity }} preserveAspectRatio="xMidYMid slice">
      {STARS.map((s, i) => (
        <circle key={i}
          cx={`${s.x.toFixed(1)}%`} cy={`${s.y.toFixed(1)}%`} r={s.size}
          fill="white"
          style={{ animation: shouldAnimate ? `${KF[s.kf]} ${subtle ? Number(s.dur) * 1.6 : s.dur}s ease-in-out ${s.delay}s infinite` : "none" }}
        />
      ))}
    </svg>
  );
}

/** Shared auth identity layer: the same NaviSync stars and ambient blobs in a compact mobile backdrop. */
export function AuthVisualBackdrop() {
  const reducedMotion = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden lg:hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_78%_at_50%_18%,#10285f_0%,#071440_52%,#020a1c_100%)]" />
      <LavaLampBackground subtle animated={!reducedMotion} />
      <StarField opacity={0.3} subtle animated={!reducedMotion} />
      <div className="absolute bottom-[4%] left-1/2 w-[min(100vw,390px)] -translate-x-1/2 opacity-[0.16]">
        <CampusAuthIllustration idPrefix="mobile-auth-campus" animated={!reducedMotion} />
      </div>
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#020a1c]/45" />
    </div>
  );
}

export const DotWave   = LavaLampBackground;
export const MeshBlobs = LavaLampBackground;
