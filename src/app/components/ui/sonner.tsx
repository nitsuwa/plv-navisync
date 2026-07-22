"use client";

import { useState, useEffect } from "react";
import { Toaster as Sonner, ToasterProps } from "sonner";

function useActiveTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  useEffect(() => {
    // Watch for .dark class changes on <html> (set by useTheme hook)
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useActiveTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          // Default
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Success
          "--success-bg": "color-mix(in srgb, #16a34a 8%, var(--popover))",
          "--success-text": "#16a34a",
          "--success-border": "color-mix(in srgb, #16a34a 20%, var(--border))",
          // Error
          "--error-bg": "color-mix(in srgb, var(--destructive) 8%, var(--popover))",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in srgb, var(--destructive) 20%, var(--border))",
          // Warning
          "--warning-bg": "color-mix(in srgb, #d97706 8%, var(--popover))",
          "--warning-text": "#d97706",
          "--warning-border": "color-mix(in srgb, #d97706 20%, var(--border))",
          // Info
          "--info-bg": "color-mix(in srgb, var(--primary) 8%, var(--popover))",
          "--info-text": "var(--primary)",
          "--info-border": "color-mix(in srgb, var(--primary) 20%, var(--border))",
        } as React.CSSProperties
      }
      toastOptions={{
        className: "shadow-lg rounded-2xl border text-sm font-semibold",
        duration: 4000,
      }}
      {...props}
    />
  );
};

export { Toaster };
