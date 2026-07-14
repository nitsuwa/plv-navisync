import { Outlet, useLocation } from "react-router";
import { Toaster } from "sonner";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ScrollToTop } from "./ScrollToTop";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavigationProgress } from "../ui/NavigationProgress";
import { cn } from "../../lib/utils";
import { motion, AnimatePresence } from "motion/react";

export function PublicLayout() {
  const { pathname } = useLocation();

  const showFooter    = pathname === "/";
  const isMapPage     = pathname === "/map";
  const showBottomNav = true;

  return (
    <div className={cn("min-h-screen flex flex-col", !isMapPage && "app-page-bg")}>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            borderRadius: "12px",
            fontFamily: "var(--font-body)",
          },
        }}
        closeButton
        richColors
      />
      <NavigationProgress />
      <ScrollToTop />
      <Navbar />

      <main
        className={cn(
          "relative z-[1] flex-1",
          isMapPage && "overflow-hidden flex flex-col",
          showBottomNav && !isMapPage && "pb-[88px] md:pb-0"
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={isMapPage ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              type: "spring",
              stiffness: 280,
              damping: 25,
              mass: 0.8,
            }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {showFooter && <Footer />}
      {showBottomNav && <MobileBottomNav />}
    </div>
  );
}
