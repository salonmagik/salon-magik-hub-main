import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { useBackofficeAuth } from "@/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ui/select";
import { toast } from "sonner";
import { Headphones } from "lucide-react";

interface SupportTicket {
  id: string;
  source_app: string;
  tenant_id: string | null;
  issue_type: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  assigned_backoffice_user_id: string | null;
}

export default function CustomersSupportPage() {
  const queryClient = useQueryClient();
  const { backofficeUser } = useBackofficeAuth();

  const { data: supportTickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("id, source_app, tenant_id, issue_type, subject, status, priority, created_at, assigned_backoffice_user_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as SupportTicket[];
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("support_tickets")
        .update({
          status,
          assigned_backoffice_user_id: backofficeUser?.user_id ?? null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets-admin"] });
      toast.success("Ticket updated");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to update ticket"),
  });

  return (
    <BackofficeLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Headphones className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Support</h1>
            <p className="text-muted-foreground">
              Manage support tickets submitted by clients and route them through the correct SLA state.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Support Ticket Queue</CardTitle>
            <CardDescription>
              {isLoading ? "Loading..." : `${supportTickets.length} ticket${supportTickets.length !== 1 ? "s" : ""} total`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading support tickets...</p>
            ) : supportTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No support tickets yet.</p>
            ) : (
              <div className="space-y-3">
                {supportTickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{ticket.subject}</p>
                          <Badge variant="secondary">{ticket.priority}</Badge>
                          <Badge>{ticket.status.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {ticket.issue_type.replace(/_/g, " ")} · {ticket.source_app.replace(/_/g, " ")} ·{" "}
                          {new Date(ticket.created_at).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ticket.tenant_id ? `Tenant: ${ticket.tenant_id}` : "Platform-level ticket"}
                        </p>
                      </div>

                      <div className="min-w-[220px]">
                        <Select
                          value={ticket.status}
                          onValueChange={(value) => updateTicketMutation.mutate({ id: ticket.id, status: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In progress</SelectItem>
                            <SelectItem value="waiting_on_salon">Waiting on salon</SelectItem>
                            <SelectItem value="waiting_on_customer">Waiting on customer</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BackofficeLayout>
  );
}
