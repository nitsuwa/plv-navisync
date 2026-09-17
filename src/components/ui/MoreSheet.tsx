import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import {
  Bookmark, Flag, Settings, HelpCircle, LogOut,
  ChevronRight, MapPin, X, User, Sun, Moon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { useTheme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MoreSheet({ open, onClose }: MoreSheetProps) {
  const navigate = useNavigate();
  const { username, role, signOut } = useStudentAuth();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const handleLogout = async () => {
    await signOut();
    onClose();
    navigate("/");
  };

  const initials = username.slice(0, 2).toUpperCase();

  const menuItems = [
    { icon: User, label: "My Profile", path: "/student", color: "text-primary" },
    { icon: Bookmark, label: "Favorites", path: "/student/favorites", color: "text-amber-500" },
    { icon: Flag, label: "My Reports", path: "/student/reports", color: "text-orange-500" },
    { icon: MapPin, label: "Campus Map", path: "/map", color: "text-green-500" },
    { icon: Settings, label: "Settings", path: "/student/settings", color: "text-purple-500" },
    { icon: HelpCircle, label: "Help Center", path: "/help", color: "text-blue-500" },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl border-t border-border shadow-2xl"
            style={{ maxHeight: "85vh" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold text-primary-foreground bg-primary">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-extrabold text-foreground">{username}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{role}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Menu items */}
            <div className="py-2">
              {menuItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/50 transition-colors"
                >
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-muted/50", item.color)}>
                    <item.icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground flex-1">{item.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>

            {/* Dark Mode Toggle */}
            <div className="px-5 py-3 border-t border-border/50">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-4 px-0 py-2 hover:bg-muted/50 rounded-xl transition-colors"
              >
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center bg-muted/50", theme === "dark" ? "text-yellow-500" : "text-indigo-500")}>
                  {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
                </div>
                <span className="text-sm font-semibold text-foreground flex-1 text-left">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                <div className={cn("w-10 h-6 rounded-full transition-colors duration-200 flex items-center", theme === "dark" ? "bg-primary justify-end" : "bg-gray-200 dark:bg-gray-700 justify-start")}>
                  <div className={cn("w-5 h-5 rounded-full bg-white shadow-sm mx-0.5 transition-transform duration-200", theme === "dark" && "translate-x-0")} />
                </div>
              </button>
            </div>

            {/* About section */}
            <div className="px-5 py-3 border-t border-border/50">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">About PLV NaviSync</p>
              <p className="text-[11px] text-muted-foreground">Smart Campus Navigator · v1.0.3</p>
              <p className="text-[10px] text-muted-foreground/60">Pamantasan ng Lungsod ng Valenzuela</p>
            </div>

            {/* Sign out */}
            <div className="px-5 pb-8 border-t border-border/50 pt-2">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-destructive/30 text-destructive text-sm font-bold hover:bg-destructive/8 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
