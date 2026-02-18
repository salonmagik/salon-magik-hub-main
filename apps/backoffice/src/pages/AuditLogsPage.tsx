import { useMemo, useState } from "react";
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

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  tenant_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");
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
      const metadata = JSON.stringify(row.metadata || {}).toLowerCase();
      return (
        row.action.toLowerCase().includes(term) ||
        row.entity_type.toLowerCase().includes(term) ||
        (row.entity_id || "").toLowerCase().includes(term) ||
        metadata.includes(term)
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

  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / PAGE_SIZE));

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
          <CardContent className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
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
                      {value}
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
                      {value}
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
                    <TableCell colSpan={6}>No logs found for the current filters.</TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                      <TableCell>{row.action}</TableCell>
                      <TableCell>{row.entity_type}</TableCell>
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
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
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
            <div className="space-y-3 text-sm">
              <div><strong>ID:</strong> <span className="font-mono">{selectedLog.id}</span></div>
              <div><strong>Action:</strong> {selectedLog.action}</div>
              <div><strong>Entity:</strong> {selectedLog.entity_type}</div>
              <div><strong>Entity ID:</strong> <span className="font-mono">{selectedLog.entity_id || "-"}</span></div>
              <div><strong>Actor:</strong> <span className="font-mono">{selectedLog.actor_user_id || "-"}</span></div>
              <div><strong>Tenant:</strong> <span className="font-mono">{selectedLog.tenant_id || "-"}</span></div>
              <div><strong>Created:</strong> {new Date(selectedLog.created_at).toLocaleString()}</div>
              <div className="space-y-2">
                <strong>Metadata</strong>
                <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
