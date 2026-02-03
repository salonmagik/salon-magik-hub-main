import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Download,
  Check,
  X,
  Link2,
  Link2Off,
  Clock,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { useJournal, JournalDirection, JournalCategory, JournalStatus, PaymentMethod } from "@/hooks/useJournal";
import { useAuth } from "@/hooks/useAuth";
import { AddJournalEntryDialog } from "@/components/dialogs/AddJournalEntryDialog";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  mobile_money: "MoMo",
  card: "Card",
  purse: "Credit",
};

const CATEGORY_LABELS: Record<JournalCategory, string> = {
  service_payment: "Service",
  product_sale: "Product",
  expense: "Expense",
  other: "Other",
};

const STATUS_STYLES: Record<JournalStatus, { bg: string; text: string }> = {
  active: { bg: "bg-success/10", text: "text-success" },
  pending_approval: { bg: "bg-warning/10", text: "text-warning" },
  rejected: { bg: "bg-destructive/10", text: "text-destructive" },
  reversed: { bg: "bg-muted", text: "text-muted-foreground" },
};

export default function JournalPage() {
  const { currentTenant } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { 
    entries, 
    stats, 
    isLoading, 
    hasMore, 
    loadMore,
    approveEntry,
    rejectEntry,
    reverseEntry,
    deleteEntry,
  } = useJournal({
    direction: directionFilter !== "all" ? directionFilter as JournalDirection : undefined,
    category: categoryFilter !== "all" ? categoryFilter as JournalCategory : undefined,
    status: statusFilter !== "all" ? statusFilter as JournalStatus : undefined,
    paymentMethod: paymentMethodFilter !== "all" ? paymentMethodFilter as PaymentMethod : undefined,
    search: searchQuery || undefined,
  });

  const currency = currentTenant?.currency || "USD";

  const handleExport = () => {
    const csvContent = [
      ["Date", "Direction", "Amount", "Category", "Payment Method", "Description", "Customer", "Status"].join(","),
      ...entries.map((entry) => [
        format(new Date(entry.occurred_at), "yyyy-MM-dd HH:mm"),
        entry.direction,
        entry.amount,
        entry.category,
        entry.payment_method,
        `"${entry.description || ""}"`,
        entry.customer?.full_name || "",
        entry.status,
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Journal</h1>
            <p className="text-muted-foreground">
              Track cash, POS, and transfer transactions
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-success">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">Inflow</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {currency} {stats.totalInflow.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-destructive">
                <TrendingDown className="w-4 h-4" />
                <span className="text-sm font-medium">Outflow</span>
              </div>
              <p className="text-2xl font-bold mt-1">
                {currency} {stats.totalOutflow.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                <span className="text-sm font-medium">Net</span>
              </div>
              <p className={cn("text-2xl font-bold mt-1", stats.netAmount >= 0 ? "text-success" : "text-destructive")}>
                {currency} {stats.netAmount.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Link2Off className="w-4 h-4" />
                <span className="text-sm font-medium">Unlinked</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.unlinkedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-warning">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">Pending</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.pendingApprovalCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search entries..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={directionFilter} onValueChange={setDirectionFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Directions</SelectItem>
                  <SelectItem value="inflow">Inflow</SelectItem>
                  <SelectItem value="outflow">Outflow</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="reversed">Reversed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Entries Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-48 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No journal entries found</p>
                <Button variant="link" onClick={() => setAddDialogOpen(true)}>
                  Add your first entry
                </Button>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const statusStyle = STATUS_STYLES[entry.status];
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(entry.occurred_at), "MMM d, h:mm a")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {entry.direction === "inflow" ? (
                                <ArrowDownLeft className="w-4 h-4 text-success flex-shrink-0" />
                              ) : (
                                <ArrowUpRight className="w-4 h-4 text-destructive flex-shrink-0" />
                              )}
                              <span className="truncate max-w-[200px]">
                                {entry.description || entry.parsed_summary || "No description"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CATEGORY_LABELS[entry.category]}
                            </Badge>
                          </TableCell>
                          <TableCell>{PAYMENT_METHOD_LABELS[entry.payment_method]}</TableCell>
                          <TableCell>
                            {entry.customer ? (
                              <div className="flex items-center gap-1">
                                <Link2 className="w-3 h-3 text-muted-foreground" />
                                <span className="truncate max-w-[100px]">
                                  {entry.customer.full_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <span className={entry.direction === "inflow" ? "text-success" : "text-destructive"}>
                              {entry.direction === "inflow" ? "+" : "-"}
                              {currency} {Number(entry.amount).toLocaleString()}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-xs", statusStyle.bg, statusStyle.text)}>
                              {entry.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {entry.status === "pending_approval" && (
                                  <>
                                    <DropdownMenuItem onClick={() => approveEntry(entry.id)}>
                                      <Check className="w-4 h-4 mr-2" />
                                      Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => rejectEntry(entry.id, "Rejected by manager")}>
                                      <X className="w-4 h-4 mr-2" />
                                      Reject
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {entry.status === "active" && (
                                  <DropdownMenuItem onClick={() => reverseEntry(entry.id)}>
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    Reverse
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => deleteEntry(entry.id)}
                                  className="text-destructive"
                                >
                                  <X className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {hasMore && (
                  <div className="text-center pt-4">
                    <Button variant="outline" onClick={loadMore}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddJournalEntryDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </SalonSidebar>
  );
}
