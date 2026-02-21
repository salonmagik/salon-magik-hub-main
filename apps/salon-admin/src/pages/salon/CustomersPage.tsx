import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Badge } from "@ui/badge";
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
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";
import type { Tables } from "@supabase-client";

type Customer = Tables<"customers">;
type ReactivationChannel = "email" | "sms" | "whatsapp";

interface InactiveCustomerRow {
  customer_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  days_since_last_transaction: number;
  last_purchased_item: string | null;
  last_transaction_at: string | null;
}

const statusFilters = ["All", "Active", "VIP", "Inactive", "Blocked"];

export default function CustomersPage() {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [inactiveDialogOpen, setInactiveDialogOpen] = useState(false);
  const [inactiveDaysThreshold, setInactiveDaysThreshold] = useState(30);
  const [reactivationDialogOpen, setReactivationDialogOpen] = useState(false);
  const [reactivationChannel, setReactivationChannel] = useState<ReactivationChannel>("email");
  const [reactivationMessage, setReactivationMessage] = useState(
    "Hi {{customer_name}}, we miss you at {{salon_name}}. Your favorite service is available this week. Reply to book and enjoy a warm welcome back.",
  );
  const [reactivationSubject, setReactivationSubject] = useState("We miss you at {{salon_name}}");
  const [selectedInactiveCustomerIds, setSelectedInactiveCustomerIds] = useState<string[]>([]);
  
  // Action dialogs
  const [flagDialogCustomer, setFlagDialogCustomer] = useState<Customer | null>(null);
  const [deleteDialogCustomer, setDeleteDialogCustomer] = useState<Customer | null>(null);

  const { currentTenant } = useAuth();
  const queryClient = useQueryClient();
  const { customers, isLoading, refetch, updateCustomerStatus, flagCustomer, deleteCustomer } = useCustomers();
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
  const canMakeVIP = hasPermission("customers:vip");
  const canFlag = hasPermission("customers:flag");
  const canDelete = hasPermission("customers:delete");

  // Calculate stats
  const stats = useMemo(() => {
    const total = customers.length;
    const vip = customers.filter((c) => c.status === "vip").length;
    const thisMonth = customers.filter((c) => {
      const created = new Date(c.created_at);
      const now = new Date();
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
    const inactive = inactiveCustomers.length;

    return { total, vip, thisMonth, inactive };
  }, [customers, inactiveCustomers.length]);

  const statusCards = [
    { label: "Total Customers", count: stats.total, icon: Users, color: "text-primary", bgColor: "bg-primary/10" },
    { label: "VIP Customers", count: stats.vip, icon: Tag, color: "text-purple-600", bgColor: "bg-purple-50" },
    {
      label: "New This Month",
      count: stats.thisMonth,
      icon: UserPlus,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    { label: "Inactive", count: stats.inactive, icon: Calendar, color: "text-muted-foreground", bgColor: "bg-muted" },
  ];

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // Exclude deleted customers
      if (customer.status === "deleted") return false;
      
      const matchesSearch =
        customer.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (customer.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (customer.phone || "").includes(searchQuery);

      const matchesFilter = activeFilter === "All" || customer.status.toLowerCase() === activeFilter.toLowerCase();

      return matchesSearch && matchesFilter;
    });
  }, [customers, searchQuery, activeFilter]);

  const handleMakeVIP = async (customer: Customer) => {
    await updateCustomerStatus(customer.id, "vip");
  };

  const handleRemoveVIP = async (customer: Customer) => {
    await updateCustomerStatus(customer.id, "active");
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
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Customers</h1>
            <p className="text-muted-foreground">Manage customer relationships and celebrate key moments.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <Download className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Import</span>
              <span className="sm:hidden">Import</span>
            </Button>
            <Button onClick={() => setCustomerDialogOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Add Customer</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statusCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 border-transparent hover:border-primary/20"
                onClick={card.label === "Inactive" ? () => setInactiveDialogOpen(true) : undefined}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-semibold mt-1">
                      {isLoading ? <Skeleton className="h-8 w-8" /> : card.count}
                    </p>
                  </div>
                  <div className={`p-2 rounded-lg ${card.bgColor}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusFilters.map((filter) => (
              <Button
                key={filter}
                variant={activeFilter === filter ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>

        {/* Customers Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCustomers.map((customer) => (
              <Card
                key={customer.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setDetailCustomer(customer)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center text-lg font-semibold flex-shrink-0">
                      {getInitials(customer.full_name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{customer.full_name}</h3>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "capitalize text-xs",
                            customer.status === "active"
                              ? "bg-success/10 text-success"
                              : customer.status === "vip"
                                ? "bg-purple-100 text-purple-700"
                                : customer.status === "blocked"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-muted text-muted-foreground",
                          )}
                        >
                          {customer.status}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
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

                      <div className="flex items-center gap-4 mt-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">
                            {currency} {Number(customer.outstanding_balance).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-muted-foreground">{customer.visit_count} visits</span>
                        </div>
                      </div>
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
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => setDetailCustomer(customer)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>

                        {canMakeVIP && (
                          <>
                            {customer.status === "vip" ? (
                              <DropdownMenuItem onClick={() => handleRemoveVIP(customer)}>
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Remove VIP
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleMakeVIP(customer)}>
                                <Star className="w-4 h-4 mr-2" />
                                Make VIP
                              </DropdownMenuItem>
                            )}
                          </>
                        )}

                        {canFlag && (
                          <>
                            {customer.status === "blocked" ? (
                              <DropdownMenuItem onClick={() => handleUnflag(customer)}>
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

      {/* Add Customer Dialog */}
      <AddCustomerDialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen} onSuccess={refetch} />

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
              Customers with no recorded activity for at least {inactiveDaysThreshold} days.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              value={inactiveDaysThreshold}
              onChange={(event) => setInactiveDaysThreshold(Number(event.target.value || 30))}
              className="w-40"
            />
            <Button variant="outline" onClick={() => refetchInactiveCustomers()}>
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
              <p className="text-sm text-muted-foreground">No inactive customers found for this threshold.</p>
            )}
            {inactiveCustomers.map((row) => (
              <Card key={row.customer_id}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium">{row.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.days_since_last_transaction} days inactive • Last item: {row.last_purchased_item || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last transaction: {row.last_transaction_at ? new Date(row.last_transaction_at).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(row.customer_phone || "");
                        toast({ title: "Copied", description: "Phone number copied." });
                      }}
                      disabled={!row.customer_phone}
                    >
                      Copy phone
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const customer = customers.find((item) => item.id === row.customer_id);
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

      <Dialog open={reactivationDialogOpen} onOpenChange={setReactivationDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Reactivation Campaign Composer</DialogTitle>
            <DialogDescription>
              Select customers, preview the message, and send through your preferred channel.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Channel</p>
                <Select
                  value={reactivationChannel}
                  onValueChange={(value) => setReactivationChannel(value as ReactivationChannel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email (1 credit)</SelectItem>
                    <SelectItem value="sms">SMS (2 credits)</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp (2 credits)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {reactivationChannel === "email" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Subject</p>
                  <Input
                    value={reactivationSubject}
                    onChange={(event) => setReactivationSubject(event.target.value)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <p className="text-sm font-medium">Message template</p>
                <Textarea
                  rows={5}
                  value={reactivationMessage}
                  onChange={(event) => setReactivationMessage(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Supported variables: {"{{customer_name}}"}, {"{{salon_name}}"}, {"{{most_purchased_item}}"}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Recipients</p>
              <div className="max-h-60 space-y-2 overflow-auto rounded-md border p-3">
                {inactiveCustomers.map((row) => {
                  const checked = selectedInactiveCustomerIds.includes(row.customer_id);
                  return (
                    <label key={row.customer_id} className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedInactiveCustomerIds((current) => {
                            if (event.target.checked) return [...current, row.customer_id];
                            return current.filter((id) => id !== row.customer_id);
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
                  {(reactivationChannel === "email" ? reactivationSubject : "Reactivation message")
                    .replaceAll("{{customer_name}}", "Jane Doe")
                    .replaceAll("{{salon_name}}", currentTenant?.name || "Salon Magik")}
                </p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {reactivationMessage
                    .replaceAll("{{customer_name}}", "Jane Doe")
                    .replaceAll("{{salon_name}}", currentTenant?.name || "Salon Magik")
                    .replaceAll("{{most_purchased_item}}", "Hair Coloring")}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => sendReactivationMutation.mutate()}
                  disabled={sendReactivationMutation.isPending || selectedInactiveCustomerIds.length === 0}
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
