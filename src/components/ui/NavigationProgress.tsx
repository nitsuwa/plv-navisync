import { useNavigation } from "react-router";
import { useEffect, useState } from "react";

export function NavigationProgress() {
  const navigation = useNavigation();
  const loading = navigation.state !== "idle";

  const [visible, setVisible] = useState(false);
  const [width,   setWidth]   = useState(0);

  useEffect(() => {
    let raf: number;
    let timeout: ReturnType<typeof setTimeout>;

    if (loading) {
      setVisible(true);
      setWidth(0);
      raf = requestAnimationFrame(() => {
        setWidth(72 + Math.random() * 15);
      });
    } else {
      setWidth(100);
      timeout = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 400);
    }

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
      }}>
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "var(--primary)",
          transition: loading
            ? "width 1.2s cubic-bezier(0.05, 0.6, 0.4, 1)"
            : "width 0.25s ease, opacity 0.3s ease",
          opacity: width === 100 && !loading ? 0 : 1,
          boxShadow: "0 0 10px color-mix(in srgb, var(--primary) 60%, transparent)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}
