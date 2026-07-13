import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { Monitor, Smartphone, Tablet, MapPin, Clock, LogOut, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ui/card";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@ui/alert-dialog";

interface SessionRow {
  id: string;
  user_id: string;
  tenant_id: string;
  started_at: string;
  last_activity_at: string;
  device_type: string | null;
  browser_name: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  user_agent: string | null;
  session_token: string | null;
  profiles: { full_name: string | null } | null;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="w-4 h-4" />;
  if (type === "tablet") return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

function locationLabel(session: SessionRow): string {
  const parts = [session.city, session.region, session.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

export function ActiveSessionsTab() {
  const { user, currentTenant, currentRole } = useAuth();
  const queryClient = useQueryClient();
  const [confirmSessionId, setConfirmSessionId] = useState<string | null>(null);

  const currentUserId = user?.id;
  const currentTenantId = currentTenant?.id;
  const currentSessionId = sessionStorage.getItem("staff_session_id");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["active-staff-sessions", currentTenantId],
    queryFn: async () => {
      if (!currentTenantId) return [];
      const { data: sessionRows, error } = await supabase
        .from("staff_sessions")
        .select("id, user_id, tenant_id, started_at, last_activity_at, device_type, browser_name, city, country, region, user_agent, session_token")
        .eq("tenant_id", currentTenantId)
        .is("ended_at", null)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      if (!sessionRows || sessionRows.length === 0) return [];

      // Fetch profiles for unique user_ids separately (no direct FK between
      // staff_sessions and profiles — both reference auth.users).
      const userIds = [...new Set(sessionRows.map((s) => s.user_id))];
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = Object.fromEntries(
        (profileRows ?? []).map((p) => [p.user_id, p.full_name]),
      );

      return sessionRows.map((s) => ({
        ...s,
        profiles: { full_name: profileMap[s.user_id] ?? null },
      })) as SessionRow[];
    },
    enabled: !!currentTenantId,
    refetchInterval: 60_000,
  });

  const { data: canManageAll } = useQuery({
    queryKey: ["can-manage-sessions", currentTenantId, currentUserId],
    queryFn: async () => {
      if (!currentTenantId || !currentUserId) return false;
      if (currentRole === "owner") return true;
      const { data } = await supabase
        .from("user_roles")
        .select("can_manage_staff_sessions")
        .eq("user_id", currentUserId)
        .eq("tenant_id", currentTenantId)
        .maybeSingle();
      return data?.can_manage_staff_sessions === true;
    },
    enabled: !!currentTenantId && !!currentUserId,
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.functions.invoke("revoke-staff-session", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-staff-sessions", currentTenantId] });
      setConfirmSessionId(null);
    },
  });

  const visibleSessions = canManageAll
    ? sessions
    : sessions.filter((s) => s.user_id === currentUserId);

  const ownSessions = sessions.filter((s) => s.user_id === currentUserId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading sessions…
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {canManageAll && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle>All Active Sessions</CardTitle>
                  <CardDescription>
                    Everyone currently logged into this account across all devices.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {visibleSessions.length === 0 ? (
                <p className="text-muted-foreground text-sm">No active sessions found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Who</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Browser</TableHead>
                      <TableHead>Logged in</TableHead>
                      <TableHead>Last active</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSessions.map((session) => {
                      const isCurrentSession = session.id === currentSessionId;
                      return (
                        <TableRow key={session.id}>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-sm">
                                {session.profiles?.full_name ?? "Unknown"}
                              </span>
                              {isCurrentSession && (
                                <Badge variant="default" className="w-fit text-xs">
                                  This session
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              {locationLabel(session)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
                              <DeviceIcon type={session.device_type} />
                              {session.device_type ?? "desktop"}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {session.browser_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              {format(new Date(session.started_at), "MMM d, h:mm a")}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(session.last_activity_at), {
                              addSuffix: true,
                            })}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setConfirmSessionId(session.id)}
                              disabled={isCurrentSession}
                              title={isCurrentSession ? "You can't end your current session here" : undefined}
                            >
                              <LogOut className="w-4 h-4 mr-1.5" />
                              End
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>My Sessions</CardTitle>
            <CardDescription>
              Your own active logins. End any session you don't recognise.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ownSessions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active sessions found for your account.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Browser</TableHead>
                    <TableHead>Logged in</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ownSessions.map((session) => {
                    const isCurrentSession = session.id === currentSessionId;
                    return (
                      <TableRow key={session.id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            {locationLabel(session)}
                          </div>
                          {isCurrentSession && (
                            <Badge variant="default" className="w-fit text-xs mt-1">
                              This session
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground capitalize">
                            <DeviceIcon type={session.device_type} />
                            {session.device_type ?? "desktop"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {session.browser_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            {format(new Date(session.started_at), "MMM d, h:mm a")}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(new Date(session.last_activity_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmSessionId(session.id)}
                            disabled={isCurrentSession}
                            title={isCurrentSession ? "You can't end your current session here" : undefined}
                          >
                            <LogOut className="w-4 h-4 mr-1.5" />
                            End
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirmSessionId !== null}
        onOpenChange={(open) => { if (!open) setConfirmSessionId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The device will be signed out immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmSessionId && revokeMutation.mutate(confirmSessionId)}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? "Ending…" : "End Session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
