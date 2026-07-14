import { useEffect, useRef, useState } from "react";

/**
 * Behavior:
 * - Elements animate IN when scrolling DOWN into them (enter from bottom)
 * - Elements STAY VISIBLE when scrolling back UP (they don't disappear)
 * - When you scroll UP far enough that the element leaves the top of the
 *   viewport it silently resets (off-screen, not visible) so it will
 *   re-animate next time you scroll back down to it.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number } = {}
) {
  const { threshold = 0.1 } = options;
  const ref     = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Entering viewport from any direction → show and animate
          setVisible(true);
        } else if (entry.boundingClientRect.top < 0) {
          // Left viewport via the TOP (scrolled down past it).
          // The element is now fully above the fold — silently reset while
          // invisible so it can re-animate next time the user scrolls down.
          setVisible(false);
        }
        // If it left via the bottom (entry.boundingClientRect.top > 0),
        // the user hasn't reached it yet — keep it invisible and waiting.
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
    );

    // Reveal immediately if already in viewport on mount
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setVisible(true);
    }

    observer.observe(el);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ref, visible };
}
