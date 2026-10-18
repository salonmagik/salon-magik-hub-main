import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type EmailCheckPhase = "editable" | "checking" | "confirmed" | "locked";

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Shared "ask once, lock it, let them re-open to edit" behavior for an email
// field that needs to be checked against platform-wide customer identity
// (customer_identity_exists) -- used by both the booker's own "Your
// Information" step and the gift-recipient step. check() is idempotent for
// the same already-checked value, so a stray blur right after a successful
// check doesn't re-hit the backend.
export function useCheckedEmail(onResolved?: (exists: boolean) => void) {
  const [phase, setPhase] = useState<EmailCheckPhase>("editable");
  const lastCheckedRef = useRef<string>("");

  const check = async (email: string) => {
    const normalized = email.trim().toLowerCase();
    if (!isValidEmail(normalized) || normalized === lastCheckedRef.current) return;
    lastCheckedRef.current = normalized;
    setPhase("checking");

    let exists = false;
    try {
      const { data, error } = (await supabase.rpc("customer_identity_exists" as never, {
        p_email: normalized,
      } as never)) as { data: boolean | null; error: unknown };
      if (error) throw error;
      exists = Boolean(data);
    } catch (err) {
      // Fail open -- never let an internal check failure block checkout.
      console.error("Error checking email identity:", err);
    }

    onResolved?.(exists);
    setPhase("confirmed");
    setTimeout(() => setPhase("locked"), 2000);
  };

  const startEdit = () => {
    lastCheckedRef.current = "";
    setPhase("editable");
  };

  // Mark an email as already checked elsewhere (e.g. the booker's initial
  // auth-resolve-identifier call already confirmed no account exists for
  // this exact address) without hitting the backend again.
  const lock = (email: string) => {
    lastCheckedRef.current = email.trim().toLowerCase();
    setPhase("locked");
  };

  return { phase, check, startEdit, lock, isLocked: phase !== "editable" };
}
