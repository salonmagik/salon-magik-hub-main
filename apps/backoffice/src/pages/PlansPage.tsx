import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { Textarea } from "@ui/textarea";
import { toast } from "sonner";
import { CreditCard, DollarSign, AlertTriangle, Plus } from "lucide-react";
import { getCurrencySymbol } from "@/hooks/usePlanPricing";

interface Plan {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	display_order: number;
	is_active: boolean;
	is_recommended: boolean;
	trial_days: number;
}

interface PlanPricing {
	id: string;
	plan_id: string;
	currency: string;
	monthly_price: number;
	annual_price: number;
	effective_monthly: number;
}

interface PlanLimit {
	id: string;
	plan_id: string;
	max_locations: number;
	max_staff: number;
	max_services: number | null;
	max_products: number | null;
	monthly_messages: number;
}

interface CreatePlanForm {
	name: string;
	slug: string;
	description: string;
	display_order: number;
	trial_days: number;
	is_active: boolean;
	is_recommended: boolean;
	max_locations: number;
	max_staff: number;
	max_services: number | null;
	max_products: number | null;
	monthly_messages: number;
	reason: string;
}

interface CreatePricingForm {
	plan_id: string;
	currency: string;
	monthly_price: number;
	annual_price: number;
	effective_monthly: number;
	reason: string;
}

const CURRENCIES = ["USD", "NGN", "GHS"];

