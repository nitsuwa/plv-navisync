import { useState, useCallback } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { LoadingScreen } from "../components/LoadingScreen";
import { CampusDataProvider } from "../contexts/CampusDataContext";
import { Toaster } from "./components/ui/sonner";

export default function App() {
  const [loading, setLoading] = useState(true);
  const handleLoadComplete = useCallback(() => setLoading(false), []);

  return (
    <CampusDataProvider>
      {loading && <LoadingScreen onComplete={handleLoadComplete} />}
      {/* Router mounts immediately behind the loading screen so pages preload */}
      <div style={{ visibility: loading ? "hidden" : "visible" }}>
        <RouterProvider router={router} />
      </div>
      {/* Toast notifications via sonner */}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: "var(--font-body)",
          },
        }}
      />
    </CampusDataProvider>
  );
}
