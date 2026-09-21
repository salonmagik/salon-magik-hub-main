import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Button } from "@ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";
import { EmptyState } from "@ui/empty-state";
import { FileText } from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  tenant_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_SIZE = 25;

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "nav.page_view": "Page viewed",
  product_announcement_created: "Announcement created",
  product_announcement_updated: "Announcement updated",
  product_announcement_published: "Announcement published",
  product_announcement_scheduled: "Announcement scheduled",
  product_announcement_archived: "Announcement archived",
  product_announcement_deleted: "Announcement deleted",
  product_announcement_viewed: "Announcement viewed",
  product_announcement_clicked: "Announcement CTA clicked",
  product_announcement_dismissed: "Announcement dismissed",
  product_announcement_snapshot: "Announcement history snapshot",
};

function formatAuditValue(value: string) {
  return AUDIT_ACTION_LABELS[value]
    ?? value.replace(/[._]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAuditJson(value: Record<string, unknown> | null) {
  return value && Object.keys(value).length > 0
    ? JSON.stringify(value, null, 2)
    : "No changes recorded for this event.";
}

export default function AuditLogsPage() {
  const [searchParams] = useSearchParams();
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState(searchParams.get("entity_type") ?? "all");
  const [entityIdFilter, setEntityIdFilter] = useState(searchParams.get("entity_id") ?? "");
  const [actorFilter, setActorFilter] = useState(searchParams.get("member") ?? "");

  useEffect(() => {
    const member = searchParams.get("member");
    if (member) setActorFilter(member);
    const entityType = searchParams.get("entity_type");
    if (entityType) setEntityTypeFilter(entityType);
    const entityId = searchParams.get("entity_id");
    if (entityId) setEntityIdFilter(entityId);
  }, [searchParams]);
  const [searchFilter, setSearchFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "backoffice-audit-logs",
      actionFilter,
      entityTypeFilter,
      entityIdFilter,
      actorFilter,
      searchFilter,
      fromDate,
      toDate,
      page,
    ],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (entityTypeFilter !== "all") query = query.eq("entity_type", entityTypeFilter);
      if (entityIdFilter.trim()) query = query.eq("entity_id", entityIdFilter.trim());
      if (actorFilter.trim()) query = query.eq("actor_user_id", actorFilter.trim());
      if (fromDate) query = query.gte("created_at", `${fromDate}T00:00:00.000Z`);
      if (toDate) query = query.lte("created_at", `${toDate}T23:59:59.999Z`);
      const { data: logs, error: queryError, count } = await query;
      if (queryError) throw queryError;
      return { logs: (logs || []) as AuditLog[], count: count || 0 };
    },
  });

  const filteredLogs = useMemo(() => {
    const term = searchFilter.trim().toLowerCase();
    if (!term) return data?.logs || [];
    return (data?.logs || []).filter((row) => {
      const searchable = JSON.stringify({
        before: row.before_json,
        after: row.after_json,
        metadata: row.metadata,
      }).toLowerCase();
      return (
        row.action.toLowerCase().includes(term) ||
        row.entity_type.toLowerCase().includes(term) ||
        (row.entity_id || "").toLowerCase().includes(term) ||
        searchable.includes(term)
      );
    });
  }, [data?.logs, searchFilter]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    (data?.logs || []).forEach((row) => set.add(row.action));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.logs]);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    (data?.logs || []).forEach((row) => set.add(row.entity_type));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data?.logs]);

  const totalCount = data?.count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            Backoffice actions and platform changes.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
            <div className="space-y-2">
              <Label>Action</Label>
              <Select
                value={actionFilter}
                onValueChange={(value) => {
                  setPage(1);
                  setActionFilter(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {actions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatAuditValue(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entity</Label>
              <Select
                value={entityTypeFilter}
                onValueChange={(value) => {
                  setPage(1);
                  setEntityTypeFilter(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {entityTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {formatAuditValue(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Actor User ID</Label>
              <Input
                value={actorFilter}
                onChange={(event) => {
                  setPage(1);
                  setActorFilter(event.target.value);
                }}
                placeholder="UUID"
              />
            </div>

            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                value={searchFilter}
                onChange={(event) => {
                  setPage(1);
                  setSearchFilter(event.target.value);
                }}
                placeholder="Action, entity, metadata"
              />
            </div>

            <div className="space-y-2">
              <Label>Entity ID</Label>
              <Input
                value={entityIdFilter}
                onChange={(event) => {
                  setPage(1);
                  setEntityIdFilter(event.target.value);
                }}
                placeholder="Announcement UUID"
              />
            </div>

            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setPage(1);
                  setFromDate(event.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setPage(1);
                  setToDate(event.target.value);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Entity ID</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6}>Loading audit logs...</TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-destructive">
                      Failed to load audit logs.
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState icon={FileText} title="No logs found" description="Try adjusting the filters above." />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell>{formatAuditValue(row.action)}</TableCell>
                      <TableCell>{formatAuditValue(row.entity_type)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.entity_id || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.actor_user_id || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setSelectedLog(row)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground tabular-nums">
            {totalCount > 0 ? `${rangeStart}–${rangeEnd} of ${totalCount}` : "0 of 0"} · Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className={cn(DIALOG_BODY_PADDING, "space-y-3 text-sm")}>
              <div><strong>ID:</strong> <span className="font-mono">{selectedLog.id}</span></div>
              <div><strong>Action:</strong> {formatAuditValue(selectedLog.action)}</div>
              <div><strong>Entity:</strong> {formatAuditValue(selectedLog.entity_type)}</div>
              <div><strong>Entity ID:</strong> <span className="font-mono">{selectedLog.entity_id || "-"}</span></div>
              <div><strong>Actor:</strong> <span className="font-mono">{selectedLog.actor_user_id || "-"}</span></div>
              <div><strong>Tenant:</strong> <span className="font-mono">{selectedLog.tenant_id || "-"}</span></div>
              <div><strong>Created:</strong> {new Date(selectedLog.created_at).toLocaleString()}</div>
              <div className="space-y-2">
                <strong>Before</strong>
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {formatAuditJson(selectedLog.before_json)}
                </pre>
              </div>
              <div className="space-y-2">
                <strong>After</strong>
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {formatAuditJson(selectedLog.after_json)}
                </pre>
              </div>
              <div className="space-y-2">
                <strong>Metadata</strong>
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {formatAuditJson(selectedLog.metadata)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
