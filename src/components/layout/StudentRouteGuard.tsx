import { Navigate, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useStudentAuth } from "../../hooks/useStudentAuth";

/**
 * Gate the student portal before its page components mount. Keeping the gate
 * at the route boundary prevents guest users from triggering student-only
 * data requests and avoids render-time navigation side effects.
 */
export function StudentRouteGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { loading, isStudent } = useStudentAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6" aria-live="polite">
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          Checking your student session…
        </div>
      </div>
    );
  }

  if (!isStudent) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/admin" replace state={{ from }} />;
  }

  return <>{children}</>;
}
