import posthog from "posthog-js";

let isInitialized = false;

// Our own record of whether a visitor has made a cookie-consent choice at
// all, separate from PostHog's own opt-in/opt-out state. We init with
// opt_out_capturing_by_default: true, so a fresh visitor and someone who
// explicitly declined are otherwise indistinguishable from posthog-js's own
// public API -- this flag is what the consent banner checks to know
// whether to show itself at all.
const CONSENT_STORAGE_KEY = "sm_analytics_consent";
type ConsentDecision = "granted" | "denied";

function readConsentDecision(): ConsentDecision | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

function writeConsentDecision(decision: ConsentDecision): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, decision);
}

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
    // Nothing is captured until a visitor explicitly consents -- see
    // the consent helpers below and <CookieConsentBanner>.
    opt_out_capturing_by_default: true,
    loaded: (ph) => {
      ph.register({ app: options.appName, environment });
      // A returning visitor who already granted consent in a prior session
      // shouldn't be re-opted-out just because this is a fresh page load.
      if (readConsentDecision() === "granted") ph.opt_in_capturing();
    },
  });
  isInitialized = true;
}

// Whether this visitor has made ANY cookie-consent choice yet (accept or
// decline) -- used by <CookieConsentBanner> to decide whether to show
// itself at all. Distinct from PostHog's own opted-in/out state, which
// can't tell "never asked" apart from "declined" once opt_out_capturing_
// by_default is on.
export function hasAnalyticsConsentDecision(): boolean {
  return readConsentDecision() !== null;
}

// Nothing to ask consent for if this app has no VITE_POSTHOG_KEY set (e.g.
// a local dev checkout before the key's been filled in) -- the consent
// banner should stay hidden entirely rather than ask about a tracker that
// was never loaded.
export function isAnalyticsInitialized(): boolean {
  return isInitialized;
}

export function grantAnalyticsConsent(): void {
  writeConsentDecision("granted");
  if (isInitialized) posthog.opt_in_capturing();
}

export function revokeAnalyticsConsent(): void {
  writeConsentDecision("denied");
  if (isInitialized) posthog.opt_out_capturing();
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
