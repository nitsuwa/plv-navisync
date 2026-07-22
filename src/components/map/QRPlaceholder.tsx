import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

export function QRPlaceholder() {
  const [animPhase, setAnimPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimPhase((p) => (p + 1) % 4);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Generate a simple QR-like pattern that subtly shifts
  const rows = [
    [1, 1, 1, 0, 1, 1, 1],
    [1, 0, 1, 0, 1, 0, 1],
    [1, 1, 1, 0, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 0, 1, 0, 1],
    [0, 0, 1, 0, animPhase === 0 || animPhase === 2 ? 1 : 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1],
  ];

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={40} height={40} viewBox="0 0 7 7" style={{ imageRendering: "pixelated" }}>
        {rows.map((row, r) =>
          row.map((cell, c) => (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill="currentColor"
              opacity={cell ? 1 : 0.08}
            />
          )),
        )}
      </svg>
      <Smartphone className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
