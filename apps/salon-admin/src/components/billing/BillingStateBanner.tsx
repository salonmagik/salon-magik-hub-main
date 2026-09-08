import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Lock } from "lucide-react";
import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantRecurringTotal } from "@/hooks/useTenantRecurringTotal";
import { useSubscriptionLifecycle } from "@/hooks/useSubscriptionLifecycle";
import { formatCurrency } from "@shared/currency";
import { cn } from "@shared/utils";
import { format } from "date-fns";

/**
 * Persistent banner shown on every authenticated screen while a tenant is
 * past_due or suspended (requirement 10) — never colour-only, an icon and
 * text carry the state so it isn't lost to accessibility tooling. Non-owners
 * see the same information but no settle action (edge case 14), matching
 * TrialBanner's contact-admin pattern.
 */
export function BillingStateBanner() {
	const { currentTenant } = useAuth();
	const { hasPermission } = usePermissions();
	const navigate = useNavigate();
	const { state, graceEndsAt } = useSubscriptionLifecycle();
	const { data: recurringTotal } = useTenantRecurringTotal();
	const [showContactAdmin, setShowContactAdmin] = useState(false);

	if (state !== "past_due" && state !== "suspended") return null;
	if (!currentTenant) return null;

	const canAccessSettings = hasPermission("settings");
	const isSuspended = state === "suspended";
	const amount = recurringTotal?.total_amount;
	const currency = recurringTotal?.currency;

	const handleSettleClick = () => {
		if (canAccessSettings) {
			navigate("/salon/subscription?billing=update_payment_method");
		} else {
			setShowContactAdmin(true);
		}
	};

	const amountLabel = amount != null && currency ? formatCurrency(amount, currency) : null;
	const deadlineLabel = graceEndsAt ? format(graceEndsAt, "MMM d, yyyy") : null;

	return (
		<>
			<div
				className={cn(
					"mx-4 mb-4 flex items-start gap-3 rounded-lg border p-3",
					"border-destructive bg-destructive/10 text-destructive",
				)}
				role="alert"
			>
				{isSuspended ? (
					<Lock className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
				) : (
					<AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">
						{isSuspended
							? "Your account is suspended for non-payment."
							: "Your payment is past due."}
						{amountLabel ? ` ${amountLabel} owed.` : ""}
					</p>
					<p className="mt-0.5 text-xs opacity-90">
						{isSuspended
							? "Your storefront and new bookings are disabled. Your existing data is safe and can still be read and exported."
							: deadlineLabel
								? `Settle by ${deadlineLabel} to avoid your storefront and bookings being disabled.`
								: "Settle now to avoid your storefront and bookings being disabled."}
					</p>
					<div className="mt-2 flex flex-wrap gap-2">
						<Button size="sm" variant="destructive" onClick={handleSettleClick}>
							{canAccessSettings ? "Settle now" : "Contact salon owner"}
						</Button>
					</div>
				</div>
			</div>

			<Dialog open={showContactAdmin} onOpenChange={setShowContactAdmin}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Ask your salon owner to settle billing</DialogTitle>
						<DialogDescription>
							You don't have access to billing settings. Ask your salon owner to update the
							payment method to restore full access.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button onClick={() => setShowContactAdmin(false)}>Got it</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
