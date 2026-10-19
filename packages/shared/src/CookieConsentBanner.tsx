import { useEffect, useState } from "react";
import {
  grantAnalyticsConsent,
  hasAnalyticsConsentDecision,
  isAnalyticsInitialized,
  revokeAnalyticsConsent,
} from "./analytics";

// Rendered once per app, as a sibling of the main router/App tree. Shows
// only when initAnalytics has actually loaded PostHog (a missing
// VITE_POSTHOG_KEY means there's nothing to ask consent for) and the
// visitor hasn't made a choice yet in this browser.
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(false);

  useEffect(() => {
    if (isAnalyticsInitialized() && !hasAnalyticsConsentDecision()) setVisible(true);
  }, []);

  if (!visible) return null;

  const handleAcceptAll = () => {
    grantAnalyticsConsent();
    setVisible(false);
  };

  const handleSaveSettings = () => {
    if (analyticsOn) grantAnalyticsConsent();
    else revokeAnalyticsConsent();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[100] flex justify-center pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:right-4 sm:justify-end"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-[16px] border border-[#EDE6F5] bg-white p-4 shadow-[0_20px_44px_rgba(46,31,78,0.22)]">
        {!managing ? (
          <>
            <p className="text-sm text-[#2E1F4E]">
              We use cookies to improve your experience. By clicking "Accept", you consent to the use of cookies for analytics. You can change your preferences at any time.
            </p>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setManaging(true)}
                className="text-sm font-medium text-[#2E1F4E] underline underline-offset-2 transition hover:text-[#3a2760]"
              >
                Manage cookies
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="rounded-full bg-[#2E1F4E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3a2760]"
              >
                Accept All
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-[#2E1F4E]">Cookie preferences</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#2E1F4E]">Strictly necessary</p>
                  <p className="text-xs text-[#6B6180]">
                    Keeps you signed in and the site working. Always active.
                  </p>
                </div>
                <span className="mt-0.5 shrink-0 text-xs font-medium text-[#6B6180]">Always active</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#2E1F4E]">Analytics</p>
                  <p className="text-xs text-[#6B6180]">
                    Helps us understand how the site is used.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsOn}
                  onClick={() => setAnalyticsOn((prev) => !prev)}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
                    analyticsOn ? "bg-[#2E1F4E]" : "bg-[#D9D2E6]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      analyticsOn ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setManaging(false)}
                className="text-sm font-medium text-[#2E1F4E] underline underline-offset-2 transition hover:text-[#3a2760]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="rounded-full bg-[#2E1F4E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3a2760]"
              >
                Save settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