export default function PlansPage() {
	const queryClient = useQueryClient();
	const { backofficeUser } = useBackofficeAuth();
	const isSuperAdmin = backofficeUser?.role === "super_admin";

	const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
	const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
	const [limitsDialogOpen, setLimitsDialogOpen] = useState(false);
	const [createPlanDialogOpen, setCreatePlanDialogOpen] = useState(false);
	const [createPricingDialogOpen, setCreatePricingDialogOpen] = useState(false);
	const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
	const [confirmReason, setConfirmReason] = useState("");
	const [pendingChange, setPendingChange] = useState<{
		type: string;
		data: unknown;
	} | null>(null);

	const [editingPricing, setEditingPricing] = useState<
		Record<string, PlanPricing>
	>({});
	const [editingLimits, setEditingLimits] = useState<PlanLimit | null>(null);
	const [createPlanForm, setCreatePlanForm] = useState<CreatePlanForm>({
		name: "",
		slug: "",
		description: "",
		display_order: 1,
		trial_days: 14,
		is_active: true,
		is_recommended: false,
		max_locations: 1,
		max_staff: 1,
		max_services: null,
		max_products: null,
		monthly_messages: 30,
		reason: "",
	});
	const [createPricingForm, setCreatePricingForm] = useState<CreatePricingForm>(
		{
			plan_id: "",
			currency: "USD",
			monthly_price: 0,
			annual_price: 0,
			effective_monthly: 0,
			reason: "",
		},
	);

	const { data: plans, isLoading: plansLoading } = useQuery({
		queryKey: ["backoffice-plans"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("plans")
				.select("*")
				.order("display_order");
			if (error) throw error;
			return data as Plan[];
		},
	});

	const { data: pricing } = useQuery({
		queryKey: ["backoffice-pricing"],
		queryFn: async () => {
			const { data, error } = await supabase
				.from("plan_pricing")
				.select("*")
				.is("valid_until", null);
			if (error) throw error;
			return data as PlanPricing[];
		},
	});

	const { data: limits } = useQuery({
		queryKey: ["backoffice-limits"],
		queryFn: async () => {
			const { data, error } = await supabase.from("plan_limits").select("*");
			if (error) throw error;
			return data as PlanLimit[];
		},
	});

	const updatePricingMutation = useMutation({
		mutationFn: async ({
			planId,
			updates,
			reason,
		}: {
			planId: string;
			updates: Record<string, Partial<PlanPricing>>;
			reason: string;
		}) => {
			for (const [currency, priceData] of Object.entries(updates)) {
				const existingPrice = pricing?.find(
					(p) => p.plan_id === planId && p.currency === currency,
				);

				if (existingPrice) {
					const { error } = await supabase
						.from("plan_pricing")
						.update({
							monthly_price: priceData.monthly_price,
							annual_price: priceData.annual_price,
							effective_monthly: priceData.effective_monthly,
						})
						.eq("id", existingPrice.id);
					if (error) throw error;
				} else {
					const { error } = await supabase.from("plan_pricing").insert({
						plan_id: planId,
						currency,
						monthly_price: priceData.monthly_price ?? 0,
						annual_price: priceData.annual_price ?? 0,
						effective_monthly: priceData.effective_monthly ?? 0,
					});
					if (error) throw error;
				}
			}

			await supabase.from("audit_logs").insert({
				action: "pricing_updated",
				entity_type: "plan",
				entity_id: planId,
				actor_user_id: backofficeUser?.user_id,
				metadata: { reason, updates },
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
			toast.success("Pricing updated successfully");
			setPricingDialogOpen(false);
			setConfirmDialogOpen(false);
			setConfirmReason("");
			setPendingChange(null);
		},
		onError: (error) => {
			toast.error("Failed to update pricing: " + error.message);
		},
	});

	const updateLimitsMutation = useMutation({
		mutationFn: async ({
			planId,
			limits: limitsData,
			reason,
		}: {
			planId: string;
			limits: Partial<PlanLimit>;
			reason: string;
		}) => {
			const existingLimit = limits?.find((l) => l.plan_id === planId);

			if (existingLimit) {
				const { error } = await supabase
					.from("plan_limits")
					.update(limitsData)
					.eq("id", existingLimit.id);
				if (error) throw error;
			}

			await supabase.from("audit_logs").insert({
				action: "limits_updated",
				entity_type: "plan",
				entity_id: planId,
				actor_user_id: backofficeUser?.user_id,
				metadata: { reason, limits: limitsData },
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
			toast.success("Limits updated successfully");
			setLimitsDialogOpen(false);
			setConfirmDialogOpen(false);
			setConfirmReason("");
			setPendingChange(null);
		},
		onError: (error) => {
			toast.error("Failed to update limits: " + error.message);
		},
	});

	const createPlanMutation = useMutation({
		mutationFn: async ({ planData }: { planData: CreatePlanForm }) => {
			const { data: createdPlan, error: planError } = await supabase
				.from("plans")
				.insert({
					name: planData.name,
					slug: planData.slug,
					description: planData.description || null,
					display_order: planData.display_order,
					trial_days: planData.trial_days,
					is_active: planData.is_active,
					is_recommended: planData.is_recommended,
				})
				.select("id")
				.single();

			if (planError) throw planError;

			const { error: limitsError } = await supabase.from("plan_limits").insert({
				plan_id: createdPlan.id,
				max_locations: planData.max_locations,
				max_staff: planData.max_staff,
				max_services: planData.max_services,
				max_products: planData.max_products,
				monthly_messages: planData.monthly_messages,
			});
			if (limitsError) throw limitsError;

			await supabase.from("audit_logs").insert({
				action: "plan_created",
				entity_type: "plan",
				entity_id: createdPlan.id,
				actor_user_id: backofficeUser?.user_id,
				metadata: {
					reason: planData.reason,
					name: planData.name,
					slug: planData.slug,
				},
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["backoffice-plans"] });
			queryClient.invalidateQueries({ queryKey: ["backoffice-limits"] });
			toast.success("Plan created successfully");
			setCreatePlanDialogOpen(false);
			setCreatePlanForm((prev) => ({
				...prev,
				name: "",
				slug: "",
				description: "",
				reason: "",
			}));
		},
		onError: (error) => {
			toast.error("Failed to create plan: " + error.message);
		},
	});

	const createPricingMutation = useMutation({
		mutationFn: async ({ pricingData }: { pricingData: CreatePricingForm }) => {
			const existing = pricing?.find(
				(p) =>
					p.plan_id === pricingData.plan_id &&
					p.currency === pricingData.currency,
			);
			if (existing)
				throw new Error(
					`${pricingData.currency} pricing already exists for this plan`,
				);

			const { data: createdPricing, error } = await supabase
				.from("plan_pricing")
				.insert({
					plan_id: pricingData.plan_id,
					currency: pricingData.currency,
					monthly_price: pricingData.monthly_price,
					annual_price: pricingData.annual_price,
					effective_monthly: pricingData.effective_monthly,
				})
				.select("id")
				.single();
			if (error) throw error;

			await supabase.from("audit_logs").insert({
				action: "pricing_created",
				entity_type: "plan_pricing",
				entity_id: createdPricing.id,
				actor_user_id: backofficeUser?.user_id,
				metadata: {
					reason: pricingData.reason,
					plan_id: pricingData.plan_id,
					currency: pricingData.currency,
				},
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["backoffice-pricing"] });
			toast.success("Pricing created successfully");
			setCreatePricingDialogOpen(false);
			setCreatePricingForm((prev) => ({
				...prev,
				monthly_price: 0,
				annual_price: 0,
				effective_monthly: 0,
				reason: "",
			}));
		},
		onError: (error) => {
			toast.error("Failed to create pricing: " + error.message);
		},
	});

	const openPricingDialog = (plan: Plan) => {
		setSelectedPlan(plan);
		const planPricing: Record<string, PlanPricing> = {};
		CURRENCIES.forEach((curr) => {
			const existing = pricing?.find(
				(p) => p.plan_id === plan.id && p.currency === curr,
			);
			if (existing) planPricing[curr] = { ...existing };
		});
		setEditingPricing(planPricing);
		setPricingDialogOpen(true);
	};

	const openLimitsDialog = (plan: Plan) => {
		setSelectedPlan(plan);
		const existing = limits?.find((l) => l.plan_id === plan.id);
		setEditingLimits(existing ? { ...existing } : null);
		setLimitsDialogOpen(true);
	};

	const openCreatePlanDialog = () => {
		const nextDisplayOrder = plans?.length
			? Math.max(...plans.map((p) => p.display_order)) + 1
			: 1;
		setCreatePlanForm((prev) => ({ ...prev, display_order: nextDisplayOrder }));
		setCreatePlanDialogOpen(true);
	};

	const openCreatePricingDialog = () => {
		setCreatePricingForm((prev) => ({
			...prev,
			plan_id: prev.plan_id || plans?.[0]?.id || "",
			currency: prev.currency || "USD",
		}));
		setCreatePricingDialogOpen(true);
	};

	const handlePricingSave = () => {
		setPendingChange({ type: "pricing", data: editingPricing });
		setConfirmDialogOpen(true);
	};

	const handleLimitsSave = () => {
		setPendingChange({ type: "limits", data: editingLimits });
		setConfirmDialogOpen(true);
	};

	const handleConfirmChange = () => {
		if (!confirmReason.trim()) {
			toast.error("Please provide a reason for this change");
			return;
		}
		if (!selectedPlan) return;

		if (pendingChange?.type === "pricing") {
			updatePricingMutation.mutate({
				planId: selectedPlan.id,
				updates: pendingChange.data as Record<string, Partial<PlanPricing>>,
				reason: confirmReason,
			});
		} else if (pendingChange?.type === "limits") {
			updateLimitsMutation.mutate({
				planId: selectedPlan.id,
				limits: pendingChange.data as Partial<PlanLimit>,
				reason: confirmReason,
			});
		}
	};

	const getPlanPricing = (planId: string, currency: string) =>
		pricing?.find((p) => p.plan_id === planId && p.currency === currency);

	const getPlanLimits = (planId: string) =>
		limits?.find((l) => l.plan_id === planId);

	return (
		<BackofficeLayout>
			<div className="p-6 space-y-6">
				<div>
					<h1 className="text-2xl font-bold tracking-tight">Plans & Pricing</h1>
					<p className="text-muted-foreground">
						Manage subscription tiers, regional pricing, and resource limits
					</p>
				</div>

				{isSuperAdmin && (
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" onClick={openCreatePlanDialog}>
							<Plus className="mr-2 h-4 w-4" />
							Add Plan
						</Button>
						<Button variant="outline" onClick={openCreatePricingDialog}>
							<Plus className="mr-2 h-4 w-4" />
							Add Pricing
						</Button>
					</div>
				)}

				{!isSuperAdmin && (
					<Card className="border-amber-200 bg-amber-50/50">
						<CardContent className="py-4">
							<div className="flex items-center gap-2 text-amber-700">
								<AlertTriangle className="h-4 w-4" />
								<span className="text-sm">
									Only Super Admins can modify pricing and limits. You have
									read-only access.
								</span>
							</div>
						</CardContent>
					</Card>
				)}

				<Tabs defaultValue="plans">
					<TabsList>
						<TabsTrigger value="plans">Plans</TabsTrigger>
						<TabsTrigger value="pricing">Regional Pricing</TabsTrigger>
					</TabsList>

					<TabsContent value="plans" className="space-y-4 mt-4">
						{plansLoading ? (
							<div className="text-center py-8 text-muted-foreground">
								Loading...
							</div>
						) : (
							<div className="grid gap-4 md:grid-cols-3">
								{plans?.map((plan) => {
									const planLimits = getPlanLimits(plan.id);
									const usdPricing = getPlanPricing(plan.id, "USD");

									return (
										<Card
											key={plan.id}
											className={plan.is_recommended ? "border-primary" : ""}
										>
											<CardHeader>
												<div className="flex items-center justify-between">
													<CardTitle>{plan.name}</CardTitle>
													<div className="flex gap-1">
														{plan.is_recommended && (
															<Badge variant="default">Recommended</Badge>
														)}
														{!plan.is_active && (
															<Badge variant="secondary">Inactive</Badge>
														)}
													</div>
												</div>
												<CardDescription>{plan.description}</CardDescription>
											</CardHeader>
											<CardContent className="space-y-4">
												<div className="text-2xl font-bold">
													${usdPricing?.monthly_price || 0}
													<span className="text-sm font-normal text-muted-foreground">
														/month
													</span>
												</div>

												<div className="text-sm space-y-1 text-muted-foreground">
													<p>Locations: {planLimits?.max_locations || 1}</p>
													<p>Staff: {planLimits?.max_staff || 1}</p>
													<p>
														Messages: {planLimits?.monthly_messages || 30}/mo
													</p>
													<p>Trial: {plan.trial_days} days</p>
												</div>

												{isSuperAdmin && (
													<div className="flex gap-2 pt-2">
														<Button
															variant="outline"
															size="sm"
															className="flex-1"
															onClick={() => openPricingDialog(plan)}
														>
															<DollarSign className="mr-1 h-3 w-3" />
															Pricing
														</Button>
														<Button
															variant="outline"
															size="sm"
															className="flex-1"
															onClick={() => openLimitsDialog(plan)}
														>
															<CreditCard className="mr-1 h-3 w-3" />
															Limits
														</Button>
													</div>
												)}
											</CardContent>
										</Card>
									);
								})}
							</div>
						)}
					</TabsContent>

					<TabsContent value="pricing" className="mt-4">
						<Card>
							<CardHeader>
								<CardTitle>Regional Pricing</CardTitle>
								<CardDescription>
									Pricing by currency for all active plans
								</CardDescription>
							</CardHeader>
							<CardContent>
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Plan</TableHead>
											{CURRENCIES.map((curr) => (
												<TableHead key={curr} className="text-center">
													{curr}
												</TableHead>
											))}
										</TableRow>
									</TableHeader>
									<TableBody>
										{plans?.map((plan) => (
											<TableRow key={plan.id}>
												<TableCell className="font-medium">
													{plan.name}
												</TableCell>
												{CURRENCIES.map((curr) => {
													const p = getPlanPricing(plan.id, curr);
													return (
														<TableCell key={curr} className="text-center">
															{p ? (
																<span>
																	{getCurrencySymbol(curr)}
																	{p.monthly_price}
																</span>
															) : (
																<span className="text-muted-foreground">-</span>
															)}
														</TableCell>
													);
												})}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
					</TabsContent>
				</Tabs>

				<Dialog
					open={createPlanDialogOpen}
					onOpenChange={setCreatePlanDialogOpen}
				>
					<DialogContent className="sm:max-w-[650px]">
						<DialogHeader>
							<DialogTitle>Create New Plan</DialogTitle>
							<DialogDescription>
								Add a new subscription plan and its default limits.
							</DialogDescription>
						</DialogHeader>

						<div className="grid gap-4 py-2">
							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label>Name</Label>
									<Input
										value={createPlanForm.name}
										onChange={(e) => {
											const name = e.target.value;
											setCreatePlanForm((prev) => ({
												...prev,
												name,
												slug:
													prev.slug ||
													name
														.toLowerCase()
														.trim()
														.replace(/[^a-z0-9\s-]/g, "")
														.replace(/\s+/g, "-"),
											}));
										}}
										placeholder="Starter"
									/>
								</div>
								<div>
									<Label>Slug</Label>
									<Input
										value={createPlanForm.slug}
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												slug: e.target.value
													.toLowerCase()
													.trim()
													.replace(/\s+/g, "-"),
											}))
										}
										placeholder="starter"
									/>
								</div>
							</div>

							<div>
								<Label>Description</Label>
								<Textarea
									value={createPlanForm.description}
									onChange={(e) =>
										setCreatePlanForm((prev) => ({
											...prev,
											description: e.target.value,
										}))
									}
								/>
							</div>

							<div className="grid grid-cols-3 gap-4">
								<div>
									<Label>Display Order</Label>
									<Input
										type="number"
										value={createPlanForm.display_order}
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												display_order: parseInt(e.target.value) || 1,
											}))
										}
									/>
								</div>
								<div>
									<Label>Trial Days</Label>
									<Input
										type="number"
										value={createPlanForm.trial_days}
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												trial_days: parseInt(e.target.value) || 0,
											}))
										}
									/>
								</div>
								<div className="flex items-end gap-4 pb-2 text-sm">
									<label className="flex items-center gap-2">
										<input
											type="checkbox"
											checked={createPlanForm.is_active}
											onChange={(e) =>
												setCreatePlanForm((prev) => ({
													...prev,
													is_active: e.target.checked,
												}))
											}
										/>
										Active
									</label>
									<label className="flex items-center gap-2">
										<input
											type="checkbox"
											checked={createPlanForm.is_recommended}
											onChange={(e) =>
												setCreatePlanForm((prev) => ({
													...prev,
													is_recommended: e.target.checked,
												}))
											}
										/>
										Recommended
									</label>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<Label>Max Locations</Label>
									<Input
										type="number"
										value={createPlanForm.max_locations}
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												max_locations: parseInt(e.target.value) || 1,
											}))
										}
									/>
								</div>
								<div>
									<Label>Max Staff</Label>
									<Input
										type="number"
										value={createPlanForm.max_staff}
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												max_staff: parseInt(e.target.value) || 1,
											}))
										}
									/>
								</div>
								<div>
									<Label>Max Services (optional)</Label>
									<Input
										type="number"
										value={createPlanForm.max_services ?? ""}
										placeholder="Unlimited"
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												max_services: e.target.value
													? parseInt(e.target.value)
													: null,
											}))
										}
									/>
								</div>
								<div>
									<Label>Max Products (optional)</Label>
									<Input
										type="number"
										value={createPlanForm.max_products ?? ""}
										placeholder="Unlimited"
										onChange={(e) =>
											setCreatePlanForm((prev) => ({
												...prev,
												max_products: e.target.value
													? parseInt(e.target.value)
													: null,
											}))
										}
									/>
								</div>
							</div>

							<div>
								<Label>Monthly Messages</Label>
								<Input
									type="number"
									value={createPlanForm.monthly_messages}
									onChange={(e) =>
										setCreatePlanForm((prev) => ({
											...prev,
											monthly_messages: parseInt(e.target.value) || 0,
										}))
									}
								/>
							</div>

							<div>
								<Label>Reason for change</Label>
								<Textarea
									value={createPlanForm.reason}
									onChange={(e) =>
										setCreatePlanForm((prev) => ({
											...prev,
											reason: e.target.value,
										}))
									}
									placeholder="Explain why this plan is being added..."
								/>
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setCreatePlanDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={() => {
									if (
										!createPlanForm.name.trim() ||
										!createPlanForm.slug.trim()
									)
										return toast.error("Plan name and slug are required");
									if (!createPlanForm.reason.trim())
										return toast.error(
											"Please provide a reason for creating this plan",
										);
									createPlanMutation.mutate({ planData: createPlanForm });
								}}
								disabled={createPlanMutation.isPending}
							>
								Create Plan
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog
					open={createPricingDialogOpen}
					onOpenChange={setCreatePricingDialogOpen}
				>
					<DialogContent className="sm:max-w-[520px]">
						<DialogHeader>
							<DialogTitle>Create Pricing Entry</DialogTitle>
							<DialogDescription>
								Add a new currency pricing row for a plan.
							</DialogDescription>
						</DialogHeader>

						<div className="grid gap-4 py-2">
							<div>
								<Label>Plan</Label>
								<select
									className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									value={createPricingForm.plan_id}
									onChange={(e) =>
										setCreatePricingForm((prev) => ({
											...prev,
											plan_id: e.target.value,
										}))
									}
								>
									<option value="" disabled>
										Select plan
									</option>
									{plans?.map((plan) => (
										<option key={plan.id} value={plan.id}>
											{plan.name}
										</option>
									))}
								</select>
							</div>

							<div>
								<Label>Currency</Label>
								<select
									className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									value={createPricingForm.currency}
									onChange={(e) =>
										setCreatePricingForm((prev) => ({
											...prev,
											currency: e.target.value,
										}))
									}
								>
									{CURRENCIES.map((curr) => (
										<option key={curr} value={curr}>
											{curr}
										</option>
									))}
								</select>
							</div>

							<div className="grid grid-cols-3 gap-3">
								<div>
									<Label>Monthly</Label>
									<Input
										type="number"
										value={createPricingForm.monthly_price}
										onChange={(e) =>
											setCreatePricingForm((prev) => ({
												...prev,
												monthly_price: parseFloat(e.target.value) || 0,
											}))
										}
									/>
								</div>
								<div>
									<Label>Annual</Label>
									<Input
										type="number"
										value={createPricingForm.annual_price}
										onChange={(e) =>
											setCreatePricingForm((prev) => ({
												...prev,
												annual_price: parseFloat(e.target.value) || 0,
											}))
										}
									/>
								</div>
								<div>
									<Label>Eff. Monthly</Label>
									<Input
										type="number"
										value={createPricingForm.effective_monthly}
										onChange={(e) =>
											setCreatePricingForm((prev) => ({
												...prev,
												effective_monthly: parseFloat(e.target.value) || 0,
											}))
										}
									/>
								</div>
							</div>

							<div>
								<Label>Reason for change</Label>
								<Textarea
									value={createPricingForm.reason}
									onChange={(e) =>
										setCreatePricingForm((prev) => ({
											...prev,
											reason: e.target.value,
										}))
									}
									placeholder="Explain why this pricing row is being added..."
								/>
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setCreatePricingDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={() => {
									if (!createPricingForm.plan_id)
										return toast.error("Please select a plan");
									if (!createPricingForm.reason.trim())
										return toast.error(
											"Please provide a reason for creating this pricing",
										);
									createPricingMutation.mutate({
										pricingData: createPricingForm,
									});
								}}
								disabled={createPricingMutation.isPending}
							>
								Create Pricing
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog open={pricingDialogOpen} onOpenChange={setPricingDialogOpen}>
					<DialogContent className="sm:max-w-[600px]">
						<DialogHeader>
							<DialogTitle>Edit Pricing - {selectedPlan?.name}</DialogTitle>
							<DialogDescription>
								Update pricing for all regions. Changes are logged and require
								confirmation.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4 py-4">
							{CURRENCIES.map((curr) => {
								const p = editingPricing[curr];
								if (!p) return null;
								return (
									<div key={curr} className="grid grid-cols-4 gap-4 items-end">
										<div>
											<Label>{curr}</Label>
											<Badge variant="outline" className="mt-1">
												{getCurrencySymbol(curr)}
											</Badge>
										</div>
										<div>
											<Label>Monthly</Label>
											<Input
												type="number"
												value={p.monthly_price}
												onChange={(e) =>
													setEditingPricing({
														...editingPricing,
														[curr]: {
															...p,
															monthly_price: parseFloat(e.target.value) || 0,
														},
													})
												}
											/>
										</div>
										<div>
											<Label>Annual</Label>
											<Input
												type="number"
												value={p.annual_price}
												onChange={(e) =>
													setEditingPricing({
														...editingPricing,
														[curr]: {
															...p,
															annual_price: parseFloat(e.target.value) || 0,
														},
													})
												}
											/>
										</div>
										<div>
											<Label>Eff. Monthly</Label>
											<Input
												type="number"
												value={p.effective_monthly}
												onChange={(e) =>
													setEditingPricing({
														...editingPricing,
														[curr]: {
															...p,
															effective_monthly:
																parseFloat(e.target.value) || 0,
														},
													})
												}
											/>
										</div>
									</div>
								);
							})}
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setPricingDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button onClick={handlePricingSave}>Save Changes</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog open={limitsDialogOpen} onOpenChange={setLimitsDialogOpen}>
					<DialogContent className="sm:max-w-[500px]">
						<DialogHeader>
							<DialogTitle>Edit Limits - {selectedPlan?.name}</DialogTitle>
							<DialogDescription>
								Update resource limits for this plan.
							</DialogDescription>
						</DialogHeader>
						{editingLimits && (
							<div className="grid gap-4 py-4">
								<div className="grid grid-cols-2 gap-4">
									<div>
										<Label>Max Locations</Label>
										<Input
											type="number"
											value={editingLimits.max_locations}
											onChange={(e) =>
												setEditingLimits({
													...editingLimits,
													max_locations: parseInt(e.target.value) || 1,
												})
											}
										/>
									</div>
									<div>
										<Label>Max Staff</Label>
										<Input
											type="number"
											value={editingLimits.max_staff}
											onChange={(e) =>
												setEditingLimits({
													...editingLimits,
													max_staff: parseInt(e.target.value) || 1,
												})
											}
										/>
									</div>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<Label>Max Services</Label>
										<Input
											type="number"
											value={editingLimits.max_services || ""}
											placeholder="Unlimited"
											onChange={(e) =>
												setEditingLimits({
													...editingLimits,
													max_services: e.target.value
														? parseInt(e.target.value)
														: null,
												})
											}
										/>
									</div>
									<div>
										<Label>Max Products</Label>
										<Input
											type="number"
											value={editingLimits.max_products || ""}
											placeholder="Unlimited"
											onChange={(e) =>
												setEditingLimits({
													...editingLimits,
													max_products: e.target.value
														? parseInt(e.target.value)
														: null,
												})
											}
										/>
									</div>
								</div>
								<div>
									<Label>Monthly Messages</Label>
									<Input
										type="number"
										value={editingLimits.monthly_messages}
										onChange={(e) =>
											setEditingLimits({
												...editingLimits,
												monthly_messages: parseInt(e.target.value) || 0,
											})
										}
									/>
								</div>
							</div>
						)}
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setLimitsDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button onClick={handleLimitsSave}>Save Changes</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				<Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<AlertTriangle className="h-5 w-5 text-amber-500" />
								Confirm Change
							</DialogTitle>
							<DialogDescription>
								This change will be logged and audited. Please provide a reason.
							</DialogDescription>
						</DialogHeader>
						<div className="py-4">
							<Label htmlFor="reason">Reason for change</Label>
							<Textarea
								id="reason"
								value={confirmReason}
								onChange={(e) => setConfirmReason(e.target.value)}
								placeholder="Explain why this change is being made..."
								className="mt-2"
							/>
						</div>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setConfirmDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button
								onClick={handleConfirmChange}
								disabled={
									updatePricingMutation.isPending ||
									updateLimitsMutation.isPending
								}
							>
								Confirm & Save
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</BackofficeLayout>
	);
}
