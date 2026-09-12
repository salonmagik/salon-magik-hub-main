import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ShieldAlert, Users as UsersIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";

interface SalonOwnerRow {
  user_id: string;
  full_name: string | null;
  email: string;
  granted_at: string;
}

/**
 * Self-contained roster of this salon's owner(s), modelled on
 * ActiveSessionsTab. Backed by get_salon_owners — owner-gated on the
 * caller's own ownership of the queried tenant (AC-24, AC-25) — so a
 * denied response means "you're not an owner here", never an empty list
 * (an empty list would misleadingly read as "this salon has no owners").
 */
export function SalonOwnersTab() {
  const { currentTenant } = useAuth();
  const currentTenantId = currentTenant?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["salon-owners", currentTenantId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_salon_owners", {
        p_tenant_id: currentTenantId,
      });
      if (error) throw error;
      return (data || []) as SalonOwnerRow[];
    },
    enabled: !!currentTenantId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading owners…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            You don't have access to this.
          </p>
        </CardContent>
      </Card>
    );
  }

  const owners = data || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <UsersIcon className="w-5 h-5 text-primary" />
          <div>
            <CardTitle>Owners</CardTitle>
            <CardDescription>
              Everyone who owns this salon. No ranking between owners — each has full owner access.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {owners.length === 0 ? (
          <p className="text-muted-foreground text-sm">No owners found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Owner since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {owners.map((owner) => (
                <TableRow key={owner.user_id}>
                  <TableCell className="font-medium">{owner.full_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{owner.email}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {format(new Date(owner.granted_at), "MMM d, yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
