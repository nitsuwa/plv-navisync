import { useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { LoadingScreen } from "../components/LoadingScreen";
import { CampusDataProvider } from "../contexts/CampusDataContext";
import { AuthProvider, useAuthBootstrap } from "../contexts/StudentAuthContext";
import { Toaster } from "./components/ui/sonner";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { OfflineIndicator, PwaUpdateNotifier } from "../components/layout/PwaPrompts";

function AppRuntime() {
  const auth = useAuthBootstrap();
  const authReady = auth.status === "authenticated" || auth.status === "unauthenticated";
  const authFailed = auth.status === "error";
  const { retryBootstrap } = auth;
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [appStarted, setAppStarted] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  // An installed app opened offline can retry automatically when connectivity returns.
  useEffect(() => {
    if (!authFailed) return;
    const retry = () => { void retryBootstrap(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [authFailed, retryBootstrap]);

  useEffect(() => {
    if (!authReady || !minimumElapsed || appStarted) {
      // If bootstrap becomes unavailable during the exit transition, restore
      // the visible retry state instead of leaving a transparent loading layer.
      if (!authReady && !appStarted && exiting) setExiting(false);
      return;
    }

    if (!exiting) {
      setExiting(true);
      return;
    }

    const timer = window.setTimeout(() => setAppStarted(true), 260);
    return () => window.clearTimeout(timer);
  }, [authReady, minimumElapsed, appStarted, exiting]);

  if (!appStarted) {
    return (
      <LoadingScreen
        exiting={exiting}
        error={authFailed ? auth.error : null}
        onRetry={() => void retryBootstrap()}
      />
    );
  }

  return (
    <CampusDataProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster
        closeButton
        position="top-right"
        toastOptions={{ style: { fontFamily: "var(--font-body)" } }}
      />
      <PwaUpdateNotifier />
      <OfflineIndicator />
    </CampusDataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRuntime />
    </AuthProvider>
  );
}
