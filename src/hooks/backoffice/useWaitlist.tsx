 import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
 import { supabase } from "@/integrations/supabase/client";
 import { useToast } from "@/hooks/use-toast";
 
 export type WaitlistStatus = "pending" | "invited" | "rejected" | "converted";
 
 export interface WaitlistLead {
   id: string;
   name: string;
   email: string;
   phone: string | null;
   country: string;
   plan_interest: string | null;
   team_size: string | null;
   notes: string | null;
   status: WaitlistStatus;
   position: number | null;
   invitation_token: string | null;
   invitation_expires_at: string | null;
   approved_by_id: string | null;
   approved_at: string | null;
   rejected_reason: string | null;
   converted_tenant_id: string | null;
   converted_at: string | null;
   created_at: string;
   updated_at: string;
 }
 
 export function useWaitlist(statusFilter?: WaitlistStatus) {
   return useQuery({
     queryKey: ["waitlist", statusFilter],
     queryFn: async () => {
       let query = supabase
         .from("waitlist_leads")
         .select("*")
         .order("position", { ascending: true, nullsFirst: false })
         .order("created_at", { ascending: true });
 
       if (statusFilter) {
         query = query.eq("status", statusFilter);
       }
 
       const { data, error } = await query;
 
       if (error) {
         console.error("Error fetching waitlist:", error);
         throw error;
       }
 
       return data as WaitlistLead[];
     },
   });
 }
 
export function useWaitlistActions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const approveLead = useMutation({
    mutationFn: async (leadId: string) => {
      // Generate invitation token
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update lead with invited status and token
      const { data, error } = await supabase
        .from("waitlist_leads")
        .update({
          status: "invited" as const,
          invitation_token: token,
          invitation_expires_at: expiresAt.toISOString(),
          approved_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .select()
        .single();

      if (error) throw error;

      // Send invitation email via edge function
      const { error: emailError } = await supabase.functions.invoke("send-waitlist-invitation", {
        body: { leadId },
      });

      if (emailError) {
        console.error("Error sending invitation email:", emailError);
        // Don't throw - approval succeeded, email is secondary
        toast({
          title: "Lead approved",
          description: "However, the invitation email could not be sent. Check logs.",
          variant: "destructive",
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast({
        title: "Lead approved",
        description: "Invitation email has been sent.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error approving lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resendInvite = useMutation({
    mutationFn: async (leadId: string) => {
      // Generate new invitation token
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Update lead with new token and expiry
      const { data, error } = await supabase
        .from("waitlist_leads")
        .update({
          invitation_token: token,
          invitation_expires_at: expiresAt.toISOString(),
        })
        .eq("id", leadId)
        .eq("status", "invited")
        .select()
        .single();

      if (error) throw error;

      // Send invitation email via edge function
      const { error: emailError } = await supabase.functions.invoke("send-waitlist-invitation", {
        body: { leadId },
      });

      if (emailError) {
        console.error("Error resending invitation email:", emailError);
        throw new Error("Failed to send invitation email");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast({
        title: "Invitation resent",
        description: "A new invitation email has been sent with a fresh 7-day link.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error resending invite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectLead = useMutation({
    mutationFn: async ({ leadId, reason }: { leadId: string; reason?: string }) => {
      const { data, error } = await supabase
        .from("waitlist_leads")
        .update({
          status: "rejected",
          rejected_reason: reason || null,
        })
        .eq("id", leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast({
        title: "Lead rejected",
        description: "No notification was sent to the applicant.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error rejecting lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    approveLead,
    resendInvite,
    rejectLead,
  };
}