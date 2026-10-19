import { createRoot } from "react-dom/client";
import { initAnalytics } from "@shared/analytics";
import App from "./App.tsx";
import "./index.css";

initAnalytics({
  apiKey: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
  appName: "salon-admin",
  mode: import.meta.env.MODE,
});

createRoot(document.getElementById("root")!).render(<App />);
