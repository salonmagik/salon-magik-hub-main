import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
import { Checkbox } from "@ui/checkbox";
import { Skeleton } from "@ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
  Users,
  Tag,
  UserPlus,
  Calendar,
  Download,
  Search,
  Mail,
  Phone,
  CreditCard,
  MoreHorizontal,
  Eye,
  Star,
  Flag,
  Trash2,
  CheckCircle,
  Plus,
  Info,
} from "lucide-react";
import { cn } from "@shared/utils";
import { AddCustomerDialog } from "@/components/dialogs/AddCustomerDialog";
import { CustomerDetailDialog } from "@/components/dialogs/CustomerDetailDialog";
import { FlagCustomerDialog } from "@/components/dialogs/FlagCustomerDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { ImportDialog, type TemplateColumn } from "@/components/dialogs/ImportDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { useCustomers } from "@/hooks/useCustomers";
import type { CustomerWithVisitSummary } from "@/hooks/useCustomers";
import { useCustomerSegments, segmentTags, CUSTOMER_TAG_META } from "@/hooks/useCustomerSegments";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type Customer = CustomerWithVisitSummary;
type ReactivationChannel = "email" | "sms";

interface InactiveCustomerRow {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  days_since_last_transaction: number;
  last_purchased_item: string | null;
  last_transaction_at: string | null;
}

const statusFilters = [
  "All",
  "Active",
  "VIP",
  "Big spender",
  "Regular",
  "Loves packages",
  "Lapsed",
  "Inactive",
  "Blocked",
];

