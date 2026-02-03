import { useState } from "react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  History,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  CreditCard,
  Package,
  Users,
  Settings,
  Plus,
  Edit,
  Trash2,
  Eye,
} from "lucide-react";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const entityIcons: Record<string, any> = {
  appointment: Calendar,
  customer: Users,
  service: Package,
  transaction: CreditCard,
  staff: User,
  settings: Settings,
};

const actionStyles: Record<string, { bg: string; text: string; icon: any }> = {
  create: { bg: "bg-success/10", text: "text-success", icon: Plus },
  update: { bg: "bg-primary/10", text: "text-primary", icon: Edit },
  delete: { bg: "bg-destructive/10", text: "text-destructive", icon: Trash2 },
  view: { bg: "bg-muted", text: "text-muted-foreground", icon: Eye },
};

export default function JournalPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const { logs, entityTypes, actionTypes, isLoading, hasMore, loadMore } = useAuditLogs({
    entityType: entityFilter !== "all" ? entityFilter : undefined,
    action: actionFilter !== "all" ? actionFilter : undefined,
  });

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      log.entity_type.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower) ||
      log.entity_id?.toLowerCase().includes(searchLower)
    );
  });

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  return (
    <SalonSidebar>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold">Journal</h1>
          <p className="text-muted-foreground">
            View the complete audit trail of all actions in your salon.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Entity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Entities</SelectItem>
                  {entityTypes.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {actionTypes.map((action) => (
                    <SelectItem key={action} value={action} className="capitalize">
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              Activity Log
            </CardTitle>
            <CardDescription>
              {filteredLogs.length} entries found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-surface">
                    <Skeleton className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-48 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">No activity logs found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLogs.map((log) => {
                  const EntityIcon = entityIcons[log.entity_type] || Settings;
                  const actionStyle = actionStyles[log.action] || actionStyles.view;
                  const ActionIcon = actionStyle.icon;
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = log.before_json || log.after_json || log.metadata;

                  return (
                    <Collapsible
                      key={log.id}
                      open={isExpanded}
                      onOpenChange={() => hasDetails && toggleExpand(log.id)}
                    >
                      <div
                        className={cn(
                          "p-3 rounded-lg bg-surface transition-colors",
                          hasDetails && "hover:bg-muted/50 cursor-pointer"
                        )}
                      >
                        <CollapsibleTrigger asChild disabled={!hasDetails}>
                          <div className="flex items-center gap-4">
                            {/* Entity Icon */}
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                              <EntityIcon className="w-5 h-5 text-muted-foreground" />
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge className={cn("text-xs", actionStyle.bg, actionStyle.text)}>
                                  <ActionIcon className="w-3 h-3 mr-1" />
                                  {log.action}
                                </Badge>
                                <span className="font-medium capitalize">
                                  {log.entity_type.replace(/_/g, " ")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                <span>{format(new Date(log.created_at), "MMM d, yyyy h:mm a")}</span>
                                {log.entity_id && (
                                  <>
                                    <span>•</span>
                                    <span className="truncate font-mono text-xs">
                                      {log.entity_id.slice(0, 8)}...
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Expand Icon */}
                            {hasDetails && (
                              <div className="flex-shrink-0">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            )}
                          </div>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          {hasDetails && (
                            <div className="mt-4 pt-4 border-t space-y-4">
                              {log.before_json && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Before:</p>
                                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                                    {JSON.stringify(log.before_json, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.after_json && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">After:</p>
                                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                                    {JSON.stringify(log.after_json, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.metadata && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">Metadata:</p>
                                  <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}

                {/* Load More */}
                {hasMore && (
                  <div className="text-center pt-4">
                    <Button variant="outline" onClick={loadMore}>
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SalonSidebar>
  );
}
