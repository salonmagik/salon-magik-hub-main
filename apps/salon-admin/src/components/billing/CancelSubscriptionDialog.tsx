import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@ui/ui/use-toast";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface CancelSubscriptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	accessEndDate: Date | null;
	onCancelled: () => void;
}

const CANCELLATION_REASONS: Array<{ value: string; label: string }> = [
	{ value: "too_expensive", label: "Too expensive" },
	{ value: "missing_features", label: "Missing features we need" },
	{ value: "switching_provider", label: "Switching to a different provider" },
	{ value: "closing_business", label: "Closing the business" },
	{ value: "temporary_pause", label: "Just need a temporary pause" },
	{ value: "other", label: "Other" },
];

/**
 * Reason picker + confirmation for owner-initiated end-of-period
 * cancellation (requirements 1-3). Confirm stays disabled until a reason is
 * chosen — the note is optional.
 */
export function CancelSubscriptionDialog({
	open,
	onOpenChange,
	accessEndDate,
	onCancelled,
}: CancelSubscriptionDialogProps) {
	const { currentTenant, refreshTenants } = useAuth();
	const { toast } = useToast();
	const [reason, setReason] = useState<string>("");
	const [note, setNote] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (open) {
			setReason("");
			setNote("");
		}
	}, [open]);

	const handleConfirm = async () => {
		if (!currentTenant?.id || !reason) return;
		setIsSubmitting(true);
		try {
			const { data, error } = await supabase.functions.invoke("manage-subscription-cancellation", {
				body: {
					tenantId: currentTenant.id,
					action: "cancel",
					reason,
					note: note.trim().slice(0, 1000) || null,
				},
			});
			if (error) throw error;

			await refreshTenants();
			toast({
				title: "Cancellation scheduled",
				description: data?.cancelAt
					? `Your access continues until ${format(new Date(data.cancelAt), "MMM d, yyyy")}. You can reverse this any time before then.`
					: "You can reverse this any time before your access ends.",
			});
			onOpenChange(false);
			onCancelled();
		} catch (error) {
			toast({
				title: "Couldn't cancel your subscription",
				description: (error as { message?: string })?.message || "Please try again.",
				variant: "destructive",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="rounded-[20px] sm:max-w-[430px]" closeButtonClassName="text-foreground hover:bg-muted hover:text-foreground">
				<DialogHeader className="!space-y-1 !px-6 !pb-3 !pt-5 sm:!px-8 sm:!pb-3 sm:!pt-7" style={{ "--background": "0 0% 100%", "--foreground": "262 20% 12%", "--muted-foreground": "258 15% 45%", backgroundColor: "#fff", color: "#21152f" } as CSSProperties}>
					<DialogTitle>Cancel your subscription?</DialogTitle>
					<DialogDescription className="text-[13px] leading-[1.45]">
						{accessEndDate
							? `You'll keep full access to ${currentTenant?.plan || "your current"} Plan until ${format(accessEndDate, "MMMM d, yyyy")}, the end of your current billing period. After that, your plan will move to the free plan and you'll lose multi-branch reporting, extra staff seats, and booking themes.`
							: "You'll keep full access until the end of your current billing period. After that, your plan will move to the free plan."
					}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 px-6 pb-4 pt-3 sm:px-8 sm:pb-5 sm:pt-3">
						<div className="space-y-1.5">
						<Label htmlFor="cancellation-reason">Why are you cancelling?</Label>
						<Select value={reason} onValueChange={setReason}>
						<SelectTrigger id="cancellation-reason" className="h-10">
								<SelectValue placeholder="Select a reason" />
							</SelectTrigger>
							<SelectContent>
								{CANCELLATION_REASONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

						<div className="space-y-1.5">
						<Label htmlFor="cancellation-note">Anything else you'd like to add? (optional)</Label>
						<Textarea
							id="cancellation-note"
							className="min-h-[72px] resize-none"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							maxLength={1000}
							placeholder="Optional"
						/>
					</div>
				</div>

				<DialogFooter className="gap-2 px-6 pb-5 pt-3 sm:flex-row sm:justify-end sm:gap-2 sm:px-8 sm:pb-5 sm:pt-3" style={{ "--primary": "0 72% 50%", "--primary-foreground": "0 0% 100%", "--accent": "262 45% 94%", "--accent-foreground": "262 46% 22%" } as CSSProperties}>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
						Keep my plan
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={!reason || isSubmitting}
					>
						{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						Confirm cancellation
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
