import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { useAuth } from "@/hooks/useAuth";
import { usePlans } from "@/hooks/usePlans";
import { usePlanPricing } from "@/hooks/usePlanPricing";
import { useChainPriceQuote } from "@/hooks/useAdditionalLocationPricing";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@ui/dialog";
import { Button } from "@ui/button";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { CreditCard, Clock, ArrowRight, Loader2 } from "lucide-react";
import type { SubscriptionPlan } from "./PlanStep";
import type { LocationInfo } from "./LocationsStep";

interface PromoPreview {
  valid: boolean;
  campaignName?: string;
  discountType?: string;
  discountValue?: number;
  billingTargets?: string[];
  campaignEndsAt?: string | null;
  expiresAt?: string | null;
}

interface WelcomeModalProps {
  initialPlan: SubscriptionPlan;
  currency: string;
  trialDays: number;
  promoPreview: PromoPreview | null;
  chainLocations?: LocationInfo[];
  businessName: string;
  onDismiss: () => void;
}

type Screen = "welcome" | "subscribe";

function formatCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return `${Math.ceil(h / 24)} days`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CONFETTI_COLORS = ["#2E1F4E", "#F4C84E", "#F5F1FC"];

function fireConfetti() {
  const duration = 1400;
  const end = Date.now() + duration;

  const frame = () => {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors: CONFETTI_COLORS, zIndex: 10000 });
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors: CONFETTI_COLORS, zIndex: 10000 });
    if (Date.now() < end) requestAnimationFrame(frame);
  };

  frame();
}

