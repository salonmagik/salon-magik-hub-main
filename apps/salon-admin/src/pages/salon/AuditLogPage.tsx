import { useMemo, useState } from "react";
import { format } from "date-fns";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { useAuth } from "@/hooks/useAuth";
import {
  AUDIT_ACTION_FILTER_OPTIONS,
  getMetadataValue,
  resolveAuditActionFilter,
  useAuditLogs,
  type AuditActionFilterKey,
  type AuditLogEntry,
  type AuditLogFilters,
} from "@/hooks/useAuditLogs";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { DatePicker } from "@ui/date-picker";
import { Input } from "@ui/input";
import { ScrollArea } from "@ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { AlertTriangle, ChevronDown, Clock, FileText, Filter, RefreshCw, Search, User } from "lucide-react";

function titleCase(value: string) {
  return value
    .replace(/[._/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w/g, (char) => char.toUpperCase());
}

function routeToPageLabel(route: string) {
  const trimmed = route.replace(/^\/salon\/?/, "").trim();
  if (!trimmed) return "Dashboard";
  return titleCase(trimmed);
}

function getWhereLabel(log: AuditLogEntry) {
  const route = getMetadataValue(log.metadata, "route");
  if (route) return routeToPageLabel(route);

  const module = getMetadataValue(log.metadata, "module");
  if (module) return titleCase(module);

  if (log.entity_type) return titleCase(log.entity_type);
  return "System";
}

function getCriticalityBadge(score: number | null) {
  const value = score ?? 0;
  if (value >= 80) {
    return <Badge variant="destructive">High</Badge>;
  }
  if (value >= 40) {
    return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Medium</Badge>;
  }
  return <Badge variant="secondary">Low</Badge>;
}

function getActionLabel(log: AuditLogEntry) {
  const matchedOption = AUDIT_ACTION_FILTER_OPTIONS.find((option) => {
    const actionFilter = resolveAuditActionFilter(option.key);
    if (!actionFilter) return false;
    const actionMatch = actionFilter.actions.includes(log.action);
    const entityMatch =
      !actionFilter.entityTypes?.length || actionFilter.entityTypes.includes(log.entity_type);
    return actionMatch && entityMatch;
  });

  if (matchedOption?.key === "update") {
    const where = getWhereLabel(log);
    return where === "System" ? "Update" : `Update ${where}`;
  }

  if (matchedOption) return matchedOption.label;
  return titleCase(log.action);
}

export default function AuditLogPage() {
  const { currentTenant } = useAuth();
  const isChainTenant = currentTenant?.plan === "chain";

  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<AuditLogFilters>({});

  const { logs, branches, isLoading, error, hasMore, loadMore, refetch } = useAuditLogs(filters, 50);

  const actionOptions = useMemo(
    () => AUDIT_ACTION_FILTER_OPTIONS.filter((option) => (option.chainOnly ? isChainTenant : true)),
    [isChainTenant]
  );

  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const query = searchQuery.trim().toLowerCase();
    return logs.filter((log) => (log.actorName || "").toLowerCase().includes(query));
  }, [logs, searchQuery]);

  return (
    <SalonSidebar>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Audit Log
            </h1>
            <p className="text-muted-foreground">Track activity across your business.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by staff name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select
                value={filters.actionKey || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    actionKey: value === "all" ? undefined : (value as AuditActionFilterKey),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <DatePicker
                value={filters.startDate}
                onChange={(date) => setFilters((prev) => ({ ...prev, startDate: date }))}
                placeholder="Start date"
                showYearMonthDropdown
              />

              <DatePicker
                value={filters.endDate}
                onChange={(date) => setFilters((prev) => ({ ...prev, endDate: date }))}
                placeholder="End date"
                showYearMonthDropdown
              />

              {isChainTenant ? (
                <Select
                  value={filters.branchLocationId || "all"}
                  onValueChange={(value) =>
                    setFilters((prev) => ({
                      ...prev,
                      branchLocationId: value === "all" ? undefined : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Branch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.city ? ` (${branch.city})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity History</CardTitle>
            <CardDescription>Recent activity with business-friendly action labels.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="w-28 h-4" />
                    <Skeleton className="w-40 h-4" />
                    <Skeleton className="w-40 h-4" />
                    <Skeleton className="w-28 h-4" />
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
                <p className="text-sm">Actions will appear here as they occur.</p>
              </div>
            ) : (
              <>
                <ScrollArea className="h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action Type</TableHead>
                        <TableHead>Where</TableHead>
                        <TableHead>Who</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead>Criticality</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-medium">{getActionLabel(log)}</TableCell>
                          <TableCell className="text-muted-foreground">{getWhereLabel(log)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {log.actor_user_id ? log.actorName || "Staff" : "System"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(
                                new Date(log.started_at || log.created_at),
                                "MMM d, yyyy HH:mm"
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getCriticalityBadge(log.criticality_score)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {hasMore ? (
                  <div className="flex justify-center pt-4">
                    <Button variant="outline" onClick={loadMore} className="gap-2">
                      <ChevronDown className="w-4 h-4" />
                      Load More
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
