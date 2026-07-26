import { useMemo, useState } from "react";
import { Gift, Loader2, Plus, Search, WalletCards } from "lucide-react";
import { useCustomerBalances } from "@/hooks/useCustomerBalances";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/dialog";
import { Label } from "@ui/label";
import { Textarea } from "@ui/textarea";
import { formatCurrency } from "@shared/currency";

export function CustomerBalancesPanel({ canAdjust }: { canAdjust: boolean }) {
  const { currentTenant } = useAuth();
  const { balances, isLoading, error, refetch } = useCustomerBalances();
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<"form" | "confirm" | "submitting" | "success" | "error">("form");
  const [errorMessage, setErrorMessage] = useState("");

  const filtered = useMemo(() => balances.filter((balance) =>
    balance.customer?.full_name.toLowerCase().includes(search.toLowerCase()) ||
    balance.customer?.email?.toLowerCase().includes(search.toLowerCase()),
  ), [balances, search]);
  const selected = balances.find((balance) => balance.customer_id === selectedCustomerId);

  const close = () => {
    setSelectedCustomerId(null);
    setAmount("");
    setReason("");
    setStage("form");
    setErrorMessage("");
  };

  const submit = async () => {
    if (!selected || Number(amount) <= 0 || !reason.trim() || !currentTenant) return;
    setStage("submitting");
    const { error: adjustmentError } = await supabase.rpc("adjust_customer_balance" as never, {
      p_tenant_id: currentTenant.id,
      p_customer_id: selected.customer_id,
      p_amount: Number(amount),
      p_currency: selected.currency,
      p_reason: reason.trim(),
    } as never);
    if (adjustmentError) {
      setErrorMessage(adjustmentError.message);
      setStage("error");
      return;
    }
    await refetch();
    setStage("success");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Customer balances</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(balances.reduce((sum, item) => sum + Number(item.balance), 0), currentTenant?.currency)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Paid funds</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(balances.reduce((sum, item) => sum + item.paidFunds, 0), currentTenant?.currency)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">Store credit</p><p className="mt-2 text-2xl font-semibold">{formatCurrency(balances.reduce((sum, item) => sum + item.storeCredit, 0), currentTenant?.currency)}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div><CardTitle className="text-base">Customer salon balances</CardTitle><p className="mt-1 text-sm text-muted-foreground">Paid funds and salon-issued credit remain source-aware.</p></div>
          <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer…" /></div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? [1,2,3].map((item) => <Skeleton key={item} className="h-16 w-full" />) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error.message}</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No customer balances found.</p>
          ) : filtered.map((balance) => (
            <div key={balance.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5"><WalletCards className="h-5 w-5 text-primary" /></div>
                <div><p className="font-medium">{balance.customer?.full_name || "Customer"}</p><p className="text-xs text-muted-foreground">{balance.customer?.email || balance.customer?.phone || "No contact details"}</p></div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right"><p className="font-semibold">{formatCurrency(Number(balance.balance) - balance.reserved, balance.currency)}</p><div className="mt-1 flex gap-1.5"><Badge variant="outline">{formatCurrency(balance.paidFunds, balance.currency)} paid</Badge><Badge variant="outline">{formatCurrency(balance.storeCredit, balance.currency)} credit</Badge></div></div>
                {canAdjust && <Button size="sm" variant="outline" onClick={() => { setSelectedCustomerId(balance.customer_id); setStage("form"); }}><Plus className="mr-1.5 h-3.5 w-3.5" />Add credit</Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedCustomerId)} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {stage === "success" || stage === "error" ? (
            <div className="py-8 text-center">
              <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${stage === "success" ? "bg-success/10" : "bg-destructive/10"}`}><Gift className={`h-7 w-7 ${stage === "success" ? "text-success" : "text-destructive"}`} /></div>
              <DialogTitle>{stage === "success" ? "Store credit added" : "Credit wasn’t added"}</DialogTitle>
              <p className="mt-2 text-sm text-muted-foreground">{stage === "success" ? `${selected?.customer?.full_name}'s salon balance has been updated.` : errorMessage}</p>
              <Button className="mt-6 w-full" onClick={close}>Done</Button>
            </div>
          ) : stage === "submitting" ? (
            <div className="flex flex-col items-center py-14"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Adding store credit…</p></div>
          ) : (
            <>
              <DialogHeader><DialogTitle>{stage === "confirm" ? "Confirm store credit" : "Add store credit"}</DialogTitle><p className="text-sm text-muted-foreground">{selected?.customer?.full_name}</p></DialogHeader>
              <div className="space-y-4 py-4">
                {stage === "form" ? <>
                  <div className="space-y-2"><Label>Amount</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Reason</Label><Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Goodwill, loyalty reward, or balance correction…" /></div>
                </> : <div className="rounded-xl border bg-surface p-4"><p className="text-2xl font-semibold">{formatCurrency(Number(amount), selected?.currency)}</p><p className="mt-2 text-sm text-muted-foreground">{reason}</p></div>}
              </div>
              <DialogFooter><Button variant="outline" onClick={() => stage === "confirm" ? setStage("form") : close()}>{stage === "confirm" ? "Back" : "Cancel"}</Button><Button disabled={Number(amount) <= 0 || !reason.trim()} onClick={() => stage === "confirm" ? void submit() : setStage("confirm")}>{stage === "confirm" ? "Add credit" : "Continue"}</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
