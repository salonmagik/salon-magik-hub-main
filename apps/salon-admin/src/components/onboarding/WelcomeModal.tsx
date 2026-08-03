import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { cn } from "@shared/utils";
import { formatCurrency } from "@shared/currency";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";
import { usePlans } from "@/hooks/usePlans";
import { usePlanPricing } from "@/hooks/usePlanPricing";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Sparkles, Check, Clock, ArrowRight, PauseCircle, Loader2 } from "lucide-react";
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

const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  solo: "Solo",
  studio: "Studio",
  chain: "Chain",
};

const PLAN_ORDER: SubscriptionPlan[] = ["solo", "studio", "chain"];

function formatCountdown(target: string): string {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return "expired";
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 48) return `${Math.ceil(h / 24)} days`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(initialPlan);
  const [selectedBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [branchesToPause, setBranchesToPause] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<string | null>(null);

  const { data: plans } = usePlans();
  const { data: pricing } = usePlanPricing(currency);

  const promoExpiry = promoPreview?.expiresAt || promoPreview?.campaignEndsAt || null;

  // Live countdown timer
  useEffect(() => {
    if (!promoExpiry) return;
    const tick = () => setCountdown(formatCountdown(promoExpiry));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [promoExpiry]);

  const getPlanPricing = (slug: SubscriptionPlan) => {
    const plan = (plans || []).find((p) => p.slug === slug);
    if (!plan) return null;
    return (pricing || []).find((p) => p.plan_id === plan.id) || null;
  };

  const activePlanPricing = getPlanPricing(selectedPlan);
  const initialPlanPricing = getPlanPricing(initialPlan);

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

  const basePrice = activePlanPricing?.monthly_price ?? null;
  const discountedPrice = basePrice !== null ? computeDiscountedPrice(basePrice) : null;
  const symbol = getCurrencySymbol(currency);

  // Determine if we're downgrading from chain
  const wasChain = initialPlan === "chain";
  const isDowngrading = wasChain && selectedPlan !== "chain";
  const maxLocationsForPlan = selectedPlan === "chain" ? Infinity : selectedPlan === "studio" ? 2 : 1;
  const excessLocations = isDowngrading
    ? chainLocations.slice(maxLocationsForPlan)
    : [];

  // Validate branch pause selection
  const pauseRequired = isDowngrading && excessLocations.length > 0;
  const pauseCount = excessLocations.length;
  const canConfirm = !isProcessing && (!pauseRequired || branchesToPause.length === pauseCount);

  const availablePlans = useMemo(() =>
    PLAN_ORDER.filter((slug) => {
      const p = (plans || []).find((pl) => pl.slug === slug);
      return p && getPlanPricing(slug);
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [plans, pricing]);

  const handleExplore = () => {
    onDismiss();
    navigate("/salon/overview");
  };

  const handleConfirmAndPay = async () => {
    if (!currentTenant?.id) return;
    if (!canConfirm) return;

    setIsProcessing(true);
    try {
      // 1. If plan changed, update tenant plan first
      if (selectedPlan !== initialPlan) {
        const { error: planErr } = await supabase
          .from("tenants")
          .update({ plan: selectedPlan })
          .eq("id", currentTenant.id);
        if (planErr) throw planErr;
      }

      // 2. Pause selected branches (if downgrading from chain)
      if (branchesToPause.length > 0) {
        const { data: pauseResult, error: pauseErr } = await (supabase.rpc as any)("pause_locations", {
          p_tenant_id: currentTenant.id,
          p_location_ids: branchesToPause,
          p_reason: `Paused on plan downgrade from Chain to ${PLAN_NAMES[selectedPlan]}.`,
        });
        if (pauseErr) throw pauseErr;
        if (!pauseResult?.success) throw new Error(pauseResult?.message || "Failed to pause branches");
      }

      // 3. Create Paystack checkout session
      const origin = window.location.origin;
      const { data: checkoutData, error: checkoutErr } = await supabase.functions.invoke(
        "create-checkout-session",
        {
          body: {
            tenantId: currentTenant.id,
            successUrl: `${origin}/salon/subscription?subscription=success`,
            cancelUrl: `${origin}/salon/overview`,
            billingCycle: selectedBillingCycle,
          },
        },
      );
      if (checkoutErr || !checkoutData?.authorization_url) {
        throw new Error(checkoutData?.error || "Failed to create checkout session");
      }

      window.location.href = checkoutData.authorization_url;
    } catch (err) {
      console.error("WelcomeModal checkout error:", err);
      toast.error(err instanceof Error ? err.message : "Could not start checkout. Please try again.");
      setIsProcessing(false);
    }
  };

  // --- Welcome Screen ---
  if (screen === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Green header band */}
          <div className="bg-green-500 text-white px-6 py-8 text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Welcome to Salon Magik!</h1>
            <p className="text-green-100 text-sm mt-1">{businessName} is ready to go.</p>
          </div>

          <div className="px-6 py-6 space-y-5">
            {/* Trial info */}
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{trialDays}-day free trial active</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You're on the <strong>{PLAN_NAMES[initialPlan]}</strong> plan. Explore all features free for {trialDays} days.
                </p>
              </div>
            </div>

            {/* Promo countdown */}
            {promoPreview?.valid && countdown && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20 p-4">
                <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-amber-700 dark:text-amber-400">
                    Promo code active — expires in {countdown}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                    {promoPreview.campaignName} ·{" "}
                    {promoPreview.discountType === "fixed"
                      ? `${symbol}${promoPreview.discountValue} off`
                      : `${promoPreview.discountValue}% off`}{" "}
                    subscription
                  </p>
                </div>
              </div>
            )}

            {/* CTA row — only the owner can reach billing, so only the owner sees Subscribe now */}
            <div className="flex flex-col gap-3 pt-2">
              {currentRole === "owner" && (
                <Button className="w-full gap-2" onClick={() => setScreen("subscribe")}>
                  Subscribe now
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant={currentRole === "owner" ? "outline" : "default"}
                className="w-full"
                onClick={handleExplore}
              >
                Start exploring
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Subscribe / Review Screen ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-bold">Choose your plan</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Lock in your discount before the promo expires.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Plan pills */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Plan</p>
            <div className="flex gap-2 flex-wrap">
              {availablePlans.map((slug) => {
                const pp = getPlanPricing(slug);
                return (
                  <button
                    key={slug}
                    type="button"
                    onClick={() => {
                      setSelectedPlan(slug);
                      setBranchesToPause([]);
                    }}
                    className={cn(
                      "flex-1 min-w-[80px] rounded-lg border px-4 py-3 text-sm font-medium transition-all",
                      selectedPlan === slug
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <span className="block">{PLAN_NAMES[slug]}</span>
                    {pp && (
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {symbol}{pp.monthly_price.toLocaleString()}/mo
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pricing comparison */}
          {activePlanPricing && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Pricing</p>
              <div className="flex items-baseline gap-2">
                {discountedPrice !== null ? (
                  <>
                    <span className="text-2xl font-bold text-green-600">
                      {symbol}{discountedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-sm text-muted-foreground line-through">
                      {symbol}{activePlanPricing.monthly_price.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">/month</span>
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-bold">
                      {symbol}{activePlanPricing.monthly_price.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">/month</span>
                  </>
                )}
              </div>
              {promoPreview?.valid && discountedPrice !== null && (
                <Badge variant="success" className="text-xs">
                  {promoPreview.discountType === "percentage"
                    ? `${promoPreview.discountValue}% off applied`
                    : `${symbol}${promoPreview.discountValue} off applied`}
                </Badge>
              )}
              {selectedPlan !== initialPlan && initialPlanPricing && (
                <p className="text-xs text-muted-foreground">
                  Changing from <strong>{PLAN_NAMES[initialPlan]}</strong> (
                  {symbol}{initialPlanPricing.monthly_price.toLocaleString()}/mo)
                </p>
              )}
            </div>
          )}

          {/* Branch pausing selection */}
          {isDowngrading && excessLocations.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <PauseCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                    {pauseCount} branch{pauseCount !== 1 ? "es" : ""} will be paused
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-500 mt-0.5">
                    {PLAN_NAMES[selectedPlan]} supports {maxLocationsForPlan === 1 ? "1 branch" : `up to ${maxLocationsForPlan} branches`}.
                    Select which to pause — all data is kept and branches can be revived later.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {excessLocations.map((loc) => (
                  <label key={loc.id} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={branchesToPause.includes(loc.id)}
                      onChange={(e) => {
                        setBranchesToPause((prev) =>
                          e.target.checked
                            ? [...prev, loc.id]
                            : prev.filter((id) => id !== loc.id)
                        );
                      }}
                    />
                    <span className="text-sm">
                      {loc.name || "Unnamed branch"}{loc.city ? ` · ${loc.city}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              {pauseRequired && branchesToPause.length < pauseCount && (
                <p className="text-xs text-destructive">
                  Please select all {pauseCount} branch{pauseCount !== 1 ? "es" : ""} to pause to continue.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t flex flex-col gap-2">
          <Button
            className="w-full gap-2"
            disabled={!canConfirm}
            onClick={handleConfirmAndPay}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Confirm & Pay
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setScreen("welcome")} disabled={isProcessing}>
            Back
          </Button>
          <Button variant="link" className="w-full text-muted-foreground text-xs" onClick={handleExplore} disabled={isProcessing}>
            Skip for now — I'll subscribe later
          </Button>
        </div>
      </div>
    </div>
  );
}
