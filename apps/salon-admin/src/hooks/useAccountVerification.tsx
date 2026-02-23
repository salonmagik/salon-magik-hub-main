import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export interface VerificationResult {
  verified: boolean;
  accountName?: string;
  accountNumber?: string;
  bankId?: number;
  error?: string;
}

export function useAccountVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const verify = useCallback(async (accountNumber: string, bankCode: string): Promise<VerificationResult> => {
    setIsVerifying(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("verify-bank-account", {
        body: {
          accountNumber,
          bankCode,
        },
      });

      if (error) throw error;

      const verificationResult: VerificationResult = data as VerificationResult;
      setResult(verificationResult);
      return verificationResult;
    } catch (err) {
      console.error("Error verifying bank account:", err);
      const errorResult: VerificationResult = {
        verified: false,
        error: err instanceof Error ? err.message : "Failed to verify account",
      };
      setResult(errorResult);
      return errorResult;
    } finally {
      setIsVerifying(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return {
    verify,
    reset,
    isVerifying,
    result,
  };
}
