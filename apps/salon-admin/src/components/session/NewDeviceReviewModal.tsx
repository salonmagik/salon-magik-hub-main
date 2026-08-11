import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Monitor, Smartphone, Tablet, MapPin, Clock, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Button } from "@ui/button";
import { Badge } from "@ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@ui/ui/use-toast";
import { DIALOG_BODY_PADDING } from "@ui/dialog-brand";
import { cn } from "@shared/utils";

const MAX_DEVICES_PER_USER = 2;

interface SessionRow {
  id: string;
  user_id: string;
  started_at: string;
  last_activity_at: string;
  device_type: string | null;
  browser_name: string | null;
  city: string | null;
  country: string | null;
  region: string | null;
  ip_address: string | null;
  session_token: string | null;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="w-4 h-4" />;
  if (type === "tablet") return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
}

function locationLabel(s: SessionRow) {
  const parts = [s.city, s.region, s.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Unknown location";
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewDeviceReviewModal({ open, onClose }: Props) {
  const { user, currentTenant } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: mySessions = [], isLoading } = useQuery({
    queryKey: ["my-sessions-review", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("staff_sessions")
        .select(
          "id, user_id, started_at, last_activity_at, device_type, browser_name, city, country, region, ip_address, session_token",
        )
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("last_activity_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SessionRow[];
    },
    enabled: open && !!user?.id,
  });

  const revokeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.functions.invoke("revoke-staff-session", {
        body: { session_id: sessionId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-sessions-review", user?.id] });
      setConfirmId(null);
      setConfirmed(true);
      toast({ title: "Session ended", description: "The session has been revoked successfully." });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to end session",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const distinctDeviceCount = new Set(mySessions.map((s) => s.ip_address || s.id)).size;
  const atCapacity = distinctDeviceCount >= MAX_DEVICES_PER_USER;

  // Identify the "new" session: most recently started (first in desc order, excluding current token)
  const currentToken = (() => {
    try {
      return supabase.auth.getSession().then((r) => r.data.session?.access_token ?? "");
    } catch {
      return "";
    }
  })();

  if (confirmed) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Session ended
            </DialogTitle>
            <DialogDescription>
              The session has been successfully revoked. Your account is secure.
            </DialogDescription>
          </DialogHeader>
          <div className={DIALOG_BODY_PADDING}>
            <Button onClick={onClose} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (confirmId) {
    const session = mySessions.find((s) => s.id === confirmId);
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirmId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              End this session?
            </DialogTitle>
            <DialogDescription>
              This will immediately sign out that device. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className={DIALOG_BODY_PADDING}>
          {session && (
            <div className="rounded-lg bg-muted p-4 text-sm space-y-1.5">
              <div className="flex items-center gap-2">
                <DeviceIcon type={session.device_type} />
                <span className="font-medium capitalize">
                  {session.device_type ?? "Desktop"} · {session.browser_name ?? "Browser"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="w-3.5 h-3.5" />
                <span>{locationLabel(session)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Signed in {formatDistanceToNow(new Date(session.started_at), { addSuffix: true })}</span>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate(confirmId)}
            >
              {revokeMutation.isPending ? "Ending…" : "End session"}
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {atCapacity ? "Session limit reached" : "New sign-in detected"}
          </DialogTitle>
          <DialogDescription>
            {atCapacity
              ? "You've reached the maximum number of active devices. End an existing session to continue or if you don't recognise a device."
              : "We noticed a new device sign-in to your account. If this wasn't you, end that session immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className={DIALOG_BODY_PADDING}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading sessions…</p>
        ) : (
          <div className="space-y-3">
            {mySessions.map((session, i) => {
              const isNewest = i === 0;
              return (
                <div
                  key={session.id}
                  className={`rounded-lg border p-4 space-y-2 ${isNewest && !atCapacity ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <DeviceIcon type={session.device_type} />
                        <span className="capitalize">
                          {session.device_type ?? "Desktop"} · {session.browser_name ?? "Browser"}
                        </span>
                        {isNewest && !atCapacity && (
                          <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {locationLabel(session)}
                        {session.ip_address && (
                          <span className="text-muted-foreground/70">· {session.ip_address}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        Signed in {format(new Date(session.started_at), "MMM d 'at' h:mm a")}
                        {" · "}Active {formatDistanceToNow(new Date(session.last_activity_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => setConfirmId(session.id)}
                    >
                      End session
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button variant="ghost" className="w-full" onClick={onClose}>
          {atCapacity ? "I'll do this later" : "This was me — dismiss"}
        </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
