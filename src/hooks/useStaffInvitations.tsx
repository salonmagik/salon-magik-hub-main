import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/hooks/use-toast";
import type { Enums } from "@/integrations/supabase/types";

export interface StaffInvitation {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Enums<"app_role">;
  token: string;
  status: "pending" | "accepted" | "expired" | "cancelled";
  invited_by_id: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
  last_resent_at: string | null;
  resend_count: number;
  invited_via: string | null;
  temp_password: string | null;
  temp_password_used: boolean;
  password_changed_at: string | null;
}

const RESEND_THROTTLE_MINUTES = 30;

export function useStaffInvitations() {
  const { currentTenant } = useAuth();
  const [invitations, setInvitations] = useState<StaffInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!currentTenant?.id) {
      setInvitations([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("staff_invitations")
        .select("*")
        .eq("tenant_id", currentTenant.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      setInvitations((data as StaffInvitation[]) || []);
    } catch (err) {
      console.error("Error fetching invitations:", err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [currentTenant?.id]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const cancelInvitation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("staff_invitations")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (error) throw error;

      toast({ title: "Success", description: "Invitation cancelled" });
      await fetchInvitations();
      return true;
    } catch (err) {
      console.error("Error cancelling invitation:", err);
      toast({ title: "Error", description: "Failed to cancel invitation", variant: "destructive" });
      return false;
    }
  };

  const canResend = (invitation: StaffInvitation): { allowed: boolean; minutesRemaining: number } => {
    if (!invitation.last_resent_at) {
      return { allowed: true, minutesRemaining: 0 };
    }

    const lastResent = new Date(invitation.last_resent_at);
    const now = new Date();
    const minutesSinceResend = (now.getTime() - lastResent.getTime()) / (1000 * 60);
    const minutesRemaining = Math.ceil(RESEND_THROTTLE_MINUTES - minutesSinceResend);

    return {
      allowed: minutesSinceResend >= RESEND_THROTTLE_MINUTES,
      minutesRemaining: Math.max(0, minutesRemaining),
    };
  };

  const resendInvitation = async (id: string) => {
    const invitation = invitations.find((i) => i.id === id);
    if (!invitation) {
      toast({ title: "Error", description: "Invitation not found", variant: "destructive" });
      return false;
    }

    const { allowed, minutesRemaining } = canResend(invitation);
    if (!allowed) {
      toast({
        title: "Throttled",
        description: `Please wait ${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""} before resending.`,
        variant: "destructive",
      });
      return false;
    }

    try {
      // Update resend tracking
      const { error: updateError } = await supabase
        .from("staff_invitations")
        .update({
          last_resent_at: new Date().toISOString(),
          resend_count: (invitation.resend_count || 0) + 1,
          status: "pending", // Reset if expired
        })
        .eq("id", id);

      if (updateError) throw updateError;

      // Trigger email resend via edge function
      const { error: resendError } = await supabase.functions.invoke("send-staff-invitation", {
        body: {
          invitationId: id,
          resend: true,
        },
      });

      if (resendError) throw resendError;

      toast({ title: "Success", description: "Invitation resent successfully" });
      await fetchInvitations();
      return true;
    } catch (err) {
      console.error("Error resending invitation:", err);
      toast({ title: "Error", description: "Failed to resend invitation", variant: "destructive" });
      return false;
    }
  };

  // Filter pending invitations - exclude those with accepted_at even if status wasn't updated
  const pendingInvitations = invitations.filter(
    (i) => i.status === "pending" && !i.accepted_at
  );
  const acceptedInvitations = invitations.filter(
    (i) => i.status === "accepted" || i.accepted_at
  );
  const expiredInvitations = pendingInvitations.filter(
    (i) => new Date(i.expires_at) < new Date()
  );

  return {
    invitations,
    pendingInvitations,
    acceptedInvitations,
    expiredInvitations,
    isLoading,
    error,
    refetch: fetchInvitations,
    cancelInvitation,
    resendInvitation,
    canResend,
  };
}
