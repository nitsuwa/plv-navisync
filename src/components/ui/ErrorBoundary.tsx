import { Component, createRef, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, Home, HelpCircle, FileWarning, Bug } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

/**
 * Catches unhandled React errors and displays a polished fallback UI
 * instead of unmounting the entire component tree.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * Or with a custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={<CustomFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private containerRef = createRef<HTMLDivElement>();

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, showDetails: false };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error.message, errorInfo.componentStack);
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    // Focus the error container when an error occurs, for keyboard users
    if (this.state.hasError && !prevState.hasError) {
      this.containerRef.current?.focus();
    }
  }

  private reset = (): void => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          ref={this.containerRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="flex items-center justify-center min-h-[60vh] px-4 animate-fade-in outline-none"
        >
          <div className="w-full max-w-md text-center">
            {/* Error icon with glow */}
            <div className="relative mx-auto mb-6 w-20 h-20">
              <div className="absolute inset-0 rounded-2xl bg-destructive/20 blur-xl animate-pulse" />
              <div className="relative w-full h-full rounded-2xl bg-destructive/10 flex items-center justify-center border border-destructive/20">
                <FileWarning className="h-10 w-10 text-destructive" />
              </div>
            </div>

            {/* Error heading */}
            <h2 className="text-2xl font-extrabold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground mb-8 leading-relaxed max-w-sm mx-auto">
              An unexpected error occurred while rendering this page.
              This is usually temporary — you can try reloading, or visit the help center for support.
            </p>

            {/* Categorize the error type for better messaging */}
            {this.state.error?.message && (
              (() => {
                const msg = this.state.error.message;
                const isNetwork = msg.includes("NetworkError") || msg.includes("Failed to fetch") || msg.includes("Network request failed") || msg.includes("ERR_NETWORK");
                const isAuth = msg.includes("Unauthorized") || msg.includes("403") || msg.includes("401") || msg.includes("forbidden");
                const isNotFound = msg.includes("404") || msg.includes("not found");
                const isTimeout = msg.includes("timeout") || msg.includes("Timed out");

                let bannerVariant: "amber" | "red" | "blue" = "amber";
                let bannerTitle = "Network Issue Detected";
                let bannerDesc = "It looks like you might be offline or the server is unreachable. Check your internet connection and try again.";

                if (isNetwork) {
                  bannerVariant = "amber";
                  bannerTitle = "Network Issue Detected";
                  bannerDesc = "It looks like you might be offline or the server is unreachable. Check your internet connection and try again.";
                } else if (isTimeout) {
                  bannerVariant = "amber";
                  bannerTitle = "Request Timed Out";
                  bannerDesc = "The server took too long to respond. This could be due to a slow connection or high server load. Please try again.";
                } else if (isAuth) {
                  bannerVariant = "red";
                  bannerTitle = "Access Issue";
                  bannerDesc = "You may not have permission to view this content. Try signing in again or contact support if the issue persists.";
                } else if (isNotFound) {
                  bannerVariant = "blue";
                  bannerTitle = "Content Not Found";
                  bannerDesc = "The requested resource could not be found. It may have been moved or deleted.";
                }

                const colorClasses = bannerVariant === "amber"
                  ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30"
                  : bannerVariant === "red"
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                    : "bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30";

                const textClasses = bannerVariant === "amber"
                  ? "text-amber-700 dark:text-amber-400"
                  : bannerVariant === "red"
                    ? "text-red-700 dark:text-red-400"
                    : "text-blue-700 dark:text-blue-400";

                const descClasses = bannerVariant === "amber"
                  ? "text-amber-600 dark:text-amber-400/80"
                  : bannerVariant === "red"
                    ? "text-red-600 dark:text-red-400/80"
                    : "text-blue-600 dark:text-blue-400/80";

                return (
                  <div className={`mb-6 p-4 rounded-xl ${colorClasses} text-left`}>
                    <p className={`text-xs font-bold ${textClasses} uppercase tracking-wide mb-1`}>{bannerTitle}</p>
                    <p className={`text-xs ${descClasses}`}>{bannerDesc}</p>
                  </div>
                );
              })()
            )}

            {/* Actions */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={this.reset}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>

              <div className="flex items-center gap-3">
                <a
                  href="/"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                >
                  <Home className="h-3.5 w-3.5" />
                  Go Home
                </a>
                <a
                  href="/help"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Help Center
                </a>
                <button
                  onClick={() => window.open("mailto:support@plvnavisync.app?subject=Error%20Report&body=Error%3A%20" + encodeURIComponent(this.state.error?.message || "Unknown") + "%0D%0A%0D%0AAdditional%20details%3A")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
                  aria-label="Report this issue via email"
                >
                  <Bug className="h-3.5 w-3.5" />
                  Report Issue
                </button>
              </div>

              {/* Error details toggle */}
              {this.state.error && (
                <button
                  onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                  aria-expanded={this.state.showDetails}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown
                    className="h-3.5 w-3.5 transition-transform duration-200"
                    style={{ transform: this.state.showDetails ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                  {this.state.showDetails ? "Hide error details" : "Show error details"}
                </button>
              )}

              {/* Expandable error details */}
              {this.state.showDetails && this.state.error && (
                <div className="w-full mt-2 animate-slide-up">
                  <div className="bg-muted/80 border border-border rounded-xl p-4 text-left overflow-auto max-h-[200px]">
                    <p className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-1.5">
                      {this.state.error.name}
                    </p>
                    <p className="text-xs text-foreground font-mono break-words leading-relaxed">
                      {this.state.error.message}
                    </p>
                    {this.state.error.stack && (
                      <pre className="mt-2 text-[10px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
                        {this.state.error.stack}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
