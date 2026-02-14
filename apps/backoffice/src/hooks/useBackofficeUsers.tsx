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
      if (role === "super_admin") {
        throw new Error("Use the provision-super-admin flow for super admin accounts");
      }

      const {
				data: { session },
				error: sessionError,
			} = await supabase.auth.getSession();

			if (sessionError || !session?.access_token) {
				throw new Error(
					"Your session is invalid or expired. Please sign in again.",
				);
			}

			const { data, error } = await supabase.functions.invoke(
				"create-backoffice-admin",
				{
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
					body: {
						email,
						role,
						origin: window.location.origin,
					},
				},
			);

      if (error || data?.error) {
				throw new Error(
					data?.error || error?.message || "Failed to create backoffice admin",
				);
			}

      return data as {
				success: boolean;
				email: string;
				role: string;
				emailSent: boolean;
				tempPassword: string | null;
			};
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      if (data?.emailSent) {
				toast.success(`BackOffice admin added. Invite sent to ${data.email}`);
			} else {
				toast.success("BackOffice admin added, but email failed to send");
				if (data?.tempPassword) {
					toast.info(
						`Temporary password for ${data.email}: ${data.tempPassword}`,
					);
				}
			}
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
