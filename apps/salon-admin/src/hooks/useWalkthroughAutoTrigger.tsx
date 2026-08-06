import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useWalkthroughDataFlags } from "@/hooks/useWalkthroughDataFlags";
import { useStaffOperationsAddon } from "@/hooks/useStaffOperationsAddon";
import { useProductTour, useIsDesktopViewport } from "@/components/onboarding/ProductTourProvider";
import { getAvailableWalkthroughsForPage, type WalkthroughPageKey } from "@/lib/walkthroughs";

// Mounted once per trigger page. Two ways a walkthrough starts:
// 1. First visit — every not-yet-seen walkthrough registered to this page is
//    concatenated into one run (e.g. Services page auto-plays create-service,
//    create-product, create-voucher back to back on a brand-new account).
// 2. Replay from Help — the page was reached via `?walkthrough=<id>`, which
//    forces just that one id to run regardless of seen state.
export function useWalkthroughAutoTrigger(pageKey: WalkthroughPageKey) {
  const { currentTenant, canUseOwnerHub } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();
  const { hasCustomers, hasCatalog, isLoading: dataFlagsLoading } = useWalkthroughDataFlags();
  const { isEnabled: staffOperationsEnabled } = useStaffOperationsAddon();
  const { startTour, hasSeenWalkthrough } = useProductTour();
  const isDesktop = useIsDesktopViewport();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (permissionsLoading || dataFlagsLoading || !currentTenant?.id) return;

    const pageWalkthroughs = getAvailableWalkthroughsForPage(pageKey, {
      hasPermission,
      canUseOwnerHub,
      hasCustomers,
      hasCatalog,
      staffOperationsEnabled,
    });
    if (pageWalkthroughs.length === 0) return;

    const replayId = searchParams.get("walkthrough");
    if (replayId) {
      const target = pageWalkthroughs.find((w) => w.id === replayId);
      if (target) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("walkthrough");
            return next;
          },
          { replace: true },
        );
        startTour({ steps: [target.buildStep({ isDesktop })], walkthroughIds: [target.id] });
        return;
      }
    }

    const unseen = pageWalkthroughs.filter((w) => !hasSeenWalkthrough(w.id));
    if (unseen.length === 0) return;

    startTour({
      steps: unseen.map((w) => w.buildStep({ isDesktop })),
      walkthroughIds: unseen.map((w) => w.id),
    });
    // Only re-evaluate on the signals that decide whether to auto-start;
    // re-running on every searchParams/hasSeenWalkthrough change would
    // re-trigger right after the run's own cleanup navigation/markSeen call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoading, dataFlagsLoading, currentTenant?.id, pageKey, isDesktop]);
}
