import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export type TeamMemberStatus = "active" | "deactivated" | "invited";

export interface BackofficeUserWithTemplate {
  id: string;
  user_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  email_domain: string | null;
  base_role: string;
  role_template_id: string | null;
  role_name: string | null;
  status: TeamMemberStatus;
  is_active: boolean;
  totp_enabled: boolean;
  is_logged_in: boolean;
  is_sales_agent: boolean;
  last_login_at: string | null;
  last_activity_at: string | null;
  created_at: string;
}

interface CreateBackofficeUserPayload {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roleId: string;
  isSalesAgent: boolean;
}

async function getFunctionErrorMessage(
  error: unknown,
  fallback: string,
): Promise<{ status?: number; message: string }> {
  const context = (error as { context?: unknown } | null)?.context;
  const status =
    typeof (context as { status?: unknown } | null)?.status === "number"
      ? ((context as { status?: number }).status as number)
      : undefined;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      const parsedMessage =
        (payload as { error?: string; message?: string } | null)?.error ||
        (payload as { error?: string; message?: string } | null)?.message;
      if (parsedMessage) {
        return { status: context.status, message: parsedMessage };
      }
    } catch {
      // Fall through to generic parsing.
    }
  }

  const genericMessage =
    (error as { message?: string } | null)?.message || fallback;
  return { status, message: genericMessage };
}

export function useBackofficeUsers() {
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["backoffice-users"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("backoffice_list_team_members");
      if (error) throw error;
      return (data || []) as BackofficeUserWithTemplate[];
    },
  });

  const createUser = useMutation({
    mutationFn: async ({ email, firstName, lastName, phone, roleId, isSalesAgent }: CreateBackofficeUserPayload) => {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      let activeSession = session;

      if (sessionError || !activeSession) {
        throw new Error("Your session is invalid or expired. Please sign in again.");
      }

      const isSessionExpiringSoon =
        typeof activeSession.expires_at === "number" &&
        activeSession.expires_at * 1000 <= Date.now() + 60_000;

      if (isSessionExpiringSoon) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          throw new Error("Your session expired while creating admin. Please sign in again.");
        }
        activeSession = refreshed.session;
      }

      const { error: validateSessionError } = await supabase.auth.getUser(activeSession.access_token);
      if (validateSessionError) {
        throw new Error("Session is invalid for this environment. Please sign in again.");
      }

      supabase.functions.setAuth(activeSession.access_token);

      const { data, error } = await supabase.functions.invoke("create-backoffice-admin", {
        body: {
          email,
          firstName,
          lastName,
          phone,
          roleId,
          isSalesAgent,
          origin: window.location.origin,
          accessToken: activeSession.access_token,
        },
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });

      if (error || data?.error) {
        const parsed = error
          ? await getFunctionErrorMessage(error, "Failed to create backoffice admin")
          : { status: undefined, message: data?.error || "Failed to create backoffice admin" };
        const status = parsed.status;
        if (status === 401) {
          throw new Error("Session/env mismatch. Please sign in again and retry.");
        }
        if (status === 403) {
          throw new Error("Only active super admins can add admins.");
        }
        throw new Error(parsed.message);
      }

      return data as {
        success: boolean;
        email: string;
        roleId: string;
        roleName: string;
        isSalesAgent: boolean;
        backofficeUserId: string | null;
        emailSent: boolean;
        tempPassword: string | null;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      if (data?.emailSent) {
        toast.success(`Backoffice admin added. Invite sent to ${data.email}`);
      } else {
        toast.success("Backoffice admin added, but email failed to send");
        if (data?.tempPassword) {
          toast.info(`Temporary password for ${data.email}: ${data.tempPassword}`);
        }
      }
    },
    onError: (mutationError: Error) => {
      toast.error("Failed to add admin: " + mutationError.message);
    },
  });

  const setUserActive = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("backoffice_users")
        .update({ is_active: isActive })
        .eq("id", userId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      toast.success(variables.isActive ? "Admin reactivated" : "Admin deactivated");
    },
    onError: (mutationError: Error) => {
      toast.error("Failed to update admin status: " + mutationError.message);
    },
  });

  const assignRole = useMutation({
    mutationFn: async ({ backofficeUserId, roleId }: { backofficeUserId: string; roleId: string }) => {
      const { error } = await (supabase.rpc as any)("backoffice_assign_user_role", {
        p_backoffice_user_id: backofficeUserId,
        p_role_id: roleId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["backoffice-users"] });
      queryClient.invalidateQueries({ queryKey: ["backoffice-role-templates"] });
      toast.success("Role updated");
    },
    onError: (mutationError: Error) => {
      toast.error("Failed to update role: " + mutationError.message);
    },
  });

  return {
    users: users || [],
    isLoading,
    error,
    createUser,
    setUserActive,
    assignRole,
  };
}