export function WelcomeModal({
  initialPlan,
  currency,
  trialDays,
  promoPreview,
  chainLocations = [],
  businessName,
  onDismiss,
}: WelcomeModalProps) {
  const navigate = useNavigate();
  const { currentTenant, currentRole } = useAuth();
  const [screen, setScreen] = useState<Screen>("welcome");
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const { data: plans } = usePlans();
  const { data: pricing } = usePlanPricing(currency);

  const promoExpiry = promoPreview?.expiresAt || promoPreview?.campaignEndsAt || null;
  const isChain = initialPlan === "chain";
  const hasPromo = Boolean(promoPreview?.valid);

  useEffect(() => {
    fireConfetti();
  }, []);

  // Live countdown timer
  useEffect(() => {
    if (!promoExpiry) return;
    const tick = () => setCountdown(formatCountdown(promoExpiry));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [promoExpiry]);

  // There is one base subscription price now — Solo/Studio/Chain are labels
  // derived from location/seat counts, not separately-priced plans. Always
  // read the base price from the Solo/Base plan regardless of initialPlan.
  const basePlan = (plans || []).find((p) => p.slug === "solo");
  const basePlanPricing = (pricing || []).find((p) => p.plan_id === basePlan?.id);

  const totalLocations = Math.max(chainLocations.length, 1);
  const { data: chainPriceQuote } = useChainPriceQuote(
    isChain ? (plans || []).find((p) => p.slug === "chain")?.id || null : null,
    currency,
    totalLocations,
  );

  const computeDiscountedPrice = (base: number): number | null => {
    if (!promoPreview?.valid || !promoPreview.discountValue) return null;
    const targets = promoPreview.billingTargets || [];
    if (!targets.includes("subscription")) return null;
    if (promoPreview.discountType === "percentage") {
      return Math.max(0, base * (1 - promoPreview.discountValue / 100));
    }
    if (promoPreview.discountType === "fixed") {
      return Math.max(0, base - promoPreview.discountValue);
    }
    return null;
  };

  const totalPrice = isChain
    ? (chainPriceQuote?.total_price ?? basePlanPricing?.monthly_price ?? null)
    : (basePlanPricing?.monthly_price ?? null);
  const discountedPrice = totalPrice !== null ? computeDiscountedPrice(totalPrice) : null;
  const symbol = getCurrencySymbol(currency);
  const locationAddonRows = isChain
    ? (chainPriceQuote?.breakdown || []).filter((row) => row.tier_label !== "Base (1 location)")
    : [];
  const baseOnlyPrice = isChain ? (basePlanPricing?.monthly_price ?? null) : totalPrice;

  const handleExplore = () => {
    onDismiss();
    navigate("/salon/overview");
  };

  const handleConfirmAndPay = async () => {
    if (!currentTenant?.id) return;
    setIsProcessing(true);
    try {
      const origin = window.location.origin;
      const { data: checkoutData, error: checkoutErr } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            tenantId: currentTenant.id,
            successUrl: `${origin}/salon/subscription?subscription=success`,
            cancelUrl: `${origin}/salon/overview`,
            billingCycle: "monthly",
          },
        },
      );
      if (checkoutErr || !checkoutData?.url) {
        throw new Error(checkoutData?.error || "Failed to create checkout session");
      }

      window.location.href = checkoutData.url;
    } catch (err) {
      console.error("WelcomeModal checkout error:", err);
      toast.error(err instanceof Error ? err.message : "Could not start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  const logoBadge = (
    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: "rgba(244,200,78,.14)" }}>
      <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M16 16 C9 9 3 11 3 16 C3 21 9 23 16 16 C23 9 29 11 29 16 C29 21 23 23 16 16 Z"
          stroke="#F4C84E"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="16" cy="16" r="1.8" fill="#ffffff" />
      </svg>
    </div>
  );

  // --- Welcome Screen — left-aligned editorial, purple throughout ---
  if (screen === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
        <div
          className="w-full max-w-md overflow-hidden rounded-[24px] shadow-[0_28px_64px_rgba(20,12,36,0.5)]"
          style={{ background: "#2E1F4E" }}
        >
          <div className="px-8 pt-10">
            {logoBadge}
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#F4C84E" }}>
              You're all set
            </p>
            <h1 className="text-[28px] font-medium leading-[1.25] tracking-[-0.3px] text-white">
              Welcome to Salon Magik, {businessName}!
            </h1>
            <p className="mt-3.5 max-w-[300px] text-[14.5px] leading-relaxed" style={{ color: "#C9C2DC" }}>
              Your salon is live and ready to take bookings.
            </p>
          </div>

          {/* plain left-aligned lines, no boxes — the bottom border lives on
              the wrapper so it stays put whether the promo line is there or not */}
          <div className="mt-6 px-8" style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
            <div className="flex items-center gap-2.5 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="flex-shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="#8FD6A8" strokeWidth="1.8" />
                <path d="M8 12.3l2.6 2.6 5.4-5.8" stroke="#8FD6A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[13.5px]" style={{ color: "#EFEAF7" }}>
                {trialDays}-day free trial, no card needed yet.
              </span>
            </div>
            {hasPromo && countdown && (
              <div className="flex items-center gap-2.5 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,.1)" }}>
                <Clock className="h-4 w-4 flex-shrink-0" style={{ color: "#F4C84E" }} />
                <span className="text-[13.5px] font-semibold" style={{ color: "#F4C84E" }}>
                  {promoPreview?.campaignName} ·{" "}
                  {promoPreview?.discountType === "fixed"
                    ? `${symbol}${promoPreview.discountValue} off`
                    : `${promoPreview?.discountValue}% off`}
                  , {countdown} left
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5 px-8 pb-8 pt-6">
            {currentRole === "owner" && (
              <button
                type="button"
                onClick={() => setScreen("subscribe")}
                className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-px"
                style={{ background: "#F4C84E", color: "#2E1F4E" }}
              >
                Subscribe now
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleExplore}
              className="w-full rounded-full px-5 py-[11px] text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              style={{ border: "1px solid rgba(255,255,255,.3)", background: "transparent" }}
            >
              Start exploring
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Subscribe / Review Screen — the app's real dialog system:
  // BRAND_DIALOG_STYLE on DialogHeader only (dark), plain white body and
  // footer, real Button variants via FOOTER_ACCENT_STYLE on DialogFooter. ---
  return (
    <Dialog open onOpenChange={(next) => { if (!next) handleExplore(); }}>
      {/* A min-height at every breakpoint, not just sm+ -- a phone's own
          DIALOG_BODY_PADDING is smaller than desktop's, so it needs its
          own (smaller) floor rather than inheriting nothing below 640px.
          Both values are sized to each breakpoint's tallest real state
          (chain + 1 location add-on + promo line) so the shorter no-
          promo/solo state grows to match instead of visibly shrinking. */}
      <DialogContent className="min-h-[480px] sm:max-w-lg sm:min-h-[530px]">
        <DialogHeader className="flex flex-row items-center gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(157,134,198,.18)" }}>
            <CreditCard className="h-[18px] w-[18px]" style={{ color: "#9D86C6" }} />
          </div>
          <div>
            <DialogTitle className="font-serif text-2xl">Your subscription</DialogTitle>
            <p className="text-sm text-muted-foreground">One base plan, built to grow</p>
          </div>
        </DialogHeader>

        <div className={`${DIALOG_BODY_PADDING} flex-1`}>
          <div className="rounded-[18px] bg-muted p-[22px]">
            <div className="flex items-baseline justify-between">
              <span className="text-[14.5px] font-semibold text-foreground/70">Base subscription</span>
              <span className="text-[15px] font-semibold text-foreground">
                {symbol}
                {(baseOnlyPrice ?? 0).toLocaleString()}/mo
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              1 location, up to 3 team seats, unlimited everything else
            </p>

            {locationAddonRows.map((row, index) => (
              <div key={`${row.tier_label}-${index}`} className="mt-4 flex items-baseline justify-between">
                <span className="text-[14.5px] text-foreground/70">
                  {row.locations} extra location{row.locations !== 1 ? "s" : ""}
                </span>
                <span className="text-[15px] font-semibold text-foreground">
                  {row.subtotal != null ? `${symbol}${Number(row.subtotal).toLocaleString()}/mo` : "Custom"}
                </span>
              </div>
            ))}

            <div className="my-[18px] border-t border-border" />

            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-foreground">Monthly total</span>
              <span className="text-[25px] font-bold text-primary">
                {symbol}
                {(discountedPrice ?? totalPrice ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            {hasPromo && discountedPrice !== null && totalPrice !== null && (
              <p className="mt-1.5 text-[12.5px] font-semibold text-success">
                {promoPreview?.campaignName} applied —{" "}
                {promoPreview?.discountType === "percentage"
                  ? `${promoPreview.discountValue}% off`
                  : `${symbol}${promoPreview?.discountValue} off`}
                , was {symbol}
                {totalPrice.toLocaleString()}
              </p>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Nothing is charged until your {trialDays}-day trial ends. Cancel any time before then.
          </p>
        </div>

        <DialogFooter className="flex-row items-center justify-between">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleExplore}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
          >
            Skip for now, I'll subscribe later
          </button>
          <div className="flex gap-2.5">
            <Button type="button" variant="outline" disabled={isProcessing} onClick={() => setScreen("welcome")}>
              Back
            </Button>
            <Button type="button" disabled={isProcessing} onClick={handleConfirmAndPay}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Confirm &amp; Pay
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
