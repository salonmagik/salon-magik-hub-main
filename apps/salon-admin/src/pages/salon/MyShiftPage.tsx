import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNowStrict } from "date-fns";
import { CalendarOff, Clock, HeartPulse, Leaf, MapPin, Navigation } from "lucide-react";
import { SalonSidebar } from "@/components/layout/SalonSidebar";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ui/card";
import { Badge } from "@ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/select";
import { Textarea } from "@ui/textarea";
import { toast } from "@ui/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useManageableLocations } from "@/hooks/useManageableLocations";
import { useMyCheckIn } from "@/hooks/useStaffCheckIns";

type LeaveType = "annual" | "sick" | "compassionate";
type TimeOffStatus = "pending" | "approved" | "rejected" | "cancelled";
interface MyTimeOff {
  id: string;
  leave_type: LeaveType;
  starts_on: string;
  ends_on: string;
  days_used: number;
  note: string | null;
  status: TimeOffStatus;
  rejection_reason: string | null;
}

const leaveMeta: Record<LeaveType, { label: string; icon: typeof Leaf; tone: string }> = {
  annual: { label: "Annual leave", icon: Leaf, tone: "bg-emerald-50 text-emerald-700" },
  sick: { label: "Sick leave", icon: HeartPulse, tone: "bg-rose-50 text-rose-700" },
  compassionate: { label: "Compassionate leave", icon: CalendarOff, tone: "bg-violet-50 text-violet-700" },
};

const statusTone: Record<TimeOffStatus, string> = {
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-muted text-muted-foreground",
};

