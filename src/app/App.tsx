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
  const [appStarted, setAppStarted] = useState(false);
  const [loadingScreenVisible, setLoadingScreenVisible] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!authReady || appStarted) return;
    setAppStarted(true);
    setExiting(true);
  }, [authReady, appStarted]);

  // An installed app opened offline stops at "needs a connection"; retry as
  // soon as the device is back online instead of waiting for a tap.
  const authFailed = auth.status === "error";
  const { retryBootstrap } = auth;
  useEffect(() => {
    if (!authFailed) return;
    const retry = () => { void retryBootstrap(); };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [authFailed, retryBootstrap]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => setLoadingScreenVisible(false), 260);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  return (
    <>
      {appStarted && (
        <CampusDataProvider>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
          <Toaster
            closeButton
            position="top-right"
            toastOptions={{ style: { fontFamily: "var(--font-body)" } }}
          />
        </CampusDataProvider>
      )}
      {loadingScreenVisible && (
        <LoadingScreen
          exiting={exiting}
          error={!appStarted && auth.status === "error" ? auth.error : null}
          onRetry={() => void auth.retryBootstrap()}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRuntime />
    </AuthProvider>
  );
}
