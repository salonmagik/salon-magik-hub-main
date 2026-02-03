import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Search,
  Download,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useTransactions } from "@/hooks/useTransactions";
import { useRefunds } from "@/hooks/useRefunds";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const methodLabels: Record<string, string> = {
  card: "Card",
  mobile_money: "Mobile Money",
  cash: "Cash",
  pos: "POS",
  transfer: "Transfer",
  purse: "Purse",
};

const statusStyles: Record<string, { bg: string; text: string; icon: any }> = {
  completed: { bg: "bg-success/10", text: "text-success", icon: CheckCircle },
  pending: { bg: "bg-warning-bg", text: "text-warning-foreground", icon: Clock },
  failed: { bg: "bg-destructive/10", text: "text-destructive", icon: XCircle },
};

export default function PaymentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const { currentTenant } = useAuth();
  const { transactions, stats, isLoading } = useTransactions();
  const { pendingRefunds, isLoading: refundsLoading } = useRefunds();

  const currency = currentTenant?.currency || "USD";

  const formatCurrency = (amount: number) => {
    const symbols: Record<string, string> = {
      USD: "$",
      GHS: "₵",
      NGN: "₦",
      EUR: "€",
      GBP: "£",
    };
    return `${symbols[currency] || currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (activeTab === "all") return matchesSearch;
    if (activeTab === "revenue") return matchesSearch && txn.type === "payment";
    if (activeTab === "refunds") return matchesSearch && txn.type === "refund";
    if (activeTab === "purse") return matchesSearch && (txn.type === "purse_topup" || txn.type === "purse_redemption");

    return matchesSearch;
  });

  const statCards = [
    {
      title: "Today's Revenue",
      value: formatCurrency(stats.todayRevenue),
      icon: TrendingUp,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Pending Refunds",
      value: stats.pendingRefunds.toString(),
      icon: AlertCircle,
      color: "text-warning-foreground",
      bgColor: "bg-warning-bg",
    },
    {
      title: "Total Purse Balance",
      value: formatCurrency(stats.totalPurseBalance),
      icon: Wallet,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Payments</h1>
            <p className="text-muted-foreground">
              Track transactions, manage refunds, and monitor customer balances.
            </p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pending Refunds Alert */}
        {pendingRefunds.length > 0 && (
          <Card className="border-warning bg-warning-bg/20">
            <CardContent className="p-4 flex items-center gap-4">
              <AlertCircle className="w-5 h-5 text-warning-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">
                  {pendingRefunds.length} refund request{pendingRefunds.length > 1 ? "s" : ""} pending approval
                </p>
                <p className="text-sm text-muted-foreground">
                  Review and approve or reject refund requests
                </p>
              </div>
              <Button variant="outline" size="sm">
                Review
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="revenue" className="gap-2">
              <ArrowUpRight className="w-4 h-4" />
              Revenue
            </TabsTrigger>
            <TabsTrigger value="refunds" className="gap-2">
              <ArrowDownLeft className="w-4 h-4" />
              Refunds
            </TabsTrigger>
            <TabsTrigger value="purse" className="gap-2">
              <Wallet className="w-4 h-4" />
              Purse
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select defaultValue="all-time">
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all-time">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Transactions List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-surface">
                        <div className="flex items-center gap-4">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div>
                            <Skeleton className="h-4 w-32 mb-1" />
                            <Skeleton className="h-3 w-24" />
                          </div>
                        </div>
                        <Skeleton className="h-6 w-20" />
                      </div>
                    ))}
                  </div>
                ) : filteredTransactions.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-muted-foreground">No transactions found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredTransactions.map((txn) => {
                      const style = statusStyles[txn.status] || statusStyles.pending;
                      const StatusIcon = style.icon;
                      const isIncoming = txn.type === "payment" || txn.type === "purse_topup";

                      return (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-surface hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center",
                                isIncoming ? "bg-success/10" : "bg-destructive/10"
                              )}
                            >
                              {isIncoming ? (
                                <ArrowUpRight className="w-5 h-5 text-success" />
                              ) : (
                                <ArrowDownLeft className="w-5 h-5 text-destructive" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">
                                {txn.customer?.full_name || "Guest"}
                              </p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{methodLabels[txn.method] || txn.method}</span>
                                <span>•</span>
                                <span>{format(new Date(txn.created_at), "MMM d, h:mm a")}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={cn("font-semibold", isIncoming ? "text-success" : "text-destructive")}>
                              {isIncoming ? "+" : "-"}{formatCurrency(Number(txn.amount))}
                            </p>
                            <Badge className={cn("text-xs", style.bg, style.text)}>
                              {txn.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Tabs>
      </div>
    </SalonSidebar>
  );
}
