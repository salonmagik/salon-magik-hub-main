import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Banknote, Plus, Search } from "lucide-react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { RecordPaymentDialog } from "@/components/dialogs/RecordPaymentDialog";
import { useCashLedger } from "@/hooks/useCashLedger";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@ui/button";
import { Card, CardContent } from "@ui/card";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Badge } from "@ui/badge";
import { formatCurrency } from "@shared/currency";

export default function JournalPage() {
  const { currentTenant } = useAuth();
  const { entries, isLoading, error, refetch } = useCashLedger();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entries;
    return entries.filter((entry) =>
      entry.customer?.full_name.toLowerCase().includes(query) ||
      entry.appointment?.booking_reference?.toLowerCase().includes(query),
    );
  }, [entries, search]);

  const todayTotal = entries
    .filter((entry) => new Date(entry.occurred_at).toDateString() === new Date().toDateString())
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);

  return (
    <SalonSidebar>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Cash Tracker</h1>
            <p className="text-muted-foreground">Offline cash payments linked to booked appointments.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Record cash payment
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card><CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cash recorded today</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(todayTotal, currentTenant?.currency)}</p>
          </CardContent></Card>
          <Card><CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ledger total</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(total, currentTenant?.currency)}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="border-b p-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search customer or booking reference…" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>

            {error ? (
              <div className="p-8 text-center text-sm text-destructive">{error.message}</div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[760px]">
                  <TableHeader><TableRow>
                    <TableHead>Date recorded</TableHead><TableHead>Appointment</TableHead>
                    <TableHead>Customer</TableHead><TableHead>Location</TableHead>
                    <TableHead>Note</TableHead><TableHead className="text-right">Cash amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? Array.from({ length: 4 }).map((_, index) => (
                      <TableRow key={index}>{Array.from({ length: 6 }).map((__, cell) => (
                        <TableCell key={cell}><Skeleton className="h-4 w-24" /></TableCell>
                      ))}</TableRow>
                    )) : filteredEntries.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-48 text-center">
                        <Banknote className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                        <p className="font-medium">No cash payments recorded</p>
                        <p className="mt-1 text-sm text-muted-foreground">Appointment-linked cash payments will appear here.</p>
                      </TableCell></TableRow>
                    ) : filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{format(new Date(entry.occurred_at), "d MMM yyyy, h:mm a")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{entry.appointment?.scheduled_start ? format(new Date(entry.appointment.scheduled_start), "d MMM, h:mm a") : "—"}</span>
                            <Badge variant="outline">Paid offline</Badge>
                          </div>
                          {entry.appointment?.booking_reference && <p className="text-xs text-muted-foreground">{entry.appointment.booking_reference}</p>}
                        </TableCell>
                        <TableCell>{entry.customer?.full_name || "—"}</TableCell>
                        <TableCell>{entry.appointment?.location?.name || "—"}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{entry.description || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(entry.amount), entry.currency)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <RecordPaymentDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={refetch} />
    </SalonSidebar>
  );
}
