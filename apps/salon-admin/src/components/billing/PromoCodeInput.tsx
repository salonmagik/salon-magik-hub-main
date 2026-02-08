import { useState } from "react";
import { Input } from "@ui/input";
import { Button } from "@ui/button";
import { useValidatePromoCode } from "@/hooks/useDiscounts";
import { Check, X, Loader2, Tag } from "lucide-react";
import { cn } from "@shared/utils";

interface PromoCodeInputProps {
  onApply: (code: string, discount: number) => void;
  disabled?: boolean;
  appliedCode?: string | null;
  onRemove?: () => void;
}

export function PromoCodeInput({
  onApply,
  disabled = false,
  appliedCode,
  onRemove,
}: PromoCodeInputProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validatePromo = useValidatePromoCode();

  const handleApply = async () => {
    if (!code.trim()) return;

    setError(null);
    const result = await validatePromo.mutateAsync(code.trim());

    if (result.valid && result.discount) {
      onApply(code.trim().toUpperCase(), result.discount);
      setCode("");
    } else {
      setError(result.message || "Invalid promo code");
    }
  };

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-lg">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-success" />
          <span className="text-sm font-medium text-success">
            Code "{appliedCode}" applied
          </span>
        </div>
        {onRemove && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Enter promo code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(null);
          }}
          disabled={disabled}
          className={cn(error && "border-destructive")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleApply();
            }
          }}
        />
        <Button
          variant="outline"
          onClick={handleApply}
          disabled={disabled || !code.trim() || validatePromo.isPending}
        >
          {validatePromo.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Apply"
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
