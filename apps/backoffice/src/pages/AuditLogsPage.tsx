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

function stringifyFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

interface FieldDiff {
  key: string;
  before: string;
  after: string;
  changed: boolean;
}

function computeFieldDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): FieldDiff[] {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return Array.from(keys)
    .sort()
    .map((key) => {
      const beforeValue = stringifyFieldValue(before?.[key]);
      const afterValue = stringifyFieldValue(after?.[key]);
      return { key, before: beforeValue, after: afterValue, changed: beforeValue !== afterValue };
    });
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

  const diffFields = selectedLog ? computeFieldDiff(selectedLog.before_json, selectedLog.after_json).filter((f) => f.changed) : [];
  const unchangedFields = selectedLog ? computeFieldDiff(selectedLog.before_json, selectedLog.after_json).filter((f) => !f.changed) : [];
  const reasonGiven = (selectedLog?.metadata as Record<string, unknown> | null)?.reason;

  return (
    <BackofficeLayout>
      <div className="flex min-h-[calc(100vh-4rem)] gap-0">
      <div className="min-w-0 flex-1 space-y-6 py-7 pl-8 pr-0">
        <div className="pr-8">
          <h1 className="text-[20px] font-bold tracking-tight">Audit logs</h1>
          <p className="mt-[3px] text-[12.5px] text-muted-foreground">
            Every admin action, platform-wide.
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
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer ${selectedLog?.id === row.id ? "bg-muted/50" : ""}`}
                      onClick={() => setSelectedLog(row)}
                    >
                      <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell>{formatAuditValue(row.action)}</TableCell>
                      <TableCell>{formatAuditValue(row.entity_type)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.entity_id || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.actor_user_id || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedLog(row); }}>
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
            {totalCount > 0 ? `${rangeStart} to ${rangeEnd} of ${totalCount}` : "0 of 0"} · Page {page} of {totalPages}
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

      {selectedLog && (
        <aside className="w-[380px] shrink-0 overflow-y-auto border-l border-border bg-card p-6">
          <div className="mb-1 text-[11.5px] font-bold uppercase tracking-[.04em] text-muted-foreground">
            {selectedLog.action}
          </div>
          <div className="mb-0.5 text-sm font-bold">{formatAuditValue(selectedLog.entity_type)}</div>
          <div className="mb-[18px] text-xs text-muted-foreground">
            {selectedLog.actor_user_id || "Unknown actor"} · {new Date(selectedLog.created_at).toLocaleString()}
          </div>

          <div className="mb-2 text-xs font-semibold text-muted-foreground">What changed</div>
          {diffFields.length > 0 ? (
            <div className="backoffice-panel flex flex-col gap-2 p-3.5 text-[12.5px]">
              {diffFields.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-3">
                  <span className="text-muted-foreground">{field.key}</span>
                  <span className="text-right font-mono">
                    <span className="text-destructive line-through">{field.before}</span>
                    {" → "}
                    <span className="text-success">{field.after}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {selectedLog.before_json || selectedLog.after_json ? "No fields changed." : "No before/after state recorded for this event."}
            </p>
          )}

          {reasonGiven ? (
            <>
              <div className="mb-2 mt-[18px] text-xs font-semibold text-muted-foreground">Reason given</div>
              <p className="text-[12.5px]">"{String(reasonGiven)}"</p>
            </>
          ) : null}

          {unchangedFields.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                {unchangedFields.length} unchanged field{unchangedFields.length === 1 ? "" : "s"}
              </summary>
              <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {unchangedFields.map((field) => (
                  <div key={field.key} className="flex items-center justify-between gap-3">
                    <span>{field.key}</span>
                    <span className="font-mono">{field.before}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Raw metadata</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs">
              {formatAuditJson(selectedLog.metadata)}
            </pre>
          </details>
        </aside>
      )}
      </div>
    </BackofficeLayout>
  );
}
