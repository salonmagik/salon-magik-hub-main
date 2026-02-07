import { useState, useMemo } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";
import { AddCustomerDialog } from "@/components/dialogs/AddCustomerDialog";
import { CustomerDetailDialog } from "@/components/dialogs/CustomerDetailDialog";
import { FlagCustomerDialog } from "@/components/dialogs/FlagCustomerDialog";
import { ConfirmActionDialog } from "@/components/dialogs/ConfirmActionDialog";
import { ImportDialog, type TemplateColumn } from "@/components/dialogs/ImportDialog";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Customer = Tables<"customers">;

const statusFilters = ["All", "Active", "VIP", "Inactive", "Blocked"];

export default function CustomersPage() {
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  
  // Action dialogs
  const [flagDialogCustomer, setFlagDialogCustomer] = useState<Customer | null>(null);
  const [deleteDialogCustomer, setDeleteDialogCustomer] = useState<Customer | null>(null);

  const { currentTenant } = useAuth();
  const { customers, isLoading, refetch, updateCustomerStatus, flagCustomer, deleteCustomer } = useCustomers();
  const { hasPermission } = usePermissions();

  const currency = currentTenant?.currency || "USD";

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
    const inactive = customers.filter((c) => c.status === "inactive").length;

    return { total, vip, thisMonth, inactive };
  }, [customers]);

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
    </SalonSidebar>
  );
}
