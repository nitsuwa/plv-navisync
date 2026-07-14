import { useEffect, useState } from "react";
import { PLVLogo } from "./ui/PLVLogo";

interface LoadingScreenProps {
  minDuration?: number;
  onComplete?: () => void;
}

export function LoadingScreen({ minDuration = 1200, onComplete }: LoadingScreenProps) {
  const [phase, setPhase] = useState<"entering" | "visible" | "exiting">("entering");

  useEffect(() => {
    const enterTimer = setTimeout(() => setPhase("visible"), 50);
    const exitTimer = setTimeout(() => setPhase("exiting"), minDuration);

    if (onComplete) {
      const completeTimer = setTimeout(onComplete, minDuration + 400);
      return () => {
        clearTimeout(enterTimer);
        clearTimeout(exitTimer);
        clearTimeout(completeTimer);
      };
    }

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [minDuration, onComplete]);

  if (phase === "exiting") {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
        style={{
          animation: "fadeOut 0.4s ease both",
        }}
      >
        <div className="flex flex-col items-center gap-4">
          <PLVLogo size={72} />
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                style={{
                  animation: `loading-bounce 0.8s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)",
        opacity: phase === "entering" ? 0 : 1,
        transition: "opacity 0.4s ease",
      }}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Animated logo */}
        <div
          style={{
            animation: phase === "visible" ? "hero-breathe 2s ease-in-out infinite" : "none",
            opacity: phase === "entering" ? 0 : 1,
            transform: phase === "entering" ? "scale(0.8)" : "scale(1)",
            transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <PLVLogo size={80} />
        </div>

        {/* Brand name */}
        <div
          className="text-center"
          style={{
            opacity: phase === "entering" ? 0 : 1,
            transform: phase === "entering" ? "translateY(12px)" : "translateY(0)",
            transition: "opacity 0.5s ease 0.2s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
          }}
        >
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            PLV <span className="text-accent">NaviSync</span>
          </h1>
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mt-1">
            Smart Campus Navigator
          </p>
        </div>

        {/* Loading dots */}
        <div
          className="flex gap-2 mt-2"
          style={{
            opacity: phase === "entering" ? 0 : 1,
            transition: "opacity 0.4s ease 0.4s",
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-accent/80"
              style={{
                animation: `loading-bounce 1s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
