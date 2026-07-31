import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BackofficeLayout } from "@/components/BackofficeLayout";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ui/card";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { Input } from "@ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/table";
import { Loader2, Search, UserRound, Eye } from "lucide-react";
import { format } from "date-fns";
import { EmptyState } from "@ui/empty-state";

interface TenantRoleEntry {
  tenant_id: string;
  tenant_name: string;
  role: string;
  is_active: boolean;
}

interface BackofficeUserRow {
  user_id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  tenant_roles: TenantRoleEntry[];
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  supervisor: "Supervisor",
  receptionist: "Receptionist",
  staff: "Staff",
};

function useBackofficeUsers() {
  return useQuery({
    queryKey: ["backoffice-users-list"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("backoffice_list_users");
      if (error) throw error;
      return (data || []) as BackofficeUserRow[];
    },
  });
}

export default function CustomersUsersPage() {
  const { data: users, isLoading } = useBackofficeUsers();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<BackofficeUserRow | null>(null);

  const filteredUsers = (users || []).filter((user) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      user.full_name?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      user.phone?.toLowerCase().includes(q) ||
      user.tenant_roles.some((tr) => tr.tenant_name.toLowerCase().includes(q))
    );
  });

  return (
    <BackofficeLayout>
      <div className="backoffice-page">
        <div>
          <h1 className="text-[22px] font-medium tracking-tight">Users</h1>
          <p className="mt-1 text-muted-foreground">
            {(users || []).length.toLocaleString()} total across salon-admin and client-portal — view only, no
            actions can be taken here.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone, or salon"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 rounded-xl bg-white pl-9"
          />
        </div>

        <Card className="backoffice-panel overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">All users</CardTitle>
            <CardDescription>{filteredUsers.length.toLocaleString()} matching users</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon={UserRound}
                title="No users found"
                description="Users will appear here once they sign up on any Salon Magik app."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Salons</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.user_id} className="h-16">
                        <TableCell className="font-medium">{user.full_name || "—"}</TableCell>
                        <TableCell className="text-sm">{user.email || "—"}</TableCell>
                        <TableCell className="text-sm">{user.phone || "—"}</TableCell>
                        <TableCell>
                          {user.tenant_roles.length === 0 ? (
                            <span className="text-sm text-muted-foreground">No salon</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {user.tenant_roles.slice(0, 2).map((tr) => (
                                <Badge key={tr.tenant_id} variant="outline" className="whitespace-nowrap">
                                  {tr.tenant_name} · {ROLE_LABELS[tr.role] || tr.role}
                                </Badge>
                              ))}
                              {user.tenant_roles.length > 2 && (
                                <Badge variant="secondary">+{user.tenant_roles.length - 2} more</Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedUser(user)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="rounded-3xl sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted">
                <UserRound className="h-5 w-5 text-muted-foreground" />
              </span>
              <span>{selectedUser?.full_name || "User details"}</span>
            </DialogTitle>
            <DialogDescription>Account and salon membership details — view only.</DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Email", value: selectedUser.email || "Not set" },
                  { label: "Phone", value: selectedUser.phone || "Not set" },
                  { label: "Joined", value: format(new Date(selectedUser.created_at), "MMM d, yyyy 'at' h:mm a") },
                  {
                    label: "Last sign-in",
                    value: selectedUser.last_sign_in_at
                      ? format(new Date(selectedUser.last_sign_in_at), "MMM d, yyyy 'at' h:mm a")
                      : "Never",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Salon memberships ({selectedUser.tenant_roles.length})
                </p>
                {selectedUser.tenant_roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not linked to any salon.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedUser.tenant_roles.map((tr) => (
                      <div key={tr.tenant_id} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2">
                        <span className="text-sm font-medium">{tr.tenant_name}</span>
                        <div className="flex items-center gap-2">
                          {!tr.is_active && <Badge variant="secondary">Inactive</Badge>}
                          <Badge variant="outline">{ROLE_LABELS[tr.role] || tr.role}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">User ID</p>
                <p className="mt-1.5 break-all font-mono text-xs">{selectedUser.user_id}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedUser(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </BackofficeLayout>
  );
}
