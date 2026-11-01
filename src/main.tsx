
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { initPwa } from "./lib/pwa";

  initPwa();

  createRoot(document.getElementById("root")!).render(<App />);
  