export default function MyShiftPage() {
  const { currentTenant, user } = useAuth();
  const { locations, defaultLocationId } = useManageableLocations();
  const { checkIn, isLoading: checkInLoading, checkInAt, checkOut } = useMyCheckIn();
  const queryClient = useQueryClient();

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [elapsed, setElapsed] = useState("");

  const [requestOpen, setRequestOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!selectedLocationId && defaultLocationId) setSelectedLocationId(defaultLocationId);
  }, [defaultLocationId, selectedLocationId]);

  useEffect(() => {
    if (!checkIn) {
      setElapsed("");
      return;
    }
    const update = () => setElapsed(formatDistanceToNowStrict(new Date(checkIn.checked_in_at)));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [checkIn]);

  const { data: staffOperationsEnabled } = useQuery({
    queryKey: ["staff-operations-addon-entitlement-self", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return false;
      const { data, error } = await (supabase.from as any)("tenant_addon_entitlements")
        .select("id")
        .eq("tenant_id", currentTenant.id)
        .eq("addon_type", "staff_operations")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return Boolean(data?.id);
    },
    enabled: Boolean(currentTenant?.id),
  });

  const { data: policies = [] } = useQuery({
    queryKey: ["my-time-off-policies", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data, error } = await (supabase as any)
        .from("staff_time_off_policies")
        .select("leave_type, allowance_days")
        .eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return (data || []) as { leave_type: LeaveType; allowance_days: number }[];
    },
    enabled: Boolean(currentTenant?.id),
  });

  const { data: myTimeOff = [], refetch: refetchTimeOff } = useQuery({
    queryKey: ["my-time-off", currentTenant?.id, user?.id],
    queryFn: async () => {
      if (!currentTenant?.id || !user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("staff_time_off")
        .select("id, leave_type, starts_on, ends_on, days_used, note, status, rejection_reason")
        .eq("tenant_id", currentTenant.id)
        .eq("user_id", user.id)
        .order("starts_on", { ascending: false });
      if (error) throw error;
      return (data || []) as MyTimeOff[];
    },
    enabled: Boolean(currentTenant?.id && user?.id),
  });

  const allowance = (type: LeaveType) => policies.find((p) => p.leave_type === type)?.allowance_days ?? 0;
  const usedDays = (type: LeaveType) =>
    myTimeOff
      .filter((item) => item.leave_type === type && item.status === "approved")
      .reduce((sum, item) => sum + item.days_used, 0);
  const daysRequested =
    startsOn && endsOn ? Math.max(differenceInCalendarDays(new Date(endsOn), new Date(startsOn)) + 1, 0) : 0;
  const exceedsAllowance = daysRequested > Math.max(allowance(leaveType) - usedDays(leaveType), 0);

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant?.id || !user?.id) throw new Error("No active tenant");
      const { error } = await supabase.from("staff_time_off" as never).insert({
        tenant_id: currentTenant.id,
        user_id: user.id,
        leave_type: leaveType,
        starts_on: startsOn,
        ends_on: endsOn,
        note: note.trim() || null,
        created_by: user.id,
        status: "pending",
      } as never);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refetchTimeOff();
      setRequestOpen(false);
      setStartsOn("");
      setEndsOn("");
      setNote("");
      toast({ title: "Request sent", description: "Your manager will review this request." });
    },
    onError: (error: Error) =>
      toast({ title: "Could not send request", description: error.message, variant: "destructive" }),
  });

  const withdrawMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("staff_time_off" as never)
        .update({ status: "cancelled" } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => refetchTimeOff(),
    onError: (error: Error) => toast({ title: "Could not withdraw", description: error.message, variant: "destructive" }),
  });

  const handleCheckIn = async () => {
    if (!selectedLocationId) {
      toast({ title: "Select a location first", variant: "destructive" });
      return;
    }
    setIsCheckingIn(true);
    try {
      await checkInAt(selectedLocationId);
      await queryClient.invalidateQueries({ queryKey: ["active-check-ins"] });
      toast({ title: "Checked in", description: "Have a great shift!" });
    } catch (error) {
      toast({
        title: "Could not check in",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleCheckOut = async () => {
    setIsCheckingOut(true);
    try {
      await checkOut();
      await queryClient.invalidateQueries({ queryKey: ["active-check-ins"] });
      toast({ title: "Checked out", description: "See you next shift." });
    } catch (error) {
      toast({
        title: "Could not check out",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const checkInLocationName = useMemo(
    () => locations.find((l) => l.id === checkIn?.location_id)?.name || "your branch",
    [locations, checkIn],
  );

  if (staffOperationsEnabled === false) {
    return (
      <SalonSidebar>
        <div className="mx-auto w-full max-w-lg py-16 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <h1 className="text-lg font-medium">Staff Operations isn't enabled</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ask your salon owner to enable the Staff Operations add-on to use check-ins and time-off requests.
          </p>
        </div>
      </SalonSidebar>
    );
  }

  return (
    <SalonSidebar>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">My Shift</h1>
          <p className="mt-1 text-sm text-muted-foreground">Check in for your shift and manage your time off.</p>
        </div>

        <Card className={checkIn ? "border-emerald-200 bg-emerald-50/60" : undefined}>
          <CardContent className="space-y-4 p-6 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {checkIn ? checkInLocationName : "Select your location"}
            </div>
            {checkIn ? (
              <>
                <p className="font-serif text-3xl">{elapsed || "just now"}</p>
                <p className="text-sm text-muted-foreground">
                  Checked in at {new Date(checkIn.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                <Button
                  variant="destructive"
                  className="w-full rounded-full"
                  disabled={isCheckingOut}
                  onClick={handleCheckOut}
                >
                  {isCheckingOut ? "Checking out…" : "Check Out"}
                </Button>
              </>
            ) : (
              <>
                {locations.length > 1 ? (
                  <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                    <SelectTrigger className="mx-auto h-11 max-w-xs">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="font-serif text-xl">Not checked in</p>
                )}
                <Button
                  className="w-full rounded-full"
                  disabled={isCheckingIn || checkInLoading || !selectedLocationId}
                  onClick={handleCheckIn}
                >
                  {isCheckingIn ? "Checking in…" : "Check In"}
                </Button>
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Navigation className="h-3 w-3" />
                  Your location will be recorded when you check in
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base font-normal">My time off</CardTitle>
            <Button size="sm" className="rounded-full" onClick={() => setRequestOpen(true)}>
              <CalendarOff className="mr-1.5 h-3.5 w-3.5" /> Request time off
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="mb-2 grid grid-cols-3 gap-2">
              {(Object.keys(leaveMeta) as LeaveType[]).map((type) => (
                <div key={type} className="rounded-lg bg-[#f7f4ef] p-2.5 text-center">
                  <p className="truncate text-[11px] text-muted-foreground">{leaveMeta[type].label}</p>
                  <p className="mt-1 text-sm font-medium">
                    {usedDays(type)} / {allowance(type)}
                  </p>
                </div>
              ))}
            </div>
            {myTimeOff.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No time off requested yet.</p>
            ) : (
              myTimeOff.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="text-sm font-medium">{leaveMeta[item.leave_type].label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.starts_on} – {item.ends_on} · {item.days_used} day{item.days_used === 1 ? "" : "s"}
                    </p>
                    {item.status === "rejected" && item.rejection_reason && (
                      <p className="mt-1 text-xs text-rose-700">Declined: {item.rejection_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={statusTone[item.status]}>
                      {item.status}
                    </Badge>
                    {item.status === "pending" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => withdrawMutation.mutate(item.id)}
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="rounded-[22px] sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Request time off</DialogTitle>
            <DialogDescription>Your manager will approve or decline this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Leave type</Label>
              <Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}>
                <SelectTrigger className="mt-1.5 h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(leaveMeta) as LeaveType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {leaveMeta[type].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="req-start">Starts</Label>
                <Input id="req-start" type="date" className="mt-1.5 h-12" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="req-end">Ends</Label>
                <Input id="req-end" type="date" min={startsOn} className="mt-1.5 h-12" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
            <div className={`rounded-xl p-3 text-sm ${exceedsAllowance ? "bg-red-50 text-red-700" : "bg-[#f1ece3] text-muted-foreground"}`}>
              {daysRequested || 0} day(s) requested · {Math.max(allowance(leaveType) - usedDays(leaveType), 0)} remaining
            </div>
            <div>
              <Label htmlFor="req-note">Note (optional)</Label>
              <Textarea id="req-note" className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your manager" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setRequestOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full"
              disabled={!startsOn || !endsOn || daysRequested < 1 || exceedsAllowance || requestMutation.isPending}
              onClick={() => requestMutation.mutate()}
            >
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SalonSidebar>
  );
}
