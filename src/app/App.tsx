import { useState, useCallback } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { LoadingScreen } from "../components/LoadingScreen";
import { CampusDataProvider } from "../contexts/CampusDataContext";
import { StudentAuthProvider } from "../contexts/StudentAuthContext";
import { Toaster } from "./components/ui/sonner";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";

export default function App() {
  const [loading, setLoading] = useState(true);
  const handleLoadComplete = useCallback(() => setLoading(false), []);

  return (
    <CampusDataProvider>
      <StudentAuthProvider>
        {loading && <LoadingScreen onComplete={handleLoadComplete} />}
        {/* Router mounts immediately behind the loading screen so pages preload */}
        <div style={{ visibility: loading ? "hidden" : "visible" }}>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </div>
        {/* Toast notifications via sonner */}
        <Toaster
          closeButton
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-body)",
            },
          }}
        />
      </StudentAuthProvider>
    </CampusDataProvider>
  );
}
