import { PLVLogo } from "./ui/PLVLogo";

interface LoadingScreenProps {
  exiting?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/** Full-window brand bootstrap shown on each fresh application runtime. */
export function LoadingScreen({ exiting = false, error, onRetry }: LoadingScreenProps) {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label={error ? "NaviSync could not restore your account" : "Starting PLV NaviSync"}
      className={`ns-startup fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden p-6 ${exiting ? "ns-startup-exit" : ""}`}
    >
      <div className="ns-startup-glow pointer-events-none absolute inset-0" />
      <section className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="ns-startup-logo mb-6 rounded-[1.6rem] p-3">
          <PLVLogo size={68} />
        </div>
        <p className="text-[1.35rem] font-extrabold tracking-tight text-white sm:text-2xl">
          PLV <span className="text-[#e5b83f]">NaviSync</span>
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/50 sm:text-xs">
          Smart Campus Navigator
        </p>

        <div className="mt-10 h-8 w-40" aria-hidden="true">
          <svg viewBox="0 0 160 32" className="h-full w-full overflow-visible">
            <path d="M8 22H55C70 22 70 10 85 10H152" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeLinecap="round" />
            <path className="ns-startup-route" d="M8 22H55C70 22 70 10 85 10H152" fill="none" stroke="#e5b83f" strokeWidth="2.5" strokeLinecap="round" />
            <circle className="ns-startup-beacon" r="4" fill="#fff" stroke="#e5b83f" strokeWidth="2">
              <animateMotion dur="2.8s" repeatCount="indefinite" path="M8 22H55C70 22 70 10 85 10H152" />
            </circle>
          </svg>
        </div>

        <p className="mt-4 min-h-5 text-xs font-medium text-white/65" aria-live="polite">
          {error ? "Account verification needs a connection" : "Restoring your NaviSync session…"}
        </p>
        {error && (
          <div className="mt-4 max-w-xs">
            <p className="text-xs leading-relaxed text-white/55">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e5b83f]"
            >
              Retry connection
            </button>
          </div>
        )}
      </section>
      <style>{`
        .ns-startup { box-sizing: border-box; padding: max(1.5rem, env(safe-area-inset-top, 0px)) max(1.5rem, env(safe-area-inset-right, 0px)) max(1.5rem, env(safe-area-inset-bottom, 0px)) max(1.5rem, env(safe-area-inset-left, 0px)); background: radial-gradient(ellipse 82% 64% at 50% 40%, #102b78 0%, #081943 58%, #040c20 100%); opacity: 1; transition: opacity 250ms ease; }
        .ns-startup-glow { background: radial-gradient(ellipse at 50% 42%, rgba(50,96,195,.14), transparent 62%); }
        .ns-startup-logo { animation: nsStartupEnter 650ms cubic-bezier(.2,.8,.2,1) both, nsStartupBreathe 3.2s ease-in-out 700ms infinite; }
        .ns-startup-route { stroke-dasharray: 36 160; stroke-dashoffset: 196; animation: nsStartupRoute 2.8s linear infinite; }
        .ns-startup-beacon { filter: drop-shadow(0 0 5px rgba(229,184,63,.6)); }
        .ns-startup-exit { opacity: 0; pointer-events: none; }
        @keyframes nsStartupEnter { from { opacity: 0; transform: translateY(8px) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes nsStartupBreathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes nsStartupRoute { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .ns-startup, .ns-startup * { animation: none !important; transition: none !important; }
          .ns-startup-beacon { display: none; }
          .ns-startup { opacity: 1; }
          .ns-startup-exit { opacity: 0; }
        }
      `}</style>
    </main>
  );
}
