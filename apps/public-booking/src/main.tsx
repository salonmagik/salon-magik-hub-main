import React from "react";
import ReactDOM from "react-dom/client";
import { initAnalytics } from "@shared/analytics";
import { CookieConsentBanner } from "@shared/CookieConsentBanner";
import App from "./App";
import "./index.css";

initAnalytics({
  apiKey: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
  appName: "public-booking",
  mode: import.meta.env.MODE,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <CookieConsentBanner />
  </React.StrictMode>
);
