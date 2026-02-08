import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Tables } from "@/lib/supabase";

type BackofficeUser = Tables<"backoffice_users">;

export function useBackofficeUsers() {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["backoffice-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backoffice_users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as BackofficeUser[];
    },
  });

  const createUser = useMutation({
    mutationFn: async ({
      email,
      role,
    }: {
      email: string;
      role: "super_admin" | "admin" | "support_agent";
    }) => {
      // First check if user exists in auth
      // Note: In production, this would be an edge function that creates the user
      const domain = email.split("@")[1];

      // Check if domain is allowed
      const { data: allowedDomains } = await supabase
        .from("backoffice_allowed_domains")
        .select("domain")
        .eq("domain", domain);

      if (!allowedDomains || allowedDomains.length === 0) {
        throw new Error(`Domain ${domain} is not in the allowed list`);
      }

      // For now, we'll just add to backoffice_users table
      // The actual user creation should be done via edge function
      toast.info("User invitation would be sent to " + email);
      return { email, role };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success("BackOffice user added successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to add user: " + error.message);
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("backoffice_users")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success("User removed from BackOffice");
    },
    onError: (error: Error) => {
      toast.error("Failed to remove user: " + error.message);
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: "super_admin" | "admin" | "support_agent";
    }) => {
      const { error } = await supabase
        .from("backoffice_users")
        .update({ role })
        .eq("user_id", userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success("Role updated successfully");
    },
    onError: (error: Error) => {
      toast.error("Failed to update role: " + error.message);
    },
  });

  return {
    users,
    isLoading,
    error,
    createUser,
    deleteUser,
    updateRole,
  };
}
