import posthog from "posthog-js";

let isInitialized = false;

// This project's branch-promotion pipeline (development-only -> main ->
// release) maps to three real environments, not two: local dev, a
// staging.salonmagik.com deploy, and the real production domain -- a built
// (`vite build`) bundle running on staging is NOT production traffic, so
// MODE alone ("development" vs "production") isn't enough to tell them
// apart. Hostname is the only signal that actually distinguishes staging
// from production once both are built bundles.
function detectEnvironment(mode: string): string {
  if (typeof window === "undefined") return mode;
  const host = window.location.hostname;
  if (host.includes("staging.salonmagik.com")) return "staging";
  if (host === "localhost" || host === "127.0.0.1") return "development";
  return mode === "development" ? "development" : "production";
}

// Every app initializes this once at startup with its own VITE_POSTHOG_KEY
// (not set in packages/shared, since each app's Vite build reads its own
// env file -- see apps/*/.env.local). Missing/empty apiKey is a deliberate
// no-op rather than a thrown error: PostHog is opt-in per app, and a
// developer running locally without a key shouldn't see broken builds or
// console noise.
export function initAnalytics(options: {
  apiKey: string | undefined;
  host?: string;
  appName: string;
  // Vite's import.meta.env.MODE ("development" in `vite dev`, "production"
  // in any `vite build`). Combined with hostname (see detectEnvironment
  // above) to also catch the staging-vs-real-production case a built
  // bundle alone can't tell apart. Registered as a super property on every
  // event so non-production traffic can be filtered out of real
  // dashboards/insights instead of polluting them, without needing a
  // second PostHog project/key.
  mode: string;
}): void {
  if (!options.apiKey) return;

  const environment = detectEnvironment(options.mode);

  posthog.init(options.apiKey, {
    api_host: options.host || "https://eu.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    loaded: (ph) => {
      ph.register({ app: options.appName, environment });
    },
  });
  isInitialized = true;
}

// Thin wrappers so call sites never need to import posthog-js directly or
// guard against it not being initialized (e.g. a missing API key in a
// local dev environment) -- every one of these is a safe no-op until
// initAnalytics has actually run.
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (!isInitialized) return;
  posthog.capture(name, properties);
}

export function identifyUser(id: string, properties?: Record<string, unknown>): void {
  if (!isInitialized) return;
  posthog.identify(id, properties);
}

export function resetAnalyticsIdentity(): void {
  if (!isInitialized) return;
  posthog.reset();
}
