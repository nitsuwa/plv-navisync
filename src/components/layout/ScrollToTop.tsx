import { useEffect } from "react";
import { useLocation } from "react-router";

/**
 * Scrolls the window to the top on every route change.
 * Placed inside PublicLayout so it runs for every public page navigation.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
