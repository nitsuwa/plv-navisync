import { LogIn } from "lucide-react";
import { Link } from "react-router";

interface SignInPromptProps {
  message: string;
  onClose: () => void;
}

export function SignInPrompt({ message, onClose }: SignInPromptProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-xs w-full mx-4 text-center animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <LogIn className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-extrabold text-foreground text-sm mb-1" style={{ fontFamily: "var(--font-sans)" }}>
          Sign in Required
        </h3>
        <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
          Log in with your PLV account to {message}.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <Link
            to="/admin"
            className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" /> Login
          </Link>
        </div>
      </div>
    </div>
  );
}