export default function CustomersPage() {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [inactiveDialogOpen, setInactiveDialogOpen] = useState(false);
  const [inactiveDaysThreshold, setInactiveDaysThreshold] = useState(30);
  const [inactiveDaysThresholdInput, setInactiveDaysThresholdInput] = useState("30");
  const [reactivationDialogOpen, setReactivationDialogOpen] = useState(false);
  const [reactivationChannel, setReactivationChannel] = useState<ReactivationChannel>("email");
  const [reactivationMessage, setReactivationMessage] = useState(
    "Hi {{customer_name}}, we miss you at {{salon_name}}. Your favorite service is available this week. Reply to book and enjoy a warm welcome back.",
  );
  const [reactivationSubject, setReactivationSubject] = useState("We miss you at {{salon_name}}");
  const [selectedInactiveCustomerIds, setSelectedInactiveCustomerIds] = useState<string[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  // Action dialogs
  const [flagDialogCustomer, setFlagDialogCustomer] = useState<Customer | null>(null);
  const [deleteDialogCustomer, setDeleteDialogCustomer] = useState<Customer | null>(null);
  const [bulkFlagDialogOpen, setBulkFlagDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const { currentTenant, currentRole } = useAuth();
  const queryClient = useQueryClient();
  const {
    customers,
    isLoading,
    refetch,
    updateCustomerStatus,
    bulkUpdateCustomerStatus,
    setCustomerVip,
    bulkSetCustomerVip,
    flagCustomer,
    bulkFlagCustomers,
    deleteCustomer,
    bulkDeleteCustomers,
  } = useCustomers();
  const { segments } = useCustomerSegments();
  const { hasPermission } = usePermissions();

  const currency = currentTenant?.currency || "USD";

  const { data: inactiveCustomers = [], refetch: refetchInactiveCustomers } = useQuery({
    queryKey: ["inactive-customers", currentTenant?.id, inactiveDaysThreshold],
    queryFn: async (): Promise<InactiveCustomerRow[]> => {
      if (!currentTenant?.id) return [];
      const { data, error } = await (supabase.rpc as any)("get_inactive_customers", {
        p_tenant_id: currentTenant.id,
        p_days_threshold: inactiveDaysThreshold,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return Array.isArray(data) ? (data as InactiveCustomerRow[]) : [];
    },
    enabled: Boolean(currentTenant?.id),
  });

  const sendReactivationMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant?.id) throw new Error("Tenant missing");
      if (!selectedInactiveCustomerIds.length) throw new Error("Select at least one recipient");

      const selectedRows = inactiveCustomers.filter((row) =>
        selectedInactiveCustomerIds.includes(row.customer_id),
      );

      const { data: campaign, error: campaignError } = await (supabase
        .from("customer_reactivation_campaigns" as any)
        .insert({
          tenant_id: currentTenant.id,
          name: `Reactivation ${new Date().toLocaleDateString()}`,
          channel: reactivationChannel,
          status: "previewed",
          template_json: {
            subject: reactivationSubject,
            message: reactivationMessage,
          },
          filters_json: {
            days_threshold: inactiveDaysThreshold,
          },
        })
        .select("id")
        .single() as any);

      if (campaignError) throw campaignError;

      const recipientsPayload = selectedRows.map((row) => ({
        campaign_id: campaign.id,
        customer_id: row.customer_id,
        preview_payload_json: {
          subject: reactivationSubject
            .replaceAll("{{customer_name}}", row.customer_name)
            .replaceAll("{{salon_name}}", currentTenant.name || "Salon Magik"),
          message: reactivationMessage
            .replaceAll("{{customer_name}}", row.customer_name)
            .replaceAll("{{salon_name}}", currentTenant.name || "Salon Magik")
            .replaceAll("{{most_purchased_item}}", row.last_purchased_item || "our top services"),
        },
      }));

      const { error: recipientsError } = await (supabase
        .from("customer_reactivation_recipients" as any)
        .insert(recipientsPayload as any) as any);
      if (recipientsError) throw recipientsError;

      const { error: invokeError } = await supabase.functions.invoke("send-reactivation-campaign", {
        body: { campaign_id: campaign.id },
      });
      if (invokeError) throw invokeError;
    },
    onSuccess: () => {
      toast({ title: "Reactivation sent", description: "Campaign queued and sent to selected customers." });
      setReactivationDialogOpen(false);
      setSelectedInactiveCustomerIds([]);
      queryClient.invalidateQueries({ queryKey: ["inactive-customers"] });
    },
    onError: (error: Error) => {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
    },
  });

  // Permission checks
  const canMakeVIP =
    currentRole === "owner" ||
    currentRole === "manager" ||
    currentRole === "supervisor" ||
    currentRole === "receptionist" ||
    hasPermission("customers:vip");
  const canFlag =
    currentRole === "owner" ||
    currentRole === "manager" ||
    currentRole === "supervisor" ||
    currentRole === "receptionist" ||
    hasPermission("customers:flag");
  const canDelete =
    currentRole === "owner" ||
    currentRole === "manager" ||
    hasPermission("customers:delete");

  // Calculate stats
  const stats = useMemo(() => {
    const activeCustomers = customers.filter((customer) => customer.status !== "deleted");
    const total = activeCustomers.length;
    const vip = activeCustomers.filter((c) => (c as { is_starred?: boolean }).is_starred).length;
    const thisMonth = activeCustomers.filter((c) => {
      const created = new Date(c.created_at);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
    const inactive = inactiveCustomers.length;

    return { total, vip, thisMonth, inactive };
  }, [customers, inactiveCustomers.length]);

  const statusCards = [
    { label: "Total Customers", count: stats.total, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
    {
      label: "VIP Customers",
      count: stats.vip,
      icon: Tag,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
      description: "Customers you've manually starred as VIP — a different, hand-picked list from the \"VIP\" segment tag shown on individual customer rows below.",
    },
    {
      label: "New This Month",
      count: stats.thisMonth,
      icon: UserPlus,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Inactive",
      count: stats.inactive,
      icon: Calendar,
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      description: `Hasn't booked in the last ${inactiveDaysThreshold} days — you can change this threshold below. Different from the "Lapsed" segment tag, which always uses a fixed 45-day cutoff.`,
    },
  ];

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getBranchChipSummary = (customer: Customer) => {
    if (customer.visitedLocations.length === 0) {
      return null;
    }

    const [primaryLocation, ...remainingLocations] = customer.visitedLocations;
    return {
      primaryLabel: primaryLocation.locationName,
      overflowCount: remainingLocations.length,
    };
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Exclude deleted customers
      if (customer.status === "deleted") return false;

      const matchesSearch =
        customer.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (customer.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (customer.phone || "").includes(searchQuery);

      const seg = segments[customer.id];
      const matchesFilter =
        activeFilter === "All"
          ? true
          : activeFilter === "VIP"
            ? Boolean((customer as { is_starred?: boolean }).is_starred)
            : activeFilter === "Big spender"
              ? Boolean(seg?.is_big_spender)
              : activeFilter === "Regular"
                ? Boolean(seg?.is_regular)
                : activeFilter === "Loves packages"
                  ? Boolean(seg?.loves_packages)
                  : activeFilter === "Lapsed"
                    ? Boolean(seg?.is_lapsed)
                    : customer.status.toLowerCase() === activeFilter.toLowerCase();

      return matchesSearch && matchesFilter;
    });
  }, [customers, searchQuery, activeFilter, segments]);

  const allVisibleSelected =
    filteredCustomers.length > 0 &&
    filteredCustomers.every((customer) => selectedCustomerIds.includes(customer.id));

  const handleMakeVIP = async (customer: Customer) => {
    await setCustomerVip(customer.id, true);
  };

  const handleRemoveVIP = async (customer: Customer) => {
    await setCustomerVip(customer.id, false);
  };

  const handleFlagCustomer = async (reason: string) => {
    if (!flagDialogCustomer) return;
    await flagCustomer(flagDialogCustomer.id, reason);
    setFlagDialogCustomer(null);
  };

  const handleUnflag = async (customer: Customer) => {
    await updateCustomerStatus(customer.id, "active");
  };

  const handleDeleteCustomer = async () => {
    if (!deleteDialogCustomer) return;
    await deleteCustomer(deleteDialogCustomer.id);
    setDeleteDialogCustomer(null);
  };

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds((current) =>
      current.includes(customerId)
        ? current.filter((id) => id !== customerId)
        : [...current, customerId],
    );
  };

  const clearSelection = () => {
    setSelectedCustomerIds([]);
  };

  const handleSelectAllVisible = (checked: boolean, ids: string[]) => {
    if (!checked) {
      clearSelection();
      return;
    }
    setSelectedCustomerIds(ids);
  };

  const handleBulkMakeVIP = async () => {
    const success = await bulkSetCustomerVip(selectedCustomerIds, true);
    if (success) clearSelection();
  };

  const handleBulkFlagSelectedCustomers = async (reason: string) => {
    const success = await bulkFlagCustomers(selectedCustomerIds, reason);
    if (success) clearSelection();
  };

  const handleBulkDeleteCustomers = async () => {
    const success = await bulkDeleteCustomers(selectedCustomerIds);
    if (success) clearSelection();
    setBulkDeleteDialogOpen(false);
  };

  const CUSTOMER_TEMPLATE: TemplateColumn[] = [
    { header: "full_name", example: "John Doe", required: true },
    { header: "email", example: "john@example.com", required: true },
    { header: "phone", example: "+2348012345678", required: false },
    { header: "notes", example: "VIP customer", required: false },
  ];

  const handleImport = async (file: File) => {
    // TODO: Implement actual import logic
    toast({
      title: "Import started",
      description: `Processing ${file.name}...`,
    });
  };

  return (
		<SalonSidebar>
			<div className="mx-auto w-full max-w-[1500px] space-y-7">
				{/* Page Header */}
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div>
						<h1 className="text-3xl font-medium tracking-tight">Customers</h1>
						<p className="mt-1.5 text-sm text-muted-foreground sm:text-base">
							Manage customer relationships and celebrate key moments.
						</p>
					</div>
					<div className="hidden items-center gap-2 lg:flex">
						<Button variant="outline" className="h-12 rounded-full px-6" onClick={() => setImportDialogOpen(true)}>
							<Download className="mr-2 h-4 w-4" />
							Import
						</Button>
						<Button className="h-12 rounded-full px-7" onClick={() => setCustomerDialogOpen(true)}>
							<UserPlus className="mr-2 h-4 w-4" />
							Add customer
						</Button>
					</div>
				</div>

				{/* Status Cards */}
				<div className="scrollbar-hide flex snap-x gap-3 overflow-x-auto overscroll-x-contain pb-1 [&>*]:min-w-[190px] [&>*]:shrink-0 [&>*]:snap-start sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 sm:[&>*]:min-w-0 xl:grid-cols-4">
					{statusCards.map((card) => {
						const Icon = card.icon;
						return (
							<Card
								key={card.label}
								className="cursor-pointer rounded-[14px] border-border/60 bg-white shadow-sm transition-shadow hover:shadow-md"
								onClick={
									card.label === "Inactive"
										? () => setInactiveDialogOpen(true)
										: undefined
								}
							>
								<CardContent className="flex items-center justify-between px-5 py-4">
									<div>
										<div className="flex items-center gap-1">
											<p className="text-sm text-muted-foreground">
												{card.label}
											</p>
											{card.description && (
												<Tooltip>
													<TooltipTrigger asChild>
														<Info className="h-3 w-3 text-muted-foreground cursor-default" />
													</TooltipTrigger>
													<TooltipContent side="top" className="max-w-56 text-xs">
														{card.description}
													</TooltipContent>
												</Tooltip>
											)}
										</div>
										<div className="mt-1 font-serif text-2xl font-semibold">
											{isLoading ? (
												<Skeleton className="h-8 w-8" />
											) : (
												card.count
											)}
										</div>
									</div>
									<div className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${card.bgColor}`}>
										<Icon className={`h-5 w-5 ${card.color}`} />
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>

				{/* Search & Filters */}
				<div className="space-y-4">
					<div className="scrollbar-hide flex h-auto min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain rounded-full bg-[#eee9e1] p-1 sm:w-fit">
						{statusFilters.map((filter) => (
							<Button
								key={filter}
								variant="ghost"
								size="sm"
								className={cn(
									"h-10 shrink-0 rounded-full border-0 px-5 text-sm shadow-none",
									activeFilter === filter
										? "bg-white text-foreground hover:bg-white"
										: "text-muted-foreground hover:bg-white/60",
								)}
								onClick={() => setActiveFilter(filter)}
							>
								{filter}
							</Button>
						))}
					</div>
					<div className="flex min-w-0 items-center gap-3">
						<div className="relative min-w-0 flex-1">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search by name, phone, email..."
								className="h-12 rounded-[12px] bg-white pl-11 text-sm shadow-sm sm:text-base"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
							/>
						</div>
						{filteredCustomers.length > 0 && (
							<label className="flex shrink-0 items-center gap-2 px-1 text-sm text-muted-foreground sm:gap-3 sm:px-2">
								<Checkbox
									checked={allVisibleSelected}
									onCheckedChange={(checked) =>
										handleSelectAllVisible(
											Boolean(checked),
											filteredCustomers.map((customer) => customer.id),
										)
									}
									aria-label="Select all customers"
								/>
								<span className="whitespace-nowrap">Select all</span>
							</label>
						)}
					</div>
				</div>

				{selectedCustomerIds.length > 0 && (
					<Card className="border-primary/20 bg-primary/5">
						<CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<p className="font-medium">
									{selectedCustomerIds.length} customer
									{selectedCustomerIds.length === 1 ? "" : "s"} selected
								</p>
								<p className="text-sm text-muted-foreground">
									Run actions on the selected customers.
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								{canMakeVIP && (
									<Button variant="outline" onClick={handleBulkMakeVIP}>
										<Star className="mr-2 h-4 w-4" />
										Make VIP
									</Button>
								)}
								{canFlag && (
									<Button
										variant="outline"
										onClick={() => setBulkFlagDialogOpen(true)}
									>
										<Flag className="mr-2 h-4 w-4" />
										Flag
									</Button>
								)}
								{canDelete && (
									<Button
										variant="destructive"
										onClick={() => setBulkDeleteDialogOpen(true)}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										Delete
									</Button>
								)}
								<Button variant="ghost" onClick={clearSelection}>
									Clear
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Customers Grid */}
				{isLoading ? (
					<div className="space-y-3">
						{[1, 2, 3, 4].map((i) => (
							<Card key={i}>
								<CardContent className="p-4">
									<div className="flex items-start gap-4">
										<Skeleton className="w-12 h-12 rounded-full" />
										<div className="flex-1">
											<Skeleton className="h-5 w-32 mb-2" />
											<Skeleton className="h-4 w-48" />
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				) : filteredCustomers.length === 0 ? (
					<div className="text-center py-12">
						<Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
						<p className="text-muted-foreground">
							{searchQuery || activeFilter !== "All"
								? "No customers match your search."
								: "No customers yet. Add your first customer."}
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{filteredCustomers.map((customer) => (
							<Card
								key={customer.id}
								className="cursor-pointer rounded-[14px] border-border/60 bg-white shadow-sm transition-shadow hover:border-primary/20 hover:shadow-md"
								onClick={() => setDetailCustomer(customer)}
							>
								<CardContent className="p-4 sm:px-5 sm:py-4">
									<div className="flex items-start gap-3 sm:items-center sm:gap-4">
										<div
											className="pt-1"
											onClick={(event) => event.stopPropagation()}
										>
											<Checkbox
												checked={selectedCustomerIds.includes(customer.id)}
												onCheckedChange={() =>
													toggleCustomerSelection(customer.id)
												}
												aria-label={`Select ${customer.full_name}`}
											/>
										</div>
										{/* Avatar */}
										<div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#f1eafa] font-serif text-lg font-semibold text-primary">
											{getInitials(customer.full_name)}
										</div>

										{/* Info */}
										<div className="flex-1 min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="truncate text-base font-medium">
													{customer.full_name}
												</h3>
															{(customer as { is_starred?: boolean }).is_starred && (
																<Star className="h-4 w-4 flex-shrink-0 fill-amber-400 text-amber-400" aria-label="VIP" />
															)}
												<Badge
													variant="secondary"
													className={cn(
														"capitalize text-xs",
														customer.status === "active"
															? "bg-success/10 text-success"
															: customer.status === "blocked"
																	? "bg-destructive/10 text-destructive"
																	: "bg-muted text-muted-foreground",
													)}
												>
													{customer.status}
												</Badge>
											</div>

											{/* Auto-derived segment tags */}
											{segmentTags(segments[customer.id]).filter((tag) => tag !== "vip").length > 0 && (
												<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
													{segmentTags(segments[customer.id])
														.filter((tag) => tag !== "vip")
														.map((tag) => (
															<Tooltip key={tag}>
																<TooltipTrigger asChild>
																	<Badge variant="secondary" className={cn("text-xs cursor-default", CUSTOMER_TAG_META[tag].className)}>
																		{CUSTOMER_TAG_META[tag].label}
																	</Badge>
																</TooltipTrigger>
																<TooltipContent side="top" className="max-w-56 text-xs">
																	{CUSTOMER_TAG_META[tag].description}
																</TooltipContent>
															</Tooltip>
														))}
												</div>
											)}
											<div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
												{customer.email && (
													<div className="flex items-center gap-1">
														<Mail className="w-3.5 h-3.5" />
														<span className="truncate">{customer.email}</span>
													</div>
												)}
												{customer.phone && (
													<div className="flex items-center gap-1">
														<Phone className="w-3.5 h-3.5" />
														<span>{customer.phone}</span>
													</div>
												)}
											</div>

											<div className="mt-1.5 flex flex-wrap items-center gap-4 text-sm">
												<div className="flex items-center gap-1.5">
													<CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
													<span className="text-muted-foreground">
														{currency}{" "}
														{Number(customer.outstanding_balance).toFixed(2)}
													</span>
												</div>
												<div className="flex items-center gap-1.5">
													<Calendar className="w-3.5 h-3.5 text-muted-foreground" />
													<span className="text-muted-foreground">
														{customer.visit_count} visits
													</span>
												</div>
											</div>

											{customer.visitedLocations.length > 0 && (
												<div className="mt-3 flex flex-wrap items-center gap-2">
													{(() => {
														const branchSummary =
															getBranchChipSummary(customer);
														if (!branchSummary) return null;

														return (
															<>
																<Badge
																	variant="outline"
																	className="max-w-full truncate"
																>
																	{branchSummary.primaryLabel}
																</Badge>
																{branchSummary.overflowCount > 0 && (
																	<Badge variant="secondary">
																		+{branchSummary.overflowCount}
																	</Badge>
																)}
															</>
														);
													})()}
												</div>
											)}
										</div>

										{/* Dropdown Menu */}
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="flex-shrink-0"
													onClick={(e) => e.stopPropagation()}
												>
													<MoreHorizontal className="w-4 h-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="end"
												onClick={(e) => e.stopPropagation()}
											>
												<DropdownMenuItem
													onClick={() => setDetailCustomer(customer)}
												>
													<Eye className="w-4 h-4 mr-2" />
													View Details
												</DropdownMenuItem>

												{canMakeVIP && (
													<>
														{(customer as { is_starred?: boolean }).is_starred ? (
															<DropdownMenuItem
																onClick={() => handleRemoveVIP(customer)}
															>
																<CheckCircle className="w-4 h-4 mr-2" />
																Remove VIP
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																onClick={() => handleMakeVIP(customer)}
															>
																<Star className="w-4 h-4 mr-2" />
																Make VIP
															</DropdownMenuItem>
														)}
													</>
												)}

												{canFlag && (
													<>
														{customer.status === "blocked" ? (
															<DropdownMenuItem
																onClick={() => handleUnflag(customer)}
															>
																<CheckCircle className="w-4 h-4 mr-2" />
																Unflag Customer
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																onClick={() => setFlagDialogCustomer(customer)}
																className="text-orange-600"
															>
																<Flag className="w-4 h-4 mr-2" />
																Flag Customer
															</DropdownMenuItem>
														)}
													</>
												)}

												{canDelete && (
													<>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => setDeleteDialogCustomer(customer)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="w-4 h-4 mr-2" />
															Delete Customer
														</DropdownMenuItem>
													</>
												)}
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}

				{/* Pagination */}
				{!isLoading && filteredCustomers.length > 0 && (
					<div className="flex items-center justify-between">
						<p className="text-sm text-muted-foreground">
							Showing {filteredCustomers.length} of {customers.length} customers
						</p>
						<div className="flex items-center gap-2">
							<Button variant="outline" size="sm" disabled>
								Previous
							</Button>
							<Button variant="default" size="sm">
								1
							</Button>
							<Button variant="outline" size="sm" disabled>
								Next
							</Button>
						</div>
					</div>
				)}
			</div>
			{/* Floating action button — mobile & tablet only */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label="Add or import customers"
						className="lg:hidden fixed bottom-20 right-5 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
					>
						<Plus className="w-6 h-6" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" className="w-52 mb-2">
					<DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
						<UserPlus className="w-4 h-4 mr-2" />
						Import Customers
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => setCustomerDialogOpen(true)}>
						<Calendar className="w-4 h-4 mr-2" />
						Add New Customer
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Add Customer Dialog */}
			<AddCustomerDialog
				open={customerDialogOpen}
				onOpenChange={setCustomerDialogOpen}
				onSuccess={refetch}
			/>

			{/* Customer Detail Dialog */}
			<CustomerDetailDialog
				open={!!detailCustomer}
				onOpenChange={(open) => !open && setDetailCustomer(null)}
				customer={detailCustomer}
			/>

			{/* Flag Customer Dialog */}
			<FlagCustomerDialog
				open={!!flagDialogCustomer}
				onOpenChange={(open) => !open && setFlagDialogCustomer(null)}
				customerName={flagDialogCustomer?.full_name || ""}
				onConfirm={handleFlagCustomer}
			/>

			<FlagCustomerDialog
				open={bulkFlagDialogOpen}
				onOpenChange={setBulkFlagDialogOpen}
				customerName={`${selectedCustomerIds.length} selected customer${selectedCustomerIds.length === 1 ? "" : "s"}`}
				onConfirm={handleBulkFlagSelectedCustomers}
			/>

			{/* Delete Confirmation Dialog */}
			<ConfirmActionDialog
				open={!!deleteDialogCustomer}
				onOpenChange={(open) => !open && setDeleteDialogCustomer(null)}
				title="Delete Customer"
				description={`Are you sure you want to delete ${deleteDialogCustomer?.full_name}? This action cannot be undone.`}
				confirmLabel="Delete"
				variant="destructive"
				onConfirm={handleDeleteCustomer}
			/>

			<ConfirmActionDialog
				open={bulkDeleteDialogOpen}
				onOpenChange={setBulkDeleteDialogOpen}
				title="Delete Selected Customers"
				description={`Are you sure you want to delete ${selectedCustomerIds.length} selected customer${selectedCustomerIds.length === 1 ? "" : "s"}? This action cannot be undone.`}
				confirmLabel="Delete Selected"
				variant="destructive"
				onConfirm={handleBulkDeleteCustomers}
			/>

			{/* Import Dialog */}
			<ImportDialog
				open={importDialogOpen}
				onOpenChange={setImportDialogOpen}
				title="Import Customers"
				templateColumns={CUSTOMER_TEMPLATE}
				templateFileName="customers"
				onImport={handleImport}
			/>

			<Dialog open={inactiveDialogOpen} onOpenChange={setInactiveDialogOpen}>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>Inactive Customers</DialogTitle>
						<DialogDescription>
							Customers with no recorded activity for at least{" "}
							{inactiveDaysThreshold} days.
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-3">
						<Input
							type="number"
							min={1}
							value={inactiveDaysThresholdInput}
							onChange={(event) => {
								const nextValue = event.target.value;
								setInactiveDaysThresholdInput(nextValue);
								if (nextValue === "") return;
								const parsed = Number(nextValue);
								if (Number.isInteger(parsed) && parsed >= 1) {
									setInactiveDaysThreshold(parsed);
								}
							}}
							onBlur={() => {
								const parsed = Number(inactiveDaysThresholdInput);
								const normalized =
									Number.isInteger(parsed) && parsed >= 1
										? parsed
										: inactiveDaysThreshold;
								setInactiveDaysThreshold(normalized);
								setInactiveDaysThresholdInput(String(normalized));
							}}
							className="w-40"
						/>
						<Button
							variant="outline"
							onClick={() => refetchInactiveCustomers()}
						>
							Refresh
						</Button>
						<Button
							onClick={() => setReactivationDialogOpen(true)}
							disabled={inactiveCustomers.length === 0}
						>
							Trigger reactivation
						</Button>
					</div>
					<div className="max-h-[420px] space-y-2 overflow-auto pt-2">
						{inactiveCustomers.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No inactive customers found for this threshold.
							</p>
						)}
						{inactiveCustomers.map((row) => (
							<Card key={row.customer_id}>
								<CardContent className="flex items-center justify-between p-3">
									<div>
										<p className="font-medium">{row.customer_name}</p>
										<p className="text-xs text-muted-foreground">
											{row.days_since_last_transaction} days inactive • Last
											item: {row.last_purchased_item || "—"}
										</p>
										<p className="text-xs text-muted-foreground">
											Last transaction:{" "}
											{row.last_transaction_at
												? new Date(row.last_transaction_at).toLocaleDateString()
												: "—"}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												navigator.clipboard.writeText(row.customer_phone || "");
												toast({
													title: "Copied",
													description: "Phone number copied.",
												});
											}}
											disabled={!row.customer_phone}
										>
											Copy phone
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												const customer = customers.find(
													(item) => item.id === row.customer_id,
												);
												if (customer) setDetailCustomer(customer);
											}}
										>
											View details
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				</DialogContent>
			</Dialog>

			<Dialog
				open={reactivationDialogOpen}
				onOpenChange={setReactivationDialogOpen}
			>
				<DialogContent className="max-w-4xl">
					<DialogHeader>
						<DialogTitle>Reactivation Campaign Composer</DialogTitle>
						<DialogDescription>
							Select customers, preview the message, and send through your
							preferred channel.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-3">
							<div className="space-y-2">
								<p className="text-sm font-medium">Channel</p>
								<Select
									value={reactivationChannel}
									onValueChange={(value) =>
										setReactivationChannel(value as ReactivationChannel)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="email">Email (free)</SelectItem>
										<SelectItem value="sms">SMS (2 credits)</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{reactivationChannel === "email" && (
								<div className="space-y-2">
									<p className="text-sm font-medium">Subject</p>
									<Input
										value={reactivationSubject}
										onChange={(event) =>
											setReactivationSubject(event.target.value)
										}
									/>
								</div>
							)}
							<div className="space-y-2">
								<p className="text-sm font-medium">Message template</p>
								<Textarea
									rows={5}
									value={reactivationMessage}
									onChange={(event) =>
										setReactivationMessage(event.target.value)
									}
								/>
								<p className="text-xs text-muted-foreground">
									Supported variables: {"{{customer_name}}"}, {"{{salon_name}}"}
									, {"{{most_purchased_item}}"}
								</p>
							</div>
						</div>

						<div className="space-y-3">
							<p className="text-sm font-medium">Recipients</p>
							<div className="max-h-60 space-y-2 overflow-auto rounded-md border p-3">
								{inactiveCustomers.map((row) => {
									const checked = selectedInactiveCustomerIds.includes(
										row.customer_id,
									);
									return (
										<label
											key={row.customer_id}
											className="flex items-start gap-3 text-sm"
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={(event) => {
													setSelectedInactiveCustomerIds((current) => {
														if (event.target.checked)
															return [...current, row.customer_id];
														return current.filter(
															(id) => id !== row.customer_id,
														);
													});
												}}
											/>
											<span>
												<span className="font-medium">{row.customer_name}</span>
												<span className="block text-muted-foreground">
													{row.days_since_last_transaction} days inactive
												</span>
											</span>
										</label>
									);
								})}
							</div>

							<div className="rounded-md border p-3">
								<p className="text-sm font-medium mb-1">Preview</p>
								<p className="text-xs text-muted-foreground mb-2">
									{(reactivationChannel === "email"
										? reactivationSubject
										: "Reactivation message"
									)
										.replaceAll("{{customer_name}}", "Jane Doe")
										.replaceAll(
											"{{salon_name}}",
											currentTenant?.name || "Salon Magik",
										)}
								</p>
								<p className="text-sm text-muted-foreground whitespace-pre-wrap">
									{reactivationMessage
										.replaceAll("{{customer_name}}", "Jane Doe")
										.replaceAll(
											"{{salon_name}}",
											currentTenant?.name || "Salon Magik",
										)
										.replaceAll("{{most_purchased_item}}", "Hair Coloring")}
								</p>
							</div>
							<div className="flex justify-end">
								<Button
									onClick={() => sendReactivationMutation.mutate()}
									disabled={
										sendReactivationMutation.isPending ||
										selectedInactiveCustomerIds.length === 0
									}
								>
									Send Campaign
								</Button>
							</div>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</SalonSidebar>
	);
}
