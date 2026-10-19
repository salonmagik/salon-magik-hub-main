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

  useEffect(() => {
    if (isAnalyticsInitialized() && !hasAnalyticsConsentDecision()) setVisible(true);
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    grantAnalyticsConsent();
    setVisible(false);
  };

  const handleDecline = () => {
    revokeAnalyticsConsent();
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-4 bottom-4 z-[100] flex justify-center pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:right-4 sm:justify-end"
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-[16px] border border-[#EDE6F5] bg-white p-4 shadow-[0_20px_44px_rgba(46,31,78,0.22)]">
        <p className="text-sm text-[#2E1F4E]">
          We use cookies to improve your experience. By clicking "Accept", you consent to the use of cookies for analytics. You can change your preferences at any time.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleDecline}
            className="rounded-full border border-[#D9D2E6] px-4 py-2 text-sm font-medium text-[#2E1F4E] transition hover:bg-[#F8F4FC]"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-full bg-[#2E1F4E] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3a2760]"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
