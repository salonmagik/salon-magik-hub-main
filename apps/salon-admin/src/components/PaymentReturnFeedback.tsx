import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OutcomeDialog } from "@ui/outcome-dialog";
import { supabase } from "@/lib/supabase";

const flows = {
  subscription: { endpoint: "verify-subscription-payment", result: "activated", title: "Subscription activated!", description: "Your plan is ready. Here’s to your salon’s next chapter." },
  planconfig: { endpoint: "verify-plan-configuration-payment", result: "applied", title: "Your plan is updated!", description: "Your new branches and team seats are ready to use." },
  billing: { endpoint: "verify-recurring-billing-retry-session", result: "applied", title: "You’re all set!", description: "Your payment method is updated and your subscription is active again." },
  themepurchase: { endpoint: "verify-theme-purchase-payment", result: "applied", title: "Your new look is ready!", description: "Your storefront theme is now active on your booking site." },
} as const;

export function PaymentReturnFeedback({ tenantId, refresh }: { tenantId?: string; refresh: () => Promise<unknown> }) {
  const [params, setParams] = useSearchParams();
  const key = (Object.keys(flows) as Array<keyof typeof flows>).find((item) => params.has(item));
  const rawStatus = key ? params.get(key) : null;
  const cancelled = rawStatus === "cancelled" || rawStatus === "update_payment_method_cancelled";
  const returning = (rawStatus === "success" || rawStatus === "failed" || rawStatus === "failure") || rawStatus === "update_payment_method" || cancelled;
  const reference = params.get("reference") || params.get("trxref");
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!key || !returning || cancelled) return;
    let active = true;
    const controller = new AbortController();
    setState("loading");
    const timeout = window.setTimeout(() => {
      active = false;
      controller.abort();
      setState("error");
    }, 30_000);
    const verify = async () => {
      if (!reference) { setState("error"); window.clearTimeout(timeout); return; }
      if (!tenantId) return; // Keep the feedback visible while the salon context loads.
      try {
        const flow = flows[key];
        const { data, error } = await supabase.functions.invoke(flow.endpoint, {
          body: { reference, tenantId }, signal: controller.signal,
        });
        if (error || data?.[flow.result] !== true) throw new Error("Payment not confirmed");
        await refreshRef.current();
        if (active) setState("success");
      } catch {
        if (active) setState("error");
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void verify();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [key, rawStatus, returning, cancelled, reference, tenantId, attempt]);

  if (!key || !returning) return null;
  const close = () => {
    const clean = new URLSearchParams(params);
    clean.delete(key); clean.delete("reference"); clean.delete("trxref");
    setParams(clean, { replace: true });
  };
  const status = cancelled ? "cancelled" : state;
  return <OutcomeDialog
    open status={status} onClose={close}
    title={cancelled ? "Checkout cancelled" : state === "loading" ? "Payment is being verified" : state === "success" ? flows[key].title : "We couldn’t confirm your payment"}
    description={cancelled ? "You closed checkout. You can return to your billing settings whenever you’re ready." : state === "loading" ? "We’re confirming your payment with Paystack and updating your salon." : state === "success" ? flows[key].description : "Your payment may still be processing. Check again before making another payment. If you were charged and this continues, contact support."}
    detail={state === "error" && !cancelled ? <div className="space-y-1"><p>{reference ? "Payment reference" : "No payment reference was returned. Contact support if you were charged."}</p>{reference && <p className="break-all font-medium text-foreground select-all">{reference}</p>}</div> : undefined}
    primaryAction={state === "error" && !cancelled && reference ? { label: "Check payment again", onClick: () => { setState("loading"); setAttempt((value) => value + 1); } } : undefined}
    closeLabel={status === "error" ? "Back to billing" : "Done"}
  />;
}
