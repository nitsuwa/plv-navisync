import { LogIn, X } from "lucide-react";
import { Link } from "react-router";
import { createPortal } from "react-dom";
import { useEscToClose } from "../../hooks/useEscToClose";

interface SignInPromptProps {
  message: string;
  onClose: () => void;
}

export function SignInPrompt({ message, onClose }: SignInPromptProps) {
  useEscToClose(onClose);
  // Portaled to body so this overlay clears PublicLayout's z-[1] stacking context
  // and stays above the z-50 mobile bottom navigation.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in required"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4 text-center animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close sign in prompt"
          className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <LogIn className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-extrabold text-foreground text-sm mb-1">
          Sign in Required
        </h3>
        <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
          Log in with your PLV account to {message}.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:border-foreground/20 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
          <Link
            to="/admin"
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-all duration-200"
          >
            <LogIn className="h-3.5 w-3.5" /> Login
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
