import { Outlet, useLocation } from "react-router";
import { Toaster } from "../../app/components/ui/sonner";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { ScrollToTop } from "./ScrollToTop";
import { MobileBottomNav } from "./MobileBottomNav";
import { NavigationProgress } from "../ui/NavigationProgress";
import { cn } from "../../lib/utils";
import { motion } from "motion/react";

export function PublicLayout() {
  const { pathname } = useLocation();

  const showFooter    = pathname === "/";
  const isMapPage     = pathname === "/map";
  const showBottomNav = true;

  return (
    <div className={cn("min-h-screen flex flex-col w-full max-w-full overflow-x-hidden", !isMapPage && "app-page-bg")}>
      {/* Skip-to-content link for keyboard and screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2.5 focus:rounded-xl focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-bold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "shadow-lg rounded-2xl border",
          duration: 4000,
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
        id="main-content"
        className={cn(
          "relative z-[1] flex-1 w-full max-w-full",
          isMapPage ? "overflow-hidden flex flex-col" : "overflow-x-hidden",
          showBottomNav && !isMapPage && "pb-[calc(88px+env(safe-area-inset-bottom,0px))] md:pb-0"
        )}
      >
        <motion.div
          key={pathname}
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.12 }}
          className="h-full"
        >
          <Outlet />
        </motion.div>
      </main>

      {showFooter && <Footer />}
      {showBottomNav && <MobileBottomNav />}
    </div>
  );
}
