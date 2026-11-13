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
import { Clock, ArrowRight, Loader2 } from "lucide-react";
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
    <div className="mx-auto mb-[18px] flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(244,200,78,.14)" }}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
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

  // --- Welcome Screen ---
  if (screen === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
        <div
          className="w-full max-w-md overflow-hidden rounded-[24px] shadow-[0_28px_64px_rgba(20,12,36,0.5)]"
          style={{ background: "#2E1F4E" }}
        >
          <div className="px-8 pb-6 pt-9 text-center">
            {logoBadge}
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#F4C84E" }}>
              You're all set
            </p>
            <h1 className="text-[23px] font-medium leading-snug text-white">
              Welcome to Salon Magik, {businessName}!
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "#C9C2DC" }}>
              Your salon is live and ready to take bookings.
            </p>
          </div>

          <div className="px-7 pb-7 space-y-3">
            {/* Trial info */}
            <div
              className="flex items-start gap-3 rounded-2xl p-4"
              style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="#8FD6A8" strokeWidth="1.6" />
                <path d="M8 12.3l2.6 2.6 5.4-5.8" stroke="#8FD6A8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-[13.5px] font-semibold text-white">{trialDays}-day free trial active</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: "#B7AFCB" }}>
                  Explore every feature free — no card needed until you're ready to go live.
                </p>
              </div>
            </div>

            {/* Promo countdown */}
            {promoPreview?.valid && countdown && (
              <div
                className="flex items-start gap-3 rounded-2xl p-4"
                style={{ background: "rgba(244,200,78,.1)", border: "1px solid rgba(244,200,78,.25)" }}
              >
                <Clock className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" style={{ color: "#F4C84E" }} />
                <div>
                  <p className="text-[13.5px] font-semibold" style={{ color: "#F4C84E" }}>
                    Promo code active, expires in {countdown}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed" style={{ color: "#E3D4A8" }}>
                    {promoPreview.campaignName} ·{" "}
                    {promoPreview.discountType === "fixed"
                      ? `${symbol}${promoPreview.discountValue} off`
                      : `${promoPreview.discountValue}% off`}{" "}
                    your first subscription
                  </p>
                </div>
              </div>
            )}

            {/* CTA row: only the owner can reach billing, so only the owner sees Subscribe now */}
            <div className="flex flex-col gap-2.5 pt-1">
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
      </div>
    );
  }

  // --- Subscribe / Review Screen ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[24px] shadow-[0_28px_64px_rgba(20,12,36,0.5)]"
        style={{ background: "#2E1F4E" }}
      >
        <div className="px-8 pb-[18px] pt-7" style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "#F4C84E" }}>
            Your subscription
          </p>
          <h2 className="text-[20px] font-medium text-white">One base plan, built to grow</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "#C9C2DC" }}>
            Every salon pays the same base price. Extra locations and team seats are added only as you need them.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5">
          <div className="rounded-[18px] p-5" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)" }}>
            <div className="flex items-baseline justify-between">
              <span className="text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#B7AFCB" }}>
                Base subscription
              </span>
              {discountedPrice !== null && totalPrice !== null ? (
                <span className="text-right">
                  <span className="text-[26px] font-medium text-white">
                    {symbol}
                    {discountedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                  <span className="ml-1.5 text-[13px] line-through" style={{ color: "#8E84A6" }}>
                    {symbol}
                    {totalPrice.toLocaleString()}
                  </span>
                </span>
              ) : (
                <span className="text-[26px] font-medium text-white">
                  {symbol}
                  {(totalPrice ?? 0).toLocaleString()}
                  <span className="text-[13px] font-medium" style={{ color: "#9A8FB4" }}>/mo</span>
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "#9A8FB4" }}>
              Covers your first location and up to 3 team seats. Unlimited services, products, packages, vouchers and
              email marketing included.
            </p>
          </div>

          {locationAddonRows.length > 0 && (
            <div className="mt-3.5">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#B7AFCB" }}>
                Add-ons for this signup
              </p>
              {locationAddonRows.map((row, index) => (
                <div
                  key={`${row.tier_label}-${index}`}
                  className="flex items-center justify-between py-[11px]"
                  style={index < locationAddonRows.length - 1 ? { borderBottom: "1px solid rgba(255,255,255,.08)" } : undefined}
                >
                  <span className="text-[13.5px] text-white">
                    {row.locations} extra location{row.locations !== 1 ? "s" : ""} ({row.tier_label})
                  </span>
                  <span className="text-[13.5px]" style={{ color: "#C9C2DC" }}>
                    {row.subtotal != null ? `${symbol}${Number(row.subtotal).toLocaleString()}/mo` : "Custom"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            className="mt-4 flex items-center justify-between pt-4"
            style={{ borderTop: "1px solid rgba(255,255,255,.12)" }}
          >
            <span className="text-sm font-semibold text-white">Estimated monthly total</span>
            <span className="text-[20px] font-bold" style={{ color: "#F4C84E" }}>
              {symbol}
              {(discountedPrice ?? totalPrice ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>

          {promoPreview?.valid && discountedPrice !== null && (
            <div
              className="mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
              style={{ background: "rgba(143,214,168,.15)", color: "#8FD6A8" }}
            >
              {promoPreview.discountType === "percentage"
                ? `${promoPreview.discountValue}% off applied`
                : `${symbol}${promoPreview.discountValue} off applied`}
            </div>
          )}

          <div
            className="mt-4 flex items-start gap-2.5 rounded-2xl p-[13px]"
            style={{ background: "rgba(244,200,78,.1)", border: "1px solid rgba(244,200,78,.25)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 flex-shrink-0" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="#F4C84E" strokeWidth="1.6" />
              <path d="M12 7v6l4 2" stroke="#F4C84E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[12px] leading-relaxed" style={{ color: "#E3D4A8" }}>
              Nothing is charged until your {trialDays}-day trial ends. Cancel any time before then.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-7 pb-[26px] pt-[18px]">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleConfirmAndPay}
            className="flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-px disabled:opacity-70"
            style={{ background: "#F4C84E", color: "#2E1F4E" }}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Confirm & Pay
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => setScreen("welcome")}
            className="w-full rounded-full py-2 text-[13px] font-medium disabled:opacity-70"
            style={{ color: "#C9C2DC" }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleExplore}
            className="w-full text-center text-[12px] disabled:opacity-70"
            style={{ color: "#8E84A6" }}
          >
            Skip for now, I'll subscribe later
          </button>
        </div>
      </div>
    </div>
  );
}
