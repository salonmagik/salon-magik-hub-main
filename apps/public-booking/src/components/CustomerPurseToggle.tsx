import { useState, useEffect, useCallback } from "react";
import { Wallet, AlertCircle } from "lucide-react";
import { Switch } from "@ui/switch";
import { Label } from "@ui/label";
import { formatCurrency } from "@shared/currency";
import { supabase } from "@/lib/supabase";
import { toast } from "@ui/ui/use-toast";

interface CustomerPurseToggleProps {
  tenantId: string;
  customerEmail: string;
  currency: string;
  maxAmount: number;
  onPurseApplied: (amount: number) => void;
}

export function CustomerPurseToggle({
  tenantId,
  customerEmail,
  currency,
  maxAmount,
  onPurseApplied,
}: CustomerPurseToggleProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [purseBalance, setPurseBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkPurseBalance = useCallback(async () => {
    setIsLoading(true);
    try {
      // Look up customer by email and tenant
      const { data: customer, error } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("email", customerEmail)
        .maybeSingle();

      if (error || !customer) {
        setPurseBalance(0);
        return;
      }

      // Get purse balance
      const { data: purse } = await supabase
        .from("customer_purses")
        .select("balance")
        .eq("tenant_id", tenantId)
        .eq("customer_id", customer.id)
        .maybeSingle();

      setPurseBalance(purse?.balance || 0);
    } catch (err) {
      console.error("Error checking purse:", err);
      setPurseBalance(0);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, customerEmail]);

  // Check balance when email changes
  useEffect(() => {
    if (customerEmail) {
      checkPurseBalance();
    }
  }, [customerEmail, checkPurseBalance]);

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      if (purseBalance && purseBalance > 0) {
        setIsEnabled(true);
        const amountToApply = Math.min(purseBalance || 0, maxAmount);
        onPurseApplied(amountToApply);

        toast({
          title: "Store credit applied",
        });
      }
    } else {
      setIsEnabled(false);
      onPurseApplied(0);
    }
  };

  // Still loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  // No balance - show disabled state with message
  if (purseBalance === 0) {
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30 opacity-60">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Store Credit</Label>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              No store credit available
            </p>
          </div>
        </div>
        <Switch disabled checked={false} />
      </div>
    );
  }

  // Calculate amounts
  const amountToApply = Math.min(purseBalance || 0, maxAmount);
  const remainderAfterPurse = maxAmount - amountToApply;
  const coversFullAmount = remainderAfterPurse === 0;

  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Use Store Credit</Label>
            <p className="text-xs text-muted-foreground">
              Balance: {formatCurrency(purseBalance || 0, currency)}
            </p>
            {isEnabled && (
              <div className="text-xs space-y-0.5">
                <p className="text-primary font-medium">
                  {formatCurrency(amountToApply, currency)} will be applied
                </p>
                {coversFullAmount ? (
                  <p className="text-muted-foreground">No additional payment required</p>
                ) : (
                  <p className="text-muted-foreground">
                    Remaining {formatCurrency(remainderAfterPurse, currency)} due via other payment
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
          />
        </div>
      </div>
    </>
  );
}
