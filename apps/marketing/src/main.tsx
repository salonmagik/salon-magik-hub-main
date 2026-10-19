import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { initAnalytics } from "@shared/analytics";
import { CookieConsentBanner } from "@shared/CookieConsentBanner";
import App from "./App";
import "./index.css";

initAnalytics({
  apiKey: import.meta.env.VITE_POSTHOG_KEY,
  host: import.meta.env.VITE_POSTHOG_HOST,
  appName: "marketing",
  mode: import.meta.env.MODE,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
		<CookieConsentBanner />
	</React.StrictMode>,
);
