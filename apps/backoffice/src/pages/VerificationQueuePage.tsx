import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";

export default function VerificationQueuePage() {
  const { data = [], isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["payout-recipient-setup-queue"],
    queryFn: async () => {
      const { data, error } = await supabase.from("salon_payout_destinations")
        .select("id, country, currency, destination_type, tenants(name)")
        .is("paystack_recipient_code", null).order("created_at");
      if (error) throw error;
      return data || [];
    },
  });
  return <BackofficeLayout><div className="p-6 space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold">Payout setup queue</h1>
        <p className="text-muted-foreground">Payout destinations that need a transfer recipient before withdrawals can be sent.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Refreshing…" : "Refresh"}</Button>
    </div>
    <Card><CardHeader><CardTitle>Incomplete payout destinations</CardTitle>
      <CardDescription>Ask the salon to add its payout account again to complete setup.</CardDescription></CardHeader>
      <CardContent>{error ? <p role="alert">Unable to load payout destinations. Please try again.</p>
        : isPending ? <p role="status">Loading payout destinations…</p>
        : data.length === 0 ? <p>No incomplete payout destinations.</p>
        : <Table><TableHeader><TableRow><TableHead>Salon</TableHead><TableHead>Country</TableHead><TableHead>Currency</TableHead><TableHead>Type</TableHead></TableRow></TableHeader>
          <TableBody>{data.map((destination) => <TableRow key={destination.id}>
            <TableCell>{destination.tenants?.name || "Unnamed salon"}</TableCell>
            <TableCell>{destination.country}</TableCell><TableCell>{destination.currency}</TableCell>
            <TableCell>{destination.destination_type === "bank" ? "Bank" : "Mobile money"}</TableCell>
          </TableRow>)}</TableBody></Table>}
      </CardContent></Card>
  </div></BackofficeLayout>;
}
