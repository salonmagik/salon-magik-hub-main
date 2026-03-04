import { useState } from "react";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Badge } from "@ui/badge";
import { supabase } from "@/lib/supabase";
import { Loader2, Tag, X, CheckCircle } from "lucide-react";
import { formatCurrency } from "@shared/currency";

interface VoucherInputProps {
  tenantId: string;
  currency: string;
  subtotal: number;
  selectedLocationId?: string;
  selectedCountryCode?: string | null;
  onVoucherApplied: (voucher: AppliedVoucher | null) => void;
  appliedVoucher: AppliedVoucher | null;
}

export interface AppliedVoucher {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  discountAmount: number;
}

export function VoucherInput({
  tenantId,
  currency,
  subtotal,
  selectedLocationId,
  selectedCountryCode,
  onVoucherApplied,
  appliedVoucher,
}: VoucherInputProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    if (!code.trim()) {
      setError("Please enter a voucher code");
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      let allowedVoucherIds: string[] | null = null;

      if (selectedLocationId) {
        const { data: scopedVoucherRows, error: scopedVoucherError } = await (supabase.from as any)("voucher_locations")
          .select("voucher_id")
          .eq("tenant_id", tenantId)
          .eq("location_id", selectedLocationId)
          .eq("is_enabled", true);

        if (scopedVoucherError) throw scopedVoucherError;
        allowedVoucherIds = (scopedVoucherRows ?? []).map((row: { voucher_id: string }) => row.voucher_id);
      } else if (selectedCountryCode) {
        const { data: locationRows, error: locationError } = await supabase
          .from("locations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("availability", "open")
          .eq("country", selectedCountryCode);

        if (locationError) throw locationError;

        const countryLocationIds = (locationRows ?? []).map((row) => row.id);
        if (countryLocationIds.length > 0) {
          const { data: scopedVoucherRows, error: scopedVoucherError } = await (supabase.from as any)("voucher_locations")
            .select("voucher_id")
            .eq("tenant_id", tenantId)
            .eq("is_enabled", true)
            .in("location_id", countryLocationIds);

          if (scopedVoucherError) throw scopedVoucherError;
          allowedVoucherIds = (scopedVoucherRows ?? []).map((row: { voucher_id: string }) => row.voucher_id);
        } else {
          allowedVoucherIds = [];
        }
      }

      if (allowedVoucherIds && allowedVoucherIds.length === 0) {
        setError("This voucher is not available for the selected location");
        return;
      }

      let voucherQuery = supabase
        .from("vouchers")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("code", code.toUpperCase().trim())
        .eq("status", "active")
        .maybeSingle();

      if (allowedVoucherIds) {
        voucherQuery = voucherQuery.in("id", allowedVoucherIds);
      }

      const { data: voucher, error: fetchError } = await voucherQuery;

      if (fetchError || !voucher) {
        setError("Invalid or expired voucher code");
        return;
      }

      // Check expiration
      if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
        setError("This voucher has expired");
        return;
      }

      // Check if voucher has remaining balance
      if (voucher.balance <= 0) {
        setError("This voucher has no remaining balance");
        return;
      }

      // Calculate discount - use remaining balance up to subtotal
      const discountAmount = Math.min(voucher.balance, subtotal);

      onVoucherApplied({
        id: voucher.id,
        code: voucher.code,
        discountType: "fixed", // Gift card vouchers are fixed amount
        discountValue: voucher.balance,
        discountAmount: Math.round(discountAmount * 100) / 100,
      });

      setCode("");
    } catch (err) {
      console.error("Voucher validation error:", err);
      setError("Failed to validate voucher");
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemove = () => {
    onVoucherApplied(null);
  };

  if (appliedVoucher) {
    return (
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Voucher Applied</Label>
        <div className="flex items-center justify-between p-3 bg-success-bg border border-success/20 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" />
            <div>
              <Badge variant="secondary" className="font-mono">
                {appliedVoucher.code}
              </Badge>
              <p className="text-sm text-success mt-1">
                -{formatCurrency(appliedVoucher.discountAmount, currency)} discount
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm text-muted-foreground">Have a voucher code?</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder="Enter code"
            className="pl-10 uppercase"
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
          />
        </div>
        <Button
          variant="outline"
          onClick={handleApply}
          disabled={isValidating || !code.trim()}
        >
          {isValidating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Apply"
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
