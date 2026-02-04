import { useState } from "react";
import { Wallet, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const checkPurseBalance = async () => {
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
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      // Check balance first
      await checkPurseBalance();
      
      if (purseBalance && purseBalance > 0) {
        // Show auth dialog for verification
        setShowAuthDialog(true);
      } else {
        toast({
          title: "No store credit",
          description: "You don't have any store credit with this salon.",
        });
      }
    } else {
      setIsEnabled(false);
      setIsVerified(false);
      onPurseApplied(0);
    }
  };

  const handleVerifyCode = async () => {
    setIsVerifying(true);
    try {
      // For demo purposes, accept any 6-digit code
      // In production, this would call verify-purse-access edge function
      if (authCode.length === 6) {
        setIsVerified(true);
        setIsEnabled(true);
        setShowAuthDialog(false);
        
        const amountToApply = Math.min(purseBalance || 0, maxAmount);
        onPurseApplied(amountToApply);
        
        toast({
          title: "Store credit applied",
          description: `${formatCurrency(amountToApply, currency)} will be deducted from your balance.`,
        });
      } else {
        toast({
          title: "Invalid code",
          description: "Please enter a valid 6-digit code.",
          variant: "destructive",
        });
      }
    } finally {
      setIsVerifying(false);
      setAuthCode("");
    }
  };

  const handleSendCode = async () => {
    // In production, this would send OTP via edge function
    toast({
      title: "Code sent",
      description: `A verification code has been sent to ${customerEmail}`,
    });
  };

  if (purseBalance === null && !isLoading) {
    // Haven't checked yet - show disabled toggle
    return null;
  }

  if (purseBalance === 0) {
    return null; // No balance, don't show toggle
  }

  return (
    <>
      <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <Label className="text-sm font-medium">Use Store Credit</Label>
            <p className="text-xs text-muted-foreground">
              Balance: {formatCurrency(purseBalance || 0, currency)}
              {isVerified && (
                <span className="ml-2 text-primary">✓ Verified</span>
              )}
            </p>
          </div>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Verify Your Identity
            </DialogTitle>
            <DialogDescription>
              To use your store credit, please verify your identity. We've sent a code to {customerEmail}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Verification Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter 6-digit code"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>

            <Button
              variant="link"
              className="px-0 text-sm"
              onClick={handleSendCode}
            >
              Didn't receive a code? Send again
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleVerifyCode}
              disabled={authCode.length !== 6 || isVerifying}
            >
              {isVerifying ? "Verifying..." : "Verify & Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
