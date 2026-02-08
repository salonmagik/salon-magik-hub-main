import { useState, useMemo } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { DatePicker } from "@ui/date-picker";
import { ScrollArea } from "@ui/scroll-area";
import { Progress } from "@ui/progress";
import {
  FileText,
  Search,
  Filter,
  AlertTriangle,
  Clock,
  User,
  Activity,
  ChevronDown,
  RefreshCw,
} from "lucide-react";
import { useAuditLogs, type AuditLogFilters } from "@/hooks/useAuditLogs";
import { format } from "date-fns";

// Action type labels for display
const actionLabels: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  login: "Logged In",
  logout: "Logged Out",
  payment: "Payment",
  refund: "Refund",
  appointment_created: "Appointment Created",
  appointment_updated: "Appointment Updated",
  appointment_cancelled: "Appointment Cancelled",
  service_created: "Service Created",
  service_updated: "Service Updated",
  customer_created: "Customer Created",
  customer_updated: "Customer Updated",
  staff_invited: "Staff Invited",
  staff_removed: "Staff Removed",
  settings_updated: "Settings Updated",
  tenant_auto_deactivated: "Tenant Deactivated",
};

// Entity type labels
const entityLabels: Record<string, string> = {
  appointment: "Appointment",
  service: "Service",
  product: "Product",
  package: "Package",
  customer: "Customer",
  staff: "Staff",
  payment: "Payment",
  refund: "Refund",
  settings: "Settings",
  tenant: "Tenant",
  journal_entry: "Journal Entry",
};

// Criticality badge styling
function getCriticalityBadge(score: number | null) {
  if (score === null) return null;
  
  if (score >= 80) {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="w-3 h-3" />
        High ({score}%)
      </Badge>
    );
  }
  if (score >= 40) {
    return (
      <Badge variant="secondary" className="bg-warning/20 text-warning-foreground gap-1">
        <Activity className="w-3 h-3" />
        Medium ({score}%)
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground gap-1">
      Low ({score}%)
    </Badge>
  );
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  
  const { logs, entityTypes, actionTypes, isLoading, error, hasMore, loadMore, refetch } = useAuditLogs(filters, 50);

  // Filter logs by search query
  const filteredLogs = useMemo(() => {
    if (!searchQuery) return logs;
    const query = searchQuery.toLowerCase();
    return logs.filter(
      (log) =>
        log.action.toLowerCase().includes(query) ||
        log.entity_type.toLowerCase().includes(query) ||
        log.entity_id?.toLowerCase().includes(query)
    );
  }, [logs, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const highCriticality = logs.filter((l) => (l.criticality_score ?? 0) >= 80).length;
    const mediumCriticality = logs.filter(
      (l) => (l.criticality_score ?? 0) >= 40 && (l.criticality_score ?? 0) < 80
    ).length;
    const lowCriticality = logs.filter((l) => (l.criticality_score ?? 0) < 40).length;
    return { highCriticality, mediumCriticality, lowCriticality, total: logs.length };
  }, [logs]);

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Audit Log
            </h1>
            <p className="text-muted-foreground">
              Track all actions and changes across your salon
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-destructive" />
                High Criticality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.highCriticality}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Medium Criticality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning-foreground">{stats.mediumCriticality}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Low Criticality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-muted-foreground">{stats.lowCriticality}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={filters.action || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, action: v === "all" ? undefined : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map((action) => (
                    <SelectItem key={action} value={action}>
                      {actionLabels[action] || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.entityType || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, entityType: v === "all" ? undefined : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Entity Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entityLabels[entity] || entity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DatePicker
                value={filters.startDate}
                onChange={(date) => setFilters((f) => ({ ...f, startDate: date }))}
                placeholder="From date"
              />
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Table */}
        <Card>
          <CardHeader>
            <CardTitle>Activity History</CardTitle>
            <CardDescription>
              Complete log of all actions performed in your salon
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-24 h-4" />
                    <Skeleton className="w-32 h-4" />
                    <Skeleton className="flex-1 h-4" />
                    <Skeleton className="w-20 h-6 rounded-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12 text-destructive">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                <p>Failed to load audit logs</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium mb-1">No audit logs found</h3>
                <p className="text-sm">Actions will appear here as they occur</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action Type</TableHead>
                        <TableHead>Entity</TableHead>
                        <TableHead className="hidden md:table-cell">Staff</TableHead>
                        <TableHead>Time Started</TableHead>
                        <TableHead className="hidden lg:table-cell">Time Ended</TableHead>
                        <TableHead>Criticality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="font-medium">
                              {actionLabels[log.action] || log.action}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {entityLabels[log.entity_type] || log.entity_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {log.actor_user_id ? "Staff" : "System"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              {log.started_at
                                ? format(new Date(log.started_at), "MMM d, HH:mm")
                                : format(new Date(log.created_at), "MMM d, HH:mm")}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <span className="text-sm text-muted-foreground">
                              {log.ended_at
                                ? format(new Date(log.ended_at), "MMM d, HH:mm")
                                : "—"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {getCriticalityBadge(log.criticality_score)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={loadMore} className="gap-2">
                      <ChevronDown className="w-4 h-4" />
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
