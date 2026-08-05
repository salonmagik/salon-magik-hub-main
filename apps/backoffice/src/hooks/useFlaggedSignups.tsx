import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface FlaggedSignupRow {
  flag_type: "blocked_phone_reuse" | "shared_signup_ip";
  detected_at: string;
  phone_last4: string | null;
  attempted_email: string | null;
  ip_address: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
}

export function useFlaggedSignups() {
  return useQuery({
    queryKey: ["backoffice-flagged-signups"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_flagged_signups" as never);
      if (error) throw error;
      return (data || []) as unknown as FlaggedSignupRow[];
    },
  });
}
