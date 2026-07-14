/**
 * LavaLampBackground
 * Pure CSS floating blobs — no mouse interaction, no RAF, no refs.
 * A radial-gradient mask softens edges so blobs never hard-clip.
 */
export function LavaLampBackground() {
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
        width: 480, height: 400,
        background: "radial-gradient(ellipse, rgba(59,110,240,0.50) 0%, transparent 65%)",
        filter: "blur(72px)",
        animation: "mesh-shift-1 28s ease-in-out infinite",
        left: "52%", top: "20%",
      }}/>

      {/* Blob 2 — gold (bottom-centre, moved away from left edge) */}
      <div style={{
        ...base,
        width: 400, height: 340,
        background: "radial-gradient(ellipse, rgba(200,150,12,0.42) 0%, transparent 62%)",
        filter: "blur(66px)",
        animation: "mesh-shift-2 34s ease-in-out infinite",
        left: "38%", top: "60%",  // was 18% — now safely centred
      }}/>

      {/* Blob 3 — teal (right-centre) */}
      <div style={{
        ...base,
        width: 340, height: 300,
        background: "radial-gradient(ellipse, rgba(56,189,248,0.34) 0%, transparent 64%)",
        filter: "blur(60px)",
        animation: "mesh-shift-3 22s ease-in-out infinite",
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

export function StarField({ opacity = 0.45 }: { opacity?: number }) {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none select-none"
      aria-hidden="true" style={{ opacity }} preserveAspectRatio="xMidYMid slice">
      {STARS.map((s, i) => (
        <circle key={i}
          cx={`${s.x.toFixed(1)}%`} cy={`${s.y.toFixed(1)}%`} r={s.size}
          fill="white"
          style={{ animation: `${KF[s.kf]} ${s.dur}s ease-in-out ${s.delay}s infinite` }}
        />
      ))}
    </svg>
  );
}

export const DotWave   = LavaLampBackground;
export const MeshBlobs = LavaLampBackground;
